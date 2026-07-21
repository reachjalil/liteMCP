import type {
  ApiProblem,
  ApiSuccess,
  ApprovalRequest,
  AuditEvent,
  Composition,
  CreateCompositionInput,
  CreateServerInput,
  CreateSessionInput,
  GatewaySession,
  IdentityProvider,
  McpServerDefinition,
  PlatformOverview,
  Policy,
  PolicyDecision,
  PolicySimulationInput,
} from "@litemcp/contracts";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

export type IssuedSession = {
  session: GatewaySession;
  token: string;
  endpoint: string;
};

export class ApiClientError extends Error {
  readonly problem: ApiProblem | null;
  readonly status: number | null;

  constructor(message: string, options?: { problem?: ApiProblem; status?: number }) {
    super(message);
    this.name = "ApiClientError";
    this.problem = options?.problem ?? null;
    this.status = options?.status ?? null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isProblem = (value: unknown): value is ApiProblem =>
  isRecord(value) &&
  typeof value.title === "string" &&
  typeof value.detail === "string" &&
  typeof value.status === "number" &&
  typeof value.requestId === "string";

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const responseMessage = (status: number, payload: unknown) => {
  if (isProblem(payload)) {
    return payload.detail || payload.title;
  }
  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  return `The API returned HTTP ${status}.`;
};

export class LiteMcpApiClient {
  readonly baseUrl: string;
  readonly demoMode: boolean;

  constructor(options: { baseUrl?: string; demoMode: boolean }) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "");
    this.demoMode = options.demoMode;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiSuccess<T>> {
    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (this.demoMode) {
      headers.set("x-litemcp-tenant", "org_demo");
      headers.set("x-litemcp-role", "finance-admin");
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: "include",
        headers,
      });
    } catch (cause) {
      throw new ApiClientError(
        cause instanceof Error
          ? `Could not reach the LiteMCP Composer API: ${cause.message}`
          : "Could not reach the LiteMCP Composer API."
      );
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new ApiClientError(responseMessage(response.status, payload), {
        problem: isProblem(payload) ? payload : undefined,
        status: response.status,
      });
    }

    if (!isRecord(payload) || !("data" in payload) || !isRecord(payload.meta)) {
      throw new ApiClientError("The API returned an invalid success envelope.", {
        status: response.status,
      });
    }

    return payload as ApiSuccess<T>;
  }

  getOverview() {
    return this.request<PlatformOverview>("/api/v1/overview");
  }

  getServers() {
    return this.request<McpServerDefinition[]>("/api/v1/servers");
  }

  getCompositions() {
    return this.request<Composition[]>("/api/v1/compositions");
  }

  getPolicies() {
    return this.request<Policy[]>("/api/v1/policies");
  }

  getAuditEvents() {
    return this.request<AuditEvent[]>("/api/v1/audit");
  }

  getIdentityProviders() {
    return this.request<IdentityProvider[]>("/api/v1/identity-providers");
  }

  getApprovals() {
    return this.request<ApprovalRequest[]>("/api/v1/approvals");
  }

  createServer(input: CreateServerInput) {
    return this.request<McpServerDefinition>("/api/v1/servers", {
      method: "POST",
      body: input,
    });
  }

  createComposition(input: CreateCompositionInput) {
    return this.request<Composition>("/api/v1/compositions", {
      method: "POST",
      body: input,
    });
  }

  issueSession(input: CreateSessionInput) {
    return this.request<IssuedSession>("/api/v1/sessions", {
      method: "POST",
      body: input,
    });
  }

  simulatePolicy(input: PolicySimulationInput) {
    return this.request<PolicyDecision>("/api/v1/policy/simulate", {
      method: "POST",
      body: input,
    });
  }
}
