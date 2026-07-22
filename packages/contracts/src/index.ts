import { z } from "zod";

export const entityIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);

export const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const timestampSchema = z.string().datetime({ offset: true });

export const riskClassSchema = z.enum([
  "read",
  "write",
  "destructive",
  "financial",
  "identity-admin",
  "code-exec",
]);

export type RiskClass = z.infer<typeof riskClassSchema>;

export const transportSchema = z.enum([
  "builtin",
  "streamable-http",
  "legacy-sse",
  "stdio",
]);

export type Transport = z.infer<typeof transportSchema>;

export const toolDefinitionSchema = z.object({
  name: z.string().min(1).max(160),
  title: z.string().min(1).max(160),
  description: z.string().max(2_000),
  inputSchema: z.record(z.string(), z.unknown()),
  risk: riskClassSchema,
  readOnly: z.boolean(),
  idempotent: z.boolean(),
});

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

export const organizationSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  slug: slugSchema,
  name: z.string().min(2).max(120),
  plan: z.literal("free"),
  region: z.string().min(2).max(40),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type Organization = z.infer<typeof organizationSchema>;

export const environmentSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  slug: slugSchema,
  name: z.string().min(2).max(100),
  kind: z.enum(["development", "staging", "production"]),
  region: z.string().min(2).max(40),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type Environment = z.infer<typeof environmentSchema>;

export const mcpServerSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  slug: slugSchema,
  name: z.string().min(2).max(120),
  description: z.string().max(2_000),
  transport: transportSchema,
  endpoint: z.string().url().optional(),
  command: z.array(z.string().min(1)).max(32).optional(),
  version: z.string().min(1).max(64),
  status: z.enum(["healthy", "degraded", "offline", "unprobed"]),
  visibility: z.enum(["public", "private", "unlisted"]),
  tags: z.array(z.string().min(1).max(60)).max(32),
  tools: z.array(toolDefinitionSchema),
  schemaHash: z.string().length(64).optional(),
  driftStatus: z.enum(["current", "drifted", "quarantined"]).optional(),
  lastProbedAt: timestampSchema.nullable().optional(),
  lastProbeError: z.string().max(2_000).nullable().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type McpServerDefinition = z.infer<typeof mcpServerSchema>;

export const compositionMemberSchema = z.object({
  serverId: entityIdSchema,
  namespace: slugSchema,
  enabled: z.boolean(),
  pinnedVersion: z.string().min(1).max(64),
  priority: z.number().int().min(0).max(10_000),
});

export const toolAliasSchema = z.object({
  alias: z.string().min(1).max(160),
  target: z.string().min(3).max(320),
});

export const compositionSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  environmentId: entityIdSchema,
  slug: slugSchema,
  name: z.string().min(2).max(120),
  description: z.string().max(2_000),
  version: z.string().min(1).max(64),
  status: z.enum(["draft", "published", "archived"]),
  members: z.array(compositionMemberSchema).max(100),
  aliases: z.array(toolAliasSchema).max(200),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type Composition = z.infer<typeof compositionSchema>;

export const policyEffectSchema = z.enum(["allow", "deny", "require-approval"]);

export type PolicyEffect = z.infer<typeof policyEffectSchema>;

export const policyRuleSchema = z.object({
  id: entityIdSchema,
  description: z.string().min(1).max(500),
  priority: z.number().int().min(0).max(100_000),
  effect: policyEffectSchema,
  roles: z.array(z.string().min(1).max(80)).max(64).optional(),
  groups: z.array(z.string().min(1).max(160)).max(256).optional(),
  tools: z.array(z.string().min(1).max(320)).max(256).optional(),
  risks: z.array(riskClassSchema).max(6).optional(),
  actions: z
    .array(z.enum(["discover", "execute"]))
    .max(2)
    .optional(),
});

export type PolicyRule = z.infer<typeof policyRuleSchema>;

export const policySchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  name: z.string().min(2).max(120),
  description: z.string().max(2_000),
  version: z.string().min(1).max(64),
  status: z.enum(["draft", "active", "archived"]),
  defaultEffect: z.enum(["allow", "deny"]),
  rules: z.array(policyRuleSchema).max(1_000),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type Policy = z.infer<typeof policySchema>;

export const roleSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  slug: slugSchema,
  name: z.string().min(2).max(120),
  description: z.string().max(1_000),
  builtin: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type Role = z.infer<typeof roleSchema>;

export const roleAssignmentSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  subjectId: entityIdSchema,
  roleId: entityIdSchema,
  createdBy: entityIdSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

export const tenantAuthoritySchema = z.object({
  id: z.literal("authority"),
  tenantId: entityIdSchema,
  authorizationEpoch: z.number().int().nonnegative(),
  activePolicyId: entityIdSchema.nullable(),
  frozen: z.boolean(),
  freezeReason: z.string().max(1_000).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type TenantAuthority = z.infer<typeof tenantAuthoritySchema>;

export const subjectSchema = z.object({
  type: z.enum(["user", "service-principal"]),
  id: entityIdSchema,
  roles: z.array(z.string().min(1).max(80)).max(64),
  groups: z.array(z.string().min(1).max(160)).max(256),
  claims: z.record(z.string(), z.string()).default({}),
});

export type Subject = z.infer<typeof subjectSchema>;

export const gatewaySessionSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  compositionId: entityIdSchema,
  environmentId: entityIdSchema,
  subject: subjectSchema,
  authorizationEpoch: z.number().int().nonnegative().optional(),
  oauthGrantId: entityIdSchema.optional(),
  tokenHash: z.string().length(64),
  approvedClients: z.array(z.string().min(1).max(160)).max(64),
  expiresAt: timestampSchema,
  revokedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type GatewaySession = z.infer<typeof gatewaySessionSchema>;

export const auditEventSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  sequence: z.number().int().positive(),
  type: z.string().min(3).max(160),
  actorId: z.string().min(1).max(160),
  actorType: z.enum(["user", "service-principal", "system"]),
  action: z.string().min(1).max(160),
  targetType: z.string().min(1).max(160),
  targetId: z.string().min(1).max(320),
  outcome: z.enum(["allowed", "denied", "pending", "succeeded", "failed"]),
  requestId: z.string().min(1).max(160),
  policyVersion: z.string().max(64).optional(),
  explanation: z.string().max(2_000),
  metadata: z.record(z.string(), z.unknown()),
  previousHash: z.string().length(64).nullable(),
  hash: z.string().length(64),
  createdAt: timestampSchema,
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

const isSecureIdentityProviderIssuer = (value: string) => {
  try {
    const issuer = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      issuer.hostname
    );
    return (
      (issuer.protocol === "https:" || (issuer.protocol === "http:" && loopback)) &&
      !issuer.username &&
      !issuer.password &&
      !issuer.hash
    );
  } catch {
    return false;
  }
};

export const identityProviderIssuerSchema = z
  .string()
  .trim()
  .url()
  .refine(isSecureIdentityProviderIssuer, {
    message:
      "Identity-provider issuers must use HTTPS, except explicit HTTP loopback development issuers, and cannot contain credentials or fragments.",
  });

const isDomainName = (value: string) => {
  if (!value.includes(".") || /^\d+(?:\.\d+){3}$/.test(value)) return false;
  return value
    .split(".")
    .every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    );
};

export const identityProviderDomainSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase().replace(/\.$/, ""))
  .pipe(
    z.string().min(3).max(253).refine(isDomainName, {
      message:
        "Identity-provider domains must be DNS hostnames without schemes, paths, ports, wildcards, or IP addresses.",
    })
  );

export const identityProviderSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  name: z.string().min(2).max(120),
  protocol: z.enum(["oidc", "saml"]),
  issuer: identityProviderIssuerSchema,
  domains: z.array(identityProviderDomainSchema).min(1).max(32),
  clientId: z.string().min(1).max(500),
  secretReference: z.string().min(3).max(500),
  status: z.enum(["draft", "active", "disabled"]),
  groupMappings: z.array(
    z.object({
      claim: z.string().min(1).max(160),
      value: z.string().min(1).max(320),
      role: z.string().min(1).max(80),
    })
  ),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type IdentityProvider = z.infer<typeof identityProviderSchema>;

export const approvalRequestSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  compositionId: entityIdSchema,
  compositionVersion: z.string().min(1).max(64),
  sessionId: entityIdSchema,
  serverId: entityIdSchema,
  serverVersion: z.string().min(1).max(64),
  serverRevision: z.number().int().positive(),
  serverSchemaHash: z.string().length(64),
  serverExecutionConfigHash: z.string().length(64),
  policyId: entityIdSchema,
  policyVersion: z.string().min(1).max(64),
  authorizationEpoch: z.number().int().nonnegative(),
  matchedRuleIds: z
    .array(entityIdSchema)
    .max(16)
    .refine((values) => new Set(values).size === values.length, {
      message: "Matched rule IDs must be unique.",
    })
    .optional(),
  toolName: z.string().min(1).max(320),
  argumentsHash: z.string().length(64),
  fingerprint: z.string().length(64),
  generation: z.number().int().positive(),
  encryptedArgumentsReference: z.string().min(3).max(500),
  status: z.enum(["pending", "approved", "denied", "expired"]),
  requestedBy: entityIdSchema,
  decidedBy: entityIdSchema.nullable(),
  decisionReason: z.string().max(1_000).nullable(),
  approvedAt: timestampSchema.nullable().optional(),
  consumedAt: timestampSchema.nullable().optional(),
  expiresAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const servicePrincipalSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  name: z.string().min(2).max(120),
  clientId: entityIdSchema,
  secretHash: z.string().length(64),
  roles: z.array(slugSchema).max(64),
  status: z.enum(["active", "disabled"]),
  lastUsedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type ServicePrincipal = z.infer<typeof servicePrincipalSchema>;

export const oauthClientSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  clientId: entityIdSchema,
  clientName: z.string().min(1).max(200),
  redirectUris: z.array(z.string().url()).min(1).max(20),
  grantTypes: z.array(z.enum(["authorization_code", "refresh_token"])).min(1),
  tokenEndpointAuthMethod: z.literal("none"),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type OAuthClient = z.infer<typeof oauthClientSchema>;

export const oauthAuthorizationCodeSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  clientId: entityIdSchema,
  compositionId: entityIdSchema,
  environmentId: entityIdSchema,
  redirectUri: z.string().url(),
  codeHash: z.string().length(64),
  codeChallenge: z.string().min(43).max(128),
  scopes: z.array(z.string().min(1).max(320)).max(16),
  subject: subjectSchema,
  authorizationEpoch: z.number().int().nonnegative(),
  expiresAt: timestampSchema,
  consumedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type OAuthAuthorizationCode = z.infer<typeof oauthAuthorizationCodeSchema>;

export const oauthRefreshTokenSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  clientId: entityIdSchema,
  compositionId: entityIdSchema,
  environmentId: entityIdSchema,
  accessSessionId: entityIdSchema,
  grantId: entityIdSchema,
  tokenHash: z.string().length(64),
  scopes: z.array(z.string().min(1).max(320)).max(16),
  subject: subjectSchema,
  authorizationEpoch: z.number().int().nonnegative(),
  expiresAt: timestampSchema,
  rotatedAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type OAuthRefreshToken = z.infer<typeof oauthRefreshTokenSchema>;

export const createServerInputSchema = mcpServerSchema
  .pick({
    slug: true,
    name: true,
    description: true,
    transport: true,
    endpoint: true,
    command: true,
    version: true,
    visibility: true,
    tags: true,
  })
  .extend({
    tools: z.array(toolDefinitionSchema).default([]),
  });

export type CreateServerInput = z.infer<typeof createServerInputSchema>;

export const updateServerInputSchema = mcpServerSchema
  .pick({
    name: true,
    description: true,
    endpoint: true,
    command: true,
    version: true,
    visibility: true,
    tags: true,
    tools: true,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one server field must be provided.",
  });

export type UpdateServerInput = z.infer<typeof updateServerInputSchema>;

export const createCompositionInputSchema = compositionSchema.pick({
  environmentId: true,
  slug: true,
  name: true,
  description: true,
  members: true,
  aliases: true,
});

export type CreateCompositionInput = z.infer<typeof createCompositionInputSchema>;

export const updateCompositionInputSchema = compositionSchema
  .pick({
    name: true,
    description: true,
    members: true,
    aliases: true,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one composition field must be provided.",
  });

export type UpdateCompositionInput = z.infer<typeof updateCompositionInputSchema>;

export const createPolicyInputSchema = policySchema.pick({
  name: true,
  description: true,
  defaultEffect: true,
  rules: true,
});

export type CreatePolicyInput = z.infer<typeof createPolicyInputSchema>;

export const updatePolicyInputSchema = policySchema
  .pick({
    name: true,
    description: true,
    defaultEffect: true,
    rules: true,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one policy field must be provided.",
  });

export type UpdatePolicyInput = z.infer<typeof updatePolicyInputSchema>;

export const createRoleInputSchema = roleSchema.pick({
  slug: true,
  name: true,
  description: true,
});

export type CreateRoleInput = z.infer<typeof createRoleInputSchema>;

export const updateRoleInputSchema = roleSchema
  .pick({ name: true, description: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one role field must be provided.",
  });

export type UpdateRoleInput = z.infer<typeof updateRoleInputSchema>;

export const assignRoleInputSchema = z.object({
  subjectId: entityIdSchema,
  roleId: entityIdSchema,
});

export type AssignRoleInput = z.infer<typeof assignRoleInputSchema>;

export const approvalDecisionInputSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  reason: z.string().trim().min(2).max(1_000),
  generation: z.number().int().positive(),
  fingerprint: z.string().length(64),
});

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionInputSchema>;

export const createIdentityProviderInputSchema = identityProviderSchema
  .pick({
    name: true,
    protocol: true,
    issuer: true,
    domains: true,
    clientId: true,
    status: true,
    groupMappings: true,
  })
  .extend({ clientSecret: z.string().min(16).max(4_096) });

export type CreateIdentityProviderInput = z.infer<
  typeof createIdentityProviderInputSchema
>;

export const updateIdentityProviderInputSchema = createIdentityProviderInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one identity-provider field must be provided.",
  });

export type UpdateIdentityProviderInput = z.infer<
  typeof updateIdentityProviderInputSchema
>;

export const createServicePrincipalInputSchema = z.object({
  name: z.string().min(2).max(120),
  roles: z.array(slugSchema).max(64).default([]),
});

export type CreateServicePrincipalInput = z.infer<
  typeof createServicePrincipalInputSchema
>;

export const oauthClientRegistrationInputSchema = z.object({
  client_name: z.string().min(1).max(200),
  redirect_uris: z.array(z.string().url()).min(1).max(20),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .min(1)
    .default(["authorization_code", "refresh_token"]),
  token_endpoint_auth_method: z.literal("none").default("none"),
});

export type OAuthClientRegistrationInput = z.infer<
  typeof oauthClientRegistrationInputSchema
>;

export const createSessionInputSchema = z.object({
  compositionId: entityIdSchema,
  environmentId: entityIdSchema,
  subject: subjectSchema,
  approvedClients: z.array(z.string().min(1).max(160)).max(64).default([]),
  expiresInSeconds: z.number().int().min(60).max(86_400).default(3_600),
});

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const policySimulationInputSchema = z.object({
  policyId: entityIdSchema.optional(),
  subject: subjectSchema,
  action: z.enum(["discover", "execute"]),
  toolName: z.string().min(1).max(320),
  risk: riskClassSchema,
});

export type PolicySimulationInput = z.infer<typeof policySimulationInputSchema>;

export const policyDecisionSchema = z.object({
  effect: policyEffectSchema,
  allowed: z.boolean(),
  requiresApproval: z.boolean(),
  matchedRuleIds: z.array(entityIdSchema),
  explanation: z.string(),
  policyId: entityIdSchema.nullable(),
  policyVersion: z.string().nullable(),
});

export type PolicyDecision = z.infer<typeof policyDecisionSchema>;

export type ApiSuccess<T> = {
  data: T;
  meta: {
    requestId: string;
    nextCursor?: string;
  };
};

export type ApiProblem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: string;
  errors?: Array<{ path: string; message: string }>;
};

export type PlatformOverview = {
  organization: Organization;
  environment: Environment;
  counts: {
    servers: number;
    compositions: number;
    activePolicies: number;
    sessions: number;
    pendingApprovals: number;
    auditEvents: number;
  };
  gateway: {
    status: "healthy" | "degraded";
    endpoint: string;
    protocolVersion: string;
    storageDriver: string;
  };
};

export const usageEventTypeSchema = z.enum([
  "initialize",
  "discover",
  "call",
  "denied",
  "approval_required",
  "error",
  "session_minted",
  "session_revoked",
  "approval_decided",
]);

export type UsageEventType = z.infer<typeof usageEventTypeSchema>;

export const usageEventStatusSchema = z.enum([
  "succeeded",
  "denied",
  "pending",
  "failed",
]);

export type UsageEventStatus = z.infer<typeof usageEventStatusSchema>;

export const analyticsUserAgentClassSchema = z.enum([
  "cursor",
  "claude-code",
  "chatgpt",
  "litemcp-sdk",
  "browser",
  "other",
  "unknown",
]);

export type AnalyticsUserAgentClass = z.infer<typeof analyticsUserAgentClassSchema>;

const analyticsDimensionSchema = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

const uniqueAnalyticsDimensions = <T>(values: T[]) =>
  new Set(values).size === values.length;

const isAnalyticsSampleTruncated = (sample: readonly unknown[], total: number) =>
  sample.length < total;

export const sessionClientInfoSchema = z
  .object({
    name: analyticsDimensionSchema(120),
    version: analyticsDimensionSchema(64),
    protocolVersion: analyticsDimensionSchema(64),
    initializedAt: timestampSchema,
    userAgentClass: analyticsUserAgentClassSchema,
    sdk: z.boolean(),
  })
  .strict();

export type SessionClientInfo = z.infer<typeof sessionClientInfoSchema>;

/**
 * A payload-free, tenant-scoped analytics fact. This schema is deliberately
 * strict: tool arguments, tool results, emails, display names, and other
 * unmodelled fields are rejected instead of being silently retained.
 */
export const usageEventSchema = z
  .object({
    id: entityIdSchema,
    tenantId: entityIdSchema,
    sessionId: entityIdSchema,
    subjectId: entityIdSchema,
    subjectType: z.enum(["user", "service-principal"]),
    roles: z
      .array(analyticsDimensionSchema(80))
      .max(8)
      .refine(uniqueAnalyticsDimensions, "Roles must be unique."),
    clientName: analyticsDimensionSchema(120),
    clientVersion: analyticsDimensionSchema(64),
    userAgentClass: analyticsUserAgentClassSchema,
    sdk: z.boolean(),
    eventType: usageEventTypeSchema,
    compositionId: entityIdSchema,
    environmentId: entityIdSchema,
    namespace: slugSchema.optional(),
    serverId: entityIdSchema.optional(),
    tool: analyticsDimensionSchema(320).optional(),
    aliasUsed: z.boolean().optional(),
    risk: riskClassSchema.optional(),
    decisionEffect: policyEffectSchema.optional(),
    matchedRuleIds: z
      .array(entityIdSchema)
      .max(16)
      .refine(uniqueAnalyticsDimensions, "Matched rule IDs must be unique."),
    policyId: entityIdSchema.optional(),
    policyVersion: analyticsDimensionSchema(64).optional(),
    approvalId: entityIdSchema.optional(),
    approvalLatencyMs: z.number().int().nonnegative().max(2_592_000_000).optional(),
    latencyTotalMs: z.number().finite().nonnegative().max(86_400_000).optional(),
    latencyUpstreamMs: z.number().finite().nonnegative().max(86_400_000).optional(),
    status: usageEventStatusSchema,
    errorCode: analyticsDimensionSchema(120).optional(),
    requestBytes: z.number().int().nonnegative().max(1_073_741_824).optional(),
    responseBytes: z.number().int().nonnegative().max(1_073_741_824).optional(),
    toolsVisible: z.number().int().nonnegative().max(100_000).optional(),
    toolsHidden: z.number().int().nonnegative().max(100_000).optional(),
    visibleTools: z
      .array(analyticsDimensionSchema(320))
      .max(64)
      .refine(uniqueAnalyticsDimensions, "Visible tools must be unique.")
      .optional(),
    visibilityTruncated: z.boolean().optional(),
    auditId: entityIdSchema.optional(),
    auditSequence: z.number().int().positive().optional(),
    auditHash: z.string().length(64).optional(),
    requestId: analyticsDimensionSchema(160),
    ts: timestampSchema,
    protocolVersion: analyticsDimensionSchema(64),
  })
  .strict()
  .superRefine((event, context) => {
    if (
      event.latencyTotalMs !== undefined &&
      event.latencyUpstreamMs !== undefined &&
      event.latencyUpstreamMs > event.latencyTotalMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["latencyUpstreamMs"],
        message: "Upstream latency cannot exceed total latency.",
      });
    }
    const hasDiscoveryData =
      event.toolsVisible !== undefined ||
      event.toolsHidden !== undefined ||
      event.visibleTools !== undefined ||
      event.visibilityTruncated !== undefined;
    if (
      event.eventType === "discover" &&
      (event.toolsVisible === undefined ||
        event.toolsHidden === undefined ||
        event.visibleTools === undefined ||
        event.visibilityTruncated === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["toolsVisible"],
        message:
          "Discovery events require visibility counts, the capped visible-tool list, and its truncation flag.",
      });
    }
    if (event.eventType !== "discover" && hasDiscoveryData) {
      context.addIssue({
        code: "custom",
        path: ["toolsVisible"],
        message: "Tool visibility data is only valid on discovery events.",
      });
    }
    if (
      event.eventType === "discover" &&
      event.toolsVisible !== undefined &&
      event.visibleTools !== undefined &&
      event.visibleTools.length > event.toolsVisible
    ) {
      context.addIssue({
        code: "custom",
        path: ["visibleTools"],
        message: "The visible-tool sample cannot exceed the visible-tool count.",
      });
    }
    if (
      event.eventType === "discover" &&
      event.toolsVisible !== undefined &&
      event.visibleTools !== undefined &&
      event.visibilityTruncated !== undefined &&
      event.visibilityTruncated !==
        isAnalyticsSampleTruncated(event.visibleTools, event.toolsVisible)
    ) {
      context.addIssue({
        code: "custom",
        path: ["visibilityTruncated"],
        message:
          "The discovery truncation flag must state whether the visible-tool sample is incomplete.",
      });
    }
    const auditReceiptFieldCount = [
      event.auditId,
      event.auditSequence,
      event.auditHash,
    ].filter((value) => value !== undefined).length;
    if (auditReceiptFieldCount !== 0 && auditReceiptFieldCount !== 3) {
      context.addIssue({
        code: "custom",
        path: ["auditId"],
        message: "Audit receipt fields must be provided together.",
      });
    }
  });

export type UsageEvent = z.infer<typeof usageEventSchema>;

const analyticsTimeRangeShape = {
  tenantId: entityIdSchema,
  from: timestampSchema,
  to: timestampSchema,
};

const isOrderedAnalyticsRange = (value: { from: string; to: string }) =>
  Date.parse(value.from) < Date.parse(value.to);

const analyticsRangeIssue = {
  message: "Analytics time ranges must have from earlier than to.",
  path: ["to"] as PropertyKey[],
};

export const analyticsTimeRangeSchema = z
  .object(analyticsTimeRangeShape)
  .strict()
  .refine(isOrderedAnalyticsRange, analyticsRangeIssue);

export type AnalyticsTimeRange = z.infer<typeof analyticsTimeRangeSchema>;

export const analyticsSummaryQuerySchema = z
  .object(analyticsTimeRangeShape)
  .strict()
  .refine(isOrderedAnalyticsRange, analyticsRangeIssue);

export type AnalyticsSummaryQuery = z.infer<typeof analyticsSummaryQuerySchema>;

export const analyticsSummaryResultSchema = z
  .object({
    from: timestampSchema,
    to: timestampSchema,
    calls: z.number().int().nonnegative(),
    activeIdentities: z.number().int().nonnegative(),
    activeSessions: z.number().int().nonnegative(),
    denials: z.number().int().nonnegative(),
    denyRate: z.number().finite().min(0).max(1),
    errors: z.number().int().nonnegative(),
    errorRate: z.number().finite().min(0).max(1),
    latencyP50Ms: z.number().finite().nonnegative().nullable(),
    latencyP95Ms: z.number().finite().nonnegative().nullable(),
    pendingApprovals: z.number().int().nonnegative(),
  })
  .strict();

export type AnalyticsSummaryResult = z.infer<typeof analyticsSummaryResultSchema>;

export const analyticsTimeseriesMetricSchema = z.enum([
  "calls",
  "denials",
  "errors",
  "latency_p95",
]);

export type AnalyticsTimeseriesMetric = z.infer<typeof analyticsTimeseriesMetricSchema>;

export const analyticsIntervalSchema = z.enum(["5m", "1h", "1d"]);

export type AnalyticsInterval = z.infer<typeof analyticsIntervalSchema>;

export const analyticsTimeseriesQuerySchema = z
  .object({
    ...analyticsTimeRangeShape,
    metric: analyticsTimeseriesMetricSchema,
    interval: analyticsIntervalSchema,
  })
  .strict()
  .refine(isOrderedAnalyticsRange, analyticsRangeIssue);

export type AnalyticsTimeseriesQuery = z.infer<typeof analyticsTimeseriesQuerySchema>;

export const analyticsTimeseriesResultSchema = z
  .object({
    from: timestampSchema,
    to: timestampSchema,
    metric: analyticsTimeseriesMetricSchema,
    interval: analyticsIntervalSchema,
    points: z.array(
      z
        .object({
          ts: timestampSchema,
          value: z.number().finite().nonnegative().nullable(),
        })
        .strict()
    ),
  })
  .strict();

export type AnalyticsTimeseriesResult = z.infer<typeof analyticsTimeseriesResultSchema>;

export const analyticsTopDimensionSchema = z.enum([
  "tool",
  "subject",
  "client",
  "rule",
  "server",
]);

export type AnalyticsTopDimension = z.infer<typeof analyticsTopDimensionSchema>;

export const analyticsTopMetricSchema = z.enum(["calls", "denials", "latency"]);

export type AnalyticsTopMetric = z.infer<typeof analyticsTopMetricSchema>;

export const analyticsTopQuerySchema = z
  .object({
    ...analyticsTimeRangeShape,
    dimension: analyticsTopDimensionSchema,
    metric: analyticsTopMetricSchema,
    limit: z.number().int().min(1).max(100).default(10),
  })
  .strict()
  .refine(isOrderedAnalyticsRange, analyticsRangeIssue);

export type AnalyticsTopQuery = z.input<typeof analyticsTopQuerySchema>;

export const analyticsTopResultSchema = z
  .object({
    from: timestampSchema,
    to: timestampSchema,
    dimension: analyticsTopDimensionSchema,
    metric: analyticsTopMetricSchema,
    rows: z.array(
      z
        .object({
          key: analyticsDimensionSchema(320),
          value: z.number().finite().nonnegative(),
          eventCount: z.number().int().nonnegative(),
        })
        .strict()
    ),
  })
  .strict();

export type AnalyticsTopResult = z.infer<typeof analyticsTopResultSchema>;

export const analyticsRecentQuerySchema = z
  .object({
    ...analyticsTimeRangeShape,
    limit: z.number().int().min(1).max(500).default(100),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict()
  .refine(isOrderedAnalyticsRange, analyticsRangeIssue);

export type AnalyticsRecentQuery = z.input<typeof analyticsRecentQuerySchema>;

export const analyticsRecentResultSchema = z
  .object({
    events: z.array(usageEventSchema),
    nextCursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export type AnalyticsRecentResult = z.infer<typeof analyticsRecentResultSchema>;

export const analyticsSessionTimelineQuerySchema = z
  .object({
    ...analyticsTimeRangeShape,
    sessionId: entityIdSchema,
  })
  .strict()
  .refine(isOrderedAnalyticsRange, analyticsRangeIssue);

export type AnalyticsSessionTimelineQuery = z.infer<
  typeof analyticsSessionTimelineQuerySchema
>;

export const analyticsSessionTimelineResultSchema = z
  .object({
    sessionId: entityIdSchema,
    startedAt: timestampSchema.nullable(),
    endedAt: timestampSchema.nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    items: z.array(
      z
        .object({
          offsetMs: z.number().int().nonnegative(),
          event: usageEventSchema,
        })
        .strict()
    ),
  })
  .strict();

export type AnalyticsSessionTimelineResult = z.infer<
  typeof analyticsSessionTimelineResultSchema
>;

export const analyticsFlowsQuerySchema = z
  .object({
    ...analyticsTimeRangeShape,
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict()
  .refine(isOrderedAnalyticsRange, analyticsRangeIssue);

export type AnalyticsFlowsQuery = z.input<typeof analyticsFlowsQuerySchema>;

export const analyticsFlowsResultSchema = z
  .object({
    from: timestampSchema,
    to: timestampSchema,
    transitions: z.array(
      z
        .object({
          source: analyticsDimensionSchema(320),
          target: analyticsDimensionSchema(320),
          count: z.number().int().positive(),
          sessionCount: z.number().int().positive(),
        })
        .strict()
    ),
  })
  .strict();

export type AnalyticsFlowsResult = z.infer<typeof analyticsFlowsResultSchema>;

export const analyticsPolicyInsightsQuerySchema = z
  .object({
    ...analyticsTimeRangeShape,
    policyId: entityIdSchema.optional(),
    ruleIds: z
      .array(entityIdSchema)
      .max(1_000)
      .refine(uniqueAnalyticsDimensions, "Rule IDs must be unique.")
      .default([]),
  })
  .strict()
  .refine(isOrderedAnalyticsRange, analyticsRangeIssue);

export type AnalyticsPolicyInsightsQuery = z.input<
  typeof analyticsPolicyInsightsQuerySchema
>;

export const analyticsPolicyInsightsResultSchema = z
  .object({
    from: timestampSchema,
    to: timestampSchema,
    ruleHits: z.array(
      z
        .object({
          ruleId: entityIdSchema,
          events: z.number().int().positive(),
          denials: z.number().int().nonnegative(),
        })
        .strict()
    ),
    zeroHitRuleIds: z.array(entityIdSchema),
    denialHotspots: z.array(
      z
        .object({
          tool: analyticsDimensionSchema(320),
          calls: z.number().int().positive(),
          denials: z.number().int().positive(),
          denyRate: z.number().finite().min(0).max(1),
        })
        .strict()
    ),
    unusedVisibleTools: z.array(
      z
        .object({
          tool: analyticsDimensionSchema(320),
          discoveryCount: z.number().int().positive(),
          callCount: z.number().int().nonnegative(),
        })
        .strict()
    ),
    discoveryExecution: z
      .object({
        discoveries: z.number().int().nonnegative(),
        toolsVisible: z.number().int().nonnegative(),
        discoveringSessions: z.number().int().nonnegative(),
        executingSessions: z.number().int().nonnegative(),
        conversionRate: z.number().finite().min(0).max(1),
      })
      .strict(),
    approvals: z
      .object({
        required: z.number().int().nonnegative(),
        decided: z.number().int().nonnegative(),
        approved: z.number().int().nonnegative(),
        denied: z.number().int().nonnegative(),
        pending: z.number().int().nonnegative(),
        latencyP50Ms: z.number().finite().nonnegative().nullable(),
        latencyP95Ms: z.number().finite().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

export type AnalyticsPolicyInsightsResult = z.infer<
  typeof analyticsPolicyInsightsResultSchema
>;

const usageStandingEntrySchema = z
  .object({
    limit: z.number().int().nonnegative(),
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
  })
  .strict();

export const usageStandingSchema = z
  .object({
    generatedAt: timestampSchema,
    analyticsEnabled: z.boolean(),
    servers: usageStandingEntrySchema,
    compositions: usageStandingEntrySchema,
    activeSessions: usageStandingEntrySchema,
    toolCallsToday: usageStandingEntrySchema.extend({
      resetsAt: timestampSchema.nullable(),
    }),
  })
  .strict();

export type UsageStanding = z.infer<typeof usageStandingSchema>;
