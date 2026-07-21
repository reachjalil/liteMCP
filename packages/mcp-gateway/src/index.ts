import type { GatewaySession, McpServerDefinition, Subject } from "@litemcp/contracts";
import {
  PlatformAuthorizationError,
  PlatformNotFoundError,
  type PlatformService,
  type ResolvedTool,
  randomId,
} from "@litemcp/core";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const MCP_PROTOCOL_VERSION = "2025-11-25";

type JsonRpcId = string | number | null;

const hasExternalSchemaReference = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasExternalSchemaReference);
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value)) {
    if (
      (key === "$ref" || key === "$dynamicRef") &&
      (typeof nested !== "string" || !nested.startsWith("#"))
    ) {
      return true;
    }
    if (hasExternalSchemaReference(nested)) return true;
  }
  return false;
};

export const validateToolArguments = (
  schema: Record<string, unknown>,
  value: Record<string, unknown>
) => {
  // Tool schemas are tenant/vendor input. A fresh validator prevents `$id`
  // registration from becoming shared mutable state across tenants, while the
  // local-reference rule keeps validation deterministic and network-free.
  if (hasExternalSchemaReference(schema)) {
    return [
      {
        path: "/",
        keyword: "schema",
        message: "external JSON Schema references are not supported",
      },
    ];
  }
  try {
    const validator = new Ajv2020({
      addUsedSchema: false,
      allErrors: true,
      coerceTypes: false,
      removeAdditional: false,
      strict: false,
      useDefaults: false,
      validateFormats: true,
    });
    addFormats(validator);
    const validate = validator.compile(schema);
    if (validate(value)) return [];
    return (validate.errors ?? []).slice(0, 20).map((error) => ({
      path: error.instancePath || "/",
      keyword: error.keyword,
      message: error.message ?? "does not satisfy the tool input schema",
    }));
  } catch {
    return [
      {
        path: "/",
        keyword: "schema",
        message: "the upstream tool input schema is invalid",
      },
    ];
  }
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      error: { code: number; message: string; data?: unknown };
    };

export type ToolExecutionResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "resource_link"; uri: string; name: string; mimeType?: string }
  >;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type ExecutionContext = {
  requestId: string;
  tenantId: string;
  session: GatewaySession;
  signal?: AbortSignal;
};

export interface UpstreamExecutor {
  supports(server: McpServerDefinition): boolean;
  execute(
    server: McpServerDefinition,
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolExecutionResult>;
}

export class BuiltinExecutor implements UpstreamExecutor {
  supports(server: McpServerDefinition) {
    return server.transport === "builtin";
  }

  async execute(
    server: McpServerDefinition,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    if (server.slug === "calculator" && toolName === "add") {
      const a = Number(args.a);
      const b = Number(args.b);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return {
          content: [{ type: "text", text: "Both a and b must be finite numbers." }],
          isError: true,
        };
      }
      const sum = a + b;
      return {
        content: [{ type: "text", text: String(sum) }],
        structuredContent: { a, b, sum },
      };
    }
    throw new Error(`No builtin implementation for ${server.slug}.${toolName}.`);
  }
}

const isPrivateIpv4 = (hostname: string) => {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a = 0, b = 0, c = 0] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a === 0
  );
};

const ipv6Hextets = (hostname: string) => {
  if (!hostname.includes(":")) return null;
  const halves = hostname.split("::");
  if (halves.length > 2) return null;
  const left = halves[0]?.split(":").filter(Boolean) ?? [];
  const right = halves[1]?.split(":").filter(Boolean) ?? [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const values = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part, 16));
  if (
    values.length !== 8 ||
    values.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffff)
  ) {
    return null;
  }
  return values;
};

const isPrivateIpv6 = (hostname: string) => {
  const values = ipv6Hextets(hostname);
  if (!values) return false;
  const first = values[0] ?? 0;
  const allZeroPrefix = values.slice(0, 6).every((value) => value === 0);
  const mappedIpv4 =
    values.slice(0, 5).every((value) => value === 0) && values[5] === 0xffff;
  if (mappedIpv4) {
    const high = values[6] ?? 0;
    const low = values[7] ?? 0;
    return isPrivateIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }
  // Unspecified, loopback, and deprecated IPv4-compatible forms are never
  // valid remote service destinations.
  if (allZeroPrefix) return true;
  // Permit only global-unicast literals (2000::/3). This intentionally fails
  // closed for ULA, link/site-local, multicast, and other special-use ranges.
  return (first & 0xe000) !== 0x2000;
};

export const validateRemoteEndpoint = (
  endpoint: string,
  options: { allowPrivateNetwork?: boolean } = {}
) => {
  const url = new URL(endpoint);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Only HTTP(S) upstream MCP endpoints are supported.");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("Upstream URLs cannot contain credentials or fragments.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localdomain") ||
    hostname.endsWith(".home.arpa") ||
    hostname === "::1" ||
    isPrivateIpv6(hostname) ||
    isPrivateIpv4(hostname);
  if (privateHost && !options.allowPrivateNetwork) {
    throw new Error("Private-network upstream URLs are blocked by default.");
  }
  if (url.protocol !== "https:" && !options.allowPrivateNetwork) {
    throw new Error("Remote upstream MCP endpoints must use HTTPS.");
  }
  return url;
};

export class RemoteHttpExecutor implements UpstreamExecutor {
  constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly options: {
      allowPrivateNetwork?: boolean;
      maxResponseBytes?: number;
      timeoutMs?: number;
    } = {}
  ) {}

  supports(server: McpServerDefinition) {
    return server.transport === "streamable-http" || server.transport === "legacy-sse";
  }

  async execute(
    server: McpServerDefinition,
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolExecutionResult> {
    if (!server.endpoint) throw new Error("Remote server endpoint is missing.");
    const endpoint = validateRemoteEndpoint(server.endpoint, this.options);
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 20_000);
    const signal = context.signal
      ? AbortSignal.any([context.signal, timeout])
      : timeout;
    const upstreamRequestId = randomId("upstream");
    const response = await this.fetchImplementation(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        "x-request-id": context.requestId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: upstreamRequestId,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      throw new Error(`Upstream returned HTTP ${response.status}.`);
    }
    const maxResponseBytes = this.options.maxResponseBytes ?? 4 * 1024 * 1024;
    const advertisedLength = Number(response.headers.get("content-length") ?? "0");
    if (advertisedLength > maxResponseBytes) {
      throw new Error("Upstream MCP response exceeded its byte limit.");
    }
    const responseBytes = await response.arrayBuffer();
    if (responseBytes.byteLength > maxResponseBytes) {
      throw new Error("Upstream MCP response exceeded its byte limit.");
    }
    let payload: {
      result?: ToolExecutionResult;
      error?: { message?: string };
    };
    try {
      payload = JSON.parse(new TextDecoder().decode(responseBytes)) as typeof payload;
    } catch {
      throw new Error("Upstream returned invalid JSON-RPC output.");
    }
    if (payload.error) {
      throw new Error(payload.error.message ?? "Upstream MCP execution failed.");
    }
    if (!payload.result?.content) {
      throw new Error("Upstream returned an invalid MCP tool result.");
    }
    return payload.result;
  }
}

export class ExecutorRouter {
  constructor(private readonly executors: UpstreamExecutor[]) {}

  async execute(
    resolved: ResolvedTool,
    args: Record<string, unknown>,
    context: ExecutionContext
  ) {
    const executor = this.executors.find((candidate) =>
      candidate.supports(resolved.server)
    );
    if (!executor) {
      throw new Error(
        `No ${resolved.server.transport} execution adapter is installed.`
      );
    }
    return executor.execute(resolved.server, resolved.upstreamName, args, context);
  }
}

const errorResponse = (
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

const resultResponse = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
});

const parseBearer = (authorization: string | null) => {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  return match?.[1] ?? null;
};

const callParams = (params: unknown) => {
  if (!params || typeof params !== "object") return null;
  const value = params as { name?: unknown; arguments?: unknown };
  if (typeof value.name !== "string") return null;
  if (
    value.arguments !== undefined &&
    (!value.arguments ||
      typeof value.arguments !== "object" ||
      Array.isArray(value.arguments))
  ) {
    return null;
  }
  return {
    name: value.name,
    arguments: (value.arguments ?? {}) as Record<string, unknown>,
  };
};

export type McpGatewayOptions = {
  platform: PlatformService;
  executors?: UpstreamExecutor[];
};

export class McpGateway {
  readonly #router: ExecutorRouter;

  constructor(private readonly options: McpGatewayOptions) {
    this.#router = new ExecutorRouter(
      options.executors ?? [new BuiltinExecutor(), new RemoteHttpExecutor()]
    );
  }

  async handle(params: {
    tenantId: string;
    compositionSlug: string;
    authorization: string | null;
    body: unknown;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<{ status: number; body?: JsonRpcResponse }> {
    const request = params.body as Partial<JsonRpcRequest>;
    const id = request.id ?? null;
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return { status: 400, body: errorResponse(id, -32600, "Invalid Request") };
    }

    if (request.method === "initialize") {
      return {
        status: 200,
        body: resultResponse(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: true },
            logging: {},
          },
          serverInfo: { name: "LiteMCP Composer", version: "0.1.0" },
          instructions:
            "Capabilities are filtered by session identity and re-authorized on execution.",
        }),
      };
    }

    if (request.method.startsWith("notifications/")) {
      return { status: 202 };
    }

    const token = parseBearer(params.authorization);
    if (!token) {
      return {
        status: 401,
        body: errorResponse(id, -32001, "A scoped MCP bearer session is required."),
      };
    }
    const session = await this.options.platform.authenticateSession(
      params.tenantId,
      token
    );
    if (!session) {
      return {
        status: 401,
        body: errorResponse(id, -32001, "The MCP session is invalid or expired."),
      };
    }
    const composition = await this.options.platform.getCompositionBySlug(
      params.tenantId,
      params.compositionSlug
    );
    if (composition.id !== session.compositionId) {
      return {
        status: 403,
        body: errorResponse(id, -32003, "Session is not scoped to this endpoint."),
      };
    }

    if (request.method === "ping") {
      return { status: 200, body: resultResponse(id, {}) };
    }

    if (request.method === "tools/list") {
      const tools = await this.options.platform.listVisibleTools(
        params.tenantId,
        composition.id,
        session.subject,
        params.requestId
      );
      return {
        status: 200,
        body: resultResponse(id, {
          tools: tools.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              readOnlyHint: tool.readOnly,
              destructiveHint: tool.risk === "destructive",
              idempotentHint: tool.idempotent,
            },
            _meta: {
              "litemcp.dev/provenance": tool.provenance,
              "litemcp.dev/risk": tool.risk,
              "litemcp.dev/serverVersion": tool.serverVersion,
            },
          })),
        }),
      };
    }

    if (request.method === "tools/call") {
      const parsed = callParams(request.params);
      if (!parsed) {
        return {
          status: 400,
          body: errorResponse(id, -32602, "Invalid tools/call parameters."),
        };
      }
      try {
        const resolved = await this.options.platform.resolveTool(
          params.tenantId,
          composition.id,
          session.subject,
          parsed.name,
          params.requestId
        );
        const argumentErrors = validateToolArguments(
          resolved.tool.inputSchema,
          parsed.arguments
        );
        if (argumentErrors.length > 0) {
          await this.options.platform.appendAudit(params.tenantId, {
            type: "execution.validation-denied",
            actorId: session.subject.id,
            action: "execute",
            targetType: "tool",
            targetId: resolved.canonicalName,
            outcome: "denied",
            requestId: params.requestId,
            policyVersion: resolved.decision.policyVersion ?? undefined,
            explanation: "Tool arguments did not satisfy the advertised input schema.",
            metadata: { validationErrors: argumentErrors },
          });
          return {
            status: 400,
            body: errorResponse(id, -32602, "Invalid tool arguments.", {
              errors: argumentErrors,
              requestId: params.requestId,
            }),
          };
        }
        if (resolved.decision.requiresApproval) {
          const approval = await this.options.platform.createApproval(
            params.tenantId,
            session,
            resolved,
            parsed.arguments,
            params.requestId
          );
          return {
            status: 200,
            body: resultResponse(id, {
              content: [
                {
                  type: "text",
                  text: `Approval ${approval.id} is required before execution.`,
                },
              ],
              structuredContent: {
                status: "approval_required",
                approvalId: approval.id,
                argumentsHash: approval.argumentsHash,
                expiresAt: approval.expiresAt,
              },
              isError: false,
            }),
          };
        }
        const executionId = randomId("execution");
        try {
          await this.options.platform.appendAudit(params.tenantId, {
            type: "execution.dispatched",
            actorId: session.subject.id,
            action: "execute",
            targetType: "tool",
            targetId: resolved.canonicalName,
            outcome: "allowed",
            requestId: params.requestId,
            policyVersion: resolved.decision.policyVersion ?? undefined,
            explanation: "Execution was authorized and is ready for upstream dispatch.",
            metadata: {
              executionId,
              idempotent: resolved.tool.idempotent,
              serverId: resolved.server.id,
            },
          });
        } catch (error) {
          console.error("[litemcp] execution blocked because audit is unavailable", {
            requestId: params.requestId,
            executionId,
            errorClass: error instanceof Error ? error.name : "UnknownError",
          });
          return {
            status: 503,
            body: errorResponse(
              id,
              -32004,
              "Execution was not dispatched because audit persistence is unavailable.",
              { retryable: true, requestId: params.requestId }
            ),
          };
        }
        const startedAt = performance.now();
        const result = await this.#router.execute(resolved, parsed.arguments, {
          requestId: params.requestId,
          tenantId: params.tenantId,
          session,
          signal: params.signal,
        });
        try {
          await this.options.platform.appendAudit(params.tenantId, {
            type: "execution.completed",
            actorId: session.subject.id,
            action: "execute",
            targetType: "tool",
            targetId: resolved.canonicalName,
            outcome: result.isError ? "failed" : "succeeded",
            requestId: params.requestId,
            policyVersion: resolved.decision.policyVersion ?? undefined,
            explanation: `Routed to ${resolved.server.name} ${resolved.server.version}.`,
            metadata: {
              executionId,
              transport: resolved.server.transport,
              serverId: resolved.server.id,
              upstreamTool: resolved.upstreamName,
              durationMs: Math.round(performance.now() - startedAt),
            },
          });
        } catch (error) {
          // The upstream already completed. Never convert a successful side
          // effect into a retryable failure because completion-audit storage
          // is degraded; the pre-dispatch record retains the execution ID.
          console.error("[litemcp] completion audit persistence failed", {
            requestId: params.requestId,
            executionId,
            errorClass: error instanceof Error ? error.name : "UnknownError",
          });
        }
        return { status: 200, body: resultResponse(id, result) };
      } catch (error) {
        if (error instanceof PlatformAuthorizationError) {
          return {
            status: 403,
            body: errorResponse(id, -32003, "Tool execution denied by policy.", {
              explanation: error.message,
              requestId: params.requestId,
            }),
          };
        }
        if (error instanceof PlatformNotFoundError) {
          return {
            status: 404,
            body: errorResponse(id, -32601, "Tool not found or not visible."),
          };
        }
        try {
          await this.options.platform.appendAudit(params.tenantId, {
            type: "execution.failed",
            actorId: session.subject.id,
            action: "execute",
            targetType: "tool",
            targetId: parsed.name,
            outcome: "failed",
            requestId: params.requestId,
            explanation: "The upstream execution failed or its outcome is unknown.",
            metadata: {
              errorClass: error instanceof Error ? error.name : "UnknownError",
            },
          });
        } catch (auditError) {
          console.error("[litemcp] failure audit persistence failed", {
            requestId: params.requestId,
            errorClass: auditError instanceof Error ? auditError.name : "UnknownError",
          });
        }
        return {
          status: 502,
          body: errorResponse(
            id,
            -32002,
            "Upstream execution failed or has an indeterminate outcome; do not retry automatically.",
            {
              retryable: false,
              outcome: "indeterminate",
              requestId: params.requestId,
            }
          ),
        };
      }
    }

    return { status: 404, body: errorResponse(id, -32601, "Method not found") };
  }
}

export const demoSubject = (role: "employee" | "finance-admin"): Subject => ({
  type: "user",
  id: role === "employee" ? "user_employee" : "user_finance_admin",
  roles: [role],
  groups: [role === "employee" ? "employees" : "finance-admins"],
  claims: { demo: "true" },
});
