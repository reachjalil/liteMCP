import type {
  AnalyticsFlowsResult,
  AnalyticsInterval,
  AnalyticsPolicyInsightsResult,
  AnalyticsRecentResult,
  AnalyticsSessionTimelineResult,
  AnalyticsSummaryResult,
  AnalyticsTimeseriesMetric,
  AnalyticsTimeseriesResult,
  AnalyticsTopDimension,
  AnalyticsTopMetric,
  AnalyticsTopResult,
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
  UsageStanding,
} from "@litemcp/contracts";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export type AnalyticsRange = {
  from: string;
  to: string;
};

export type AnalyticsExport = {
  blob: Blob;
  filename: string;
};

export type IssuedSession = {
  session: GatewaySession;
  token: string;
  endpoint: string;
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

export type PolicyLint = {
  valid: boolean;
  conflicts: Array<{ ruleIds: string[]; message: string }>;
  unreachable: Array<{ ruleId: string; shadowedBy: string; message: string }>;
};

export type PolicyMutationResult = {
  policy: Policy;
  lint: PolicyLint;
};

export type IssuedServicePrincipal = {
  principal: ServicePrincipal;
  secret: string;
};

export type PortableExport = {
  format: "litemcp.portable.v1";
  exportedAt: string;
  tenantId: string;
  organization: PlatformOverview["organization"];
  environments: Environment[];
  servers: McpServerDefinition[];
  compositions: Composition[];
  policies: Policy[];
  roles: Role[];
  identityProviders: IdentityProvider[];
  secretsIncluded: false;
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

const queryPath = (
  path: string,
  values: Record<string, string | number | undefined>
) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
};

const responseFilename = (response: Response, fallback: string) => {
  const disposition = response.headers.get("content-disposition");
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition?.match(/filename="([^"]+)"/i)?.[1];
  const plain = disposition?.match(/filename=([^;]+)/i)?.[1];
  const candidate = encoded
    ? decodeURIComponent(encoded)
    : (quoted ?? plain?.trim() ?? fallback);
  return candidate.replace(/[\\/\0]/g, "-");
};

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

  private headers(accept = "application/json") {
    const headers = new Headers({ Accept: accept });
    if (this.demoMode) {
      headers.set("x-litemcp-tenant", "org_demo");
      headers.set("x-litemcp-role", "finance-admin");
    }
    return headers;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiSuccess<T>> {
    const headers = this.headers();
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
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

  getEnvironments() {
    return this.request<Environment[]>("/api/v1/environments");
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

  getAnalyticsSummary(range: AnalyticsRange) {
    return this.request<AnalyticsSummaryResult>(
      queryPath("/api/v1/analytics/summary", range)
    );
  }

  getAnalyticsTimeseries(
    range: AnalyticsRange & {
      metric: AnalyticsTimeseriesMetric;
      interval: AnalyticsInterval;
    }
  ) {
    return this.request<AnalyticsTimeseriesResult>(
      queryPath("/api/v1/analytics/timeseries", range)
    );
  }

  getAnalyticsTop(
    range: AnalyticsRange & {
      dimension: AnalyticsTopDimension;
      metric: AnalyticsTopMetric;
      limit?: number;
    }
  ) {
    return this.request<AnalyticsTopResult>(queryPath("/api/v1/analytics/top", range));
  }

  getAnalyticsRecent(range: AnalyticsRange & { limit?: number; cursor?: string }) {
    return this.request<AnalyticsRecentResult>(
      queryPath("/api/v1/analytics/recent", range)
    );
  }

  getAnalyticsSessionTimeline(sessionId: string, range: AnalyticsRange) {
    return this.request<AnalyticsSessionTimelineResult>(
      queryPath(
        `/api/v1/analytics/sessions/${encodeURIComponent(sessionId)}/timeline`,
        range
      )
    );
  }

  getAnalyticsFlows(range: AnalyticsRange & { limit?: number }) {
    return this.request<AnalyticsFlowsResult>(
      queryPath("/api/v1/analytics/flows", range)
    );
  }

  getAnalyticsPolicyInsights(range: AnalyticsRange) {
    return this.request<AnalyticsPolicyInsightsResult>(
      queryPath("/api/v1/analytics/policy-insights", range)
    );
  }

  getUsageStanding() {
    return this.request<UsageStanding>("/api/v1/usage");
  }

  async downloadAnalyticsCsv(
    path: string,
    values: Record<string, string | number | undefined>,
    fallbackFilename: string
  ): Promise<AnalyticsExport> {
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}${queryPath(path, { ...values, format: "csv" })}`,
        {
          credentials: "include",
          headers: this.headers("text/csv, application/problem+json"),
        }
      );
    } catch (cause) {
      throw new ApiClientError(
        cause instanceof Error
          ? `Could not reach the LiteMCP Composer API: ${cause.message}`
          : "Could not reach the LiteMCP Composer API."
      );
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as unknown;
      throw new ApiClientError(responseMessage(response.status, payload), {
        problem: isProblem(payload) ? payload : undefined,
        status: response.status,
      });
    }
    return {
      blob: await response.blob(),
      filename: responseFilename(response, fallbackFilename),
    };
  }

  getIdentityProviders() {
    return this.request<IdentityProvider[]>("/api/v1/identity-providers");
  }

  getApprovals() {
    return this.request<ApprovalRequest[]>("/api/v1/approvals");
  }

  getSessions() {
    return this.request<GatewaySession[]>("/api/v1/sessions");
  }

  getRoles() {
    return this.request<Role[]>("/api/v1/roles");
  }

  getRoleAssignments(subjectId?: string) {
    const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
    return this.request<RoleAssignment[]>(`/api/v1/role-assignments${query}`);
  }

  getActivationEvents() {
    return this.request<ActivationEvent[]>("/api/v1/activation-events");
  }

  getAuthority() {
    return this.request<TenantAuthority>("/api/v1/authority");
  }

  createServer(input: CreateServerInput) {
    return this.request<McpServerDefinition>("/api/v1/servers", {
      method: "POST",
      body: input,
    });
  }

  updateServer(serverId: string, input: UpdateServerInput) {
    return this.request<McpServerDefinition>(
      `/api/v1/servers/${encodeURIComponent(serverId)}`,
      { method: "PATCH", body: input }
    );
  }

  deleteServer(serverId: string) {
    return this.request<{ id: string; deleted: true }>(
      `/api/v1/servers/${encodeURIComponent(serverId)}`,
      { method: "DELETE" }
    );
  }

  probeServer(serverId: string, acceptDrift = false) {
    return this.request<McpServerDefinition>(
      `/api/v1/servers/${encodeURIComponent(serverId)}/probe`,
      { method: "POST", body: { acceptDrift } }
    );
  }

  createComposition(input: CreateCompositionInput) {
    return this.request<Composition>("/api/v1/compositions", {
      method: "POST",
      body: input,
    });
  }

  updateComposition(compositionId: string, input: UpdateCompositionInput) {
    return this.request<Composition>(
      `/api/v1/compositions/${encodeURIComponent(compositionId)}`,
      { method: "PATCH", body: input }
    );
  }

  publishComposition(compositionId: string) {
    return this.request<Composition>(
      `/api/v1/compositions/${encodeURIComponent(compositionId)}/publish`,
      { method: "POST" }
    );
  }

  deleteComposition(compositionId: string) {
    return this.request<{ id: string; deleted: true }>(
      `/api/v1/compositions/${encodeURIComponent(compositionId)}`,
      { method: "DELETE" }
    );
  }

  createPolicy(input: CreatePolicyInput) {
    return this.request<PolicyMutationResult>("/api/v1/policies", {
      method: "POST",
      body: input,
    });
  }

  updatePolicy(policyId: string, input: UpdatePolicyInput) {
    return this.request<PolicyMutationResult>(
      `/api/v1/policies/${encodeURIComponent(policyId)}`,
      { method: "PATCH", body: input }
    );
  }

  activatePolicy(policyId: string) {
    return this.request<PolicyMutationResult>(
      `/api/v1/policies/${encodeURIComponent(policyId)}/activate`,
      { method: "POST" }
    );
  }

  archivePolicy(policyId: string) {
    return this.request<Policy>(
      `/api/v1/policies/${encodeURIComponent(policyId)}/archive`,
      { method: "POST" }
    );
  }

  lintPolicy(policyId: string) {
    return this.request<PolicyLint>(
      `/api/v1/policies/${encodeURIComponent(policyId)}/lint`
    );
  }

  issueSession(input: CreateSessionInput) {
    return this.request<IssuedSession>("/api/v1/sessions", {
      method: "POST",
      body: input,
    });
  }

  revokeSession(sessionId: string) {
    return this.request<GatewaySession>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/revoke`,
      { method: "POST" }
    );
  }

  createRole(input: CreateRoleInput) {
    return this.request<Role>("/api/v1/roles", { method: "POST", body: input });
  }

  updateRole(roleId: string, input: UpdateRoleInput) {
    return this.request<Role>(`/api/v1/roles/${encodeURIComponent(roleId)}`, {
      method: "PATCH",
      body: input,
    });
  }

  deleteRole(roleId: string) {
    return this.request<{ id: string; deleted: true }>(
      `/api/v1/roles/${encodeURIComponent(roleId)}`,
      { method: "DELETE" }
    );
  }

  assignRole(input: AssignRoleInput) {
    return this.request<RoleAssignment>("/api/v1/role-assignments", {
      method: "POST",
      body: input,
    });
  }

  removeRoleAssignment(assignmentId: string) {
    return this.request<{ id: string; deleted: true }>(
      `/api/v1/role-assignments/${encodeURIComponent(assignmentId)}`,
      { method: "DELETE" }
    );
  }

  createIdentityProvider(input: CreateIdentityProviderInput) {
    return this.request<IdentityProvider>("/api/v1/identity-providers", {
      method: "POST",
      body: input,
    });
  }

  updateIdentityProvider(providerId: string, input: UpdateIdentityProviderInput) {
    return this.request<IdentityProvider>(
      `/api/v1/identity-providers/${encodeURIComponent(providerId)}`,
      { method: "PATCH", body: input }
    );
  }

  deleteIdentityProvider(providerId: string) {
    return this.request<{ id: string; deleted: true }>(
      `/api/v1/identity-providers/${encodeURIComponent(providerId)}`,
      { method: "DELETE" }
    );
  }

  decideApproval(approvalId: string, input: ApprovalDecisionInput) {
    return this.request<ApprovalRequest>(
      `/api/v1/approvals/${encodeURIComponent(approvalId)}/decision`,
      { method: "POST", body: input }
    );
  }

  freezeTenant(reason: string) {
    return this.request<TenantAuthority>("/api/v1/tenant/freeze", {
      method: "POST",
      body: { reason },
    });
  }

  unfreezeTenant() {
    return this.request<TenantAuthority>("/api/v1/tenant/unfreeze", {
      method: "POST",
    });
  }

  createServicePrincipal(input: CreateServicePrincipalInput) {
    return this.request<IssuedServicePrincipal>("/api/v1/service-principals", {
      method: "POST",
      body: input,
    });
  }

  exportTenant() {
    return this.request<PortableExport>("/api/v1/export");
  }

  importTenant(input: unknown) {
    return this.request<PlatformOverview>("/api/v1/import", {
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
