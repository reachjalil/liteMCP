import type {
  ApprovalRequest,
  GatewaySession,
  McpServerDefinition,
  SessionClientInfo,
  Subject,
} from "@litemcp/contracts";
import {
  type AuditReceipt,
  PlatformAuthorizationError,
  PlatformConflictError,
  PlatformNotFoundError,
  PlatformPolicyDeniedError,
  PlatformQuotaError,
  type PlatformService,
  type ResolvedTool,
  randomId,
} from "@litemcp/core";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  ipFamily,
  isDemoPrivateIpAddress,
  isPublicIpAddress,
  isSpecialHostname,
  normalizeHostname,
} from "./network-security.js";

export * from "./network-security.js";

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
  onUpstreamMeasurement?: (measurement: UpstreamMeasurement) => void;
};

export type ProbeContext = {
  requestId: string;
  signal?: AbortSignal;
  onUpstreamMeasurement?: (measurement: UpstreamMeasurement) => void;
};

export type UpstreamMeasurement = {
  latencyMs: number;
  requestBytes: number;
  responseBytes: number;
  httpStatus?: number;
  errorCode?: "timeout" | "transport_error" | "http_error" | "protocol_error";
};

export interface UpstreamExecutor {
  supports(server: McpServerDefinition): boolean;
  execute(
    server: McpServerDefinition,
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolExecutionResult>;
  probe?(
    server: McpServerDefinition,
    context: ProbeContext
  ): Promise<{ tools: McpServerDefinition["tools"]; serverVersion?: string }>;
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

  async probe(server: McpServerDefinition) {
    return { tools: server.tools, serverVersion: server.version };
  }
}

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
  const hostname = normalizeHostname(url.hostname);
  const family = ipFamily(hostname);
  const allowedLiteral =
    family === 0 ||
    isPublicIpAddress(hostname) ||
    (options.allowPrivateNetwork && isDemoPrivateIpAddress(hostname));
  if (
    (!allowedLiteral || (family === 0 && isSpecialHostname(hostname))) &&
    !options.allowPrivateNetwork
  ) {
    throw new Error("Private-network upstream URLs are blocked by default.");
  }
  if (family !== 0 && !allowedLiteral) {
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

  async #request(
    server: McpServerDefinition,
    method: string,
    params: Record<string, unknown> | undefined,
    context: ProbeContext
  ) {
    if (!server.endpoint) throw new Error("Remote server endpoint is missing.");
    const endpoint = validateRemoteEndpoint(server.endpoint, this.options);
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 20_000);
    const signal = context.signal
      ? AbortSignal.any([context.signal, timeout])
      : timeout;
    const upstreamRequestId = randomId("upstream");
    const requestBody = JSON.stringify({
      jsonrpc: "2.0",
      id: upstreamRequestId,
      method,
      ...(params ? { params } : {}),
    });
    const requestBytes = new TextEncoder().encode(requestBody).byteLength;
    const startedAt = performance.now();
    let measuredResponseBytes = 0;
    let httpStatus: number | undefined;
    let errorCode: UpstreamMeasurement["errorCode"];
    try {
      const response = await this.fetchImplementation(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": MCP_PROTOCOL_VERSION,
          "x-request-id": context.requestId,
        },
        body: requestBody,
        redirect: "error",
        signal,
      });
      httpStatus = response.status;
      if (!response.ok) {
        errorCode = "http_error";
        throw new Error(`Upstream returned HTTP ${response.status}.`);
      }
      const maxResponseBytes = this.options.maxResponseBytes ?? 4 * 1024 * 1024;
      const advertisedLength = Number(response.headers.get("content-length") ?? "0");
      if (advertisedLength > maxResponseBytes) {
        errorCode = "protocol_error";
        throw new Error("Upstream MCP response exceeded its byte limit.");
      }
      const responseBytes = await response.arrayBuffer();
      measuredResponseBytes = responseBytes.byteLength;
      if (responseBytes.byteLength > maxResponseBytes) {
        errorCode = "protocol_error";
        throw new Error("Upstream MCP response exceeded its byte limit.");
      }
      let payload: { result?: unknown; error?: { message?: string } };
      try {
        payload = JSON.parse(new TextDecoder().decode(responseBytes)) as typeof payload;
      } catch {
        errorCode = "protocol_error";
        throw new Error("Upstream returned invalid JSON-RPC output.");
      }
      if (payload.error) {
        errorCode = "protocol_error";
        throw new Error(payload.error.message ?? "Upstream MCP request failed.");
      }
      return payload.result;
    } catch (error) {
      if (!errorCode) {
        errorCode =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
            ? "timeout"
            : "transport_error";
      }
      throw error;
    } finally {
      try {
        context.onUpstreamMeasurement?.({
          latencyMs: Math.max(0, performance.now() - startedAt),
          requestBytes,
          responseBytes: measuredResponseBytes,
          ...(httpStatus !== undefined ? { httpStatus } : {}),
          ...(errorCode ? { errorCode } : {}),
        });
      } catch {
        // Measurement collection is analytics-only and cannot affect dispatch.
      }
    }
  }

  async probe(server: McpServerDefinition, context: ProbeContext) {
    const initialized = (await this.#request(
      server,
      "initialize",
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "LiteMCP Composer Probe", version: "0.1.0" },
      },
      context
    )) as { protocolVersion?: unknown; serverInfo?: { version?: unknown } } | undefined;
    if (typeof initialized?.protocolVersion !== "string") {
      throw new Error("Upstream initialize response is invalid.");
    }
    const listed = (await this.#request(server, "tools/list", undefined, context)) as
      | { tools?: unknown }
      | undefined;
    if (!Array.isArray(listed?.tools) || listed.tools.length > 1_000) {
      throw new Error(
        "Upstream tools/list response is invalid or exceeds 1,000 tools."
      );
    }
    const tools = listed.tools.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`Upstream tool ${index} is invalid.`);
      }
      const tool = entry as {
        name?: unknown;
        title?: unknown;
        description?: unknown;
        inputSchema?: unknown;
        annotations?: {
          readOnlyHint?: unknown;
          destructiveHint?: unknown;
          idempotentHint?: unknown;
        };
      };
      if (
        typeof tool.name !== "string" ||
        tool.name.length < 1 ||
        tool.name.length > 160 ||
        !tool.inputSchema ||
        typeof tool.inputSchema !== "object" ||
        Array.isArray(tool.inputSchema)
      ) {
        throw new Error(`Upstream tool ${index} has an invalid name or input schema.`);
      }
      const destructive = tool.annotations?.destructiveHint === true;
      return {
        name: tool.name,
        title:
          typeof tool.title === "string" && tool.title.length > 0
            ? tool.title.slice(0, 160)
            : tool.name,
        description:
          typeof tool.description === "string"
            ? tool.description.slice(0, 2_000)
            : "Imported from upstream MCP discovery.",
        inputSchema: tool.inputSchema as Record<string, unknown>,
        // Discovery metadata is controlled by the upstream. It may raise the
        // risk classification, but only an administrator can downgrade a tool
        // to read-only or mark it retry-safe through PATCH /servers/:id.
        risk: destructive ? ("destructive" as const) : ("write" as const),
        readOnly: false,
        idempotent: false,
      };
    });
    return {
      tools,
      ...(typeof initialized.serverInfo?.version === "string"
        ? { serverVersion: initialized.serverInfo.version }
        : {}),
    };
  }

  async execute(
    server: McpServerDefinition,
    toolName: string,
    args: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolExecutionResult> {
    const result = (await this.#request(
      server,
      "tools/call",
      { name: toolName, arguments: args },
      context
    )) as ToolExecutionResult | undefined;
    if (!result?.content) {
      throw new Error("Upstream returned an invalid MCP tool result.");
    }
    return result;
  }
}

export class ExecutorRouter {
  readonly #active = new Map<string, number>();
  readonly #failures = new Map<string, { count: number; openUntil: number }>();

  constructor(
    private readonly executors: UpstreamExecutor[],
    private readonly limits: {
      maxConcurrencyPerServer?: number;
      failureThreshold?: number;
      circuitOpenMs?: number;
    } = {}
  ) {}

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
    const authorityKey = `${context.tenantId}:${resolved.server.id}`;
    const circuit = this.#failures.get(authorityKey);
    if (circuit && circuit.openUntil > Date.now()) {
      throw new Error(
        "The upstream circuit is temporarily open after repeated failures."
      );
    }
    const active = this.#active.get(authorityKey) ?? 0;
    if (active >= (this.limits.maxConcurrencyPerServer ?? 20)) {
      throw new Error("The upstream concurrency limit is currently saturated.");
    }
    this.#active.set(authorityKey, active + 1);
    const attempts = resolved.tool.idempotent ? 2 : 1;
    try {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const result = await executor.execute(
            resolved.server,
            resolved.upstreamName,
            args,
            context
          );
          this.#failures.delete(authorityKey);
          return result;
        } catch (error) {
          if (attempt < attempts && !context.signal?.aborted) {
            await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
            continue;
          }
          const previous = this.#failures.get(authorityKey)?.count ?? 0;
          const count = previous + 1;
          this.#failures.set(authorityKey, {
            count,
            openUntil:
              count >= (this.limits.failureThreshold ?? 3)
                ? Date.now() + (this.limits.circuitOpenMs ?? 30_000)
                : 0,
          });
          throw error;
        }
      }
      throw new Error("Upstream execution exhausted its retry budget.");
    } finally {
      const remaining = (this.#active.get(authorityKey) ?? 1) - 1;
      if (remaining <= 0) this.#active.delete(authorityKey);
      else this.#active.set(authorityKey, remaining);
    }
  }

  async probe(server: McpServerDefinition, context: ProbeContext) {
    const executor = this.executors.find(
      (candidate) => candidate.supports(server) && candidate.probe
    );
    if (!executor?.probe) {
      throw new Error(`No ${server.transport} probe adapter is installed.`);
    }
    return executor.probe(server, context);
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

const jsonBytes = (value: unknown) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
};

const parseInitializeClientInfo = (params: unknown): SessionClientInfo | null => {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  const value = params as {
    protocolVersion?: unknown;
    clientInfo?: { name?: unknown; version?: unknown };
  };
  const protocolVersion =
    typeof value.protocolVersion === "string" ? value.protocolVersion.trim() : "";
  const name =
    typeof value.clientInfo?.name === "string" ? value.clientInfo.name.trim() : "";
  const version =
    typeof value.clientInfo?.version === "string"
      ? value.clientInfo.version.trim()
      : "";
  if (
    protocolVersion.length < 1 ||
    protocolVersion.length > 64 ||
    name.length < 1 ||
    name.length > 120 ||
    version.length < 1 ||
    version.length > 64
  ) {
    return null;
  }
  const normalized = name.toLowerCase();
  const sdk = normalized === "@litemcp/sdk" || normalized === "litemcp-sdk-python";
  const userAgentClass: SessionClientInfo["userAgentClass"] = sdk
    ? "litemcp-sdk"
    : normalized.includes("cursor")
      ? "cursor"
      : normalized.includes("claude")
        ? "claude-code"
        : normalized.includes("chatgpt")
          ? "chatgpt"
          : normalized.includes("browser")
            ? "browser"
            : "other";
  return {
    name,
    version,
    protocolVersion,
    initializedAt: new Date().toISOString(),
    userAgentClass,
    sdk,
  };
};

type TerminalCallUsage = {
  eventType: "call" | "denied" | "approval_required" | "error";
  status: "succeeded" | "denied" | "pending" | "failed";
  errorCode?: string;
  namespace?: string;
  serverId?: string;
  tool?: string;
  aliasUsed?: boolean;
  risk?: ResolvedTool["tool"]["risk"];
  decisionEffect?: ResolvedTool["decision"]["effect"];
  matchedRuleIds?: string[];
  policyId?: string;
  policyVersion?: string;
  approvalId?: string;
  auditReceipt?: AuditReceipt;
};

export type McpGatewayOptions = {
  platform: PlatformService;
  executors?: UpstreamExecutor[];
  maxConcurrencyPerServer?: number;
  circuitFailureThreshold?: number;
  circuitOpenMs?: number;
};

export class McpGateway {
  readonly #router: ExecutorRouter;

  constructor(private readonly options: McpGatewayOptions) {
    this.#router = new ExecutorRouter(
      options.executors ?? [new BuiltinExecutor(), new RemoteHttpExecutor()],
      {
        maxConcurrencyPerServer: options.maxConcurrencyPerServer,
        failureThreshold: options.circuitFailureThreshold,
        circuitOpenMs: options.circuitOpenMs,
      }
    );
  }

  async probeServer(
    server: McpServerDefinition,
    requestId: string,
    signal?: AbortSignal
  ) {
    return this.#router.probe(server, { requestId, signal });
  }

  async handle(params: {
    tenantId: string;
    compositionSlug: string;
    authorization: string | null;
    body: unknown;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<{ status: number; body?: JsonRpcResponse }> {
    const handleStartedAt = performance.now();
    const requestBytes = jsonBytes(params.body);
    const request = params.body as Partial<JsonRpcRequest>;
    const id = request.id ?? null;
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return { status: 400, body: errorResponse(id, -32600, "Invalid Request") };
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

    if (request.method === "initialize") {
      const observedClientInfo = parseInitializeClientInfo(request.params);
      if (!observedClientInfo) {
        const response = errorResponse(
          id,
          -32602,
          "Invalid initialize parameters. clientInfo name/version and protocolVersion are required."
        );
        this.options.platform.recordSessionUsage(session, {
          eventType: "error",
          status: "failed",
          requestId: params.requestId,
          errorCode: "INVALID_INITIALIZE_PARAMS",
          latencyTotalMs: Math.max(0, performance.now() - handleStartedAt),
          requestBytes,
          responseBytes: jsonBytes(response),
        });
        return { status: 400, body: response };
      }
      let clientInfo = observedClientInfo;
      try {
        clientInfo = await this.options.platform.bindSessionAttribution(
          params.tenantId,
          session.id,
          observedClientInfo
        );
      } catch (error) {
        // Attribution persistence belongs to the fail-open insight plane.
        console.error("[litemcp] session attribution persistence failed", {
          requestId: params.requestId,
          errorClass: error instanceof Error ? error.name : "UnknownError",
        });
      }
      const response = resultResponse(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: true },
          logging: {},
        },
        serverInfo: { name: "LiteMCP Composer", version: "0.1.0" },
        instructions:
          "Capabilities are filtered by session identity and re-authorized on execution.",
      });
      this.options.platform.recordSessionUsage(session, {
        eventType: "initialize",
        status: "succeeded",
        requestId: params.requestId,
        clientInfo,
        latencyTotalMs: Math.max(0, performance.now() - handleStartedAt),
        requestBytes,
        responseBytes: jsonBytes(response),
      });
      return {
        status: 200,
        body: response,
      };
    }

    if (request.method.startsWith("notifications/")) {
      return { status: 202 };
    }

    if (request.method === "ping") {
      return { status: 200, body: resultResponse(id, {}) };
    }

    if (request.method === "logging/setLevel") {
      return { status: 200, body: resultResponse(id, {}) };
    }

    if (request.method === "tools/list") {
      try {
        const discovery = await this.options.platform.discoverVisibleTools(
          params.tenantId,
          composition.id,
          session.subject,
          params.requestId
        );
        const response = resultResponse(id, {
          tools: discovery.tools.map((tool) => ({
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              readOnlyHint: tool.readOnly,
              destructiveHint: [
                "destructive",
                "financial",
                "code-exec",
                "identity-admin",
              ].includes(tool.risk),
              idempotentHint: tool.idempotent,
            },
            _meta: {
              "litemcp.dev/provenance": tool.provenance,
              "litemcp.dev/risk": tool.risk,
              "litemcp.dev/serverVersion": tool.serverVersion,
            },
          })),
        });
        this.options.platform.recordSessionUsage(session, {
          eventType: "discover",
          status: discovery.denied ? "denied" : "succeeded",
          requestId: params.requestId,
          matchedRuleIds: discovery.matchedRuleIds,
          ...(discovery.policyId ? { policyId: discovery.policyId } : {}),
          ...(discovery.policyVersion
            ? { policyVersion: discovery.policyVersion }
            : {}),
          toolsVisible: discovery.toolsVisible,
          toolsHidden: discovery.toolsHidden,
          visibleTools: discovery.visibleTools,
          visibilityTruncated: discovery.visibilityTruncated,
          auditReceipt: discovery.auditReceipt,
          latencyTotalMs: Math.max(0, performance.now() - handleStartedAt),
          requestBytes,
          responseBytes: jsonBytes(response),
        });
        return { status: 200, body: response };
      } catch (error) {
        const response = errorResponse(id, -32002, "Capability discovery failed.", {
          requestId: params.requestId,
        });
        this.options.platform.recordSessionUsage(session, {
          eventType: "discover",
          status: "failed",
          requestId: params.requestId,
          matchedRuleIds: [],
          toolsVisible: 0,
          toolsHidden: 0,
          visibleTools: [],
          visibilityTruncated: false,
          errorCode:
            error instanceof PlatformAuthorizationError
              ? "DISCOVERY_DENIED"
              : "DISCOVERY_FAILED",
          latencyTotalMs: Math.max(0, performance.now() - handleStartedAt),
          requestBytes,
          responseBytes: jsonBytes(response),
        });
        return { status: 502, body: response };
      }
    }

    if (request.method === "tools/call") {
      const parsed = callParams(request.params);
      if (!parsed) {
        const response = errorResponse(id, -32602, "Invalid tools/call parameters.");
        this.options.platform.recordSessionUsage(session, {
          eventType: "error",
          status: "failed",
          requestId: params.requestId,
          errorCode: "INVALID_CALL_PARAMS",
          latencyTotalMs: Math.max(0, performance.now() - handleStartedAt),
          latencyUpstreamMs: 0,
          requestBytes,
          responseBytes: jsonBytes(response),
        });
        return { status: 400, body: response };
      }

      let resolved: ResolvedTool | undefined;
      let usageSession: GatewaySession = session;
      let terminalUsage: TerminalCallUsage | null = {
        eventType: "error",
        status: "failed",
        errorCode: "INTERNAL_ERROR",
        tool: parsed.name,
      };
      let responseBody: JsonRpcResponse | undefined;
      let latencyUpstreamMs = 0;
      let upstreamRequestBytes = 0;
      let upstreamResponseBytes = 0;
      const finish = (status: number, body: JsonRpcResponse) => {
        responseBody = body;
        return { status, body };
      };
      const usageForResolved = (
        current: ResolvedTool,
        eventType: TerminalCallUsage["eventType"],
        status: TerminalCallUsage["status"],
        errorCode?: string,
        auditReceipt: AuditReceipt = current.auditReceipt
      ): TerminalCallUsage => ({
        eventType,
        status,
        ...(errorCode ? { errorCode } : {}),
        namespace: current.canonicalName.slice(0, current.canonicalName.indexOf(".")),
        serverId: current.server.id,
        tool: current.canonicalName,
        aliasUsed: current.aliasUsed,
        risk: current.tool.risk,
        decisionEffect: current.decision.effect,
        matchedRuleIds: current.decision.matchedRuleIds,
        ...(current.decision.policyId ? { policyId: current.decision.policyId } : {}),
        ...(current.decision.policyVersion
          ? { policyVersion: current.decision.policyVersion }
          : {}),
        auditReceipt,
      });
      try {
        resolved = await this.options.platform.resolveTool(
          params.tenantId,
          composition.id,
          session.subject,
          parsed.name,
          params.requestId
        );
        terminalUsage = usageForResolved(resolved, "error", "failed", "INTERNAL_ERROR");
        const argumentErrors = validateToolArguments(
          resolved.tool.inputSchema,
          parsed.arguments
        );
        if (argumentErrors.length > 0) {
          const auditEvent = await this.options.platform.appendAudit(params.tenantId, {
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
          terminalUsage = usageForResolved(
            resolved,
            "denied",
            "denied",
            "ARGUMENT_VALIDATION",
            auditEvent
          );
          return finish(
            400,
            errorResponse(id, -32602, "Invalid tool arguments.", {
              errors: argumentErrors,
              requestId: params.requestId,
            })
          );
        }
        if (resolved.decision.requiresApproval) {
          const approvalState = await this.options.platform.consumeApprovalForCall(
            params.tenantId,
            session,
            resolved,
            parsed.arguments,
            params.requestId
          );
          if (approvalState.state === "denied") {
            terminalUsage = {
              ...usageForResolved(resolved, "denied", "denied", "APPROVAL_DENIED"),
              approvalId: approvalState.approval.id,
            };
            return finish(
              403,
              errorResponse(id, -32003, "This exact action was denied.", {
                approvalId: approvalState.approval.id,
                reason: approvalState.approval.decisionReason,
              })
            );
          }
          if (approvalState.state !== "approved") {
            let approval: ApprovalRequest;
            let lifecycleRecorded = false;
            if (approvalState.state === "pending") {
              approval = approvalState.approval;
            } else {
              const created = await this.options.platform.createApprovalWithState(
                params.tenantId,
                session,
                resolved,
                parsed.arguments,
                params.requestId
              );
              approval = created.approval;
              lifecycleRecorded = created.created;
            }
            terminalUsage = lifecycleRecorded
              ? null
              : {
                  ...usageForResolved(resolved, "approval_required", "pending"),
                  approvalId: approval.id,
                };
            return finish(
              200,
              resultResponse(id, {
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
                isError: true,
              })
            );
          }
        }
        await this.options.platform.consumeToolCallQuota(params.tenantId);
        const executionId = randomId("execution");
        try {
          const dispatchAudit = await this.options.platform.appendAudit(
            params.tenantId,
            {
              type: "execution.dispatched",
              actorId: session.subject.id,
              action: "execute",
              targetType: "tool",
              targetId: resolved.canonicalName,
              outcome: "allowed",
              requestId: params.requestId,
              policyVersion: resolved.decision.policyVersion ?? undefined,
              explanation:
                "Execution was authorized and is ready for upstream dispatch.",
              metadata: {
                executionId,
                idempotent: resolved.tool.idempotent,
                serverId: resolved.server.id,
              },
            }
          );
          terminalUsage = usageForResolved(
            resolved,
            "error",
            "failed",
            "INTERNAL_ERROR",
            dispatchAudit
          );
          await this.options.platform.recordActivationEvent(
            params.tenantId,
            "first_tool_call",
            session.subject.id,
            { toolName: resolved.canonicalName },
            true
          );
        } catch (error) {
          console.error("[litemcp] execution blocked because audit is unavailable", {
            requestId: params.requestId,
            executionId,
            errorClass: error instanceof Error ? error.name : "UnknownError",
          });
          terminalUsage = usageForResolved(
            resolved,
            "error",
            "failed",
            "AUDIT_UNAVAILABLE"
          );
          return finish(
            503,
            errorResponse(
              id,
              -32004,
              "Execution was not dispatched because audit persistence is unavailable.",
              { retryable: true, requestId: params.requestId }
            )
          );
        }
        const dispatchSession = await this.options.platform.authenticateSession(
          params.tenantId,
          token
        );
        if (!dispatchSession || dispatchSession.id !== session.id) {
          throw new PlatformAuthorizationError(
            "The MCP session was revoked or frozen before dispatch."
          );
        }
        usageSession = dispatchSession;
        await this.options.platform.assertExecutionContext(
          params.tenantId,
          dispatchSession,
          resolved
        );
        const dispatchStartedAt = performance.now();
        const result = await this.#router.execute(resolved, parsed.arguments, {
          requestId: params.requestId,
          tenantId: params.tenantId,
          session: dispatchSession,
          signal: params.signal,
          onUpstreamMeasurement: (measurement) => {
            latencyUpstreamMs += measurement.latencyMs;
            upstreamRequestBytes += measurement.requestBytes;
            upstreamResponseBytes += measurement.responseBytes;
          },
        });
        try {
          const completionAudit = await this.options.platform.appendAudit(
            params.tenantId,
            {
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
                durationMs: Math.round(performance.now() - dispatchStartedAt),
              },
            }
          );
          terminalUsage = usageForResolved(
            resolved,
            result.isError ? "error" : "call",
            result.isError ? "failed" : "succeeded",
            result.isError ? "TOOL_REPORTED_ERROR" : undefined,
            completionAudit
          );
        } catch (error) {
          // The upstream already completed. Never convert a successful side
          // effect into a retryable failure because completion-audit storage
          // is degraded; the pre-dispatch record retains the execution ID.
          console.error("[litemcp] completion audit persistence failed", {
            requestId: params.requestId,
            executionId,
            errorClass: error instanceof Error ? error.name : "UnknownError",
          });
          terminalUsage = usageForResolved(
            resolved,
            result.isError ? "error" : "call",
            result.isError ? "failed" : "succeeded",
            result.isError ? "TOOL_REPORTED_ERROR" : undefined,
            terminalUsage?.auditReceipt ?? resolved.auditReceipt
          );
        }
        return finish(200, resultResponse(id, result));
      } catch (error) {
        if (error instanceof PlatformPolicyDeniedError) {
          const denied = error.context;
          terminalUsage = {
            eventType: "denied",
            status: "denied",
            errorCode: "POLICY_DENIED",
            namespace: denied.namespace,
            serverId: denied.serverId,
            tool: denied.canonicalName,
            aliasUsed: denied.aliasUsed,
            risk: denied.risk,
            decisionEffect: denied.decision.effect,
            matchedRuleIds: denied.decision.matchedRuleIds,
            ...(denied.decision.policyId ? { policyId: denied.decision.policyId } : {}),
            ...(denied.decision.policyVersion
              ? { policyVersion: denied.decision.policyVersion }
              : {}),
            auditReceipt: denied.auditReceipt,
          };
          return finish(
            403,
            errorResponse(id, -32003, "Tool execution denied by policy.", {
              explanation: error.message,
              requestId: params.requestId,
            })
          );
        }
        if (error instanceof PlatformAuthorizationError) {
          terminalUsage = resolved
            ? usageForResolved(resolved, "denied", "denied", "AUTHORIZATION_DENIED")
            : {
                eventType: "denied",
                status: "denied",
                errorCode: "AUTHORIZATION_DENIED",
                tool: parsed.name,
              };
          return finish(
            403,
            errorResponse(id, -32003, "Tool execution denied by policy.", {
              explanation: error.message,
              requestId: params.requestId,
            })
          );
        }
        if (error instanceof PlatformNotFoundError) {
          terminalUsage = {
            eventType: "denied",
            status: "denied",
            errorCode: "TOOL_NOT_VISIBLE",
            tool: parsed.name,
          };
          return finish(
            404,
            errorResponse(id, -32601, "Tool not found or not visible.")
          );
        }
        if (error instanceof PlatformQuotaError) {
          terminalUsage = resolved
            ? usageForResolved(resolved, "denied", "denied", "QUOTA_EXCEEDED")
            : {
                eventType: "denied",
                status: "denied",
                errorCode: "QUOTA_EXCEEDED",
                tool: parsed.name,
              };
          return finish(
            429,
            errorResponse(id, -32005, error.message, {
              retryable: false,
              requestId: params.requestId,
            })
          );
        }
        if (error instanceof PlatformConflictError) {
          terminalUsage = resolved
            ? usageForResolved(
                resolved,
                "error",
                "failed",
                "EXECUTION_CONTEXT_CONFLICT"
              )
            : {
                eventType: "error",
                status: "failed",
                errorCode: "EXECUTION_CONTEXT_CONFLICT",
                tool: parsed.name,
              };
          return finish(
            409,
            errorResponse(id, -32009, error.message, {
              retryable: false,
              requestId: params.requestId,
            })
          );
        }
        try {
          const failureAudit = await this.options.platform.appendAudit(
            params.tenantId,
            {
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
            }
          );
          terminalUsage = resolved
            ? usageForResolved(
                resolved,
                "error",
                "failed",
                "UPSTREAM_FAILURE",
                failureAudit
              )
            : {
                eventType: "error",
                status: "failed",
                errorCode: "UPSTREAM_FAILURE",
                tool: parsed.name,
                auditReceipt: failureAudit,
              };
        } catch (auditError) {
          console.error("[litemcp] failure audit persistence failed", {
            requestId: params.requestId,
            errorClass: auditError instanceof Error ? auditError.name : "UnknownError",
          });
          terminalUsage = resolved
            ? usageForResolved(resolved, "error", "failed", "UPSTREAM_FAILURE")
            : {
                eventType: "error",
                status: "failed",
                errorCode: "UPSTREAM_FAILURE",
                tool: parsed.name,
              };
        }
        return finish(
          502,
          errorResponse(
            id,
            -32002,
            "Upstream execution failed or has an indeterminate outcome; do not retry automatically.",
            {
              retryable: false,
              outcome: "indeterminate",
              requestId: params.requestId,
            }
          )
        );
      } finally {
        if (terminalUsage) {
          const latencyTotalMs = Math.max(0, performance.now() - handleStartedAt);
          this.options.platform.recordSessionUsage(usageSession, {
            ...terminalUsage,
            requestId: params.requestId,
            latencyTotalMs,
            latencyUpstreamMs: Math.min(latencyUpstreamMs, latencyTotalMs),
            requestBytes:
              upstreamRequestBytes > 0 ? upstreamRequestBytes : requestBytes,
            responseBytes:
              upstreamResponseBytes > 0
                ? upstreamResponseBytes
                : responseBody
                  ? jsonBytes(responseBody)
                  : 0,
          });
        }
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
