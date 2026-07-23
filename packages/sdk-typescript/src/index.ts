import type {
  ApiProblem,
  ApiSuccess,
  ApprovalDecisionInput,
  ApprovalRequest,
  AssignRoleInput,
  AuditEvent,
  Composition,
  CreateCompositionInput,
  CreateIdentityProviderInput,
  CreatePolicyInput,
  CreateRoleInput,
  CreateServerInput,
  CreateServicePrincipalInput,
  CreateSessionInput,
  Environment,
  GatewaySession,
  IdentityProvider,
  McpServerDefinition,
  Organization,
  PlatformOverview,
  Policy,
  PolicyDecision,
  PolicySimulationInput,
  Role,
  RoleAssignment,
  ServicePrincipal,
  TenantAuthority,
  UpdateCompositionInput,
  UpdateIdentityProviderInput,
  UpdatePolicyInput,
  UpdateRoleInput,
  UpdateServerInput,
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
  session: RedactedGatewaySession;
  token: string;
  endpoint: string;
};

export type RedactedGatewaySession = Omit<GatewaySession, "tokenHash"> & {
  tokenHash: "[REDACTED]";
};

export type RedactedIdentityProvider = Omit<
  IdentityProvider,
  "clientId" | "secretReference"
> & {
  clientId: "[REDACTED]";
  secretReference: "[REDACTED]";
};

export type PolicyLint = {
  valid: boolean;
  conflicts: Array<{ ruleIds: string[]; message: string }>;
  unreachable: Array<{ ruleId: string; shadowedBy: string; message: string }>;
};

export type PolicyMutation = {
  policy: Policy;
  lint: PolicyLint;
};

export type ActivationEvent = {
  id: string;
  tenantId: string;
  name:
    | "tenant_bootstrapped"
    | "server_registered"
    | "server_probed"
    | "composition_published"
    | "session_issued"
    | "first_tool_call";
  actorId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type PortableConfiguration = {
  format: "litemcp.portable.v1";
  exportedAt: string;
  tenantId: string;
  organization: Organization;
  environments: Environment[];
  servers: McpServerDefinition[];
  compositions: Composition[];
  policies: Policy[];
  roles: Role[];
  identityProviders: IdentityProvider[];
  secretsIncluded: false;
};

export type PortableConfigurationImport = Omit<
  PortableConfiguration,
  "exportedAt" | "tenantId"
> & {
  exportedAt?: string;
  tenantId?: string;
};

export type CreatedServicePrincipal = {
  principal: Omit<ServicePrincipal, "secretHash"> & {
    secretHash: "[REDACTED]";
  };
  secret: string;
};

export type ServicePrincipalSessionInput = Omit<
  CreateSessionInput,
  "subject" | "expiresInSeconds"
> & {
  tenantId: string;
  expiresInSeconds?: number;
};

export type DeletedResource = { id: string; deleted: true };

export type DeprovisionedSubject = {
  subjectId: string;
  assignmentsRemoved: number;
  sessionsRevoked: number;
  authorizationEpoch: number;
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
    if (this.options.apiKey && !headers.has("authorization")) {
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

  environments() {
    return this.#request<Environment[]>("/api/v1/environments");
  }

  servers() {
    return this.#request<McpServerDefinition[]>("/api/v1/servers");
  }

  createServer(input: CreateServerInput) {
    return this.#request<McpServerDefinition>("/api/v1/servers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateServer(serverId: string, input: UpdateServerInput) {
    return this.#request<McpServerDefinition>(
      `/api/v1/servers/${encodeURIComponent(serverId)}`,
      { method: "PATCH", body: JSON.stringify(input) }
    );
  }

  deleteServer(serverId: string) {
    return this.#request<DeletedResource>(
      `/api/v1/servers/${encodeURIComponent(serverId)}`,
      { method: "DELETE" }
    );
  }

  probeServer(serverId: string, options: { acceptDrift?: boolean } = {}) {
    return this.#request<McpServerDefinition>(
      `/api/v1/servers/${encodeURIComponent(serverId)}/probe`,
      { method: "POST", body: JSON.stringify(options) }
    );
  }

  compositions() {
    return this.#request<Composition[]>("/api/v1/compositions");
  }

  createComposition(input: CreateCompositionInput) {
    return this.#request<Composition>("/api/v1/compositions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateComposition(compositionId: string, input: UpdateCompositionInput) {
    return this.#request<Composition>(
      `/api/v1/compositions/${encodeURIComponent(compositionId)}`,
      { method: "PATCH", body: JSON.stringify(input) }
    );
  }

  publishComposition(compositionId: string) {
    return this.#request<Composition>(
      `/api/v1/compositions/${encodeURIComponent(compositionId)}/publish`,
      { method: "POST" }
    );
  }

  deleteComposition(compositionId: string) {
    return this.#request<DeletedResource>(
      `/api/v1/compositions/${encodeURIComponent(compositionId)}`,
      { method: "DELETE" }
    );
  }

  policies() {
    return this.#request<Policy[]>("/api/v1/policies");
  }

  createPolicy(input: CreatePolicyInput) {
    return this.#request<PolicyMutation>("/api/v1/policies", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updatePolicy(policyId: string, input: UpdatePolicyInput) {
    return this.#request<PolicyMutation>(
      `/api/v1/policies/${encodeURIComponent(policyId)}`,
      { method: "PATCH", body: JSON.stringify(input) }
    );
  }

  lintPolicy(policyId: string) {
    return this.#request<PolicyLint>(
      `/api/v1/policies/${encodeURIComponent(policyId)}/lint`
    );
  }

  activatePolicy(policyId: string) {
    return this.#request<PolicyMutation>(
      `/api/v1/policies/${encodeURIComponent(policyId)}/activate`,
      { method: "POST" }
    );
  }

  archivePolicy(policyId: string) {
    return this.#request<Policy>(
      `/api/v1/policies/${encodeURIComponent(policyId)}/archive`,
      { method: "POST" }
    );
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

  sessions() {
    return this.#request<RedactedGatewaySession[]>("/api/v1/sessions");
  }

  revokeSession(sessionId: string) {
    return this.#request<RedactedGatewaySession>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/revoke`,
      {
        method: "POST",
      }
    );
  }

  roles() {
    return this.#request<Role[]>("/api/v1/roles");
  }

  createRole(input: CreateRoleInput) {
    return this.#request<Role>("/api/v1/roles", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateRole(roleId: string, input: UpdateRoleInput) {
    return this.#request<Role>(`/api/v1/roles/${encodeURIComponent(roleId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteRole(roleId: string) {
    return this.#request<DeletedResource>(
      `/api/v1/roles/${encodeURIComponent(roleId)}`,
      { method: "DELETE" }
    );
  }

  roleAssignments(subjectId?: string) {
    const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
    return this.#request<RoleAssignment[]>(`/api/v1/role-assignments${query}`);
  }

  assignRole(input: AssignRoleInput) {
    return this.#request<RoleAssignment>("/api/v1/role-assignments", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  removeRoleAssignment(assignmentId: string) {
    return this.#request<DeletedResource>(
      `/api/v1/role-assignments/${encodeURIComponent(assignmentId)}`,
      { method: "DELETE" }
    );
  }

  identityProviders() {
    return this.#request<RedactedIdentityProvider[]>("/api/v1/identity-providers");
  }

  createIdentityProvider(input: CreateIdentityProviderInput) {
    return this.#request<RedactedIdentityProvider>("/api/v1/identity-providers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateIdentityProvider(providerId: string, input: UpdateIdentityProviderInput) {
    return this.#request<RedactedIdentityProvider>(
      `/api/v1/identity-providers/${encodeURIComponent(providerId)}`,
      { method: "PATCH", body: JSON.stringify(input) }
    );
  }

  deleteIdentityProvider(providerId: string) {
    return this.#request<DeletedResource>(
      `/api/v1/identity-providers/${encodeURIComponent(providerId)}`,
      { method: "DELETE" }
    );
  }

  approvals() {
    return this.#request<ApprovalRequest[]>("/api/v1/approvals");
  }

  decideApproval(approvalId: string, input: ApprovalDecisionInput) {
    return this.#request<ApprovalRequest>(
      `/api/v1/approvals/${encodeURIComponent(approvalId)}/decision`,
      { method: "POST", body: JSON.stringify(input) }
    );
  }

  authority() {
    return this.#request<TenantAuthority>("/api/v1/authority");
  }

  freeze(reason?: string) {
    return this.#request<TenantAuthority>("/api/v1/tenant/freeze", {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
  }

  unfreeze() {
    return this.#request<TenantAuthority>("/api/v1/tenant/unfreeze", {
      method: "POST",
    });
  }

  createServicePrincipal(input: CreateServicePrincipalInput) {
    return this.#request<CreatedServicePrincipal>("/api/v1/service-principals", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createServicePrincipalSession(
    input: ServicePrincipalSessionInput,
    credentials: { clientId: string; secret: string }
  ) {
    return this.#request<IssuedSession>("/api/v1/service-principal-sessions", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.secret}`)}`,
      },
      body: JSON.stringify(input),
    });
  }

  deprovisionSubject(subjectId: string) {
    return this.#request<DeprovisionedSubject>(
      `/api/v1/subjects/${encodeURIComponent(subjectId)}/deprovision`,
      { method: "POST" }
    );
  }

  activationEvents() {
    return this.#request<ActivationEvent[]>("/api/v1/activation-events");
  }

  exportConfiguration() {
    return this.#request<PortableConfiguration>("/api/v1/export");
  }

  importConfiguration(configuration: PortableConfigurationImport) {
    return this.#request<PlatformOverview>("/api/v1/import", {
      method: "POST",
      body: JSON.stringify(configuration),
    });
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
