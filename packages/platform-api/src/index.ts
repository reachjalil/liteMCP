import {
  type AnalyticsCsvRow,
  type AnalyticsQuery,
  AnalyticsQueryLimitError,
  analyticsRowsToCsv,
  usageEventsToCsv,
} from "@litemcp/analytics";
import {
  analyticsIntervalSchema,
  analyticsTimeseriesMetricSchema,
  analyticsTopDimensionSchema,
  analyticsTopMetricSchema,
  approvalDecisionInputSchema,
  assignRoleInputSchema,
  createCompositionInputSchema,
  createIdentityProviderInputSchema,
  createPolicyInputSchema,
  createRoleInputSchema,
  createServerInputSchema,
  createServicePrincipalInputSchema,
  createSessionInputSchema,
  entityIdSchema,
  oauthClientRegistrationInputSchema,
  policySimulationInputSchema,
  type Subject,
  slugSchema,
  timestampSchema,
  type UsageStanding,
  updateCompositionInputSchema,
  updateIdentityProviderInputSchema,
  updatePolicyInputSchema,
  updateRoleInputSchema,
  updateServerInputSchema,
} from "@litemcp/contracts";
import {
  PlatformAuthorizationError,
  PlatformConflictError,
  PlatformNotFoundError,
  PlatformQuotaError,
  type PlatformService,
  PlatformValidationError,
  tenantFromSessionToken,
} from "@litemcp/core";
import { demoSubject, type McpGateway } from "@litemcp/mcp-gateway";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { type ZodType, z } from "zod";

type AuthRuntime = {
  handler(request: Request): Response | Promise<Response>;
  api: {
    getSession(input: { headers: Headers }): Promise<unknown>;
    getActiveMemberRole(input: {
      headers: Headers;
      query?: { organizationId?: string };
    }): Promise<unknown>;
  };
};

type ApiActor = {
  id: string;
  tenantId: string;
  subject: Subject;
  organizationName: string;
};

type AppVariables = {
  actor: ApiActor;
};

export type PlatformAppOptions = {
  platform: PlatformService;
  gateway: McpGateway;
  analytics?: AnalyticsQuery;
  auth?: AuthRuntime;
  publicOrigin: string;
  webOrigins: string[];
  demoMode?: boolean;
  reportError?: (event: {
    error: unknown;
    requestId: string;
    request: Request;
  }) => void | Promise<void>;
};

class AnalyticsUnavailableError extends Error {
  constructor() {
    super("Usage analytics are not configured for this deployment.");
    this.name = "AnalyticsUnavailableError";
  }
}

const analyticsFormatSchema = z.enum(["json", "csv"]);
const analyticsWindowShape = {
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
  format: analyticsFormatSchema.default("json"),
};
const analyticsSummaryHttpSchema = z.object(analyticsWindowShape).strict();
const analyticsTimeseriesHttpSchema = z
  .object({
    ...analyticsWindowShape,
    metric: analyticsTimeseriesMetricSchema,
    interval: analyticsIntervalSchema.default("1h"),
  })
  .strict();
const analyticsTopHttpSchema = z
  .object({
    ...analyticsWindowShape,
    dimension: analyticsTopDimensionSchema,
    metric: analyticsTopMetricSchema,
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
const analyticsRecentHttpSchema = z
  .object({
    ...analyticsWindowShape,
    limit: z.coerce.number().int().min(1).max(500).default(100),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
const analyticsTimelineHttpSchema = z.object(analyticsWindowShape).strict();
const analyticsFlowsHttpSchema = z
  .object({
    ...analyticsWindowShape,
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();
const analyticsPolicyInsightsHttpSchema = z.object(analyticsWindowShape).strict();
const usageHttpSchema = z
  .object({ format: analyticsFormatSchema.default("json") })
  .strict();

const ANALYTICS_DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1_000;
const ANALYTICS_MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

type AnalyticsHttpWindow = {
  from: string;
  to: string;
  format: "json" | "csv";
};

const validationError = (
  message: string,
  issues?: Array<{ path: string; message: string }>
) => {
  const error = new PlatformValidationError(message);
  if (issues) Object.assign(error, { issues });
  return error;
};

const analyticsSearchParams = (request: Request) => {
  const entries = Object.create(null) as Record<string, string>;
  const search = new URL(request.url).searchParams;
  for (const key of new Set(search.keys())) {
    if (Object.hasOwn(Object.prototype, key)) {
      throw validationError("Analytics query validation failed.", [
        { path: key, message: "This query parameter name is not allowed." },
      ]);
    }
    const values = search.getAll(key);
    if (values.length !== 1) {
      throw validationError("Analytics query validation failed.", [
        { path: key, message: "Query parameters cannot be repeated." },
      ]);
    }
    const value = values[0];
    if (value !== undefined) entries[key] = value;
  }
  return entries;
};

const parseAnalyticsHttpQuery = <
  T extends { from?: string; to?: string; format: "json" | "csv" },
>(
  request: Request,
  schema: ZodType<T>
): Omit<T, "from" | "to"> & AnalyticsHttpWindow => {
  const parsed = schema.safeParse(analyticsSearchParams(request));
  if (!parsed.success) {
    throw validationError(
      "Analytics query validation failed.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))
    );
  }
  const toMs = parsed.data.to ? Date.parse(parsed.data.to) : Date.now();
  const fromMs = parsed.data.from
    ? Date.parse(parsed.data.from)
    : toMs - ANALYTICS_DEFAULT_WINDOW_MS;
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    fromMs >= toMs ||
    toMs - fromMs > ANALYTICS_MAX_WINDOW_MS
  ) {
    throw validationError("Analytics query validation failed.", [
      {
        path: "from",
        message: "Analytics windows must be ordered and cannot exceed 30 days.",
      },
    ]);
  }
  return {
    ...parsed.data,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
  } as Omit<T, "from" | "to"> & AnalyticsHttpWindow;
};

const csvResponse = (csv: string, filename: string) =>
  new Response(csv, {
    status: 200,
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=UTF-8",
      pragma: "no-cache",
    },
  });

const analyticsJsonHeaders = (headers: Headers) => {
  headers.set("cache-control", "private, no-store");
  headers.set("pragma", "no-cache");
};

const summaryCsv = (value: Awaited<ReturnType<AnalyticsQuery["summary"]>>) =>
  analyticsRowsToCsv(
    [value],
    [
      "from",
      "to",
      "calls",
      "activeIdentities",
      "activeSessions",
      "denials",
      "denyRate",
      "errors",
      "errorRate",
      "latencyP50Ms",
      "latencyP95Ms",
      "pendingApprovals",
    ]
  );

const timeseriesCsv = (value: Awaited<ReturnType<AnalyticsQuery["timeseries"]>>) =>
  analyticsRowsToCsv(
    value.points.map((point) => ({
      from: value.from,
      to: value.to,
      metric: value.metric,
      interval: value.interval,
      ts: point.ts,
      value: point.value,
    })),
    ["from", "to", "metric", "interval", "ts", "value"]
  );

const topCsv = (value: Awaited<ReturnType<AnalyticsQuery["top"]>>) =>
  analyticsRowsToCsv(
    value.rows.map((row) => ({
      from: value.from,
      to: value.to,
      dimension: value.dimension,
      metric: value.metric,
      ...row,
    })),
    ["from", "to", "dimension", "metric", "key", "value", "eventCount"]
  );

const timelineCsv = (value: Awaited<ReturnType<AnalyticsQuery["sessionTimeline"]>>) =>
  analyticsRowsToCsv(
    value.items.map(({ offsetMs, event }) => ({
      sessionId: value.sessionId,
      startedAt: value.startedAt,
      endedAt: value.endedAt,
      durationMs: value.durationMs,
      offsetMs,
      eventId: event.id,
      eventType: event.eventType,
      status: event.status,
      subjectId: event.subjectId,
      clientName: event.clientName,
      clientVersion: event.clientVersion,
      compositionId: event.compositionId,
      environmentId: event.environmentId,
      serverId: event.serverId,
      tool: event.tool,
      decisionEffect: event.decisionEffect,
      matchedRuleIds: event.matchedRuleIds.join("|"),
      latencyTotalMs: event.latencyTotalMs,
      latencyUpstreamMs: event.latencyUpstreamMs,
      errorCode: event.errorCode,
      requestId: event.requestId,
      auditId: event.auditId,
      auditSequence: event.auditSequence,
      auditHash: event.auditHash,
      ts: event.ts,
    })),
    [
      "sessionId",
      "startedAt",
      "endedAt",
      "durationMs",
      "offsetMs",
      "eventId",
      "eventType",
      "status",
      "subjectId",
      "clientName",
      "clientVersion",
      "compositionId",
      "environmentId",
      "serverId",
      "tool",
      "decisionEffect",
      "matchedRuleIds",
      "latencyTotalMs",
      "latencyUpstreamMs",
      "errorCode",
      "requestId",
      "auditId",
      "auditSequence",
      "auditHash",
      "ts",
    ]
  );

const flowsCsv = (value: Awaited<ReturnType<AnalyticsQuery["flows"]>>) =>
  analyticsRowsToCsv(
    value.transitions.map((transition) => ({
      from: value.from,
      to: value.to,
      ...transition,
    })),
    ["from", "to", "source", "target", "count", "sessionCount"]
  );

const policyInsightsCsv = (
  value: Awaited<ReturnType<AnalyticsQuery["policyInsights"]>>
) => {
  const rows: AnalyticsCsvRow[] = [
    ...value.ruleHits.map((row) => ({
      section: "rule_hit",
      key: row.ruleId,
      count: row.events,
      denials: row.denials,
    })),
    ...value.zeroHitRuleIds.map((ruleId) => ({
      section: "zero_hit_rule",
      key: ruleId,
    })),
    ...value.denialHotspots.map((row) => ({
      section: "denial_hotspot",
      key: row.tool,
      count: row.calls,
      denials: row.denials,
      rate: row.denyRate,
    })),
    ...value.unusedVisibleTools.map((row) => ({
      section: "unused_visible_tool",
      key: row.tool,
      discoveryCount: row.discoveryCount,
      callCount: row.callCount,
    })),
    {
      section: "discovery_execution",
      key: "funnel",
      discoveries: value.discoveryExecution.discoveries,
      toolsVisible: value.discoveryExecution.toolsVisible,
      discoveringSessions: value.discoveryExecution.discoveringSessions,
      executingSessions: value.discoveryExecution.executingSessions,
      rate: value.discoveryExecution.conversionRate,
    },
    {
      section: "approvals",
      key: "approval_latency",
      required: value.approvals.required,
      decided: value.approvals.decided,
      approved: value.approvals.approved,
      denied: value.approvals.denied,
      pending: value.approvals.pending,
      latencyP50Ms: value.approvals.latencyP50Ms,
      latencyP95Ms: value.approvals.latencyP95Ms,
    },
  ];
  return analyticsRowsToCsv(rows, [
    "section",
    "key",
    "count",
    "denials",
    "rate",
    "discoveryCount",
    "callCount",
    "discoveries",
    "toolsVisible",
    "discoveringSessions",
    "executingSessions",
    "required",
    "decided",
    "approved",
    "denied",
    "pending",
    "latencyP50Ms",
    "latencyP95Ms",
  ]);
};

const usageCsv = (value: UsageStanding) =>
  analyticsRowsToCsv(
    [
      {
        generatedAt: value.generatedAt,
        analyticsEnabled: value.analyticsEnabled,
        serversUsed: value.servers.used,
        serversLimit: value.servers.limit,
        serversRemaining: value.servers.remaining,
        compositionsUsed: value.compositions.used,
        compositionsLimit: value.compositions.limit,
        compositionsRemaining: value.compositions.remaining,
        activeSessionsUsed: value.activeSessions.used,
        activeSessionsLimit: value.activeSessions.limit,
        activeSessionsRemaining: value.activeSessions.remaining,
        toolCallsTodayUsed: value.toolCallsToday.used,
        toolCallsTodayLimit: value.toolCallsToday.limit,
        toolCallsTodayRemaining: value.toolCallsToday.remaining,
        toolCallsTodayResetsAt: value.toolCallsToday.resetsAt,
      },
    ],
    [
      "generatedAt",
      "analyticsEnabled",
      "serversUsed",
      "serversLimit",
      "serversRemaining",
      "compositionsUsed",
      "compositionsLimit",
      "compositionsRemaining",
      "activeSessionsUsed",
      "activeSessionsLimit",
      "activeSessionsRemaining",
      "toolCallsTodayUsed",
      "toolCallsTodayLimit",
      "toolCallsTodayRemaining",
      "toolCallsTodayResetsAt",
    ]
  );

const problem = (
  request: Request,
  requestIdValue: string,
  status: number,
  title: string,
  detail: string,
  errors?: Array<{ path: string; message: string }>
) => ({
  type: `https://litemcp.dev/problems/${title.toLowerCase().replaceAll(" ", "-")}`,
  title,
  status,
  detail,
  instance: new URL(request.url).pathname,
  requestId: requestIdValue,
  ...(errors ? { errors } : {}),
});

const bearerToken = (authorization: string | null) =>
  /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1] ?? null;

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const safeStrings = (value: unknown, limit: number, maxLength: number) => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && entry.length <= maxLength)
        .slice(0, limit)
    ),
  ];
};

const safeClaims = (value: unknown): Record<string, string> => {
  const record = objectValue(value);
  if (!record) return {};
  const entries: Array<[string, string]> = [];
  for (const [key, entry] of Object.entries(record)) {
    if (
      entries.length < 128 &&
      key.length > 0 &&
      key.length <= 160 &&
      !["__proto__", "constructor", "prototype"].includes(key) &&
      typeof entry === "string" &&
      entry.length <= 2_000
    ) {
      entries.push([key, entry]);
    }
  }
  return Object.fromEntries(entries);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const sessionActor = (value: unknown, roles: string[]): ApiActor | null => {
  if (!value || typeof value !== "object") return null;
  const sessionValue = value as {
    user?: {
      id?: unknown;
      role?: unknown;
      groups?: unknown;
      claims?: unknown;
      organizationName?: unknown;
    };
    session?: {
      activeOrganizationId?: unknown;
      activeOrganizationName?: unknown;
      groups?: unknown;
      claims?: unknown;
    };
  };
  const id = sessionValue.user?.id;
  const tenantId = sessionValue.session?.activeOrganizationId;
  if (
    typeof id !== "string" ||
    typeof tenantId !== "string" ||
    !entityIdSchema.safeParse(id).success ||
    !entityIdSchema.safeParse(tenantId).success
  ) {
    return null;
  }
  const organizationName =
    typeof sessionValue.session?.activeOrganizationName === "string"
      ? sessionValue.session.activeOrganizationName
      : typeof sessionValue.user?.organizationName === "string"
        ? sessionValue.user.organizationName
        : tenantId;
  const groups = [
    ...new Set([
      ...safeStrings(sessionValue.user?.groups, 256, 160),
      ...safeStrings(sessionValue.session?.groups, 256, 160),
    ]),
  ].slice(0, 256);
  const claims = safeClaims({
    ...safeClaims(sessionValue.session?.claims),
    ...safeClaims(sessionValue.user?.claims),
  });
  return {
    id,
    tenantId,
    organizationName,
    subject: {
      type: "user",
      id,
      roles,
      groups,
      claims,
    },
  };
};

const organizationRoles = (value: unknown) => {
  if (!value || typeof value !== "object") return [];
  const role = (value as { role?: unknown }).role;
  if (typeof role !== "string") return [];
  return role
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= 80)
    .slice(0, 64);
};

const managementRoles = new Set(["owner", "admin"]);

const hasManagementRole = (actor: ApiActor) =>
  actor.subject.roles.some((role) => managementRoles.has(role));

const requireManagementRole = (actor: ApiActor) => {
  if (!hasManagementRole(actor)) {
    throw new PlatformAuthorizationError(
      "An organization owner or administrator role is required."
    );
  }
};

const parseBody = async <T>(request: Request, schema: ZodType<T>) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new PlatformValidationError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new PlatformValidationError("Request validation failed.");
    Object.assign(error, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    throw error;
  }
  return result.data;
};

const optionalJsonBody = async <T>(
  request: Request,
  schema: ZodType<T>,
  fallback: unknown
) => {
  const text = await request.text();
  if (!text.trim()) {
    const parsedFallback = schema.safeParse(fallback);
    if (parsedFallback.success) return parsedFallback.data;
    throw new PlatformValidationError("Request validation failed.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new PlatformValidationError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new PlatformValidationError("Request validation failed.");
    Object.assign(error, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    throw error;
  }
  return result.data;
};

const basicCredentials = (authorization: string | null) => {
  const encoded = /^Basic\s+(.+)$/i.exec(authorization ?? "")?.[1];
  if (!encoded) return null;
  try {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    return {
      clientId: decoded.slice(0, separator),
      secret: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
};

const normalizedOrigin = (value: string) => value.replace(/\/$/, "");

const protectedResourceMetadataUrl = (
  origin: string,
  tenantId: string,
  compositionSlug: string
) =>
  `${normalizedOrigin(origin)}/.well-known/oauth-protected-resource/mcp/${encodeURIComponent(
    tenantId
  )}/${encodeURIComponent(compositionSlug)}`;

const oauthIssuer = (origin: string, tenantId: string) =>
  `${normalizedOrigin(origin)}/oauth/${encodeURIComponent(tenantId)}`;

const oauthError = (error: string, description: string, status = 400) =>
  new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      pragma: "no-cache",
    },
  });

const openApiDocument = (origin: string) => {
  const ok = (description: string) => ({ responses: { "200": { description } } });
  const created = (description: string) => ({
    responses: { "201": { description } },
  });
  const pathId = (name: string) => [
    { name, in: "path", required: true, schema: { type: "string" } },
  ];
  return {
    openapi: "3.1.0",
    info: {
      title: "LiteMCP Composer Control Plane API",
      version: "0.2.0",
      description:
        "Portable MCP management, identity, policy, OAuth, session, approval, audit, and tenant analytics API.",
      license: { name: "Apache-2.0", identifier: "Apache-2.0" },
    },
    servers: [{ url: normalizedOrigin(origin) }],
    tags: [
      { name: "Platform" },
      { name: "Registry" },
      { name: "Composer" },
      { name: "Policy" },
      { name: "Identity" },
      { name: "Sessions" },
      { name: "OAuth" },
      { name: "Audit" },
      { name: "Analytics" },
    ],
    components: {
      securitySchemes: {
        cookieSession: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
        },
        bearerAuth: { type: "http", scheme: "bearer" },
        servicePrincipal: { type: "http", scheme: "basic" },
      },
      schemas: {
        CreateServerInput: z.toJSONSchema(createServerInputSchema),
        UpdateServerInput: z.toJSONSchema(updateServerInputSchema),
        CreateCompositionInput: z.toJSONSchema(createCompositionInputSchema),
        UpdateCompositionInput: z.toJSONSchema(updateCompositionInputSchema),
        CreatePolicyInput: z.toJSONSchema(createPolicyInputSchema),
        UpdatePolicyInput: z.toJSONSchema(updatePolicyInputSchema),
        CreateRoleInput: z.toJSONSchema(createRoleInputSchema),
        AssignRoleInput: z.toJSONSchema(assignRoleInputSchema),
        CreateIdentityProviderInput: z.toJSONSchema(createIdentityProviderInputSchema),
        CreateServicePrincipalInput: z.toJSONSchema(createServicePrincipalInputSchema),
        CreateSessionInput: z.toJSONSchema(createSessionInputSchema),
        ApprovalDecisionInput: z.toJSONSchema(approvalDecisionInputSchema),
        PolicySimulationInput: z.toJSONSchema(policySimulationInputSchema),
        OAuthClientRegistrationInput: z.toJSONSchema(
          oauthClientRegistrationInputSchema
        ),
      },
    },
    security: [{ cookieSession: [] }],
    paths: {
      "/api/v1/openapi.json": {
        get: { ...ok("OpenAPI document"), security: [], tags: ["Platform"] },
      },
      "/api/v1/overview": { get: { ...ok("Overview"), tags: ["Platform"] } },
      "/api/v1/environments": {
        get: { ...ok("Environments"), tags: ["Platform"] },
      },
      "/api/v1/servers": {
        get: { ...ok("Servers"), tags: ["Registry"] },
        post: { ...created("Server created"), tags: ["Registry"] },
      },
      "/api/v1/servers/{serverId}": {
        patch: {
          ...ok("Server updated"),
          tags: ["Registry"],
          parameters: pathId("serverId"),
        },
        delete: {
          ...ok("Server deleted"),
          tags: ["Registry"],
          parameters: pathId("serverId"),
        },
      },
      "/api/v1/servers/{serverId}/probe": {
        post: {
          ...ok("Server probed and tools imported"),
          tags: ["Registry"],
          parameters: pathId("serverId"),
        },
      },
      "/api/v1/compositions": {
        get: { ...ok("Compositions"), tags: ["Composer"] },
        post: { ...created("Composition created"), tags: ["Composer"] },
      },
      "/api/v1/compositions/{compositionId}": {
        patch: {
          ...ok("Composition updated"),
          tags: ["Composer"],
          parameters: pathId("compositionId"),
        },
        delete: {
          ...ok("Composition deleted"),
          tags: ["Composer"],
          parameters: pathId("compositionId"),
        },
      },
      "/api/v1/compositions/{compositionId}/publish": {
        post: {
          ...ok("Composition published"),
          tags: ["Composer"],
          parameters: pathId("compositionId"),
        },
      },
      "/api/v1/policies": {
        get: { ...ok("Policies"), tags: ["Policy"] },
        post: { ...created("Draft policy created"), tags: ["Policy"] },
      },
      "/api/v1/policies/{policyId}": {
        patch: {
          ...ok("Draft policy updated"),
          tags: ["Policy"],
          parameters: pathId("policyId"),
        },
      },
      "/api/v1/policies/{policyId}/activate": {
        post: {
          ...ok("Policy activated"),
          tags: ["Policy"],
          parameters: pathId("policyId"),
        },
      },
      "/api/v1/policies/{policyId}/archive": {
        post: {
          ...ok("Policy archived"),
          tags: ["Policy"],
          parameters: pathId("policyId"),
        },
      },
      "/api/v1/policies/{policyId}/lint": {
        get: {
          ...ok("Policy lint result"),
          tags: ["Policy"],
          parameters: pathId("policyId"),
        },
      },
      "/api/v1/policy/simulate": {
        post: { ...ok("Policy simulation"), tags: ["Policy"] },
      },
      "/api/v1/sessions": {
        get: { ...ok("Scoped sessions"), tags: ["Sessions"] },
        post: { ...created("Scoped session issued"), tags: ["Sessions"] },
      },
      "/api/v1/sessions/{sessionId}/revoke": {
        post: {
          ...ok("Session revoked"),
          tags: ["Sessions"],
          parameters: pathId("sessionId"),
        },
      },
      "/api/v1/roles": {
        get: { ...ok("Roles"), tags: ["Identity"] },
        post: { ...created("Role created"), tags: ["Identity"] },
      },
      "/api/v1/roles/{roleId}": {
        patch: {
          ...ok("Role updated"),
          tags: ["Identity"],
          parameters: pathId("roleId"),
        },
        delete: {
          ...ok("Role deleted"),
          tags: ["Identity"],
          parameters: pathId("roleId"),
        },
      },
      "/api/v1/role-assignments": {
        get: { ...ok("Role assignments"), tags: ["Identity"] },
        post: { ...created("Role assigned"), tags: ["Identity"] },
      },
      "/api/v1/role-assignments/{assignmentId}": {
        delete: {
          ...ok("Role assignment removed"),
          tags: ["Identity"],
          parameters: pathId("assignmentId"),
        },
      },
      "/api/v1/identity-providers": {
        get: { ...ok("Identity providers"), tags: ["Identity"] },
        post: { ...created("Identity provider created"), tags: ["Identity"] },
      },
      "/api/v1/identity-providers/{providerId}": {
        patch: {
          ...ok("Identity provider updated"),
          tags: ["Identity"],
          parameters: pathId("providerId"),
        },
        delete: {
          ...ok("Identity provider deleted"),
          tags: ["Identity"],
          parameters: pathId("providerId"),
        },
      },
      "/api/v1/approvals/{approvalId}/decision": {
        post: {
          ...ok("Approval decided"),
          tags: ["Policy"],
          parameters: pathId("approvalId"),
          description:
            "Decides the exact listed request. Generation and fingerprint must match the current pending approval.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApprovalDecisionInput" },
              },
            },
          },
        },
      },
      "/api/v1/approvals": {
        get: { ...ok("Approval inbox"), tags: ["Policy"] },
      },
      "/api/v1/authority": {
        get: { ...ok("Tenant authorization authority"), tags: ["Platform"] },
      },
      "/api/v1/tenant/freeze": {
        post: { ...ok("Tenant frozen"), tags: ["Platform"] },
      },
      "/api/v1/tenant/unfreeze": {
        post: { ...ok("Tenant unfrozen"), tags: ["Platform"] },
      },
      "/api/v1/service-principals": {
        post: { ...created("Service principal created"), tags: ["Identity"] },
      },
      "/api/v1/subjects/{subjectId}/deprovision": {
        post: {
          ...ok("Subject deprovisioned and credentials invalidated"),
          tags: ["Identity"],
          parameters: pathId("subjectId"),
        },
      },
      "/api/v1/service-principal-sessions": {
        post: {
          ...created("Service-principal session issued"),
          security: [{ servicePrincipal: [] }],
          tags: ["Sessions"],
        },
      },
      "/api/v1/audit": { get: { ...ok("Audit events"), tags: ["Audit"] } },
      "/api/v1/analytics/summary": {
        get: { ...ok("Usage analytics summary or CSV export"), tags: ["Analytics"] },
      },
      "/api/v1/analytics/timeseries": {
        get: {
          ...ok("Usage analytics time series or CSV export"),
          tags: ["Analytics"],
        },
      },
      "/api/v1/analytics/top": {
        get: { ...ok("Ranked usage analytics or CSV export"), tags: ["Analytics"] },
      },
      "/api/v1/analytics/sessions/{sessionId}/timeline": {
        get: {
          ...ok("Session analytics timeline with audit receipts or CSV export"),
          tags: ["Analytics"],
          parameters: pathId("sessionId"),
        },
      },
      "/api/v1/analytics/flows": {
        get: { ...ok("Tool transition flows or CSV export"), tags: ["Analytics"] },
      },
      "/api/v1/analytics/policy-insights": {
        get: {
          ...ok("Active-policy usage insights or CSV export"),
          tags: ["Analytics"],
        },
      },
      "/api/v1/analytics/recent": {
        get: { ...ok("Recent usage events or CSV export"), tags: ["Analytics"] },
      },
      "/api/v1/usage": {
        get: {
          ...ok("Exact quota and fair-use standing or CSV export"),
          tags: ["Analytics"],
        },
      },
      "/api/v1/activation-events": {
        get: { ...ok("Activation funnel events"), tags: ["Audit"] },
      },
      "/api/v1/export": {
        get: { ...ok("Portable export"), tags: ["Platform"] },
      },
      "/api/v1/import": {
        post: { ...ok("Portable import"), tags: ["Platform"] },
      },
      "/.well-known/oauth-protected-resource/mcp/{tenantId}/{compositionSlug}": {
        get: { ...ok("Protected-resource metadata"), security: [], tags: ["OAuth"] },
      },
      "/.well-known/oauth-authorization-server/oauth/{tenantId}": {
        get: { ...ok("Authorization-server metadata"), security: [], tags: ["OAuth"] },
      },
      "/oauth/{tenantId}/register": {
        post: { ...created("OAuth client registered"), security: [], tags: ["OAuth"] },
      },
      "/oauth/{tenantId}/authorize": {
        get: { ...ok("OAuth authorization redirect"), security: [], tags: ["OAuth"] },
      },
      "/oauth/{tenantId}/token": {
        post: { ...ok("OAuth tokens issued"), security: [], tags: ["OAuth"] },
      },
      "/oauth/{tenantId}/revoke": {
        post: { ...ok("OAuth token revoked"), security: [], tags: ["OAuth"] },
      },
      "/mcp/{tenantId}/{compositionSlug}": {
        post: { ...ok("MCP JSON-RPC response"), security: [{ bearerAuth: [] }] },
      },
    },
  };
};

export const createPlatformApp = (options: PlatformAppOptions) => {
  const app = new Hono<{ Variables: AppVariables }>();
  const servicePrincipalSessionInputSchema = createSessionInputSchema
    .omit({ subject: true })
    .extend({
      tenantId: entityIdSchema,
      expiresInSeconds: z.number().int().min(60).max(3_600).default(900),
    });
  const probeInputSchema = z.object({ acceptDrift: z.boolean().default(false) });
  const freezeInputSchema = z.object({
    reason: z.string().trim().min(2).max(1_000).default("Emergency freeze"),
  });
  const authorizationQuerySchema = z.object({
    response_type: z.literal("code"),
    client_id: entityIdSchema,
    redirect_uri: z.string().url(),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    code_challenge_method: z.literal("S256"),
    state: z.string().max(2_000).optional(),
    scope: z.string().trim().max(2_000).optional(),
    resource: z.string().url().optional(),
    composition: slugSchema.optional(),
  });
  type AuthorizationQuery = z.infer<typeof authorizationQuerySchema>;

  const resolveAuthenticatedActor = async (
    headers: Headers,
    bootstrap: boolean
  ): Promise<ApiActor | null> => {
    if (!options.auth) return null;
    const session = await options.auth.api.getSession({ headers });
    const identity = sessionActor(session, []);
    if (!identity) return null;
    let membership: unknown;
    try {
      membership = await options.auth.api.getActiveMemberRole({
        headers,
        query: { organizationId: identity.tenantId },
      });
    } catch {
      throw new PlatformAuthorizationError(
        "The authenticated identity is not an active member of this organization."
      );
    }
    const roles = organizationRoles(membership);
    if (roles.length === 0) {
      throw new PlatformAuthorizationError(
        "The active organization membership has no recognized role."
      );
    }
    const base = { ...identity.subject, roles };
    if (bootstrap) {
      await options.platform.bootstrapTenant(
        identity.tenantId,
        identity.organizationName,
        identity.id,
        roles
      );
    }
    const subject = await options.platform.buildSubject(identity.tenantId, base);
    // Import intentionally runs before tenant bootstrap so a portable graph can
    // replace the pristine target. Preserve only verified Better Auth
    // organization-management roles for that pre-bootstrap authorization step.
    const importManagementRoles = bootstrap
      ? []
      : roles.filter((role) => managementRoles.has(role));
    return {
      ...identity,
      subject: {
        ...subject,
        roles: [...new Set([...subject.roles, ...importManagementRoles])],
      },
    };
  };

  const resolveAuthorizationContext = async (
    tenantId: string,
    request: AuthorizationQuery,
    actor: ApiActor
  ) => {
    if (actor.tenantId !== tenantId) {
      return {
        response: oauthError(
          "access_denied",
          "The signed-in organization does not match the authorization server.",
          403
        ),
      };
    }
    let compositionSlug = request.composition;
    if (request.resource) {
      const resource = new URL(request.resource);
      const expectedOrigin = new URL(options.publicOrigin).origin;
      const segments = resource.pathname.split("/").filter(Boolean);
      if (
        resource.origin !== expectedOrigin ||
        segments.length !== 3 ||
        segments[0] !== "mcp" ||
        segments[1] !== tenantId
      ) {
        return {
          response: oauthError(
            "invalid_target",
            "The requested OAuth resource is not a LiteMCP endpoint for this tenant."
          ),
        };
      }
      compositionSlug = segments[2];
    }
    if (!compositionSlug) {
      return {
        response: oauthError(
          "invalid_target",
          "Provide the protected MCP resource or a composition identifier."
        ),
      };
    }
    const client = await options.platform.getOAuthClient(tenantId, request.client_id);
    if (!client?.grantTypes.includes("authorization_code")) {
      return {
        response: oauthError(
          "unauthorized_client",
          "This client is not registered for the authorization-code grant."
        ),
      };
    }
    if (!client.redirectUris.includes(request.redirect_uri)) {
      return {
        response: oauthError(
          "invalid_request",
          "redirect_uri is not registered for this client."
        ),
      };
    }
    try {
      await options.platform.getCompositionBySlug(tenantId, compositionSlug);
    } catch (error) {
      if (error instanceof PlatformNotFoundError) {
        return { response: oauthError("invalid_target", error.message) };
      }
      throw error;
    }
    const compositionScope = `mcp:composition:${compositionSlug}`;
    const requestedScopes = request.scope
      ? request.scope.split(/\s+/).filter(Boolean)
      : [compositionScope];
    const acceptedScopes = new Set(["mcp", compositionScope, "offline_access"]);
    if (
      requestedScopes.length === 0 ||
      requestedScopes.some((scope) => !acceptedScopes.has(scope)) ||
      (requestedScopes.includes("offline_access") &&
        !client.grantTypes.includes("refresh_token"))
    ) {
      return {
        response: oauthError(
          "invalid_scope",
          "The requested scope is not available for this composition or client."
        ),
      };
    }
    const grantedScopes = [
      compositionScope,
      ...(requestedScopes.includes("offline_access") ? ["offline_access"] : []),
    ];
    return { actor, client, compositionSlug, grantedScopes, request };
  };

  const redirectAuthorizationError = (
    tenantId: string,
    redirectUri: string,
    state: string | undefined,
    error: string,
    description: string
  ) => {
    const redirect = new URL(redirectUri);
    redirect.searchParams.set("error", error);
    redirect.searchParams.set("error_description", description);
    redirect.searchParams.set("iss", oauthIssuer(options.publicOrigin, tenantId));
    if (state) redirect.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: { location: redirect.toString() },
    });
  };

  app.use("*", requestId());
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
      referrerPolicy: "no-referrer",
      xFrameOptions: "DENY",
    })
  );
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !options.webOrigins.includes(origin)) {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          403,
          "Origin Denied",
          "This origin is not allowed to call the credentialed API."
        ),
        403
      );
    }
    await next();
  });
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (options.webOrigins.includes(origin) ? origin : null),
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "Idempotency-Key",
        "X-LiteMCP-Tenant",
        "X-LiteMCP-Role",
        "X-Request-ID",
      ],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["X-Request-ID"],
      credentials: true,
      maxAge: 600,
    })
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        c.json(
          problem(
            c.req.raw,
            c.get("requestId"),
            413,
            "Payload Too Large",
            "Request bodies are limited to 1 MiB."
          ),
          413
        ),
    })
  );

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "litemcp",
      version: "0.1.0",
      storage: options.platform.store.capabilities,
      time: new Date().toISOString(),
    })
  );
  app.get("/ready", async (c) => {
    if (options.demoMode) {
      await options.platform.ensureDemoTenant("org_demo", options.publicOrigin);
      return c.json({ status: "ready" });
    }
    if (!options.auth || options.platform.store.capabilities.driver === "memory") {
      return c.json(
        {
          status: "not_ready",
          reason:
            "Production readiness requires persistent storage and authentication.",
        },
        503
      );
    }
    try {
      await options.platform.store.list("__readiness__", "organizations", {
        limit: 1,
      });
      return c.json({ status: "ready" });
    } catch {
      return c.json(
        { status: "not_ready", reason: "The product data store is unavailable." },
        503
      );
    }
  });

  // Public discovery must be registered before the cookie-authenticated
  // control-plane middleware so MCP clients can bootstrap authorization.
  app.get("/api/v1/openapi.json", (c) => c.json(openApiDocument(options.publicOrigin)));

  app.get(
    "/.well-known/oauth-protected-resource/mcp/:tenantId/:compositionSlug",
    (c) => {
      const tenantId = c.req.param("tenantId");
      const compositionSlug = c.req.param("compositionSlug");
      const resource = `${normalizedOrigin(options.publicOrigin)}/mcp/${encodeURIComponent(
        tenantId
      )}/${encodeURIComponent(compositionSlug)}`;
      return c.json({
        resource,
        resource_name: `LiteMCP composition ${compositionSlug}`,
        authorization_servers: [oauthIssuer(options.publicOrigin, tenantId)],
        bearer_methods_supported: ["header"],
        scopes_supported: [`mcp:composition:${compositionSlug}`],
      });
    }
  );

  const authorizationServerDocument = (tenantId: string) => {
    const issuer = oauthIssuer(options.publicOrigin, tenantId);
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      revocation_endpoint: `${issuer}/revoke`,
      registration_endpoint: `${issuer}/register`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp", "offline_access"],
      authorization_response_iss_parameter_supported: true,
    };
  };
  app.get("/.well-known/oauth-authorization-server/oauth/:tenantId", (c) =>
    c.json(authorizationServerDocument(c.req.param("tenantId")))
  );
  // A compatibility alias is cheap and helps older clients that omit the
  // issuer's leading path segment when constructing the discovery URL.
  app.get("/.well-known/oauth-authorization-server/:tenantId", (c) =>
    c.json(authorizationServerDocument(c.req.param("tenantId")))
  );

  app.post("/oauth/:tenantId/register", async (c) => {
    const tenantId = c.req.param("tenantId");
    if (!entityIdSchema.safeParse(tenantId).success) {
      throw new PlatformValidationError("The OAuth tenant identifier is invalid.");
    }
    const organization = await options.platform.store.get(
      tenantId,
      "organizations",
      tenantId
    );
    if (!organization) throw new PlatformNotFoundError("Organization");
    try {
      const input = await parseBody(c.req.raw, oauthClientRegistrationInputSchema);
      const client = await options.platform.registerOAuthClient(tenantId, input);
      return c.json(
        {
          client_id: client.clientId,
          client_name: client.clientName,
          redirect_uris: client.redirectUris,
          grant_types: client.grantTypes,
          token_endpoint_auth_method: client.tokenEndpointAuthMethod,
          client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1_000),
        },
        201
      );
    } catch (error) {
      if (error instanceof PlatformValidationError) {
        return oauthError("invalid_client_metadata", error.message);
      }
      if (error instanceof PlatformQuotaError) {
        return oauthError("temporarily_unavailable", error.message, 429);
      }
      throw error;
    }
  });

  app.get("/oauth/:tenantId/authorize", async (c) => {
    const parsed = authorizationQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return oauthError(
        "invalid_request",
        parsed.error.issues[0]?.message ?? "The authorization request is invalid."
      );
    }
    const tenantId = c.req.param("tenantId");
    if (!entityIdSchema.safeParse(tenantId).success) {
      return oauthError("invalid_request", "The OAuth tenant identifier is invalid.");
    }
    const actor = await resolveAuthenticatedActor(c.req.raw.headers, true);
    if (!actor) {
      const login = new URL("/login", options.publicOrigin);
      const requestUrl = new URL(c.req.url);
      login.searchParams.set("returnTo", `${requestUrl.pathname}${requestUrl.search}`);
      return c.redirect(login.toString(), 302);
    }
    const authorization = await resolveAuthorizationContext(
      tenantId,
      parsed.data,
      actor
    );
    if ("response" in authorization) return authorization.response;
    const hiddenInputs = Object.entries(parsed.data)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`
      )
      .join("");
    c.header("cache-control", "no-store");
    return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Authorize ${escapeHtml(authorization.client.clientName)} — LiteMCP Composer</title>
  </head>
  <body>
    <main>
      <h1>Authorize MCP access</h1>
      <p><strong>${escapeHtml(authorization.client.clientName)}</strong> is requesting access to the <strong>${escapeHtml(authorization.compositionSlug)}</strong> composition as ${escapeHtml(actor.id)}.</p>
      <p>The client can discover and call only tools allowed by your current roles and policy. Access expires after 15 minutes and may be revoked at any time.</p>
      ${authorization.grantedScopes.includes("offline_access") ? "<p><strong>Offline access requested:</strong> authorizing also creates a rotating refresh credential valid for up to 30 days. Role, policy, deprovisioning, freeze, session revocation, or token revocation invalidates it.</p>" : "<p>No offline access was requested; this authorization will not issue a refresh credential.</p>"}
      <form method="post" action="/oauth/${encodeURIComponent(tenantId)}/authorize">
        ${hiddenInputs}
        <button type="submit" name="decision" value="approve">Authorize</button>
        <button type="submit" name="decision" value="deny">Deny</button>
      </form>
    </main>
  </body>
</html>`);
  });

  app.post("/oauth/:tenantId/authorize", async (c) => {
    const contentType = c.req.header("content-type")?.toLowerCase();
    if (!contentType?.startsWith("application/x-www-form-urlencoded")) {
      return oauthError(
        "invalid_request",
        "The consent endpoint accepts application/x-www-form-urlencoded bodies."
      );
    }
    const expectedOrigin = new URL(options.publicOrigin).origin;
    const requestOrigin = c.req.header("origin");
    if (
      (requestOrigin && requestOrigin !== expectedOrigin) ||
      c.req.header("sec-fetch-site") === "cross-site"
    ) {
      return oauthError(
        "access_denied",
        "Cross-site consent submissions are denied.",
        403
      );
    }
    const form = new URLSearchParams(await c.req.text());
    const parsed = authorizationQuerySchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      return oauthError(
        "invalid_request",
        parsed.error.issues[0]?.message ?? "The authorization request is invalid."
      );
    }
    const tenantId = c.req.param("tenantId");
    if (!entityIdSchema.safeParse(tenantId).success) {
      return oauthError("invalid_request", "The OAuth tenant identifier is invalid.");
    }
    const actor = await resolveAuthenticatedActor(c.req.raw.headers, true);
    if (!actor) {
      return oauthError(
        "login_required",
        "Your login session expired before consent was submitted.",
        401
      );
    }
    const authorization = await resolveAuthorizationContext(
      tenantId,
      parsed.data,
      actor
    );
    if ("response" in authorization) return authorization.response;
    const decision = form.get("decision");
    if (decision === "deny") {
      return redirectAuthorizationError(
        tenantId,
        parsed.data.redirect_uri,
        parsed.data.state,
        "access_denied",
        "The user denied the authorization request."
      );
    }
    if (decision !== "approve") {
      return oauthError("invalid_request", "A consent decision is required.");
    }
    let code: string;
    try {
      code = await options.platform.issueOAuthAuthorizationCode(tenantId, {
        clientId: parsed.data.client_id,
        redirectUri: parsed.data.redirect_uri,
        compositionSlug: authorization.compositionSlug,
        codeChallenge: parsed.data.code_challenge,
        scopes: authorization.grantedScopes,
        subject: actor.subject,
      });
    } catch (error) {
      if (error instanceof PlatformNotFoundError) {
        return redirectAuthorizationError(
          tenantId,
          parsed.data.redirect_uri,
          parsed.data.state,
          "invalid_target",
          error.message
        );
      }
      if (error instanceof PlatformAuthorizationError) {
        return redirectAuthorizationError(
          tenantId,
          parsed.data.redirect_uri,
          parsed.data.state,
          "access_denied",
          error.message
        );
      }
      if (error instanceof PlatformValidationError) {
        return redirectAuthorizationError(
          tenantId,
          parsed.data.redirect_uri,
          parsed.data.state,
          "invalid_request",
          error.message
        );
      }
      throw error;
    }
    const redirect = new URL(parsed.data.redirect_uri);
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("iss", oauthIssuer(options.publicOrigin, tenantId));
    if (parsed.data.state) redirect.searchParams.set("state", parsed.data.state);
    return c.redirect(redirect.toString(), 302);
  });

  app.post("/oauth/:tenantId/token", async (c) => {
    if (
      !c.req
        .header("content-type")
        ?.toLowerCase()
        .startsWith("application/x-www-form-urlencoded")
    ) {
      return oauthError(
        "invalid_request",
        "The token endpoint accepts application/x-www-form-urlencoded bodies."
      );
    }
    const tenantId = c.req.param("tenantId");
    if (!entityIdSchema.safeParse(tenantId).success) {
      return oauthError("invalid_request", "The OAuth tenant identifier is invalid.");
    }
    const form = new URLSearchParams(await c.req.text());
    const grantType = form.get("grant_type");
    const clientId = form.get("client_id");
    if (!clientId || !entityIdSchema.safeParse(clientId).success) {
      return oauthError("invalid_client", "client_id is required.", 401);
    }
    try {
      if (grantType === "authorization_code") {
        const code = form.get("code");
        const codeVerifier = form.get("code_verifier");
        const redirectUri = form.get("redirect_uri");
        if (!code || !codeVerifier || !redirectUri) {
          return oauthError(
            "invalid_request",
            "code, code_verifier, and redirect_uri are required."
          );
        }
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
          return oauthError("invalid_grant", "code_verifier is invalid.");
        }
        const tokens = await options.platform.exchangeOAuthAuthorizationCode(
          tenantId,
          { clientId, code, codeVerifier, redirectUri },
          options.publicOrigin,
          c.get("requestId")
        );
        return new Response(JSON.stringify(tokens), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "cache-control": "no-store",
            pragma: "no-cache",
          },
        });
      }
      if (grantType === "refresh_token") {
        const refreshToken = form.get("refresh_token");
        if (!refreshToken) {
          return oauthError("invalid_request", "refresh_token is required.");
        }
        const tokens = await options.platform.rotateOAuthRefreshToken(
          tenantId,
          { clientId, refreshToken },
          options.publicOrigin,
          c.get("requestId")
        );
        return new Response(JSON.stringify(tokens), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "cache-control": "no-store",
            pragma: "no-cache",
          },
        });
      }
      return oauthError(
        "unsupported_grant_type",
        "Only authorization_code and refresh_token are supported."
      );
    } catch (error) {
      if (
        error instanceof PlatformAuthorizationError ||
        error instanceof PlatformValidationError ||
        error instanceof PlatformConflictError
      ) {
        return oauthError("invalid_grant", error.message);
      }
      if (error instanceof PlatformQuotaError) {
        return oauthError("temporarily_unavailable", error.message, 429);
      }
      throw error;
    }
  });

  app.post("/oauth/:tenantId/revoke", async (c) => {
    if (
      !c.req
        .header("content-type")
        ?.toLowerCase()
        .startsWith("application/x-www-form-urlencoded")
    ) {
      return oauthError(
        "invalid_request",
        "The revocation endpoint accepts application/x-www-form-urlencoded bodies."
      );
    }
    const tenantId = c.req.param("tenantId");
    if (!entityIdSchema.safeParse(tenantId).success) {
      return oauthError("invalid_request", "The OAuth tenant identifier is invalid.");
    }
    const form = new URLSearchParams(await c.req.text());
    const clientId = form.get("client_id");
    const token = form.get("token");
    if (!clientId || !entityIdSchema.safeParse(clientId).success || !token) {
      return oauthError("invalid_request", "client_id and token are required.");
    }
    if (!(await options.platform.getOAuthClient(tenantId, clientId))) {
      return oauthError("invalid_client", "The OAuth client is not registered.", 401);
    }
    await options.platform.revokeOAuthToken(
      tenantId,
      clientId,
      token,
      c.get("requestId")
    );
    return new Response(null, {
      status: 200,
      headers: { "cache-control": "no-store", pragma: "no-cache" },
    });
  });

  app.post("/api/v1/service-principal-sessions", async (c) => {
    const input = await parseBody(c.req.raw, servicePrincipalSessionInputSchema);
    const credentials = basicCredentials(c.req.header("authorization") ?? null);
    const subject = credentials
      ? await options.platform.authenticateServicePrincipal(
          input.tenantId,
          credentials.clientId,
          credentials.secret
        )
      : null;
    if (!subject) {
      c.header("WWW-Authenticate", 'Basic realm="LiteMCP service principals"');
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          401,
          "Authentication Required",
          "Valid service-principal credentials are required."
        ),
        401
      );
    }
    const { tenantId, ...scope } = input;
    return c.json(
      {
        data: await options.platform.createSession(
          tenantId,
          { ...scope, subject },
          subject.id,
          c.get("requestId"),
          options.publicOrigin
        ),
        meta: { requestId: c.get("requestId") },
      },
      201
    );
  });

  app.on(["GET", "POST", "PUT", "PATCH", "DELETE"], "/api/auth/*", (c) => {
    if (!options.auth) {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          503,
          "Authentication Unavailable",
          "Better Auth is not configured for this process."
        ),
        503
      );
    }
    return options.auth.handler(c.req.raw);
  });

  app.use("/api/v1/*", async (c, next) => {
    if (options.demoMode) {
      await options.platform.ensureDemoTenant("org_demo", options.publicOrigin);
      const requestedTenant = c.req.header("x-litemcp-tenant") ?? "org_demo";
      if (requestedTenant !== "org_demo") {
        return c.json(
          problem(
            c.req.raw,
            c.get("requestId"),
            403,
            "Tenant Denied",
            "The local demo runtime exposes only org_demo."
          ),
          403
        );
      }
      const requestedRole = c.req.header("x-litemcp-role");
      const role = requestedRole === "finance-admin" ? "finance-admin" : "employee";
      const demoIdentity = demoSubject(role);
      const subject =
        role === "finance-admin"
          ? { ...demoIdentity, roles: ["admin", "finance-admin"] }
          : demoIdentity;
      c.set("actor", {
        id: subject.id,
        tenantId: "org_demo",
        organizationName: "Northstar Labs",
        subject,
      });
      await next();
      return;
    }
    if (!options.auth) {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          503,
          "Authentication Unavailable",
          "The production API requires Better Auth."
        ),
        503
      );
    }
    const actor = await resolveAuthenticatedActor(
      c.req.raw.headers,
      c.req.path !== "/api/v1/import"
    );
    if (!actor) {
      return c.json(
        problem(
          c.req.raw,
          c.get("requestId"),
          401,
          "Authentication Required",
          "Sign in and select an active organization."
        ),
        401
      );
    }
    c.set("actor", actor);
    await next();
  });

  const respond = <T>(
    c: {
      json: (value: unknown, status?: 200 | 201) => Response;
      get: (key: "requestId") => string;
    },
    data: T,
    status: 200 | 201 = 200
  ) => c.json({ data, meta: { requestId: c.get("requestId") } }, status);

  app.get("/api/v1/overview", async (c) => {
    const actor = c.get("actor");
    return respond(
      c,
      await options.platform.getOverview(actor.tenantId, options.publicOrigin)
    );
  });
  app.get("/api/v1/environments", async (c) =>
    respond(c, await options.platform.listEnvironments(c.get("actor").tenantId))
  );
  app.get("/api/v1/servers", async (c) => {
    return respond(c, await options.platform.listServers(c.get("actor").tenantId));
  });
  app.post("/api/v1/servers", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, createServerInputSchema);
    return respond(
      c,
      await options.platform.createServer(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.patch("/api/v1/servers/:serverId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, updateServerInputSchema);
    return respond(
      c,
      await options.platform.updateServer(
        actor.tenantId,
        c.req.param("serverId"),
        input,
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.delete("/api/v1/servers/:serverId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.deleteServer(
        actor.tenantId,
        c.req.param("serverId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.post("/api/v1/servers/:serverId/probe", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await optionalJsonBody(c.req.raw, probeInputSchema, {});
    const server = (await options.platform.listServers(actor.tenantId)).find(
      (candidate) => candidate.id === c.req.param("serverId")
    );
    if (!server) throw new PlatformNotFoundError("MCP server");
    let tools: Awaited<ReturnType<McpGateway["probeServer"]>>["tools"];
    try {
      const result = await options.gateway.probeServer(
        server,
        c.get("requestId"),
        c.req.raw.signal
      );
      tools = result.tools;
    } catch (error) {
      return respond(
        c,
        await options.platform.recordServerProbe(
          actor.tenantId,
          server.id,
          {
            error:
              error instanceof Error
                ? error.message
                : "The upstream probe failed unexpectedly.",
          },
          input.acceptDrift,
          actor.id,
          c.get("requestId")
        )
      );
    }
    return respond(
      c,
      await options.platform.recordServerProbe(
        actor.tenantId,
        server.id,
        { tools },
        input.acceptDrift,
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.get("/api/v1/compositions", async (c) => {
    return respond(c, await options.platform.listCompositions(c.get("actor").tenantId));
  });
  app.post("/api/v1/compositions", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, createCompositionInputSchema);
    return respond(
      c,
      await options.platform.createComposition(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.patch("/api/v1/compositions/:compositionId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, updateCompositionInputSchema);
    return respond(
      c,
      await options.platform.updateComposition(
        actor.tenantId,
        c.req.param("compositionId"),
        input,
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.delete("/api/v1/compositions/:compositionId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.deleteComposition(
        actor.tenantId,
        c.req.param("compositionId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.post("/api/v1/compositions/:compositionId/publish", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.publishComposition(
        actor.tenantId,
        c.req.param("compositionId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.get("/api/v1/policies", async (c) => {
    requireManagementRole(c.get("actor"));
    return respond(c, await options.platform.listPolicies(c.get("actor").tenantId));
  });
  app.post("/api/v1/policies", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, createPolicyInputSchema);
    return respond(
      c,
      await options.platform.createPolicy(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.patch("/api/v1/policies/:policyId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, updatePolicyInputSchema);
    return respond(
      c,
      await options.platform.updatePolicy(
        actor.tenantId,
        c.req.param("policyId"),
        input,
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.post("/api/v1/policies/:policyId/activate", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.activatePolicy(
        actor.tenantId,
        c.req.param("policyId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.post("/api/v1/policies/:policyId/archive", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.archivePolicy(
        actor.tenantId,
        c.req.param("policyId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.get("/api/v1/policies/:policyId/lint", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const policy = (await options.platform.listPolicies(actor.tenantId)).find(
      (candidate) => candidate.id === c.req.param("policyId")
    );
    if (!policy) throw new PlatformNotFoundError("Policy");
    return respond(c, options.platform.lintPolicy(policy));
  });
  app.post("/api/v1/policy/simulate", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, policySimulationInputSchema);
    return respond(c, await options.platform.simulatePolicy(actor.tenantId, input));
  });
  app.post("/api/v1/sessions", async (c) => {
    const actor = c.get("actor");
    const requestedInput = await parseBody(c.req.raw, createSessionInputSchema);
    // A production caller may only mint a session for its authenticated
    // identity. Delegated/service-principal issuance needs a separate,
    // explicitly authorized API instead of trusting roles from request JSON.
    const input = options.demoMode
      ? requestedInput
      : { ...requestedInput, subject: actor.subject };
    return respond(
      c,
      await options.platform.createSession(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId"),
        options.publicOrigin
      ),
      201
    );
  });
  app.get("/api/v1/sessions", async (c) => {
    const actor = c.get("actor");
    return respond(
      c,
      await options.platform.listSessions(
        actor.tenantId,
        hasManagementRole(actor) ? undefined : actor.id
      )
    );
  });
  app.post("/api/v1/sessions/:sessionId/revoke", async (c) => {
    const actor = c.get("actor");
    return respond(
      c,
      await options.platform.revokeSession(
        actor.tenantId,
        c.req.param("sessionId"),
        actor.id,
        c.get("requestId"),
        hasManagementRole(actor)
      )
    );
  });
  app.get("/api/v1/roles", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(c, await options.platform.listRoles(actor.tenantId));
  });
  app.post("/api/v1/roles", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, createRoleInputSchema);
    return respond(
      c,
      await options.platform.createRole(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.patch("/api/v1/roles/:roleId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, updateRoleInputSchema);
    return respond(
      c,
      await options.platform.updateRole(
        actor.tenantId,
        c.req.param("roleId"),
        input,
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.delete("/api/v1/roles/:roleId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.deleteRole(
        actor.tenantId,
        c.req.param("roleId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.get("/api/v1/role-assignments", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.listRoleAssignments(
        actor.tenantId,
        c.req.query("subjectId")
      )
    );
  });
  app.post("/api/v1/role-assignments", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, assignRoleInputSchema);
    return respond(
      c,
      await options.platform.assignRole(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.delete("/api/v1/role-assignments/:assignmentId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.removeRoleAssignment(
        actor.tenantId,
        c.req.param("assignmentId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.get("/api/v1/audit", async (c) => {
    requireManagementRole(c.get("actor"));
    const limitValue = Number(c.req.query("limit") ?? "100");
    const limit = Number.isFinite(limitValue) ? Math.max(1, limitValue) : 100;
    return respond(c, await options.platform.listAudit(c.get("actor").tenantId, limit));
  });
  app.get("/api/v1/analytics/summary", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    if (!options.analytics) throw new AnalyticsUnavailableError();
    const { format, ...window } = parseAnalyticsHttpQuery(
      c.req.raw,
      analyticsSummaryHttpSchema
    );
    const result = await options.analytics.summary({
      tenantId: actor.tenantId,
      ...window,
    });
    if (format === "csv") {
      return csvResponse(summaryCsv(result), "litemcp-analytics-summary.csv");
    }
    analyticsJsonHeaders(c.res.headers);
    return respond(c, result);
  });
  app.get("/api/v1/analytics/timeseries", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    if (!options.analytics) throw new AnalyticsUnavailableError();
    const { format, ...query } = parseAnalyticsHttpQuery(
      c.req.raw,
      analyticsTimeseriesHttpSchema
    );
    const result = await options.analytics.timeseries({
      tenantId: actor.tenantId,
      ...query,
    });
    if (format === "csv") {
      return csvResponse(timeseriesCsv(result), "litemcp-analytics-timeseries.csv");
    }
    analyticsJsonHeaders(c.res.headers);
    return respond(c, result);
  });
  app.get("/api/v1/analytics/top", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    if (!options.analytics) throw new AnalyticsUnavailableError();
    const { format, ...query } = parseAnalyticsHttpQuery(
      c.req.raw,
      analyticsTopHttpSchema
    );
    const result = await options.analytics.top({
      tenantId: actor.tenantId,
      ...query,
    });
    if (format === "csv") {
      return csvResponse(topCsv(result), "litemcp-analytics-top.csv");
    }
    analyticsJsonHeaders(c.res.headers);
    return respond(c, result);
  });
  app.get("/api/v1/analytics/sessions/:sessionId/timeline", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    if (!options.analytics) throw new AnalyticsUnavailableError();
    const sessionId = entityIdSchema.safeParse(c.req.param("sessionId"));
    if (!sessionId.success) {
      throw validationError("Analytics query validation failed.", [
        { path: "sessionId", message: "A valid session identifier is required." },
      ]);
    }
    const { format, ...window } = parseAnalyticsHttpQuery(
      c.req.raw,
      analyticsTimelineHttpSchema
    );
    const result = await options.analytics.sessionTimeline({
      tenantId: actor.tenantId,
      sessionId: sessionId.data,
      ...window,
    });
    if (format === "csv") {
      return csvResponse(timelineCsv(result), "litemcp-analytics-session-timeline.csv");
    }
    analyticsJsonHeaders(c.res.headers);
    return respond(c, result);
  });
  app.get("/api/v1/analytics/flows", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    if (!options.analytics) throw new AnalyticsUnavailableError();
    const { format, ...query } = parseAnalyticsHttpQuery(
      c.req.raw,
      analyticsFlowsHttpSchema
    );
    const result = await options.analytics.flows({
      tenantId: actor.tenantId,
      ...query,
    });
    if (format === "csv") {
      return csvResponse(flowsCsv(result), "litemcp-analytics-flows.csv");
    }
    analyticsJsonHeaders(c.res.headers);
    return respond(c, result);
  });
  app.get("/api/v1/analytics/policy-insights", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    if (!options.analytics) throw new AnalyticsUnavailableError();
    const { format, ...window } = parseAnalyticsHttpQuery(
      c.req.raw,
      analyticsPolicyInsightsHttpSchema
    );
    const activePolicy = await options.platform.activePolicy(actor.tenantId);
    const result = await options.analytics.policyInsights({
      tenantId: actor.tenantId,
      ...window,
      ...(activePolicy ? { policyId: activePolicy.id } : {}),
      ruleIds: activePolicy?.rules.map((rule) => rule.id) ?? [],
    });
    if (format === "csv") {
      return csvResponse(
        policyInsightsCsv(result),
        "litemcp-analytics-policy-insights.csv"
      );
    }
    analyticsJsonHeaders(c.res.headers);
    return respond(c, result);
  });
  app.get("/api/v1/analytics/recent", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    if (!options.analytics) throw new AnalyticsUnavailableError();
    const { format, ...query } = parseAnalyticsHttpQuery(
      c.req.raw,
      analyticsRecentHttpSchema
    );
    const result = await options.analytics.recent({
      tenantId: actor.tenantId,
      ...query,
    });
    if (format === "csv") {
      return csvResponse(
        usageEventsToCsv(result.events),
        "litemcp-analytics-recent.csv"
      );
    }
    analyticsJsonHeaders(c.res.headers);
    return respond(c, result);
  });
  app.get("/api/v1/usage", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const parsed = usageHttpSchema.safeParse(analyticsSearchParams(c.req.raw));
    if (!parsed.success) {
      throw validationError(
        "Usage query validation failed.",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      );
    }
    const result = await options.platform.getUsageStanding(actor.tenantId);
    if (parsed.data.format === "csv") {
      return csvResponse(usageCsv(result), "litemcp-usage-standing.csv");
    }
    analyticsJsonHeaders(c.res.headers);
    return respond(c, result);
  });
  app.get("/api/v1/activation-events", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(c, await options.platform.listActivationEvents(actor.tenantId));
  });
  app.get("/api/v1/authority", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(c, await options.platform.getAuthority(actor.tenantId));
  });
  app.get("/api/v1/identity-providers", async (c) => {
    requireManagementRole(c.get("actor"));
    return respond(
      c,
      await options.platform.listIdentityProviders(c.get("actor").tenantId)
    );
  });
  app.post("/api/v1/identity-providers", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, createIdentityProviderInputSchema);
    return respond(
      c,
      await options.platform.createIdentityProvider(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.patch("/api/v1/identity-providers/:providerId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, updateIdentityProviderInputSchema);
    return respond(
      c,
      await options.platform.updateIdentityProvider(
        actor.tenantId,
        c.req.param("providerId"),
        input,
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.delete("/api/v1/identity-providers/:providerId", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.deleteIdentityProvider(
        actor.tenantId,
        c.req.param("providerId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.get("/api/v1/approvals", async (c) => {
    const actor = c.get("actor");
    if (!hasManagementRole(actor) && !actor.subject.roles.includes("approver")) {
      throw new PlatformAuthorizationError(
        "An organization administrator or approver role is required."
      );
    }
    return respond(c, await options.platform.listApprovals(actor.tenantId));
  });
  app.post("/api/v1/approvals/:approvalId/decision", async (c) => {
    const actor = c.get("actor");
    const input = await parseBody(c.req.raw, approvalDecisionInputSchema);
    return respond(
      c,
      await options.platform.decideApproval(
        actor.tenantId,
        c.req.param("approvalId"),
        input,
        actor.subject,
        c.get("requestId")
      )
    );
  });
  app.post("/api/v1/tenant/freeze", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await optionalJsonBody(c.req.raw, freezeInputSchema, {});
    return respond(
      c,
      await options.platform.setTenantFrozen(
        actor.tenantId,
        true,
        input.reason,
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.post("/api/v1/tenant/unfreeze", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.setTenantFrozen(
        actor.tenantId,
        false,
        null,
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.post("/api/v1/service-principals", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    const input = await parseBody(c.req.raw, createServicePrincipalInputSchema);
    return respond(
      c,
      await options.platform.createServicePrincipal(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      ),
      201
    );
  });
  app.post("/api/v1/subjects/:subjectId/deprovision", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    return respond(
      c,
      await options.platform.deprovisionSubject(
        actor.tenantId,
        c.req.param("subjectId"),
        actor.id,
        c.get("requestId")
      )
    );
  });
  app.get("/api/v1/export", async (c) => {
    requireManagementRole(c.get("actor"));
    return respond(c, await options.platform.exportTenant(c.get("actor").tenantId));
  });
  app.post("/api/v1/import", async (c) => {
    const actor = c.get("actor");
    requireManagementRole(actor);
    let input: unknown;
    try {
      input = await c.req.json();
    } catch {
      throw new PlatformValidationError("Request body must be valid JSON.");
    }
    return respond(
      c,
      await options.platform.importTenant(
        actor.tenantId,
        input,
        actor.id,
        c.get("requestId")
      )
    );
  });

  app.post("/mcp/:tenantId/:compositionSlug", async (c) => {
    const requestIdValue = c.get("requestId");
    const tenantId = c.req.param("tenantId");
    const compositionSlug = c.req.param("compositionSlug");
    const resourceMetadata = protectedResourceMetadataUrl(
      options.publicOrigin,
      tenantId,
      compositionSlug
    );
    const token = bearerToken(c.req.header("authorization") ?? null);
    if (!token || tenantFromSessionToken(token) === null) {
      c.header("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadata}"`);
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "A valid MCP bearer token is required." },
        },
        401
      );
    }
    if (tenantFromSessionToken(token) !== tenantId) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32003, message: "Session tenant does not match endpoint." },
        },
        403
      );
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        400
      );
    }
    const result = await options.gateway.handle({
      tenantId,
      compositionSlug,
      authorization: c.req.header("authorization") ?? null,
      body,
      requestId: requestIdValue,
      signal: c.req.raw.signal,
    });
    if (result.status === 401) {
      c.header("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadata}"`);
    }
    if (!result.body) return c.body(null, result.status === 202 ? 202 : 204);
    return c.json(result.body, result.status as 200);
  });

  app.post("/demo-upstreams/finance/mcp", async (c) => {
    if (!options.demoMode) return c.notFound();
    const body = (await c.req.json()) as {
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    if (body.method === "initialize") {
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "LiteMCP Composer Finance Sandbox", version: "1.0.0" },
        },
      });
    }
    if (body.method === "tools/list") {
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          tools: [
            {
              name: "list_invoices",
              description: "Lists deterministic sandbox invoices.",
              inputSchema: {
                type: "object",
                properties: { accountId: { type: "string" } },
                required: ["accountId"],
              },
            },
            {
              name: "issue_refund",
              description: "Creates a sandbox refund.",
              inputSchema: {
                type: "object",
                properties: {
                  invoiceId: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["invoiceId", "reason"],
              },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call" && body.params?.name === "list_invoices") {
      const accountId = String(body.params.arguments?.accountId ?? "unknown");
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          content: [
            {
              type: "text",
              text: `invoice_100 · ${accountId} · EUR 42.00 · open`,
            },
          ],
          structuredContent: {
            invoices: [
              {
                id: "invoice_100",
                accountId,
                currency: "EUR",
                amount: 42,
                status: "open",
              },
            ],
          },
        },
      });
    }
    if (body.method === "tools/call" && body.params?.name === "issue_refund") {
      const invoiceId = String(body.params.arguments?.invoiceId ?? "unknown");
      const reason = String(body.params.arguments?.reason ?? "unspecified");
      const refundId = `refund_${invoiceId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          content: [
            {
              type: "text",
              text: `${refundId} · ${invoiceId} · approved sandbox refund`,
            },
          ],
          structuredContent: {
            refund: {
              id: refundId,
              invoiceId,
              reason,
              status: "succeeded",
              sandbox: true,
            },
          },
          isError: false,
        },
      });
    }
    return c.json(
      {
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32601, message: "Method or tool not found" },
      },
      404
    );
  });

  app.notFound((c) =>
    c.json(
      problem(
        c.req.raw,
        c.get("requestId"),
        404,
        "Not Found",
        "No route matched this request."
      ),
      404
    )
  );

  app.onError((error, c) => {
    const requestIdValue = c.get("requestId");
    try {
      void Promise.resolve(
        options.reportError?.({
          error,
          requestId: requestIdValue,
          request: c.req.raw,
        })
      ).catch(() => undefined);
    } catch {
      // Observability must never replace the original HTTP error response.
    }
    if (error instanceof AnalyticsUnavailableError) {
      return c.json(
        problem(c.req.raw, requestIdValue, 503, "Analytics Unavailable", error.message),
        503
      );
    }
    if (error instanceof AnalyticsQueryLimitError) {
      return c.json(
        problem(c.req.raw, requestIdValue, 422, "Analytics Query Limit", error.message),
        422
      );
    }
    if (error instanceof PlatformNotFoundError) {
      return c.json(
        problem(c.req.raw, requestIdValue, 404, "Not Found", error.message),
        404
      );
    }
    if (error instanceof PlatformAuthorizationError) {
      return c.json(
        problem(c.req.raw, requestIdValue, 403, "Forbidden", error.message),
        403
      );
    }
    if (error instanceof PlatformConflictError) {
      return c.json(
        problem(c.req.raw, requestIdValue, 409, "Conflict", error.message),
        409
      );
    }
    if (error instanceof PlatformQuotaError) {
      return c.json(
        problem(c.req.raw, requestIdValue, 429, "Quota Exceeded", error.message),
        429
      );
    }
    if (error instanceof PlatformValidationError) {
      const issues = (
        error as PlatformValidationError & {
          issues?: Array<{ path: string; message: string }>;
        }
      ).issues;
      return c.json(
        problem(
          c.req.raw,
          requestIdValue,
          422,
          "Validation Failed",
          error.message,
          issues
        ),
        422
      );
    }
    console.error("[litemcp] request failed", {
      requestId: requestIdValue,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return c.json(
      problem(
        c.req.raw,
        requestIdValue,
        500,
        "Internal Error",
        "The request failed. Sensitive details were not returned."
      ),
      500
    );
  });

  return app;
};

export type PlatformApp = ReturnType<typeof createPlatformApp>;
