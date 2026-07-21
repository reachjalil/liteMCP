import type {
  ApiProblem,
  ApiSuccess,
  AuditEvent,
  Composition,
  CreateSessionInput,
  GatewaySession,
  McpServerDefinition,
  PlatformOverview,
  Policy,
  PolicyDecision,
  PolicySimulationInput,
} from "@litemcp/contracts";

export class LiteMcpApiError extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.detail);
    this.name = "LiteMcpApiError";
  }
}

export type LiteMcpClientOptions = {
  baseUrl: string;
  tenantId?: string;
  demoRole?: "employee" | "finance-admin";
  apiKey?: string;
  fetch?: typeof fetch;
};

export type IssuedSession = {
  session: Omit<GatewaySession, "tokenHash"> & { tokenHash: "[REDACTED]" };
  token: string;
  endpoint: string;
};

export class LiteMcpClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(private readonly options: LiteMcpClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#fetch = options.fetch ?? fetch;
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (this.options.tenantId) {
      headers.set("x-litemcp-tenant", this.options.tenantId);
    }
    if (this.options.demoRole) {
      headers.set("x-litemcp-role", this.options.demoRole);
    }
    if (this.options.apiKey) {
      headers.set("authorization", `Bearer ${this.options.apiKey}`);
    }
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
      redirect: "error",
    });
    const payload = (await response.json()) as ApiSuccess<T> | ApiProblem;
    if (!response.ok || !("data" in payload)) {
      throw new LiteMcpApiError(payload as ApiProblem);
    }
    return payload.data;
  }

  overview() {
    return this.#request<PlatformOverview>("/api/v1/overview");
  }

  servers() {
    return this.#request<McpServerDefinition[]>("/api/v1/servers");
  }

  compositions() {
    return this.#request<Composition[]>("/api/v1/compositions");
  }

  policies() {
    return this.#request<Policy[]>("/api/v1/policies");
  }

  audit(limit = 100) {
    return this.#request<AuditEvent[]>(`/api/v1/audit?limit=${limit}`);
  }

  simulatePolicy(input: PolicySimulationInput) {
    return this.#request<PolicyDecision>("/api/v1/policy/simulate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createSession(input: CreateSessionInput) {
    return this.#request<IssuedSession>("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  revokeSession(sessionId: string) {
    return this.#request<
      Omit<GatewaySession, "tokenHash"> & {
        tokenHash: "[REDACTED]";
      }
    >(`/api/v1/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: "POST",
    });
  }

  exportConfiguration() {
    return this.#request<Record<string, unknown>>("/api/v1/export");
  }
}

type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

export class McpSessionClient {
  readonly #fetch: typeof fetch;
  #requestId = 0;

  constructor(
    readonly endpoint: string,
    private readonly token: string,
    fetchImplementation: typeof fetch = fetch
  ) {
    this.#fetch = fetchImplementation;
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    this.#requestId += 1;
    const response = await this.#fetch(this.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.#requestId,
        method,
        ...(params === undefined ? {} : { params }),
      }),
      redirect: "error",
    });
    const payload = (await response.json()) as JsonRpcResponse<T>;
    if (!response.ok || payload.error) {
      throw new Error(
        payload.error?.message ?? `MCP request failed (${response.status}).`
      );
    }
    if (payload.result === undefined) {
      throw new Error("MCP response did not contain a result.");
    }
    return payload.result;
  }

  initialize() {
    return this.request<{
      protocolVersion: string;
      capabilities: Record<string, unknown>;
      serverInfo: { name: string; version: string };
    }>("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "@litemcp/sdk", version: "0.1.0" },
    });
  }

  listTools() {
    return this.request<{ tools: Array<Record<string, unknown>> }>("tools/list");
  }

  callTool(name: string, args: Record<string, unknown>) {
    return this.request<{
      content: Array<Record<string, unknown>>;
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
    }>("tools/call", { name, arguments: args });
  }
}
