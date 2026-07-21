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
  members: z.array(compositionMemberSchema).min(1).max(100),
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

export const identityProviderSchema = z.object({
  id: entityIdSchema,
  tenantId: entityIdSchema,
  name: z.string().min(2).max(120),
  protocol: z.enum(["oidc", "saml"]),
  issuer: z.string().url(),
  domains: z.array(z.string().min(3).max(255)).min(1).max(32),
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
  sessionId: entityIdSchema,
  toolName: z.string().min(1).max(320),
  argumentsHash: z.string().length(64),
  encryptedArgumentsReference: z.string().min(3).max(500),
  status: z.enum(["pending", "approved", "denied", "expired"]),
  requestedBy: entityIdSchema,
  decidedBy: entityIdSchema.nullable(),
  decisionReason: z.string().max(1_000).nullable(),
  expiresAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revision: z.number().int().positive(),
});

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

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

export const createCompositionInputSchema = compositionSchema.pick({
  environmentId: true,
  slug: true,
  name: true,
  description: true,
  members: true,
  aliases: true,
});

export type CreateCompositionInput = z.infer<typeof createCompositionInputSchema>;

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
