import type { FailOpenAnalyticsRecorder } from "@litemcp/analytics";
import {
  type ApprovalRequest,
  type AuditEvent,
  approvalDecisionInputSchema,
  assignRoleInputSchema,
  type Composition,
  compositionSchema,
  createCompositionInputSchema,
  createIdentityProviderInputSchema,
  createPolicyInputSchema,
  createRoleInputSchema,
  createServerInputSchema,
  createServicePrincipalInputSchema,
  createSessionInputSchema,
  type Environment,
  entityIdSchema,
  environmentSchema,
  type GatewaySession,
  type IdentityProvider,
  identityProviderSchema,
  type McpServerDefinition,
  mcpServerSchema,
  type OAuthAuthorizationCode,
  type OAuthClient,
  type OAuthRefreshToken,
  type Organization,
  oauthClientRegistrationInputSchema,
  organizationSchema,
  type PlatformOverview,
  type Policy,
  type PolicyDecision,
  policySchema,
  policySimulationInputSchema,
  type RiskClass,
  type Role,
  type RoleAssignment,
  roleSchema,
  type ServicePrincipal,
  type SessionClientInfo,
  type Subject,
  sessionClientInfoSchema,
  type TenantAuthority,
  type ToolDefinition,
  timestampSchema,
  type UsageEvent,
  type UsageStanding,
  updateCompositionInputSchema,
  updateIdentityProviderInputSchema,
  updatePolicyInputSchema,
  updateRoleInputSchema,
  updateServerInputSchema,
  usageStandingSchema,
} from "@litemcp/contracts";
import {
  type DocumentStore,
  StoreConflictError,
  type StoredDocument,
} from "@litemcp/storage";
import { z } from "zod";

import { evaluatePolicy } from "./policy-engine.js";
import {
  type CredentialCipher,
  canonicalJson,
  nowIso,
  randomId,
  redactSecrets,
  safeEqual,
  sha256,
  sha256Base64Url,
} from "./security.js";

export class PlatformNotFoundError extends Error {
  readonly status = 404;

  constructor(resource: string) {
    super(`${resource} was not found in this tenant.`);
    this.name = "PlatformNotFoundError";
  }
}

export class PlatformValidationError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "PlatformValidationError";
  }
}

export class PlatformAuthorizationError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "PlatformAuthorizationError";
  }
}

export type AuditReceipt = Pick<AuditEvent, "id" | "sequence" | "hash">;

export type PolicyDenialContext = {
  requestedName: string;
  canonicalName: string;
  aliasUsed: boolean;
  namespace: string;
  serverId: string;
  risk: RiskClass;
  decision: PolicyDecision;
  auditReceipt: AuditReceipt;
};

/**
 * Preserves governance dimensions for product analytics while callers still
 * receive the same non-enumerating authorization response.
 */
export class PlatformPolicyDeniedError extends PlatformAuthorizationError {
  constructor(
    message: string,
    readonly context: PolicyDenialContext
  ) {
    super(message);
    this.name = "PlatformPolicyDeniedError";
  }
}

export class PlatformConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "PlatformConflictError";
  }
}

export class PlatformQuotaError extends Error {
  readonly status = 429;

  constructor(message: string) {
    super(message);
    this.name = "PlatformQuotaError";
  }
}

const encodeTenantTokenPart = (tenantId: string) =>
  btoa(tenantId).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

const decodeTenantTokenPart = (value: string) => {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/");
    return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  } catch {
    return null;
  }
};

export const tenantFromSessionToken = (token: string) => {
  const match = /^lmcp_v1\.([A-Za-z0-9_-]+)\.session_[a-f0-9]{32}\.[a-f0-9]{32}$/.exec(
    token
  );
  return match?.[1] ? decodeTenantTokenPart(match[1]) : null;
};

const sensitivePathSegment =
  /(?:^|[-_.])(api[-_]?key|access[-_]?token|auth|authorization|bearer|credential|jwt|key|password|secret|signature|sig|token)(?:$|[-_.:=])/i;

const decodeEndpointPathSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new PlatformValidationError(
      "Upstream endpoint paths must use valid percent encoding."
    );
  }
};

const validateEndpointForStorage = (endpoint: string) => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new PlatformValidationError("The upstream endpoint must be an absolute URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PlatformValidationError("Upstream endpoints must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.hash) {
    throw new PlatformValidationError(
      "Upstream endpoints cannot embed credentials or URL fragments."
    );
  }
  if (url.search) {
    throw new PlatformValidationError(
      "Upstream endpoint query parameters are not supported; store authentication in a credential profile."
    );
  }
  if (
    url.pathname
      .split("/")
      .filter(Boolean)
      .some((segment) => sensitivePathSegment.test(decodeEndpointPathSegment(segment)))
  ) {
    throw new PlatformValidationError(
      "Upstream endpoints cannot contain credential-like path segments."
    );
  }
  return url.toString();
};

const endpointForDisclosure = (endpoint: string | undefined) => {
  if (!endpoint) return undefined;
  const url = new URL(endpoint);
  url.search = "";
  url.hash = "";
  url.username = "";
  url.password = "";
  return url.toString();
};

type AuditInput = {
  type: string;
  actorId: string;
  actorType?: AuditEvent["actorType"];
  action: string;
  targetType: string;
  targetId: string;
  outcome: AuditEvent["outcome"];
  requestId: string;
  policyVersion?: string;
  explanation: string;
  metadata?: Record<string, unknown>;
};

type AuditHead = StoredDocument & {
  id: "head";
  tenantId: string;
  sequence: number;
  hash: string | null;
};

export type ResolvedTool = {
  composition: Composition;
  server: McpServerDefinition;
  tool: ToolDefinition;
  requestedName: string;
  canonicalName: string;
  upstreamName: string;
  aliasUsed: boolean;
  decision: PolicyDecision;
  auditReceipt: AuditReceipt;
};

type ApprovalBinding = {
  id: string;
  compositionId: string;
  compositionVersion: string;
  sessionId: string;
  serverId: string;
  serverVersion: string;
  serverRevision: number;
  serverSchemaHash: string;
  serverExecutionConfigHash: string;
  policyId: string;
  policyVersion: string;
  authorizationEpoch: number;
  toolName: string;
  argumentsHash: string;
  requestedBy: string;
  fingerprint: string;
  matchedRuleIds: string[];
};

type SessionAttribution = StoredDocument & {
  id: string;
  tenantId: string;
  sessionId: string;
  clientInfo: SessionClientInfo;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type AttributedGatewaySession = GatewaySession & {
  /** Runtime-only enrichment loaded from the immutable attribution document. */
  analyticsClientInfo?: SessionClientInfo;
};

export type DiscoveryResult = {
  tools: VisibleTool[];
  denied: boolean;
  toolsVisible: number;
  toolsHidden: number;
  visibleTools: string[];
  visibilityTruncated: boolean;
  matchedRuleIds: string[];
  policyId?: string;
  policyVersion?: string;
  auditReceipt: AuditReceipt;
};

type SessionUsageDetails = Pick<UsageEvent, "eventType" | "status" | "requestId"> &
  Partial<
    Pick<
      UsageEvent,
      | "namespace"
      | "serverId"
      | "tool"
      | "aliasUsed"
      | "risk"
      | "decisionEffect"
      | "matchedRuleIds"
      | "policyId"
      | "policyVersion"
      | "approvalId"
      | "approvalLatencyMs"
      | "latencyTotalMs"
      | "latencyUpstreamMs"
      | "errorCode"
      | "requestBytes"
      | "responseBytes"
      | "toolsVisible"
      | "toolsHidden"
      | "visibleTools"
      | "visibilityTruncated"
    >
  > & {
    ts?: string;
    auditReceipt?: AuditReceipt;
    clientInfo?: SessionClientInfo;
  };

export type VisibleTool = ToolDefinition & {
  name: string;
  canonicalName: string;
  serverId: string;
  serverName: string;
  serverVersion: string;
  transport: McpServerDefinition["transport"];
  provenance: {
    namespace: string;
    upstreamTool: string;
    origin: string;
  };
};

export type PlatformExport = {
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

export type PlatformImport = Omit<PlatformExport, "exportedAt" | "tenantId"> & {
  exportedAt?: string;
  tenantId?: string;
};

const portableImportSchema = z
  .object({
    format: z.literal("litemcp.portable.v1"),
    exportedAt: timestampSchema.optional(),
    tenantId: entityIdSchema.optional(),
    organization: organizationSchema.strict(),
    environments: z.array(environmentSchema.strict()).min(1).max(1_000),
    servers: z.array(mcpServerSchema.strict()).max(1_000),
    compositions: z.array(compositionSchema.strict()).max(1_000),
    policies: z.array(policySchema.strict()).max(1_000),
    roles: z.array(roleSchema.strict()).max(1_000),
    identityProviders: z.array(identityProviderSchema.strict()).max(1_000),
    secretsIncluded: z.literal(false),
  })
  .strict();

type ParsedPortableImport = z.infer<typeof portableImportSchema>;

const portableFields = {
  root: [
    "format",
    "exportedAt",
    "tenantId",
    "organization",
    "environments",
    "servers",
    "compositions",
    "policies",
    "roles",
    "identityProviders",
    "secretsIncluded",
  ],
  tool: [
    "name",
    "title",
    "description",
    "inputSchema",
    "risk",
    "readOnly",
    "idempotent",
  ],
  compositionMember: ["serverId", "namespace", "enabled", "pinnedVersion", "priority"],
  alias: ["alias", "target"],
  policyRule: [
    "id",
    "description",
    "priority",
    "effect",
    "roles",
    "groups",
    "tools",
    "risks",
    "actions",
  ],
  groupMapping: ["claim", "value", "role"],
} as const;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertOnlyPortableFields = (
  value: unknown,
  allowed: readonly string[],
  label: string
) => {
  if (!isPlainRecord(value)) return;
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new PlatformValidationError(
      `${label} contains unsupported field ${unexpected[0]}. Portable imports reject unknown fields so secret-bearing data is never silently discarded.`
    );
  }
};

const assertPortableNestedFields = (input: unknown) => {
  if (!isPlainRecord(input)) return;
  assertOnlyPortableFields(input, portableFields.root, "Portable import");
  if (Array.isArray(input.servers)) {
    for (const [serverIndex, server] of input.servers.entries()) {
      if (!isPlainRecord(server) || !Array.isArray(server.tools)) continue;
      for (const [toolIndex, tool] of server.tools.entries()) {
        assertOnlyPortableFields(
          tool,
          portableFields.tool,
          `servers[${serverIndex}].tools[${toolIndex}]`
        );
      }
    }
  }
  if (Array.isArray(input.compositions)) {
    for (const [compositionIndex, composition] of input.compositions.entries()) {
      if (!isPlainRecord(composition)) continue;
      if (Array.isArray(composition.members)) {
        for (const [memberIndex, member] of composition.members.entries()) {
          assertOnlyPortableFields(
            member,
            portableFields.compositionMember,
            `compositions[${compositionIndex}].members[${memberIndex}]`
          );
        }
      }
      if (Array.isArray(composition.aliases)) {
        for (const [aliasIndex, alias] of composition.aliases.entries()) {
          assertOnlyPortableFields(
            alias,
            portableFields.alias,
            `compositions[${compositionIndex}].aliases[${aliasIndex}]`
          );
        }
      }
    }
  }
  if (Array.isArray(input.policies)) {
    for (const [policyIndex, policy] of input.policies.entries()) {
      if (!isPlainRecord(policy) || !Array.isArray(policy.rules)) continue;
      for (const [ruleIndex, rule] of policy.rules.entries()) {
        assertOnlyPortableFields(
          rule,
          portableFields.policyRule,
          `policies[${policyIndex}].rules[${ruleIndex}]`
        );
      }
    }
  }
  if (Array.isArray(input.identityProviders)) {
    for (const [providerIndex, provider] of input.identityProviders.entries()) {
      if (!isPlainRecord(provider) || !Array.isArray(provider.groupMappings)) {
        continue;
      }
      for (const [mappingIndex, mapping] of provider.groupMappings.entries()) {
        assertOnlyPortableFields(
          mapping,
          portableFields.groupMapping,
          `identityProviders[${providerIndex}].groupMappings[${mappingIndex}]`
        );
      }
    }
  }
};

const assertUniquePortableValues = <T>(
  documents: readonly T[],
  selectValue: (document: T) => string,
  label: string
) => {
  const seen = new Set<string>();
  for (const document of documents) {
    const value = selectValue(document);
    if (seen.has(value)) {
      throw new PlatformValidationError(
        `Portable import contains duplicate ${label} ${value}.`
      );
    }
    seen.add(value);
  }
};

export type PlatformQuotaLimits = {
  servers: number;
  compositions: number;
  activeSessions: number;
  toolCallsPerDay: number;
};

export type PlatformQuotaResolver = (
  tenantId: string
) => Partial<PlatformQuotaLimits> | Promise<Partial<PlatformQuotaLimits>>;

/**
 * Legacy constructor defaults retained for compatibility with embedders.
 * They are local safety limits, not a plan, license, or remote entitlement.
 * The canonical self-hosted Node runtime explicitly uses
 * `UNLIMITED_PLATFORM_QUOTAS` unless its operator supplies finite values.
 */
export const DEFAULT_FREE_QUOTAS: PlatformQuotaLimits = {
  servers: 5,
  compositions: 5,
  activeSessions: 25,
  toolCallsPerDay: 1_000,
};

/**
 * Numeric unlimited sentinel for deployments whose public usage contract still
 * requires finite integer limits. Operators can replace any value locally, and
 * hosted runtimes can resolve tenant-specific limits through `quotaResolver`.
 */
export const UNLIMITED_PLATFORM_QUOTAS: PlatformQuotaLimits = {
  servers: Number.MAX_SAFE_INTEGER,
  compositions: Number.MAX_SAFE_INTEGER,
  activeSessions: Number.MAX_SAFE_INTEGER,
  toolCallsPerDay: Number.MAX_SAFE_INTEGER,
};

const quotaLimitKeys = [
  "servers",
  "compositions",
  "activeSessions",
  "toolCallsPerDay",
] as const satisfies readonly (keyof PlatformQuotaLimits)[];

const mergeQuotaLimits = (
  defaults: PlatformQuotaLimits,
  overrides: Partial<PlatformQuotaLimits> = {}
): PlatformQuotaLimits => {
  const limits = { ...defaults };
  for (const key of quotaLimitKeys) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${key} quota must be a non-negative safe integer.`);
    }
    limits[key] = value;
  }
  return limits;
};

type QuotaCounter = StoredDocument & {
  id: string;
  tenantId: string;
  count: number;
  resetsAt: string;
  revision: number;
};

type QuotaReservationLedger = StoredDocument & {
  id: string;
  tenantId: string;
  reservations: Array<{ resourceId: string; expiresAt: string }>;
  revision: number;
};

type OAuthGrant = StoredDocument & {
  id: string;
  tenantId: string;
  clientId: string;
  currentAccessSessionId: string;
  currentRefreshTokenId: string;
  authorizationEpoch: number;
  generation: number;
  revokedAt: string | null;
  revision: number;
};

export type ActivationEvent = StoredDocument & {
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

export type PlatformServiceOptions = {
  credentialCipher?: CredentialCipher;
  /** Static deployment defaults retained for backwards compatibility. */
  quotas?: Partial<PlatformQuotaLimits>;
  /** Per-tenant overrides; evaluated at each quota-sensitive operation. */
  quotaResolver?: PlatformQuotaResolver;
  analyticsRecorder?: FailOpenAnalyticsRecorder;
  analyticsEnabled?: boolean;
  approvalNotifier?: (notification: {
    tenantId: string;
    approvalId: string;
    toolName: string;
    requestedBy: string;
    expiresAt: string;
  }) => Promise<void>;
};

export class PlatformService {
  readonly #auditQueues = new Map<string, Promise<void>>();
  readonly #credentialCipher?: CredentialCipher;
  readonly #quotas: PlatformQuotaLimits;
  readonly #quotaResolver?: PlatformQuotaResolver;
  readonly #analyticsRecorder?: FailOpenAnalyticsRecorder;
  readonly #analyticsEnabled: boolean;
  readonly #sessionAttributionCache = new Map<string, SessionClientInfo>();
  readonly #approvalNotifier?: PlatformServiceOptions["approvalNotifier"];

  constructor(
    readonly store: DocumentStore,
    options: PlatformServiceOptions = {}
  ) {
    this.#credentialCipher = options.credentialCipher;
    this.#quotas = mergeQuotaLimits(DEFAULT_FREE_QUOTAS, options.quotas);
    this.#quotaResolver = options.quotaResolver;
    this.#analyticsRecorder = options.analyticsRecorder;
    this.#analyticsEnabled =
      options.analyticsEnabled ?? Boolean(options.analyticsRecorder);
    this.#approvalNotifier = options.approvalNotifier;
  }

  async #quotaLimitsFor(tenantId: string): Promise<PlatformQuotaLimits> {
    const resolved = await this.#quotaResolver?.(tenantId);
    return mergeQuotaLimits(this.#quotas, resolved);
  }

  #sessionAttributionKey(tenantId: string, sessionId: string) {
    return `${tenantId}\u0000${sessionId}`;
  }

  #analyticsClientInfo(session: GatewaySession) {
    return (
      (session as AttributedGatewaySession).analyticsClientInfo ??
      this.#sessionAttributionCache.get(
        this.#sessionAttributionKey(session.tenantId, session.id)
      )
    );
  }

  #buildSessionUsageEvent(
    session: GatewaySession,
    details: SessionUsageDetails
  ): UsageEvent {
    const clientInfo = details.clientInfo ?? this.#analyticsClientInfo(session);
    const receipt = details.auditReceipt;
    return {
      id: randomId("usage"),
      tenantId: session.tenantId,
      sessionId: session.id,
      subjectId: session.subject.id,
      subjectType: session.subject.type,
      roles: [...new Set(session.subject.roles)].slice(0, 8),
      clientName: clientInfo?.name ?? "unknown",
      clientVersion: clientInfo?.version ?? "unknown",
      userAgentClass: clientInfo?.userAgentClass ?? "unknown",
      sdk: clientInfo?.sdk ?? false,
      eventType: details.eventType,
      compositionId: session.compositionId,
      environmentId: session.environmentId,
      matchedRuleIds: [...new Set(details.matchedRuleIds ?? [])].slice(0, 16),
      status: details.status,
      requestId: details.requestId,
      ts: details.ts ?? nowIso(),
      protocolVersion: clientInfo?.protocolVersion ?? "unknown",
      ...(details.namespace ? { namespace: details.namespace } : {}),
      ...(details.serverId ? { serverId: details.serverId } : {}),
      ...(details.tool ? { tool: details.tool } : {}),
      ...(details.aliasUsed !== undefined ? { aliasUsed: details.aliasUsed } : {}),
      ...(details.risk ? { risk: details.risk } : {}),
      ...(details.decisionEffect ? { decisionEffect: details.decisionEffect } : {}),
      ...(details.policyId ? { policyId: details.policyId } : {}),
      ...(details.policyVersion ? { policyVersion: details.policyVersion } : {}),
      ...(details.approvalId ? { approvalId: details.approvalId } : {}),
      ...(details.approvalLatencyMs !== undefined
        ? { approvalLatencyMs: details.approvalLatencyMs }
        : {}),
      ...(details.latencyTotalMs !== undefined
        ? { latencyTotalMs: details.latencyTotalMs }
        : {}),
      ...(details.latencyUpstreamMs !== undefined
        ? { latencyUpstreamMs: details.latencyUpstreamMs }
        : {}),
      ...(details.errorCode ? { errorCode: details.errorCode } : {}),
      ...(details.requestBytes !== undefined
        ? { requestBytes: details.requestBytes }
        : {}),
      ...(details.responseBytes !== undefined
        ? { responseBytes: details.responseBytes }
        : {}),
      ...(details.toolsVisible !== undefined
        ? { toolsVisible: details.toolsVisible }
        : {}),
      ...(details.toolsHidden !== undefined
        ? { toolsHidden: details.toolsHidden }
        : {}),
      ...(details.visibleTools ? { visibleTools: details.visibleTools } : {}),
      ...(details.visibilityTruncated !== undefined
        ? { visibilityTruncated: details.visibilityTruncated }
        : {}),
      ...(receipt
        ? {
            auditId: receipt.id,
            auditSequence: receipt.sequence,
            auditHash: receipt.hash,
          }
        : {}),
    };
  }

  /** The only legal analytics emission seam inside the platform domain. */
  recordUsage(event: UsageEvent) {
    this.#analyticsRecorder?.recordUsage(event);
  }

  recordSessionUsage(session: GatewaySession, details: SessionUsageDetails) {
    this.recordUsage(this.#buildSessionUsageEvent(session, details));
  }

  async #listAll<T extends StoredDocument>(
    tenantId: string,
    collection: Parameters<DocumentStore["list"]>[1]
  ) {
    const items: T[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await this.store.list<T>(tenantId, collection, {
        ...(cursor ? { cursor } : {}),
        limit: 1_000,
      });
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor) {
        if (seenCursors.has(cursor)) {
          throw new PlatformConflictError(
            `Storage returned a repeated cursor while listing ${collection}.`
          );
        }
        seenCursors.add(cursor);
      }
    } while (cursor);
    return items;
  }

  async #reserveResourceQuota(
    tenantId: string,
    resource: "servers" | "compositions" | "activeSessions" | "oauthClients",
    resourceId: string,
    activeIds: string[],
    limit: number
  ) {
    const ledgerId = `reservations_${resource}`;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const current = await this.store.get<QuotaReservationLedger>(
        tenantId,
        "quota-counters",
        ledgerId
      );
      const nowMs = Date.now();
      const active = new Set(activeIds);
      const reservations = (current?.reservations ?? []).filter(
        (entry) => Date.parse(entry.expiresAt) > nowMs && !active.has(entry.resourceId)
      );
      const occupied = new Set([
        ...active,
        ...reservations.map((entry) => entry.resourceId),
      ]);
      if (occupied.has(resourceId)) return;
      if (occupied.size >= limit) {
        throw new PlatformQuotaError(
          `The configured ${resource} limit of ${limit} has been reached.`
        );
      }
      const now = nowIso();
      const next: QuotaReservationLedger = {
        id: ledgerId,
        tenantId,
        reservations: [
          ...reservations,
          {
            resourceId,
            // A crashed request cannot leak capacity permanently.
            expiresAt: new Date(nowMs + 30_000).toISOString(),
          },
        ],
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        revision: (current?.revision ?? 0) + 1,
      };
      try {
        await this.store.put(tenantId, "quota-counters", next, {
          expectedRevision: current?.revision ?? null,
        });
        return;
      } catch (error) {
        if (error instanceof StoreConflictError && attempt < 11) continue;
        throw error;
      }
    }
  }

  async #releaseResourceQuotaReservation(
    tenantId: string,
    resource: "servers" | "compositions" | "activeSessions" | "oauthClients",
    resourceId: string
  ) {
    const ledgerId = `reservations_${resource}`;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.store.get<QuotaReservationLedger>(
        tenantId,
        "quota-counters",
        ledgerId
      );
      if (!current) return;
      const reservations = current.reservations.filter(
        (entry) => entry.resourceId !== resourceId
      );
      if (reservations.length === current.reservations.length) return;
      try {
        await this.store.put(
          tenantId,
          "quota-counters",
          {
            ...current,
            reservations,
            updatedAt: nowIso(),
            revision: current.revision + 1,
          },
          { expectedRevision: current.revision }
        );
        return;
      } catch (error) {
        if (error instanceof StoreConflictError && attempt < 7) continue;
        throw error;
      }
    }
  }

  async #putIfMissing<T extends StoredDocument>(
    tenantId: string,
    collection: Parameters<DocumentStore["put"]>[1],
    document: T
  ) {
    const existing = await this.store.get<T>(tenantId, collection, document.id);
    if (existing) return existing;
    try {
      return await this.store.put(tenantId, collection, document, {
        expectedRevision: null,
      });
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const raced = await this.store.get<T>(tenantId, collection, document.id);
      if (!raced) throw error;
      return raced;
    }
  }

  /**
   * Idempotent production bootstrap. Calling this on the first authenticated
   * request also covers organizations created through Better Auth's normal and
   * SSO-provisioning paths without trusting browser-supplied tenant data.
   */
  async bootstrapTenant(
    tenantId: string,
    name: string,
    creatorId?: string,
    creatorOrganizationRoles: string[] = []
  ) {
    const now = nowIso();
    const normalizedSlug =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70) || `workspace-${tenantId.slice(-8).toLowerCase()}`;
    const organization: Organization = {
      id: tenantId,
      tenantId,
      slug: normalizedSlug.length >= 2 ? normalizedSlug : `org-${normalizedSlug}`,
      name: name.trim().length >= 2 ? name.trim().slice(0, 120) : "LiteMCP workspace",
      plan: "free",
      region: "eu-central",
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const environment: Environment = {
      id: "env_production",
      tenantId,
      slug: "production",
      name: "Production",
      kind: "production",
      region: "eu-central",
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const composition: Composition = {
      id: "composition_default",
      tenantId,
      environmentId: environment.id,
      slug: "company-tools",
      name: "Company tools",
      description: "Attach a probed MCP server, then publish this endpoint.",
      version: "0.1.0",
      status: "draft",
      members: [],
      aliases: [],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const starterPolicy: Policy = {
      id: "policy_starter",
      tenantId,
      name: "Starter default-deny policy",
      description:
        "Owners and administrators can onboard tools; members receive no capabilities until a deliberate rule is added.",
      version: "1.0.0",
      status: "active",
      defaultEffect: "deny",
      rules: [
        {
          id: "rule_starter_administrators",
          description: "Allow organization owners and administrators.",
          priority: 100,
          effect: "allow",
          roles: ["owner", "admin"],
          tools: ["*"],
          actions: ["discover", "execute"],
        },
      ],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const authority: TenantAuthority = {
      id: "authority",
      tenantId,
      authorizationEpoch: 1,
      activePolicyId: starterPolicy.id,
      frozen: false,
      freezeReason: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const builtinRoles: Role[] = [
      ["role_owner", "owner", "Owner", "Full organization governance."],
      ["role_admin", "admin", "Administrator", "Day-to-day organization governance."],
      ["role_member", "member", "Member", "Base authenticated organization member."],
    ].map(([id, slug, roleName, description]) => ({
      id: id!,
      tenantId,
      slug: slug!,
      name: roleName!,
      description: description!,
      builtin: true,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    }));

    const existingOrganization = await this.store.get<Organization>(
      tenantId,
      "organizations",
      tenantId
    );
    await this.#putIfMissing(tenantId, "organizations", organization);
    await Promise.all([
      this.#putIfMissing(tenantId, "environments", environment),
      this.#putIfMissing(tenantId, "compositions", composition),
      this.#putIfMissing(tenantId, "policies", starterPolicy),
      this.#putIfMissing(tenantId, "tenant-authority", authority),
      ...builtinRoles.map((role) => this.#putIfMissing(tenantId, "roles", role)),
    ]);

    if (
      creatorId &&
      creatorOrganizationRoles.some((role) => role === "owner" || role === "admin")
    ) {
      const ownerRole = builtinRoles[0]!;
      const assignments = await this.listRoleAssignments(tenantId, creatorId);
      if (!assignments.some((assignment) => assignment.roleId === ownerRole.id)) {
        await this.#putIfMissing<RoleAssignment>(tenantId, "role-assignments", {
          id: `assignment_${await sha256(`${creatorId}:${ownerRole.id}`)}`.slice(0, 60),
          tenantId,
          subjectId: creatorId,
          roleId: ownerRole.id,
          createdBy: creatorId,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        });
      }
    }

    if (!existingOrganization) {
      await this.appendAudit(tenantId, {
        type: "tenant.bootstrapped",
        actorId: creatorId ?? "system",
        actorType: creatorId ? "user" : "system",
        action: "bootstrap",
        targetType: "organization",
        targetId: tenantId,
        outcome: "succeeded",
        requestId: "tenant-bootstrap",
        explanation:
          "Seeded a production environment, draft composition, roles, and a safe starter policy.",
        metadata: { plan: "free" },
      });
      await this.recordActivationEvent(
        tenantId,
        "tenant_bootstrapped",
        creatorId ?? "system",
        {},
        true
      );
    }
    return this.store.get<Organization>(tenantId, "organizations", tenantId);
  }

  async ensureDemoTenant(tenantId = "org_demo", baseUrl = "http://localhost:8787") {
    const existing = await this.store.get<Organization>(
      tenantId,
      "organizations",
      tenantId
    );
    if (existing) return existing;

    const now = nowIso();
    const organization: Organization = {
      id: tenantId,
      tenantId,
      slug: "northstar-labs",
      name: "Northstar Labs",
      plan: "free",
      region: "eu-central",
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const environment: Environment = {
      id: "env_production",
      tenantId,
      slug: "production",
      name: "Production",
      kind: "production",
      region: "eu-central",
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const calculator: McpServerDefinition = {
      id: "server_calculator",
      tenantId,
      slug: "calculator",
      name: "Calculator",
      description: "Local deterministic arithmetic tools.",
      transport: "builtin",
      version: "1.0.0",
      status: "healthy",
      visibility: "public",
      tags: ["reference", "read-only"],
      tools: [
        {
          name: "add",
          title: "Add numbers",
          description: "Adds two finite numbers.",
          inputSchema: {
            type: "object",
            properties: {
              a: { type: "number" },
              b: { type: "number" },
            },
            required: ["a", "b"],
            additionalProperties: false,
          },
          risk: "read",
          readOnly: true,
          idempotent: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const finance: McpServerDefinition = {
      id: "server_finance",
      tenantId,
      slug: "finance-sandbox",
      name: "Finance sandbox",
      description: "Standards-faithful HTTP MCP used for local validation.",
      transport: "streamable-http",
      endpoint: `${baseUrl.replace(/\/$/, "")}/demo-upstreams/finance/mcp`,
      version: "1.0.0",
      status: "healthy",
      visibility: "private",
      tags: ["reference", "oauth-shaped"],
      tools: [
        {
          name: "list_invoices",
          title: "List invoices",
          description: "Lists deterministic sandbox invoices for an account.",
          inputSchema: {
            type: "object",
            properties: { accountId: { type: "string" } },
            required: ["accountId"],
            additionalProperties: false,
          },
          risk: "read",
          readOnly: true,
          idempotent: true,
        },
        {
          name: "issue_refund",
          title: "Issue refund",
          description: "Creates a sandbox refund and always requires governance.",
          inputSchema: {
            type: "object",
            properties: {
              invoiceId: { type: "string" },
              reason: { type: "string" },
            },
            required: ["invoiceId", "reason"],
            additionalProperties: false,
          },
          risk: "financial",
          readOnly: false,
          idempotent: false,
        },
      ],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const composition: Composition = {
      id: "composition_company",
      tenantId,
      environmentId: environment.id,
      slug: "company-tools",
      name: "Company tools",
      description: "The governed MCP endpoint for employees and agents.",
      version: "1.0.0",
      status: "published",
      members: [
        {
          serverId: calculator.id,
          namespace: "math",
          enabled: true,
          pinnedVersion: calculator.version,
          priority: 10,
        },
        {
          serverId: finance.id,
          namespace: "finance",
          enabled: true,
          pinnedVersion: finance.version,
          priority: 20,
        },
      ],
      aliases: [{ alias: "sum", target: "math.add" }],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const policy: Policy = {
      id: "policy_company",
      tenantId,
      name: "Company capability policy",
      description: "Filters discovery and rechecks every execution.",
      version: "1.0.0",
      status: "active",
      defaultEffect: "deny",
      rules: [
        {
          id: "rule_employee_refund_deny",
          description: "Employees cannot discover or invoke refund operations.",
          priority: 1_000,
          effect: "deny",
          roles: ["employee"],
          tools: ["finance.issue_refund"],
          actions: ["discover", "execute"],
        },
        {
          id: "rule_finance_refund_approval",
          description: "Finance administrators require a second approver.",
          priority: 900,
          effect: "require-approval",
          roles: ["finance-admin", "admin", "owner"],
          tools: ["finance.issue_refund"],
          actions: ["execute"],
        },
        {
          id: "rule_standard_tools_allow",
          description: "Employees and finance administrators may use standard tools.",
          priority: 100,
          effect: "allow",
          roles: ["employee", "finance-admin", "member", "admin", "owner"],
          tools: ["math.*", "finance.list_invoices"],
          actions: ["discover", "execute"],
        },
        {
          id: "rule_finance_refund_discovery",
          description:
            "Finance administrators may discover the approval-gated refund tool.",
          priority: 90,
          effect: "allow",
          roles: ["finance-admin", "admin", "owner"],
          tools: ["finance.issue_refund"],
          actions: ["discover"],
        },
      ],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const identityProvider: IdentityProvider = {
      id: "idp_entra_template",
      tenantId,
      name: "Microsoft Entra ID",
      protocol: "oidc",
      issuer: "https://login.microsoftonline.com/common/v2.0",
      domains: ["example.com"],
      clientId: "configure-in-admin",
      secretReference: "secret://entra/client-secret",
      status: "draft",
      groupMappings: [
        { claim: "groups", value: "finance-admins", role: "finance-admin" },
        { claim: "groups", value: "employees", role: "employee" },
      ],
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const authority: TenantAuthority = {
      id: "authority",
      tenantId,
      authorizationEpoch: 1,
      activePolicyId: policy.id,
      frozen: false,
      freezeReason: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const roles: Role[] = [
      {
        id: "role_owner",
        tenantId,
        slug: "owner",
        name: "Owner",
        description: "Full organization governance.",
        builtin: true,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
      {
        id: "role_admin",
        tenantId,
        slug: "admin",
        name: "Administrator",
        description: "Day-to-day organization governance.",
        builtin: true,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
      {
        id: "role_member",
        tenantId,
        slug: "member",
        name: "Member",
        description: "Base authenticated organization member.",
        builtin: true,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
      {
        id: "role_employee",
        tenantId,
        slug: "employee",
        name: "Employee",
        description: "Standard employee access in the local governance demo.",
        builtin: false,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
      {
        id: "role_finance_admin",
        tenantId,
        slug: "finance-admin",
        name: "Finance administrator",
        description: "Approval-gated finance access in the local governance demo.",
        builtin: false,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      },
    ];

    await this.store.put(tenantId, "organizations", organization, {
      expectedRevision: null,
    });
    await Promise.all([
      this.store.put(tenantId, "environments", environment, {
        expectedRevision: null,
      }),
      this.store.put(tenantId, "servers", calculator, {
        expectedRevision: null,
      }),
      this.store.put(tenantId, "servers", finance, {
        expectedRevision: null,
      }),
      this.store.put(tenantId, "compositions", composition, {
        expectedRevision: null,
      }),
      this.store.put(tenantId, "policies", policy, {
        expectedRevision: null,
      }),
      this.store.put(tenantId, "identity-providers", identityProvider, {
        expectedRevision: null,
      }),
      this.store.put(tenantId, "tenant-authority", authority, {
        expectedRevision: null,
      }),
      ...roles.map((role) =>
        this.store.put(tenantId, "roles", role, { expectedRevision: null })
      ),
    ]);
    await this.appendAudit(tenantId, {
      type: "tenant.seeded",
      actorId: "system",
      actorType: "system",
      action: "seed",
      targetType: "organization",
      targetId: tenantId,
      outcome: "succeeded",
      requestId: "seed",
      explanation: "Created the explicit local demo tenant.",
      metadata: { demo: true },
    });
    return organization;
  }

  async getOverview(
    tenantId: string,
    gatewayOrigin: string
  ): Promise<PlatformOverview> {
    const [
      organization,
      environments,
      servers,
      compositions,
      policies,
      sessions,
      approvals,
      audit,
    ] = await Promise.all([
      this.store.get<Organization>(tenantId, "organizations", tenantId),
      this.listEnvironments(tenantId),
      this.listServers(tenantId),
      this.listCompositions(tenantId),
      this.listPolicies(tenantId),
      this.store.list<GatewaySession>(tenantId, "sessions", { limit: 1_000 }),
      this.store.list<ApprovalRequest>(tenantId, "approvals", { limit: 1_000 }),
      this.store.list<AuditEvent>(tenantId, "audit-events", { limit: 1_000 }),
    ]);
    if (!organization) throw new PlatformNotFoundError("Organization");
    const environment = environments[0];
    if (!environment) throw new PlatformNotFoundError("Environment");
    const primary = compositions.find((entry) => entry.status === "published");
    return {
      organization,
      environment,
      counts: {
        servers: servers.length,
        compositions: compositions.length,
        activePolicies: policies.filter((entry) => entry.status === "active").length,
        sessions: sessions.items.filter((entry) => !entry.revokedAt).length,
        pendingApprovals: approvals.items.filter((entry) => entry.status === "pending")
          .length,
        auditEvents: audit.items.length,
      },
      gateway: {
        status: servers.every((entry) => entry.status === "healthy")
          ? "healthy"
          : "degraded",
        endpoint: primary
          ? `${gatewayOrigin.replace(/\/$/, "")}/mcp/${tenantId}/${primary.slug}`
          : `${gatewayOrigin.replace(/\/$/, "")}/mcp`,
        protocolVersion: "2025-11-25",
        storageDriver: this.store.capabilities.driver,
      },
    };
  }

  async listEnvironments(tenantId: string) {
    return this.#listAll<Environment>(tenantId, "environments");
  }

  async listServers(tenantId: string) {
    return this.#listAll<McpServerDefinition>(tenantId, "servers");
  }

  async listCompositions(tenantId: string) {
    return this.#listAll<Composition>(tenantId, "compositions");
  }

  async listPolicies(tenantId: string) {
    return this.#listAll<Policy>(tenantId, "policies");
  }

  async listRoles(tenantId: string) {
    return this.#listAll<Role>(tenantId, "roles");
  }

  async listRoleAssignments(tenantId: string, subjectId?: string) {
    const assignments = await this.#listAll<RoleAssignment>(
      tenantId,
      "role-assignments"
    );
    return subjectId
      ? assignments.filter((assignment) => assignment.subjectId === subjectId)
      : assignments;
  }

  async getAuthority(tenantId: string) {
    const existing = await this.store.get<TenantAuthority>(
      tenantId,
      "tenant-authority",
      "authority"
    );
    if (existing) return existing;
    const active = (await this.listPolicies(tenantId)).find(
      (policy) => policy.status === "active"
    );
    const now = nowIso();
    return this.#putIfMissing<TenantAuthority>(tenantId, "tenant-authority", {
      id: "authority",
      tenantId,
      authorizationEpoch: 1,
      activePolicyId: active?.id ?? null,
      frozen: false,
      freezeReason: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });
  }

  async bumpAuthorizationEpoch(tenantId: string) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const authority = await this.getAuthority(tenantId);
      const updated: TenantAuthority = {
        ...authority,
        authorizationEpoch: authority.authorizationEpoch + 1,
        updatedAt: nowIso(),
        revision: authority.revision + 1,
      };
      try {
        return await this.store.put(tenantId, "tenant-authority", updated, {
          expectedRevision: authority.revision,
        });
      } catch (error) {
        if (error instanceof StoreConflictError && attempt < 7) continue;
        throw error;
      }
    }
    throw new StoreConflictError("Authorization epoch remained contended.");
  }

  async setTenantFrozen(
    tenantId: string,
    frozen: boolean,
    reason: string | null,
    actorId: string,
    requestId: string
  ) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const authority = await this.getAuthority(tenantId);
      const updated: TenantAuthority = {
        ...authority,
        frozen,
        freezeReason: frozen
          ? reason?.trim().slice(0, 1_000) || "Emergency freeze"
          : null,
        authorizationEpoch: authority.authorizationEpoch + 1,
        updatedAt: nowIso(),
        revision: authority.revision + 1,
      };
      try {
        const stored = await this.store.put(tenantId, "tenant-authority", updated, {
          expectedRevision: authority.revision,
        });
        await this.appendAudit(tenantId, {
          type: frozen ? "tenant.frozen" : "tenant.unfrozen",
          actorId,
          action: frozen ? "freeze" : "unfreeze",
          targetType: "organization",
          targetId: tenantId,
          outcome: "succeeded",
          requestId,
          explanation: frozen
            ? "Emergency deny-all overlay enabled."
            : "Emergency deny-all overlay removed.",
          metadata: { reason: stored.freezeReason, epoch: stored.authorizationEpoch },
        });
        return stored;
      } catch (error) {
        if (error instanceof StoreConflictError && attempt < 7) continue;
        throw error;
      }
    }
    throw new StoreConflictError("Tenant freeze state remained contended.");
  }

  async buildSubject(tenantId: string, base: Subject): Promise<Subject> {
    const [roles, assignments, providers] = await Promise.all([
      this.listRoles(tenantId),
      this.listRoleAssignments(tenantId, base.id),
      this.listIdentityProviders(tenantId, true),
    ]);
    const assignedRoleIds = new Set(assignments.map((assignment) => assignment.roleId));
    const knownRoleSlugs = new Set(roles.map((role) => role.slug));
    const resolvedRoles = new Set(
      base.roles.filter((role) => knownRoleSlugs.has(role))
    );
    for (const role of roles) {
      if (assignedRoleIds.has(role.id)) resolvedRoles.add(role.slug);
    }
    for (const provider of providers.filter((entry) => entry.status === "active")) {
      for (const mapping of provider.groupMappings) {
        const claimValues = (base.claims[mapping.claim] ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        if (
          knownRoleSlugs.has(mapping.role) &&
          (base.groups.includes(mapping.value) || claimValues.includes(mapping.value))
        ) {
          resolvedRoles.add(mapping.role);
        }
      }
    }
    return { ...base, roles: [...resolvedRoles].sort() };
  }

  async listSessions(tenantId: string, subjectId?: string) {
    const sessions = await this.#listAll<GatewaySession>(tenantId, "sessions");
    return sessions
      .filter((session) => !subjectId || session.subject.id === subjectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((session) => ({ ...session, tokenHash: "[REDACTED]" as const }));
  }

  async listIdentityProviders(tenantId: string, includeSecretReferences = false) {
    const providers = await this.#listAll<IdentityProvider>(
      tenantId,
      "identity-providers"
    );
    return includeSecretReferences
      ? providers
      : providers.map((provider) => ({
          ...provider,
          clientId: "[REDACTED]",
          secretReference: "[REDACTED]",
        }));
  }

  async listApprovals(tenantId: string) {
    const result = await this.store.list<ApprovalRequest>(tenantId, "approvals", {
      limit: 1_000,
    });
    return result.items;
  }

  async listAudit(tenantId: string, limit = 100) {
    const result = await this.store.list<AuditEvent>(tenantId, "audit-events", {
      limit: Math.min(limit, 1_000),
    });
    return result.items.sort((left, right) => right.sequence - left.sequence);
  }

  async listActivationEvents(tenantId: string) {
    const result = await this.store.list<ActivationEvent>(
      tenantId,
      "activation-events",
      { limit: 1_000 }
    );
    return result.items.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  async recordActivationEvent(
    tenantId: string,
    name: ActivationEvent["name"],
    actorId: string,
    metadata: Record<string, unknown> = {},
    dedupe = false
  ) {
    if (
      dedupe &&
      (await this.listActivationEvents(tenantId)).some((event) => event.name === name)
    ) {
      return null;
    }
    const now = nowIso();
    const event: ActivationEvent = {
      id: randomId("activation"),
      tenantId,
      name,
      actorId,
      metadata: redactSecrets(metadata) as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    return this.store.put(tenantId, "activation-events", event, {
      expectedRevision: null,
    });
  }

  async createRole(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = createRoleInputSchema.parse(input);
    if ((await this.listRoles(tenantId)).some((role) => role.slug === parsed.slug)) {
      throw new PlatformConflictError(`Role slug ${parsed.slug} already exists.`);
    }
    const now = nowIso();
    const role: Role = {
      ...parsed,
      id: randomId("role"),
      tenantId,
      builtin: false,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "roles", role, { expectedRevision: null });
    await this.appendAudit(tenantId, {
      type: "role.created",
      actorId,
      action: "create",
      targetType: "role",
      targetId: role.id,
      outcome: "succeeded",
      requestId,
      explanation: `Created platform role ${role.slug}.`,
    });
    return role;
  }

  async updateRole(
    tenantId: string,
    roleId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = updateRoleInputSchema.parse(input);
    const current = await this.store.get<Role>(tenantId, "roles", roleId);
    if (!current) throw new PlatformNotFoundError("Role");
    const updated: Role = {
      ...current,
      ...parsed,
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "roles", updated, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: "role.updated",
      actorId,
      action: "update",
      targetType: "role",
      targetId: roleId,
      outcome: "succeeded",
      requestId,
      explanation: `Updated platform role ${updated.slug}.`,
    });
    return updated;
  }

  async deleteRole(
    tenantId: string,
    roleId: string,
    actorId: string,
    requestId: string
  ) {
    const current = await this.store.get<Role>(tenantId, "roles", roleId);
    if (!current) throw new PlatformNotFoundError("Role");
    if (current.builtin) {
      throw new PlatformConflictError("Built-in roles cannot be deleted.");
    }
    const [assignments, providers, principals] = await Promise.all([
      this.listRoleAssignments(tenantId),
      this.listIdentityProviders(tenantId, true),
      this.#listAll<ServicePrincipal>(tenantId, "service-principals"),
    ]);
    if (assignments.some((entry) => entry.roleId === roleId)) {
      throw new PlatformConflictError(
        "Remove this role from every subject before deleting it."
      );
    }
    if (
      providers.some((provider) =>
        provider.groupMappings.some((mapping) => mapping.role === current.slug)
      )
    ) {
      throw new PlatformConflictError(
        "Remove this role from every identity-provider group mapping before deleting it."
      );
    }
    if (principals.some((principal) => principal.roles.includes(current.slug))) {
      throw new PlatformConflictError(
        "Remove this role from every service principal before deleting it."
      );
    }
    await this.store.delete(tenantId, "roles", roleId, {
      expectedRevision: current.revision,
    });
    await this.bumpAuthorizationEpoch(tenantId);
    await this.appendAudit(tenantId, {
      type: "role.deleted",
      actorId,
      action: "delete",
      targetType: "role",
      targetId: roleId,
      outcome: "succeeded",
      requestId,
      explanation: `Deleted platform role ${current.slug}.`,
    });
    return { id: roleId, deleted: true };
  }

  async assignRole(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = assignRoleInputSchema.parse(input);
    const role = await this.store.get<Role>(tenantId, "roles", parsed.roleId);
    if (!role) throw new PlatformNotFoundError("Role");
    const existing = (await this.listRoleAssignments(tenantId, parsed.subjectId)).find(
      (assignment) => assignment.roleId === parsed.roleId
    );
    if (existing) return existing;
    const now = nowIso();
    const assignment: RoleAssignment = {
      id: `assignment_${await sha256(`${parsed.subjectId}:${parsed.roleId}`)}`.slice(
        0,
        60
      ),
      tenantId,
      subjectId: parsed.subjectId,
      roleId: parsed.roleId,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "role-assignments", assignment, {
      expectedRevision: null,
    });
    const authority = await this.bumpAuthorizationEpoch(tenantId);
    await this.appendAudit(tenantId, {
      type: "role.assigned",
      actorId,
      action: "assign",
      targetType: "subject-role",
      targetId: assignment.id,
      outcome: "succeeded",
      requestId,
      explanation: `Assigned ${role.slug} to ${parsed.subjectId}.`,
      metadata: {
        subjectId: parsed.subjectId,
        roleId: role.id,
        epoch: authority.authorizationEpoch,
      },
    });
    return assignment;
  }

  async removeRoleAssignment(
    tenantId: string,
    assignmentId: string,
    actorId: string,
    requestId: string
  ) {
    const assignment = await this.store.get<RoleAssignment>(
      tenantId,
      "role-assignments",
      assignmentId
    );
    if (!assignment) throw new PlatformNotFoundError("Role assignment");
    await this.store.delete(tenantId, "role-assignments", assignmentId, {
      expectedRevision: assignment.revision,
    });
    const authority = await this.bumpAuthorizationEpoch(tenantId);
    await this.appendAudit(tenantId, {
      type: "role.unassigned",
      actorId,
      action: "unassign",
      targetType: "subject-role",
      targetId: assignmentId,
      outcome: "succeeded",
      requestId,
      explanation: `Removed a platform role from ${assignment.subjectId}.`,
      metadata: {
        subjectId: assignment.subjectId,
        roleId: assignment.roleId,
        epoch: authority.authorizationEpoch,
      },
    });
    return { id: assignmentId, deleted: true };
  }

  async deprovisionSubject(
    tenantId: string,
    subjectId: string,
    actorId: string,
    requestId: string
  ) {
    const [allAssignments, sessions, principals] = await Promise.all([
      this.listRoleAssignments(tenantId),
      this.#listAll<GatewaySession>(tenantId, "sessions"),
      this.#listAll<ServicePrincipal>(tenantId, "service-principals"),
    ]);
    const matchingPrincipals = principals.filter(
      (principal) => principal.id === subjectId || principal.clientId === subjectId
    );
    const targetSubjectIds = new Set([
      subjectId,
      ...matchingPrincipals.map((principal) => principal.id),
    ]);
    const assignments = allAssignments.filter((assignment) =>
      targetSubjectIds.has(assignment.subjectId)
    );
    const now = nowIso();
    let servicePrincipalsDisabled = 0;
    for (const matchingPrincipal of matchingPrincipals) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const principal = await this.store.get<ServicePrincipal>(
          tenantId,
          "service-principals",
          matchingPrincipal.id
        );
        if (!principal || principal.status === "disabled") break;
        try {
          await this.store.put(
            tenantId,
            "service-principals",
            {
              ...principal,
              status: "disabled",
              updatedAt: now,
              revision: principal.revision + 1,
            },
            { expectedRevision: principal.revision }
          );
          servicePrincipalsDisabled += 1;
          break;
        } catch (error) {
          if (error instanceof StoreConflictError && attempt < 7) continue;
          throw error;
        }
      }
    }
    for (const assignment of assignments) {
      await this.store.delete(tenantId, "role-assignments", assignment.id, {
        expectedRevision: assignment.revision,
      });
    }
    let revokedSessions = 0;
    for (const session of sessions.filter(
      (entry) => targetSubjectIds.has(entry.subject.id) && !entry.revokedAt
    )) {
      await this.store.put(
        tenantId,
        "sessions",
        {
          ...session,
          revokedAt: now,
          updatedAt: now,
          revision: session.revision + 1,
        },
        { expectedRevision: session.revision }
      );
      revokedSessions += 1;
    }
    const authority = await this.bumpAuthorizationEpoch(tenantId);
    await this.appendAudit(tenantId, {
      type: "subject.deprovisioned",
      actorId,
      action: "deprovision",
      targetType: "subject",
      targetId: subjectId,
      outcome: "succeeded",
      requestId,
      explanation:
        "Disabled matching service principals, removed platform roles, and invalidated every scoped MCP credential.",
      metadata: {
        assignmentsRemoved: assignments.length,
        sessionsRevoked: revokedSessions,
        servicePrincipalsDisabled,
        epoch: authority.authorizationEpoch,
      },
    });
    return {
      subjectId,
      assignmentsRemoved: assignments.length,
      sessionsRevoked: revokedSessions,
      servicePrincipalsDisabled,
      authorizationEpoch: authority.authorizationEpoch,
    };
  }

  async createIdentityProvider(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    if (!this.#credentialCipher) {
      throw new PlatformValidationError(
        "Identity-provider writes require CREDENTIAL_MASTER_KEY envelope encryption."
      );
    }
    const parsed = createIdentityProviderInputSchema.parse(input);
    const roles = new Set((await this.listRoles(tenantId)).map((role) => role.slug));
    for (const mapping of parsed.groupMappings) {
      if (!roles.has(mapping.role)) {
        throw new PlatformValidationError(
          `Group mapping references unknown platform role ${mapping.role}.`
        );
      }
    }
    const now = nowIso();
    const provider: IdentityProvider = {
      id: randomId("idp"),
      tenantId,
      name: parsed.name,
      protocol: parsed.protocol,
      issuer: parsed.issuer,
      domains: [...new Set(parsed.domains.map((domain) => domain.toLowerCase()))],
      clientId: parsed.clientId,
      secretReference: await this.#credentialCipher.encrypt(
        tenantId,
        parsed.clientSecret
      ),
      status: parsed.status,
      groupMappings: parsed.groupMappings,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "identity-providers", provider, {
      expectedRevision: null,
    });
    await this.bumpAuthorizationEpoch(tenantId);
    await this.appendAudit(tenantId, {
      type: "identity-provider.created",
      actorId,
      action: "create",
      targetType: "identity-provider",
      targetId: provider.id,
      outcome: "succeeded",
      requestId,
      explanation: `Created encrypted ${provider.protocol} provider ${provider.name}.`,
      metadata: { domains: provider.domains, status: provider.status },
    });
    return { ...provider, clientId: "[REDACTED]", secretReference: "[REDACTED]" };
  }

  async updateIdentityProvider(
    tenantId: string,
    providerId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = updateIdentityProviderInputSchema.parse(input);
    const current = await this.store.get<IdentityProvider>(
      tenantId,
      "identity-providers",
      providerId
    );
    if (!current) throw new PlatformNotFoundError("Identity provider");
    if (parsed.clientSecret && !this.#credentialCipher) {
      throw new PlatformValidationError(
        "Credential rotation requires CREDENTIAL_MASTER_KEY envelope encryption."
      );
    }
    const roles = new Set((await this.listRoles(tenantId)).map((role) => role.slug));
    for (const mapping of parsed.groupMappings ?? current.groupMappings) {
      if (!roles.has(mapping.role)) {
        throw new PlatformValidationError(
          `Group mapping references unknown platform role ${mapping.role}.`
        );
      }
    }
    const { clientSecret: _clientSecret, ...safe } = parsed;
    const updated: IdentityProvider = {
      ...current,
      ...safe,
      ...(parsed.domains
        ? {
            domains: [...new Set(parsed.domains.map((domain) => domain.toLowerCase()))],
          }
        : {}),
      ...(parsed.clientSecret
        ? {
            secretReference: await this.#credentialCipher!.encrypt(
              tenantId,
              parsed.clientSecret
            ),
          }
        : {}),
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "identity-providers", updated, {
      expectedRevision: current.revision,
    });
    await this.bumpAuthorizationEpoch(tenantId);
    await this.appendAudit(tenantId, {
      type: "identity-provider.updated",
      actorId,
      action: "update",
      targetType: "identity-provider",
      targetId: providerId,
      outcome: "succeeded",
      requestId,
      explanation: `Updated ${updated.name}; issued MCP credentials were invalidated.`,
      metadata: { status: updated.status, domains: updated.domains },
    });
    return { ...updated, clientId: "[REDACTED]", secretReference: "[REDACTED]" };
  }

  async deleteIdentityProvider(
    tenantId: string,
    providerId: string,
    actorId: string,
    requestId: string
  ) {
    const current = await this.store.get<IdentityProvider>(
      tenantId,
      "identity-providers",
      providerId
    );
    if (!current) throw new PlatformNotFoundError("Identity provider");
    await this.store.delete(tenantId, "identity-providers", providerId, {
      expectedRevision: current.revision,
    });
    await this.bumpAuthorizationEpoch(tenantId);
    await this.appendAudit(tenantId, {
      type: "identity-provider.deleted",
      actorId,
      action: "delete",
      targetType: "identity-provider",
      targetId: providerId,
      outcome: "succeeded",
      requestId,
      explanation: `Deleted ${current.name}; issued MCP credentials were invalidated.`,
    });
    return { id: providerId, deleted: true };
  }

  async createServicePrincipal(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = createServicePrincipalInputSchema.parse(input);
    const knownRoles = new Set(
      (await this.listRoles(tenantId)).map((role) => role.slug)
    );
    for (const role of parsed.roles) {
      if (!knownRoles.has(role)) {
        throw new PlatformValidationError(`Unknown platform role ${role}.`);
      }
    }
    const id = randomId("principal");
    const clientId = randomId("sp");
    const secret = `lmcp_sp_${crypto.randomUUID().replaceAll("-", "")}`;
    const now = nowIso();
    const principal: ServicePrincipal = {
      id,
      tenantId,
      name: parsed.name,
      clientId,
      secretHash: await sha256(secret),
      roles: parsed.roles,
      status: "active",
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "service-principals", principal, {
      expectedRevision: null,
    });
    await this.appendAudit(tenantId, {
      type: "service-principal.created",
      actorId,
      action: "create",
      targetType: "service-principal",
      targetId: id,
      outcome: "succeeded",
      requestId,
      explanation: `Created service principal ${principal.name}.`,
      metadata: { roles: principal.roles },
    });
    return { principal: { ...principal, secretHash: "[REDACTED]" }, secret };
  }

  async authenticateServicePrincipal(
    tenantId: string,
    clientId: string,
    secret: string
  ) {
    const [principals, roles] = await Promise.all([
      this.#listAll<ServicePrincipal>(tenantId, "service-principals"),
      this.listRoles(tenantId),
    ]);
    const match = principals.find((entry) => entry.clientId === clientId);
    if (!match) return null;
    const suppliedHash = await sha256(secret);
    const knownRoleSlugs = new Set(roles.map((role) => role.slug));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const principal = await this.store.get<ServicePrincipal>(
        tenantId,
        "service-principals",
        match.id
      );
      if (
        !principal ||
        principal.status !== "active" ||
        !safeEqual(suppliedHash, principal.secretHash)
      ) {
        return null;
      }
      const now = nowIso();
      const updated: ServicePrincipal = {
        ...principal,
        lastUsedAt: now,
        updatedAt: now,
        revision: principal.revision + 1,
      };
      try {
        await this.store.put(tenantId, "service-principals", updated, {
          expectedRevision: principal.revision,
        });
        return {
          type: "service-principal" as const,
          id: principal.id,
          roles: [
            ...new Set(principal.roles.filter((role) => knownRoleSlugs.has(role))),
          ].sort(),
          groups: [],
          claims: { clientId: principal.clientId },
        };
      } catch (error) {
        if (error instanceof StoreConflictError && attempt < 3) continue;
        throw error;
      }
    }
    return null;
  }

  async registerOAuthClient(tenantId: string, input: unknown) {
    const parsed = oauthClientRegistrationInputSchema.parse(input);
    for (const redirectUri of parsed.redirect_uris) {
      const url = new URL(redirectUri);
      const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
      if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
        throw new PlatformValidationError(
          "OAuth redirect URIs must use HTTPS, except loopback development clients."
        );
      }
      if (url.username || url.password || url.hash) {
        throw new PlatformValidationError(
          "OAuth redirect URIs cannot contain credentials or fragments."
        );
      }
    }
    const clientId = `oauthclient_${(await sha256(canonicalJson(parsed))).slice(
      0,
      48
    )}`;
    const existing = await this.store.get<OAuthClient>(
      tenantId,
      "oauth-clients",
      clientId
    );
    if (existing) return existing;
    const registrations = await this.store.list<OAuthClient>(
      tenantId,
      "oauth-clients",
      { limit: 101 }
    );
    if (registrations.items.length >= 100) {
      throw new PlatformQuotaError(
        "This tenant has reached the limit of 100 dynamically registered OAuth clients."
      );
    }
    const now = nowIso();
    const client: OAuthClient = {
      id: clientId,
      tenantId,
      clientId,
      clientName: parsed.client_name,
      redirectUris: parsed.redirect_uris,
      grantTypes: parsed.grant_types,
      tokenEndpointAuthMethod: parsed.token_endpoint_auth_method,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.#reserveResourceQuota(
      tenantId,
      "oauthClients",
      client.id,
      registrations.items.map((entry) => entry.id),
      100
    );
    let persisted = false;
    try {
      await this.store.put(tenantId, "oauth-clients", client, {
        expectedRevision: null,
      });
      persisted = true;
      return client;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const raced = await this.store.get<OAuthClient>(
        tenantId,
        "oauth-clients",
        clientId
      );
      if (!raced) throw error;
      persisted = true;
      return raced;
    } finally {
      if (!persisted) {
        await this.#releaseResourceQuotaReservation(
          tenantId,
          "oauthClients",
          client.id
        );
      }
    }
  }

  async getOAuthClient(tenantId: string, clientId: string) {
    return this.store.get<OAuthClient>(tenantId, "oauth-clients", clientId);
  }

  async issueOAuthAuthorizationCode(
    tenantId: string,
    input: {
      clientId: string;
      redirectUri: string;
      compositionSlug: string;
      codeChallenge: string;
      scopes: string[];
      subject: Subject;
    }
  ) {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) {
      throw new PlatformValidationError("OAuth PKCE code_challenge is invalid.");
    }
    const [client, composition, authority] = await Promise.all([
      this.getOAuthClient(tenantId, input.clientId),
      this.getCompositionBySlug(tenantId, input.compositionSlug),
      this.getAuthority(tenantId),
    ]);
    if (!client || !client.redirectUris.includes(input.redirectUri)) {
      throw new PlatformAuthorizationError("OAuth client or redirect URI is invalid.");
    }
    if (authority.frozen) {
      throw new PlatformAuthorizationError(
        "OAuth authorization is disabled while frozen."
      );
    }
    const subject = await this.buildSubject(tenantId, input.subject);
    const code = `lmcp_code_${crypto.randomUUID().replaceAll("-", "")}`;
    const codeHash = await sha256(code);
    const now = nowIso();
    const record: OAuthAuthorizationCode = {
      id: `oauthcode_${codeHash}`,
      tenantId,
      clientId: client.clientId,
      compositionId: composition.id,
      environmentId: composition.environmentId,
      redirectUri: input.redirectUri,
      codeHash,
      codeChallenge: input.codeChallenge,
      scopes: input.scopes,
      subject,
      authorizationEpoch: authority.authorizationEpoch,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      consumedAt: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "oauth-codes", record, {
      expectedRevision: null,
    });
    return code;
  }

  async #mintOAuthRefreshToken(
    tenantId: string,
    grantId: string,
    clientId: string,
    compositionId: string,
    environmentId: string,
    accessSessionId: string,
    scopes: string[],
    subject: Subject,
    authorizationEpoch: number
  ) {
    const refreshToken = `lmcp_refresh_${crypto.randomUUID().replaceAll("-", "")}${crypto
      .randomUUID()
      .replaceAll("-", "")}`;
    const tokenHash = await sha256(refreshToken);
    const now = nowIso();
    const record: OAuthRefreshToken = {
      id: `refreshtoken_${tokenHash}`,
      tenantId,
      clientId,
      compositionId,
      environmentId,
      accessSessionId,
      grantId,
      tokenHash,
      scopes,
      subject,
      authorizationEpoch,
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      rotatedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "oauth-refresh-tokens", record, {
      expectedRevision: null,
    });
    return { refreshToken, record };
  }

  async exchangeOAuthAuthorizationCode(
    tenantId: string,
    input: {
      clientId: string;
      code: string;
      codeVerifier: string;
      redirectUri: string;
    },
    gatewayOrigin: string,
    requestId: string
  ) {
    const codeHash = await sha256(input.code);
    const record = await this.store.get<OAuthAuthorizationCode>(
      tenantId,
      "oauth-codes",
      `oauthcode_${codeHash}`
    );
    if (
      !record ||
      record.clientId !== input.clientId ||
      !safeEqual(record.codeHash, codeHash) ||
      record.consumedAt ||
      record.redirectUri !== input.redirectUri ||
      Date.parse(record.expiresAt) <= Date.now()
    ) {
      throw new PlatformAuthorizationError("OAuth authorization code is invalid.");
    }
    if ((await sha256Base64Url(input.codeVerifier)) !== record.codeChallenge) {
      throw new PlatformAuthorizationError("OAuth PKCE verification failed.");
    }
    const authority = await this.getAuthority(tenantId);
    if (
      authority.frozen ||
      authority.authorizationEpoch !== record.authorizationEpoch
    ) {
      throw new PlatformAuthorizationError("OAuth authorization is stale or revoked.");
    }
    const consumedAt = nowIso();
    await this.store.put(
      tenantId,
      "oauth-codes",
      {
        ...record,
        consumedAt,
        updatedAt: consumedAt,
        revision: record.revision + 1,
      },
      { expectedRevision: record.revision }
    );
    const offlineAccess = record.scopes.includes("offline_access");
    const grantId = offlineAccess ? randomId("oauthgrant") : undefined;
    const issued = await this.createSession(
      tenantId,
      {
        compositionId: record.compositionId,
        environmentId: record.environmentId,
        subject: record.subject,
        approvedClients: [input.clientId],
        expiresInSeconds: 900,
      },
      record.subject.id,
      requestId,
      gatewayOrigin,
      grantId
    );
    const response: {
      access_token: string;
      token_type: "Bearer";
      expires_in: number;
      scope: string;
      refresh_token?: string;
    } = {
      access_token: issued.token,
      token_type: "Bearer",
      expires_in: 900,
      scope: record.scopes.join(" "),
    };
    if (grantId) {
      let minted: { refreshToken: string; record: OAuthRefreshToken } | undefined;
      try {
        minted = await this.#mintOAuthRefreshToken(
          tenantId,
          grantId,
          input.clientId,
          record.compositionId,
          record.environmentId,
          issued.session.id,
          record.scopes,
          record.subject,
          authority.authorizationEpoch
        );
        const now = nowIso();
        const grant: OAuthGrant = {
          id: grantId,
          tenantId,
          clientId: input.clientId,
          currentAccessSessionId: issued.session.id,
          currentRefreshTokenId: minted.record.id,
          authorizationEpoch: authority.authorizationEpoch,
          generation: 1,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        };
        await this.store.put(tenantId, "oauth-grants", grant, {
          expectedRevision: null,
        });
      } catch (error) {
        if (minted) {
          await this.store
            .delete(tenantId, "oauth-refresh-tokens", minted.record.id, {
              expectedRevision: minted.record.revision,
            })
            .catch(() => false);
        }
        await this.#markSessionRevoked(tenantId, issued.session.id, {
          actorId: record.subject.id,
          requestId,
          reason: "OAuth authorization issuance rolled back.",
        });
        throw error;
      }
      response.refresh_token = minted.refreshToken;
    }
    return response;
  }

  async rotateOAuthRefreshToken(
    tenantId: string,
    input: { clientId: string; refreshToken: string },
    gatewayOrigin: string,
    requestId: string
  ) {
    const tokenHash = await sha256(input.refreshToken);
    const record = await this.store.get<OAuthRefreshToken>(
      tenantId,
      "oauth-refresh-tokens",
      `refreshtoken_${tokenHash}`
    );
    const authority = await this.getAuthority(tenantId);
    if (
      record?.clientId === input.clientId &&
      safeEqual(record.tokenHash, tokenHash) &&
      record.rotatedAt
    ) {
      // A spent refresh token is a replay signal. Keep the tombstone and
      // invalidate every access/refresh token descended from the same grant.
      await this.#revokeOAuthGrant(tenantId, record.grantId, {
        actorId: record.subject.id,
        requestId,
        reason: "OAuth refresh-token replay revoked the grant.",
      });
      throw new PlatformAuthorizationError("OAuth refresh token replay detected.");
    }
    const grant = record
      ? await this.store.get<OAuthGrant>(tenantId, "oauth-grants", record.grantId)
      : null;
    if (
      !record ||
      record.clientId !== input.clientId ||
      !safeEqual(record.tokenHash, tokenHash) ||
      record.revokedAt ||
      Date.parse(record.expiresAt) <= Date.now() ||
      !grant ||
      grant.clientId !== input.clientId ||
      grant.revokedAt ||
      grant.currentRefreshTokenId !== record.id ||
      authority.frozen ||
      record.authorizationEpoch !== authority.authorizationEpoch ||
      grant.authorizationEpoch !== authority.authorizationEpoch
    ) {
      throw new PlatformAuthorizationError("OAuth refresh token is invalid or stale.");
    }
    const rotatedAt = nowIso();
    try {
      await this.store.put(
        tenantId,
        "oauth-refresh-tokens",
        {
          ...record,
          rotatedAt,
          updatedAt: rotatedAt,
          revision: record.revision + 1,
        },
        { expectedRevision: record.revision }
      );
    } catch (error) {
      if (error instanceof StoreConflictError) {
        await this.#revokeOAuthGrant(tenantId, record.grantId, {
          actorId: record.subject.id,
          requestId,
          reason: "Concurrent OAuth refresh-token replay revoked the grant.",
        });
        throw new PlatformAuthorizationError("OAuth refresh token replay detected.");
      }
      throw error;
    }

    let issued: Awaited<ReturnType<PlatformService["createSession"]>> | undefined;
    let minted: { refreshToken: string; record: OAuthRefreshToken } | undefined;
    try {
      issued = await this.createSession(
        tenantId,
        {
          compositionId: record.compositionId,
          environmentId: record.environmentId,
          subject: record.subject,
          approvedClients: [input.clientId],
          expiresInSeconds: 900,
        },
        record.subject.id,
        requestId,
        gatewayOrigin,
        grant.id
      );
      minted = await this.#mintOAuthRefreshToken(
        tenantId,
        grant.id,
        input.clientId,
        record.compositionId,
        record.environmentId,
        issued.session.id,
        record.scopes,
        record.subject,
        authority.authorizationEpoch
      );
      const updatedGrant: OAuthGrant = {
        ...grant,
        currentAccessSessionId: issued.session.id,
        currentRefreshTokenId: minted.record.id,
        generation: grant.generation + 1,
        updatedAt: nowIso(),
        revision: grant.revision + 1,
      };
      await this.store.put(tenantId, "oauth-grants", updatedGrant, {
        expectedRevision: grant.revision,
      });

      // Grant membership is the authorization boundary, so the previous
      // access token stopped working at the CAS above. Mark it revoked as
      // well so administrative inventory reflects the effective state.
      await this.#markSessionRevoked(tenantId, record.accessSessionId, {
        actorId: record.subject.id,
        requestId,
        reason: "OAuth refresh rotation replaced the access session.",
      });
      return {
        access_token: issued.token,
        token_type: "Bearer" as const,
        expires_in: 900,
        refresh_token: minted.refreshToken,
        scope: record.scopes.join(" "),
      };
    } catch (error) {
      if (minted) {
        await this.store
          .delete(tenantId, "oauth-refresh-tokens", minted.record.id, {
            expectedRevision: minted.record.revision,
          })
          .catch(() => false);
      }
      if (issued) {
        await this.#markSessionRevoked(tenantId, issued.session.id, {
          actorId: record.subject.id,
          requestId,
          reason: "OAuth refresh rotation rolled back the replacement session.",
        });
      }
      await this.#revokeOAuthGrant(tenantId, grant.id, {
        actorId: record.subject.id,
        requestId,
        reason: "OAuth refresh rotation failure revoked the grant.",
      });
      if (error instanceof StoreConflictError) {
        throw new PlatformAuthorizationError(
          "OAuth refresh token was concurrently rotated or revoked."
        );
      }
      throw error;
    }
  }

  async consumeToolCallQuota(tenantId: string) {
    const { toolCallsPerDay } = await this.#quotaLimitsFor(tenantId);
    const day = new Date().toISOString().slice(0, 10);
    const id = `calls_${day.replaceAll("-", "")}`;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.store.get<QuotaCounter>(
        tenantId,
        "quota-counters",
        id
      );
      if ((current?.count ?? 0) >= toolCallsPerDay) {
        throw new PlatformQuotaError(
          `The configured daily tool-call limit of ${toolCallsPerDay} has been reached.`
        );
      }
      const now = nowIso();
      const next: QuotaCounter = {
        id,
        tenantId,
        count: (current?.count ?? 0) + 1,
        resetsAt: `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        revision: (current?.revision ?? 0) + 1,
      };
      try {
        return await this.store.put(tenantId, "quota-counters", next, {
          expectedRevision: current?.revision ?? null,
        });
      } catch (error) {
        if (error instanceof StoreConflictError && attempt < 7) continue;
        throw error;
      }
    }
    throw new StoreConflictError("The tool-call quota counter remained contended.");
  }

  /** Exact deployment quota standing; analytics events are intentionally not consulted. */
  async getUsageStanding(tenantId: string): Promise<UsageStanding> {
    const generatedAt = nowIso();
    const day = generatedAt.slice(0, 10);
    const counterId = `calls_${day.replaceAll("-", "")}`;
    const [servers, compositions, sessions, callCounter, quotas] = await Promise.all([
      this.listServers(tenantId),
      this.listCompositions(tenantId),
      this.#listAll<GatewaySession>(tenantId, "sessions"),
      this.store.get<QuotaCounter>(tenantId, "quota-counters", counterId),
      this.#quotaLimitsFor(tenantId),
    ]);
    const activeSessions = sessions.filter(
      (session) => !session.revokedAt && Date.parse(session.expiresAt) > Date.now()
    ).length;
    const entry = (used: number, limit: number) => ({
      limit,
      used,
      remaining: Math.max(0, limit - used),
    });
    return usageStandingSchema.parse({
      generatedAt,
      analyticsEnabled: this.#analyticsEnabled,
      servers: entry(servers.length, quotas.servers),
      compositions: entry(compositions.length, quotas.compositions),
      activeSessions: entry(activeSessions, quotas.activeSessions),
      toolCallsToday: {
        ...entry(callCounter?.count ?? 0, quotas.toolCallsPerDay),
        resetsAt:
          callCounter?.resetsAt ??
          `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`,
      },
    });
  }

  async #validateCompositionMembers(
    tenantId: string,
    members: Composition["members"],
    aliases: Composition["aliases"],
    requireHealthy = false
  ) {
    const servers = await this.listServers(tenantId);
    const serverIds = new Set(servers.map((server) => server.id));
    for (const member of members) {
      if (!serverIds.has(member.serverId)) {
        throw new PlatformValidationError(
          `Composition member ${member.serverId} does not exist in this tenant.`
        );
      }
      const server = servers.find((entry) => entry.id === member.serverId);
      if (server?.version !== member.pinnedVersion) {
        throw new PlatformValidationError(
          `Composition member ${member.serverId} must pin the registered server version.`
        );
      }
      if (server?.driftStatus === "quarantined") {
        throw new PlatformValidationError(
          `Composition member ${member.serverId} is quarantined after tool-schema drift.`
        );
      }
      if (requireHealthy && server?.status !== "healthy") {
        throw new PlatformValidationError(
          `Composition member ${member.serverId} must pass a live probe before publication.`
        );
      }
    }
    const namespaceSet = new Set(members.map((member) => member.namespace));
    if (namespaceSet.size !== members.length) {
      throw new PlatformValidationError("Member namespaces must be unique.");
    }
    const targets = new Set(
      members.flatMap((member) => {
        const server = servers.find((entry) => entry.id === member.serverId);
        return (server?.tools ?? []).map((tool) => `${member.namespace}.${tool.name}`);
      })
    );
    const aliasNames = new Set<string>();
    for (const alias of aliases) {
      if (!targets.has(alias.target)) {
        throw new PlatformValidationError(
          `Alias target ${alias.target} is not present in the composition.`
        );
      }
      if (targets.has(alias.alias) || aliasNames.has(alias.alias)) {
        throw new PlatformValidationError(`Alias ${alias.alias} collides.`);
      }
      aliasNames.add(alias.alias);
    }
  }

  async createServer(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = createServerInputSchema.parse(input);
    if (
      (parsed.transport === "streamable-http" || parsed.transport === "legacy-sse") &&
      !parsed.endpoint
    ) {
      throw new PlatformValidationError(
        "A remote HTTP server requires an absolute endpoint URL."
      );
    }
    if (parsed.transport === "stdio" && !parsed.command?.length) {
      throw new PlatformValidationError("A stdio server requires a command.");
    }
    const endpoint = parsed.endpoint
      ? validateEndpointForStorage(parsed.endpoint)
      : undefined;
    const [existingServers, quotas] = await Promise.all([
      this.listServers(tenantId),
      this.#quotaLimitsFor(tenantId),
    ]);
    if (existingServers.some((server) => server.slug === parsed.slug)) {
      throw new PlatformValidationError(
        `Server slug ${parsed.slug} already exists in this tenant.`
      );
    }
    const now = nowIso();
    const server: McpServerDefinition = {
      ...parsed,
      ...(endpoint ? { endpoint } : {}),
      id: randomId("server"),
      tenantId,
      status: "unprobed",
      driftStatus: "current",
      lastProbedAt: null,
      lastProbeError: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.#reserveResourceQuota(
      tenantId,
      "servers",
      server.id,
      existingServers.map((entry) => entry.id),
      quotas.servers
    );
    let persisted = false;
    try {
      await this.store.put(tenantId, "servers", server, {
        expectedRevision: null,
      });
      persisted = true;
    } finally {
      if (!persisted) {
        await this.#releaseResourceQuotaReservation(tenantId, "servers", server.id);
      }
    }
    await this.appendAudit(tenantId, {
      type: "server.created",
      actorId,
      action: "create",
      targetType: "mcp-server",
      targetId: server.id,
      outcome: "succeeded",
      requestId,
      explanation: `Registered ${server.name}.`,
      metadata: { transport: server.transport, version: server.version },
    });
    await this.recordActivationEvent(tenantId, "server_registered", actorId, {
      serverId: server.id,
    });
    return server;
  }

  async updateServer(
    tenantId: string,
    serverId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = updateServerInputSchema.parse(input);
    const current = await this.store.get<McpServerDefinition>(
      tenantId,
      "servers",
      serverId
    );
    if (!current) throw new PlatformNotFoundError("MCP server");
    const endpoint = parsed.endpoint
      ? validateEndpointForStorage(parsed.endpoint)
      : parsed.endpoint;
    const now = nowIso();
    const updated: McpServerDefinition = {
      ...current,
      ...parsed,
      ...(endpoint ? { endpoint } : {}),
      ...(parsed.tools
        ? {
            schemaHash: await sha256(
              canonicalJson(
                [...parsed.tools].sort((left, right) =>
                  left.name.localeCompare(right.name)
                )
              )
            ),
            driftStatus: "current" as const,
          }
        : {}),
      status:
        parsed.endpoint !== undefined || parsed.command !== undefined
          ? "unprobed"
          : current.status,
      lastProbeError:
        parsed.endpoint !== undefined || parsed.command !== undefined
          ? null
          : current.lastProbeError,
      updatedAt: now,
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "servers", updated, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: "server.updated",
      actorId,
      action: "update",
      targetType: "mcp-server",
      targetId: serverId,
      outcome: "succeeded",
      requestId,
      explanation: `Updated ${updated.name}.`,
      metadata: { version: updated.version },
    });
    return updated;
  }

  async deleteServer(
    tenantId: string,
    serverId: string,
    actorId: string,
    requestId: string
  ) {
    const current = await this.store.get<McpServerDefinition>(
      tenantId,
      "servers",
      serverId
    );
    if (!current) throw new PlatformNotFoundError("MCP server");
    const compositions = await this.listCompositions(tenantId);
    const dependent = compositions.find((composition) =>
      composition.members.some((member) => member.serverId === serverId)
    );
    if (dependent) {
      throw new PlatformConflictError(
        `Remove this server from composition ${dependent.name} before deleting it.`
      );
    }
    await this.store.delete(tenantId, "servers", serverId, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: "server.deleted",
      actorId,
      action: "delete",
      targetType: "mcp-server",
      targetId: serverId,
      outcome: "succeeded",
      requestId,
      explanation: `Deleted ${current.name}.`,
      metadata: { slug: current.slug },
    });
    return { id: serverId, deleted: true };
  }

  async recordServerProbe(
    tenantId: string,
    serverId: string,
    result: { tools?: ToolDefinition[]; error?: string },
    acceptDrift: boolean,
    actorId: string,
    requestId: string
  ) {
    const current = await this.store.get<McpServerDefinition>(
      tenantId,
      "servers",
      serverId
    );
    if (!current) throw new PlatformNotFoundError("MCP server");
    const now = nowIso();
    if (result.error || !result.tools) {
      const failed: McpServerDefinition = {
        ...current,
        status: current.status === "healthy" ? "degraded" : "offline",
        lastProbedAt: now,
        lastProbeError: (result.error ?? "Probe did not return tools.").slice(0, 2_000),
        updatedAt: now,
        revision: current.revision + 1,
      };
      await this.store.put(tenantId, "servers", failed, {
        expectedRevision: current.revision,
      });
      await this.appendAudit(tenantId, {
        type: "server.probe-failed",
        actorId,
        action: "probe",
        targetType: "mcp-server",
        targetId: serverId,
        outcome: "failed",
        requestId,
        explanation: failed.lastProbeError ?? "Upstream probe failed.",
      });
      return failed;
    }
    const sortedTools = [...result.tools].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    const schemaHash = await sha256(canonicalJson(sortedTools));
    const drifted = Boolean(current.schemaHash && current.schemaHash !== schemaHash);
    const shouldApply = !drifted || acceptDrift;
    const probed: McpServerDefinition = {
      ...current,
      ...(shouldApply ? { tools: sortedTools, schemaHash } : {}),
      status: drifted && !acceptDrift ? "degraded" : "healthy",
      driftStatus: drifted && !acceptDrift ? "quarantined" : "current",
      lastProbedAt: now,
      lastProbeError:
        drifted && !acceptDrift
          ? "Tool schema drift detected; review and re-probe with acceptDrift=true."
          : null,
      updatedAt: now,
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "servers", probed, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: drifted
        ? acceptDrift
          ? "server.drift-accepted"
          : "server.drift-quarantined"
        : "server.probed",
      actorId,
      action: "probe",
      targetType: "mcp-server",
      targetId: serverId,
      outcome: drifted && !acceptDrift ? "denied" : "succeeded",
      requestId,
      explanation:
        drifted && !acceptDrift
          ? "Live tools differ from the approved schema and were quarantined."
          : `Imported ${sortedTools.length} upstream tools.`,
      metadata: {
        schemaHash,
        previousSchemaHash: current.schemaHash,
        toolCount: sortedTools.length,
      },
    });
    if (!(drifted && !acceptDrift)) {
      await this.recordActivationEvent(tenantId, "server_probed", actorId, {
        serverId,
        toolCount: sortedTools.length,
      });
    }
    return probed;
  }

  async createComposition(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = createCompositionInputSchema.parse(input);
    const [environment, existingCompositions, quotas] = await Promise.all([
      this.store.get<Environment>(tenantId, "environments", parsed.environmentId),
      this.listCompositions(tenantId),
      this.#quotaLimitsFor(tenantId),
    ]);
    if (!environment) {
      throw new PlatformValidationError(
        `Environment ${parsed.environmentId} does not exist in this tenant.`
      );
    }
    if (existingCompositions.some((entry) => entry.slug === parsed.slug)) {
      throw new PlatformValidationError(
        `Composition slug ${parsed.slug} already exists in this tenant.`
      );
    }
    await this.#validateCompositionMembers(tenantId, parsed.members, parsed.aliases);
    const now = nowIso();
    const composition: Composition = {
      ...parsed,
      id: randomId("composition"),
      tenantId,
      version: "0.1.0",
      status: "draft",
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.#reserveResourceQuota(
      tenantId,
      "compositions",
      composition.id,
      existingCompositions.map((entry) => entry.id),
      quotas.compositions
    );
    let persisted = false;
    try {
      await this.store.put(tenantId, "compositions", composition, {
        expectedRevision: null,
      });
      persisted = true;
    } finally {
      if (!persisted) {
        await this.#releaseResourceQuotaReservation(
          tenantId,
          "compositions",
          composition.id
        );
      }
    }
    await this.appendAudit(tenantId, {
      type: "composition.created",
      actorId,
      action: "create",
      targetType: "composition",
      targetId: composition.id,
      outcome: "succeeded",
      requestId,
      explanation: `Created composition ${composition.name}.`,
      metadata: { memberCount: composition.members.length },
    });
    return composition;
  }

  async updateComposition(
    tenantId: string,
    compositionId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = updateCompositionInputSchema.parse(input);
    const current = await this.store.get<Composition>(
      tenantId,
      "compositions",
      compositionId
    );
    if (!current) throw new PlatformNotFoundError("Composition");
    const members = parsed.members ?? current.members;
    const aliases = parsed.aliases ?? current.aliases;
    await this.#validateCompositionMembers(tenantId, members, aliases);
    const updated: Composition = {
      ...current,
      ...parsed,
      members,
      aliases,
      status: "draft",
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "compositions", updated, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: "composition.updated",
      actorId,
      action: "update",
      targetType: "composition",
      targetId: compositionId,
      outcome: "succeeded",
      requestId,
      explanation: `Updated ${updated.name}; republishing is required.`,
      metadata: { memberCount: members.length },
    });
    return updated;
  }

  async publishComposition(
    tenantId: string,
    compositionId: string,
    actorId: string,
    requestId: string
  ) {
    const current = await this.store.get<Composition>(
      tenantId,
      "compositions",
      compositionId
    );
    if (!current) throw new PlatformNotFoundError("Composition");
    if (current.members.length === 0) {
      throw new PlatformValidationError(
        "Attach at least one probed server before publishing a composition."
      );
    }
    await this.#validateCompositionMembers(
      tenantId,
      current.members,
      current.aliases,
      true
    );
    const parts = current.version.split(".").map(Number);
    const nextVersion =
      parts.length === 3 && parts.every(Number.isInteger)
        ? `${parts[0]}.${parts[1]}.${(parts[2] ?? 0) + 1}`
        : `${current.version}.1`;
    const published: Composition = {
      ...current,
      version: nextVersion,
      status: "published",
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "compositions", published, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: "composition.published",
      actorId,
      action: "publish",
      targetType: "composition",
      targetId: compositionId,
      outcome: "succeeded",
      requestId,
      explanation: `Published ${published.name} ${published.version}.`,
      metadata: { version: published.version },
    });
    await this.recordActivationEvent(tenantId, "composition_published", actorId, {
      compositionId,
      version: published.version,
    });
    return published;
  }

  async deleteComposition(
    tenantId: string,
    compositionId: string,
    actorId: string,
    requestId: string
  ) {
    const current = await this.store.get<Composition>(
      tenantId,
      "compositions",
      compositionId
    );
    if (!current) throw new PlatformNotFoundError("Composition");
    const sessions = await this.store.list<GatewaySession>(tenantId, "sessions", {
      limit: 1_000,
    });
    if (
      sessions.items.some(
        (session) => session.compositionId === compositionId && !session.revokedAt
      )
    ) {
      throw new PlatformConflictError(
        "Revoke active sessions for this composition before deleting it."
      );
    }
    await this.store.delete(tenantId, "compositions", compositionId, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: "composition.deleted",
      actorId,
      action: "delete",
      targetType: "composition",
      targetId: compositionId,
      outcome: "succeeded",
      requestId,
      explanation: `Deleted ${current.name}.`,
    });
    return { id: compositionId, deleted: true };
  }

  async getCompositionBySlug(tenantId: string, slug: string) {
    const compositions = await this.listCompositions(tenantId);
    const composition = compositions.find((entry) => entry.slug === slug);
    if (!composition || composition.status !== "published") {
      throw new PlatformNotFoundError("Published composition");
    }
    return composition;
  }

  async activePolicy(tenantId: string) {
    const authority = await this.getAuthority(tenantId);
    if (!authority.activePolicyId) return null;
    const policy = await this.store.get<Policy>(
      tenantId,
      "policies",
      authority.activePolicyId
    );
    // Never coerce a draft into an effective policy merely because a stale or
    // partially written authority document points at it.
    return policy?.status === "active" ? policy : null;
  }

  async simulatePolicy(tenantId: string, input: unknown) {
    const parsed = policySimulationInputSchema.parse(input);
    const policy = parsed.policyId
      ? await this.store.get<Policy>(tenantId, "policies", parsed.policyId)
      : await this.activePolicy(tenantId);
    return evaluatePolicy(policy, parsed);
  }

  lintPolicy(policy: Policy) {
    const conflicts: Array<{ ruleIds: string[]; message: string }> = [];
    const unreachable: Array<{ ruleId: string; shadowedBy: string; message: string }> =
      [];
    const selector = (rule: Policy["rules"][number]) =>
      canonicalJson({
        roles: [...(rule.roles ?? [])].sort(),
        groups: [...(rule.groups ?? [])].sort(),
        tools: [...(rule.tools ?? [])].sort(),
        risks: [...(rule.risks ?? [])].sort(),
        actions: [...(rule.actions ?? [])].sort(),
      });
    for (let index = 0; index < policy.rules.length; index += 1) {
      const left = policy.rules[index]!;
      for (let nested = index + 1; nested < policy.rules.length; nested += 1) {
        const right = policy.rules[nested]!;
        if (selector(left) !== selector(right)) continue;
        if (left.priority === right.priority && left.effect !== right.effect) {
          conflicts.push({
            ruleIds: [left.id, right.id],
            message: "Identical selectors at the same priority have different effects.",
          });
        } else {
          const winner = left.priority >= right.priority ? left : right;
          const loser = winner === left ? right : left;
          unreachable.push({
            ruleId: loser.id,
            shadowedBy: winner.id,
            message: "An identical higher-priority selector always wins.",
          });
        }
      }
    }
    return { valid: conflicts.length === 0, conflicts, unreachable };
  }

  async createPolicy(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = createPolicyInputSchema.parse(input);
    const now = nowIso();
    const policy: Policy = {
      ...parsed,
      id: randomId("policy"),
      tenantId,
      version: "0.1.0",
      status: "draft",
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "policies", policy, { expectedRevision: null });
    await this.appendAudit(tenantId, {
      type: "policy.created",
      actorId,
      action: "create",
      targetType: "policy",
      targetId: policy.id,
      outcome: "succeeded",
      requestId,
      explanation: `Created draft policy ${policy.name}.`,
      metadata: { lint: this.lintPolicy(policy) },
    });
    return { policy, lint: this.lintPolicy(policy) };
  }

  async updatePolicy(
    tenantId: string,
    policyId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = updatePolicyInputSchema.parse(input);
    const current = await this.store.get<Policy>(tenantId, "policies", policyId);
    if (!current) throw new PlatformNotFoundError("Policy");
    if (current.status === "active") {
      throw new PlatformConflictError(
        "Active policies are immutable; create or edit a draft, then activate it."
      );
    }
    const updated: Policy = {
      ...current,
      ...parsed,
      status: "draft",
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "policies", updated, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: "policy.updated",
      actorId,
      action: "update",
      targetType: "policy",
      targetId: policyId,
      outcome: "succeeded",
      requestId,
      explanation: `Updated draft policy ${updated.name}.`,
      metadata: { lint: this.lintPolicy(updated) },
    });
    return { policy: updated, lint: this.lintPolicy(updated) };
  }

  async activatePolicy(
    tenantId: string,
    policyId: string,
    actorId: string,
    requestId: string
  ) {
    const target = await this.store.get<Policy>(tenantId, "policies", policyId);
    if (!target) throw new PlatformNotFoundError("Policy");
    const lint = this.lintPolicy(target);
    if (!lint.valid) {
      throw new PlatformValidationError(
        "Resolve conflicting rules before activating this policy."
      );
    }
    const authority = await this.getAuthority(tenantId);
    if (authority.activePolicyId === policyId) {
      if (target.status !== "active") {
        throw new PlatformConflictError(
          "The active-policy pointer is inconsistent; repair it before continuing."
        );
      }
      return { policy: target, lint };
    }
    const previousId = authority.activePolicyId;
    const now = nowIso();
    const activated: Policy =
      target.status === "active"
        ? target
        : {
            ...target,
            status: "active",
            version: target.version === "0.1.0" ? "1.0.0" : target.version,
            updatedAt: now,
            revision: target.revision + 1,
          };
    if (target.status !== "active") {
      try {
        // Make the exact linted revision immutable before publishing its ID.
        // If a concurrent editor wins, this CAS fails and authority is untouched.
        await this.store.put(tenantId, "policies", activated, {
          expectedRevision: target.revision,
        });
      } catch (error) {
        if (error instanceof StoreConflictError) {
          throw new PlatformConflictError(
            "The policy changed while it was being activated; review and retry."
          );
        }
        throw error;
      }
    }

    const updatedAuthority: TenantAuthority = {
      ...authority,
      activePolicyId: policyId,
      authorizationEpoch: authority.authorizationEpoch + 1,
      updatedAt: now,
      revision: authority.revision + 1,
    };
    try {
      await this.store.put(tenantId, "tenant-authority", updatedAuthority, {
        expectedRevision: authority.revision,
      });
    } catch (error) {
      if (error instanceof StoreConflictError) {
        const latestAuthority = await this.getAuthority(tenantId);
        if (target.status !== "active" && latestAuthority.activePolicyId !== policyId) {
          await this.store
            .put(
              tenantId,
              "policies",
              {
                ...activated,
                status: "draft",
                updatedAt: nowIso(),
                revision: activated.revision + 1,
              },
              { expectedRevision: activated.revision }
            )
            .catch((rollbackError) => {
              if (!(rollbackError instanceof StoreConflictError)) {
                throw rollbackError;
              }
              return activated;
            });
        }
        throw new PlatformConflictError(
          "Another policy activation won the race; refresh before retrying."
        );
      }
      throw error;
    }
    if (previousId && previousId !== policyId) {
      const previous = await this.store.get<Policy>(tenantId, "policies", previousId);
      if (previous) {
        await this.store
          .put(
            tenantId,
            "policies",
            {
              ...previous,
              status: "archived",
              updatedAt: now,
              revision: previous.revision + 1,
            },
            { expectedRevision: previous.revision }
          )
          .catch((error) => {
            // The authority pointer is already authoritative. A concurrent
            // activation may have changed this bookkeeping document again.
            if (!(error instanceof StoreConflictError)) throw error;
            return previous;
          });
      }
    }
    await this.appendAudit(tenantId, {
      type: "policy.activated",
      actorId,
      action: "activate",
      targetType: "policy",
      targetId: policyId,
      outcome: "succeeded",
      requestId,
      policyVersion: activated.version,
      explanation: `Activated ${activated.name}; existing MCP sessions were invalidated.`,
      metadata: {
        previousPolicyId: previousId,
        epoch: updatedAuthority.authorizationEpoch,
      },
    });
    return { policy: activated, lint };
  }

  async archivePolicy(
    tenantId: string,
    policyId: string,
    actorId: string,
    requestId: string
  ) {
    const current = await this.store.get<Policy>(tenantId, "policies", policyId);
    if (!current) throw new PlatformNotFoundError("Policy");
    const authority = await this.getAuthority(tenantId);
    if (authority.activePolicyId === policyId) {
      throw new PlatformConflictError(
        "Activate another policy before archiving the current policy."
      );
    }
    const archived: Policy = {
      ...current,
      status: "archived",
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "policies", archived, {
      expectedRevision: current.revision,
    });
    await this.appendAudit(tenantId, {
      type: "policy.archived",
      actorId,
      action: "archive",
      targetType: "policy",
      targetId: policyId,
      outcome: "succeeded",
      requestId,
      explanation: `Archived ${archived.name}.`,
    });
    return archived;
  }

  async discoverVisibleTools(
    tenantId: string,
    compositionId: string,
    subject: Subject,
    requestId: string,
    actorId = subject.id
  ): Promise<DiscoveryResult> {
    const composition = await this.store.get<Composition>(
      tenantId,
      "compositions",
      compositionId
    );
    if (!composition) throw new PlatformNotFoundError("Composition");
    if (composition.status !== "published") {
      throw new PlatformAuthorizationError(
        "Only published compositions can expose capabilities."
      );
    }
    const [servers, policy, authority] = await Promise.all([
      this.listServers(tenantId),
      this.activePolicy(tenantId),
      this.getAuthority(tenantId),
    ]);
    if (authority.frozen) {
      const auditEvent = await this.appendAudit(tenantId, {
        type: "policy.discovery-batch",
        actorId,
        action: "discover",
        targetType: "composition",
        targetId: compositionId,
        outcome: "denied",
        requestId,
        explanation: "The tenant is frozen by an emergency deny-all overlay.",
        metadata: { frozen: true },
      });
      return {
        tools: [],
        denied: true,
        toolsVisible: 0,
        toolsHidden: 0,
        visibleTools: [],
        visibilityTruncated: false,
        matchedRuleIds: [],
        ...(policy?.id ? { policyId: policy.id } : {}),
        ...(policy?.version ? { policyVersion: policy.version } : {}),
        auditReceipt: auditEvent,
      };
    }
    const visible: VisibleTool[] = [];
    const discoveryDecisions: Array<{
      toolName: string;
      allowed: boolean;
      matchedRuleIds: string[];
    }> = [];
    for (const member of composition.members
      .filter((entry) => entry.enabled)
      .sort((left, right) => left.priority - right.priority)) {
      const server = servers.find((entry) => entry.id === member.serverId);
      if (
        !server ||
        server.status !== "healthy" ||
        server.version !== member.pinnedVersion ||
        server.driftStatus === "quarantined"
      ) {
        continue;
      }
      for (const tool of server.tools) {
        const canonicalName = `${member.namespace}.${tool.name}`;
        const decision = evaluatePolicy(policy, {
          subject,
          action: "discover",
          toolName: canonicalName,
          risk: tool.risk,
        });
        discoveryDecisions.push({
          toolName: canonicalName,
          allowed: decision.allowed,
          matchedRuleIds: decision.matchedRuleIds,
        });
        if (!decision.allowed) continue;
        visible.push({
          ...tool,
          name: canonicalName,
          canonicalName,
          serverId: server.id,
          serverName: server.name,
          serverVersion: server.version,
          transport: server.transport,
          provenance: {
            namespace: member.namespace,
            upstreamTool: tool.name,
            origin:
              endpointForDisclosure(server.endpoint) ?? `builtin://${server.slug}`,
          },
        });
        for (const alias of composition.aliases.filter(
          (entry) => entry.target === canonicalName
        )) {
          visible.push({
            ...tool,
            name: alias.alias,
            canonicalName,
            serverId: server.id,
            serverName: server.name,
            serverVersion: server.version,
            transport: server.transport,
            provenance: {
              namespace: member.namespace,
              upstreamTool: tool.name,
              origin:
                endpointForDisclosure(server.endpoint) ?? `builtin://${server.slug}`,
            },
          });
        }
      }
    }
    const canonicalVisible = discoveryDecisions
      .filter((decision) => decision.allowed)
      .map((decision) => decision.toolName);
    const matchedRuleIds = [
      ...new Set(discoveryDecisions.flatMap((decision) => decision.matchedRuleIds)),
    ].slice(0, 16);
    const auditEvent = await this.appendAudit(tenantId, {
      type: "policy.discovery-batch",
      actorId,
      action: "discover",
      targetType: "composition",
      targetId: compositionId,
      outcome: "succeeded",
      requestId,
      policyVersion: policy?.version,
      explanation: `Evaluated ${discoveryDecisions.length} tools; ${visible.length} names are visible including aliases.`,
      metadata: {
        toolsEvaluated: discoveryDecisions.length,
        toolsVisible: canonicalVisible.length,
        toolsHidden: discoveryDecisions.length - canonicalVisible.length,
        visibleNamesIncludingAliases: visible.length,
        matchedRuleIds,
      },
    });
    return {
      tools: visible,
      denied: false,
      toolsVisible: canonicalVisible.length,
      toolsHidden: discoveryDecisions.length - canonicalVisible.length,
      visibleTools: canonicalVisible.slice(0, 64),
      visibilityTruncated: canonicalVisible.length > 64,
      matchedRuleIds,
      ...(policy?.id ? { policyId: policy.id } : {}),
      ...(policy?.version ? { policyVersion: policy.version } : {}),
      auditReceipt: auditEvent,
    };
  }

  async listVisibleTools(
    tenantId: string,
    compositionId: string,
    subject: Subject,
    requestId: string,
    actorId = subject.id
  ): Promise<VisibleTool[]> {
    return (
      await this.discoverVisibleTools(
        tenantId,
        compositionId,
        subject,
        requestId,
        actorId
      )
    ).tools;
  }

  async resolveTool(
    tenantId: string,
    compositionId: string,
    subject: Subject,
    requestedName: string,
    requestId: string
  ): Promise<ResolvedTool> {
    const composition = await this.store.get<Composition>(
      tenantId,
      "compositions",
      compositionId
    );
    if (!composition) throw new PlatformNotFoundError("Composition");
    if (composition.status !== "published") {
      throw new PlatformAuthorizationError(
        "Only published compositions can execute capabilities."
      );
    }
    const authority = await this.getAuthority(tenantId);
    if (authority.frozen) {
      throw new PlatformAuthorizationError(
        "The tenant is frozen by an emergency deny-all overlay."
      );
    }
    const alias = composition.aliases.find((entry) => entry.alias === requestedName);
    const canonicalName = alias?.target ?? requestedName;
    const separator = canonicalName.indexOf(".");
    if (separator < 1) throw new PlatformNotFoundError("Tool");
    const namespace = canonicalName.slice(0, separator);
    const upstreamName = canonicalName.slice(separator + 1);
    const member = composition.members.find(
      (entry) => entry.namespace === namespace && entry.enabled
    );
    if (!member) throw new PlatformNotFoundError("Tool");
    const server = await this.store.get<McpServerDefinition>(
      tenantId,
      "servers",
      member.serverId
    );
    const tool = server?.tools.find((entry) => entry.name === upstreamName);
    if (!server || !tool) throw new PlatformNotFoundError("Tool");
    if (
      server.status !== "healthy" ||
      server.version !== member.pinnedVersion ||
      server.driftStatus === "quarantined"
    ) {
      throw new PlatformAuthorizationError(
        "The upstream is unhealthy, unprobed, quarantined, or no longer matches the approved composition pin."
      );
    }
    const policy = await this.activePolicy(tenantId);
    const decision = evaluatePolicy(policy, {
      subject,
      action: "execute",
      toolName: canonicalName,
      risk: tool.risk,
    });
    const auditEvent = await this.appendAudit(tenantId, {
      type: "policy.execution-decision",
      actorId: subject.id,
      action: "execute",
      targetType: "tool",
      targetId: canonicalName,
      outcome: decision.requiresApproval
        ? "pending"
        : decision.allowed
          ? "allowed"
          : "denied",
      requestId,
      policyVersion: decision.policyVersion ?? undefined,
      explanation: decision.explanation,
      metadata: {
        matchedRuleIds: decision.matchedRuleIds,
        requestedName,
        canonicalName,
      },
    });
    if (!decision.allowed) {
      throw new PlatformPolicyDeniedError(decision.explanation, {
        requestedName,
        canonicalName,
        aliasUsed: Boolean(alias),
        namespace,
        serverId: server.id,
        risk: tool.risk,
        decision,
        auditReceipt: auditEvent,
      });
    }
    return {
      composition,
      server,
      tool,
      requestedName,
      canonicalName,
      upstreamName,
      aliasUsed: Boolean(alias),
      decision,
      auditReceipt: auditEvent,
    };
  }

  /**
   * Revalidates the complete authorization snapshot immediately before an
   * upstream side effect. This method deliberately performs no audit writes,
   * quota mutations, or approval consumption so the gateway can place it at
   * the final dispatch boundary.
   */
  async assertExecutionContext(
    tenantId: string,
    session: GatewaySession,
    resolved: ResolvedTool
  ) {
    const [storedSession, authority, composition, server, policy] = await Promise.all([
      this.store.get<GatewaySession>(tenantId, "sessions", session.id),
      this.getAuthority(tenantId),
      this.store.get<Composition>(tenantId, "compositions", resolved.composition.id),
      this.store.get<McpServerDefinition>(tenantId, "servers", resolved.server.id),
      resolved.decision.policyId
        ? this.store.get<Policy>(tenantId, "policies", resolved.decision.policyId)
        : Promise.resolve(null),
    ]);
    if (
      !storedSession ||
      storedSession.revision !== session.revision ||
      storedSession.revokedAt ||
      Date.parse(storedSession.expiresAt) <= Date.now() ||
      storedSession.compositionId !== resolved.composition.id ||
      authority.frozen ||
      (storedSession.authorizationEpoch ?? 0) !== authority.authorizationEpoch
    ) {
      throw new PlatformAuthorizationError(
        "The MCP session was revoked, frozen, or changed before dispatch."
      );
    }
    if (
      !composition ||
      composition.status !== "published" ||
      composition.version !== resolved.composition.version ||
      composition.revision !== resolved.composition.revision
    ) {
      throw new PlatformConflictError(
        "The composition changed before dispatch; resolve the tool again."
      );
    }
    const namespace = resolved.canonicalName.slice(
      0,
      resolved.canonicalName.indexOf(".")
    );
    const member = composition.members.find(
      (entry) =>
        entry.enabled &&
        entry.namespace === namespace &&
        entry.serverId === resolved.server.id
    );
    const currentTool = server?.tools.find(
      (entry) => entry.name === resolved.upstreamName
    );
    if (
      !server ||
      !member ||
      !currentTool ||
      server.status !== "healthy" ||
      server.driftStatus === "quarantined" ||
      member.pinnedVersion !== server.version ||
      server.version !== resolved.server.version ||
      server.revision !== resolved.server.revision
    ) {
      throw new PlatformConflictError(
        "The upstream server changed or became unhealthy before dispatch."
      );
    }
    if (
      authority.activePolicyId !== resolved.decision.policyId ||
      policy?.status !== "active" ||
      policy.version !== resolved.decision.policyVersion
    ) {
      throw new PlatformConflictError(
        "The authorization policy changed before dispatch."
      );
    }
    const decision = evaluatePolicy(policy, {
      subject: storedSession.subject,
      action: "execute",
      toolName: resolved.canonicalName,
      risk: currentTool.risk,
    });
    if (
      !decision.allowed ||
      decision.requiresApproval !== resolved.decision.requiresApproval
    ) {
      throw new PlatformAuthorizationError(
        "The execution is no longer authorized at the dispatch boundary."
      );
    }
  }

  /**
   * Immutably binds MCP initialize metadata outside the authorization document.
   * The first successful writer wins; later callers can read but never replace
   * the attribution, so a reused token cannot rewrite historical identity.
   */
  async bindSessionAttribution(
    tenantId: string,
    sessionId: string,
    input: unknown
  ): Promise<SessionClientInfo> {
    const clientInfo = sessionClientInfoSchema.parse(input);
    const session = await this.store.get<GatewaySession>(
      tenantId,
      "sessions",
      sessionId
    );
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
      throw new PlatformAuthorizationError(
        "The MCP session is no longer eligible for client attribution."
      );
    }
    const cacheKey = this.#sessionAttributionKey(tenantId, sessionId);
    const existing = await this.store.get<SessionAttribution>(
      tenantId,
      "session-attributions",
      sessionId
    );
    if (existing) {
      const parsed = sessionClientInfoSchema.parse(existing.clientInfo);
      this.#sessionAttributionCache.set(cacheKey, parsed);
      return parsed;
    }
    const now = nowIso();
    const attribution: SessionAttribution = {
      id: sessionId,
      tenantId,
      sessionId,
      clientInfo,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    try {
      await this.store.put(tenantId, "session-attributions", attribution, {
        expectedRevision: null,
      });
      this.#sessionAttributionCache.set(cacheKey, clientInfo);
      return clientInfo;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const winner = await this.store.get<SessionAttribution>(
        tenantId,
        "session-attributions",
        sessionId
      );
      if (!winner) {
        throw new PlatformConflictError(
          "Session attribution remained contended; the first writer was not readable."
        );
      }
      const parsed = sessionClientInfoSchema.parse(winner.clientInfo);
      this.#sessionAttributionCache.set(cacheKey, parsed);
      return parsed;
    }
  }

  async getSessionAttribution(tenantId: string, sessionId: string) {
    const cacheKey = this.#sessionAttributionKey(tenantId, sessionId);
    const cached = this.#sessionAttributionCache.get(cacheKey);
    if (cached) return cached;
    try {
      const attribution = await this.store.get<SessionAttribution>(
        tenantId,
        "session-attributions",
        sessionId
      );
      const parsed = attribution
        ? sessionClientInfoSchema.safeParse(attribution.clientInfo)
        : null;
      if (!parsed?.success) return null;
      this.#sessionAttributionCache.set(cacheKey, parsed.data);
      return parsed.data;
    } catch {
      // Attribution is analytics-only and must never make authorization fail.
      return null;
    }
  }

  async createSession(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string,
    gatewayOrigin: string,
    oauthGrantId?: string
  ) {
    const parsed = createSessionInputSchema.parse(input);
    const [composition, authority, existingSessions, quotas] = await Promise.all([
      this.store.get<Composition>(tenantId, "compositions", parsed.compositionId),
      this.getAuthority(tenantId),
      this.#listAll<GatewaySession>(tenantId, "sessions"),
      this.#quotaLimitsFor(tenantId),
    ]);
    if (!composition) throw new PlatformNotFoundError("Composition");
    if (authority.frozen) {
      throw new PlatformAuthorizationError(
        "New MCP credentials cannot be issued while the tenant is frozen."
      );
    }
    if (composition.status !== "published") {
      throw new PlatformValidationError(
        "Gateway sessions can be issued only for published compositions."
      );
    }
    const environment = await this.store.get<Environment>(
      tenantId,
      "environments",
      parsed.environmentId
    );
    if (!environment) {
      throw new PlatformValidationError("The session environment does not exist.");
    }
    if (composition.environmentId !== parsed.environmentId) {
      throw new PlatformValidationError(
        "Session environment does not match the composition environment."
      );
    }
    const id = randomId("session");
    const secret = crypto.randomUUID().replaceAll("-", "");
    const token = `lmcp_v1.${encodeTenantTokenPart(tenantId)}.${id}.${secret}`;
    const now = nowIso();
    const subject = await this.buildSubject(tenantId, parsed.subject);
    const session: GatewaySession = {
      id,
      tenantId,
      compositionId: composition.id,
      environmentId: parsed.environmentId,
      subject,
      authorizationEpoch: authority.authorizationEpoch,
      ...(oauthGrantId ? { oauthGrantId } : {}),
      tokenHash: await sha256(token),
      approvedClients: parsed.approvedClients,
      expiresAt: new Date(Date.now() + parsed.expiresInSeconds * 1_000).toISOString(),
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const replacedSessionId = oauthGrantId
      ? (await this.store.get<OAuthGrant>(tenantId, "oauth-grants", oauthGrantId))
          ?.currentAccessSessionId
      : undefined;
    const activeSessionIds = existingSessions
      .filter(
        (entry) =>
          !entry.revokedAt &&
          Date.parse(entry.expiresAt) > Date.now() &&
          entry.id !== replacedSessionId
      )
      .map((entry) => entry.id);
    await this.#reserveResourceQuota(
      tenantId,
      "activeSessions",
      session.id,
      activeSessionIds,
      quotas.activeSessions
    );
    let persisted = false;
    try {
      await this.store.put(tenantId, "sessions", session, {
        expectedRevision: null,
      });
      persisted = true;
    } finally {
      if (!persisted) {
        await this.#releaseResourceQuotaReservation(
          tenantId,
          "activeSessions",
          session.id
        );
      }
    }
    const auditEvent = await this.appendAudit(tenantId, {
      type: "session.issued",
      actorId,
      action: "issue",
      targetType: "gateway-session",
      targetId: session.id,
      outcome: "succeeded",
      requestId,
      explanation: `Issued a scoped session for ${session.subject.id}.`,
      metadata: { expiresAt: session.expiresAt, roles: session.subject.roles },
    });
    this.recordSessionUsage(session, {
      eventType: "session_minted",
      status: "succeeded",
      requestId,
      auditReceipt: auditEvent,
    });
    await this.recordActivationEvent(tenantId, "session_issued", actorId, {
      compositionId: session.compositionId,
      sessionId: session.id,
    });
    return {
      session: { ...session, tokenHash: "[REDACTED]" },
      token,
      endpoint: `${gatewayOrigin.replace(/\/$/, "")}/mcp/${tenantId}/${composition.slug}`,
    };
  }

  async authenticateSession(tenantId: string, token: string) {
    const match =
      /^lmcp_v1\.([A-Za-z0-9_-]+)\.(session_[a-f0-9]{32})\.[a-f0-9]{32}$/.exec(token);
    if (!match?.[1] || !match[2]) return null;
    if (decodeTenantTokenPart(match[1]) !== tenantId) return null;
    const [session, authority, clientInfo] = await Promise.all([
      this.store.get<GatewaySession>(tenantId, "sessions", match[2]),
      this.getAuthority(tenantId),
      this.getSessionAttribution(tenantId, match[2]),
    ]);
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
      return null;
    }
    if (
      authority.frozen ||
      (session.authorizationEpoch ?? 0) !== authority.authorizationEpoch
    ) {
      return null;
    }
    const tokenHash = await sha256(token);
    if (!safeEqual(tokenHash, session.tokenHash)) return null;
    if (session.oauthGrantId) {
      const grant = await this.store.get<OAuthGrant>(
        tenantId,
        "oauth-grants",
        session.oauthGrantId
      );
      if (
        !grant ||
        grant.revokedAt ||
        grant.authorizationEpoch !== authority.authorizationEpoch ||
        grant.currentAccessSessionId !== session.id
      ) {
        return null;
      }
    }
    return {
      ...session,
      ...(clientInfo ? { analyticsClientInfo: clientInfo } : {}),
    } satisfies AttributedGatewaySession;
  }

  async #markSessionRevoked(
    tenantId: string,
    sessionId: string,
    context?: { actorId: string; requestId: string; reason: string }
  ) {
    const [session, clientInfo] = await Promise.all([
      this.store.get<GatewaySession>(tenantId, "sessions", sessionId),
      this.getSessionAttribution(tenantId, sessionId),
    ]);
    if (!session || session.revokedAt) return false;
    const now = nowIso();
    try {
      const revoked = await this.store.put(
        tenantId,
        "sessions",
        {
          ...session,
          revokedAt: now,
          updatedAt: now,
          revision: session.revision + 1,
        },
        { expectedRevision: session.revision }
      );
      if (context) {
        const auditEvent = await this.appendAudit(tenantId, {
          type: "session.revoked",
          actorId: context.actorId,
          action: "revoke",
          targetType: "gateway-session",
          targetId: session.id,
          outcome: "succeeded",
          requestId: context.requestId,
          explanation: context.reason,
          metadata: { subjectId: session.subject.id },
        });
        this.recordSessionUsage(revoked, {
          eventType: "session_revoked",
          status: "succeeded",
          requestId: context.requestId,
          ...(clientInfo ? { clientInfo } : {}),
          auditReceipt: auditEvent,
        });
      }
      return true;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      return false;
    }
  }

  async #revokeOAuthGrant(
    tenantId: string,
    grantId: string,
    context?: { actorId: string; requestId: string; reason: string }
  ) {
    let revoked: OAuthGrant | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const grant = await this.store.get<OAuthGrant>(tenantId, "oauth-grants", grantId);
      if (!grant) return false;
      if (grant.revokedAt) {
        revoked = grant;
        break;
      }
      const now = nowIso();
      const next: OAuthGrant = {
        ...grant,
        revokedAt: now,
        updatedAt: now,
        revision: grant.revision + 1,
      };
      try {
        revoked = await this.store.put(tenantId, "oauth-grants", next, {
          expectedRevision: grant.revision,
        });
        break;
      } catch (error) {
        if (error instanceof StoreConflictError && attempt < 7) continue;
        throw error;
      }
    }
    if (!revoked) {
      throw new PlatformConflictError("OAuth grant remained contended during revoke.");
    }

    const refresh = await this.store.get<OAuthRefreshToken>(
      tenantId,
      "oauth-refresh-tokens",
      revoked.currentRefreshTokenId
    );
    if (refresh && !refresh.revokedAt) {
      const now = nowIso();
      await this.store
        .put(
          tenantId,
          "oauth-refresh-tokens",
          {
            ...refresh,
            revokedAt: now,
            updatedAt: now,
            revision: refresh.revision + 1,
          },
          { expectedRevision: refresh.revision }
        )
        .catch((error) => {
          if (!(error instanceof StoreConflictError)) throw error;
          return refresh;
        });
    }
    await this.#markSessionRevoked(tenantId, revoked.currentAccessSessionId, context);
    return true;
  }

  async revokeOAuthToken(
    tenantId: string,
    clientId: string,
    token: string,
    requestId: string
  ) {
    if (token.startsWith("lmcp_refresh_")) {
      const tokenHash = await sha256(token);
      const refresh = await this.store.get<OAuthRefreshToken>(
        tenantId,
        "oauth-refresh-tokens",
        `refreshtoken_${tokenHash}`
      );
      if (
        !refresh ||
        refresh.clientId !== clientId ||
        !safeEqual(refresh.tokenHash, tokenHash)
      ) {
        return false;
      }
      await this.#revokeOAuthGrant(tenantId, refresh.grantId, {
        actorId: refresh.subject.id,
        requestId,
        reason: "OAuth token revocation invalidated the access session.",
      });
      return true;
    }
    const session = await this.authenticateSession(tenantId, token);
    if (!session || !session.approvedClients.includes(clientId)) return false;
    await this.revokeSession(tenantId, session.id, session.subject.id, requestId);
    return true;
  }

  async revokeSession(
    tenantId: string,
    sessionId: string,
    actorId: string,
    requestId: string,
    canManageOthers = false
  ) {
    const [session, clientInfo] = await Promise.all([
      this.store.get<GatewaySession>(tenantId, "sessions", sessionId),
      this.getSessionAttribution(tenantId, sessionId),
    ]);
    if (!session) throw new PlatformNotFoundError("Gateway session");
    if (session.subject.id !== actorId && !canManageOthers) {
      throw new PlatformAuthorizationError(
        "A session may be revoked only by its subject or an organization administrator."
      );
    }
    const wasActive = !session.revokedAt;
    if (session.oauthGrantId) {
      await this.#revokeOAuthGrant(tenantId, session.oauthGrantId);
    }
    const current =
      (await this.store.get<GatewaySession>(tenantId, "sessions", session.id)) ??
      session;
    if (current.revokedAt) {
      if (wasActive) {
        const auditEvent = await this.appendAudit(tenantId, {
          type: "session.revoked",
          actorId,
          action: "revoke",
          targetType: "gateway-session",
          targetId: session.id,
          outcome: "succeeded",
          requestId,
          explanation: `Revoked the scoped session for ${session.subject.id}.`,
          metadata: { subjectId: session.subject.id },
        });
        this.recordSessionUsage(current, {
          eventType: "session_revoked",
          status: "succeeded",
          requestId,
          ...(clientInfo ? { clientInfo } : {}),
          auditReceipt: auditEvent,
        });
      }
      return { ...current, tokenHash: "[REDACTED]" as const };
    }
    const now = nowIso();
    const revoked: GatewaySession = {
      ...current,
      revokedAt: now,
      updatedAt: now,
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "sessions", revoked, {
      expectedRevision: current.revision,
    });
    const auditEvent = await this.appendAudit(tenantId, {
      type: "session.revoked",
      actorId,
      action: "revoke",
      targetType: "gateway-session",
      targetId: session.id,
      outcome: "succeeded",
      requestId,
      explanation: `Revoked the scoped session for ${session.subject.id}.`,
      metadata: { subjectId: session.subject.id },
    });
    this.recordSessionUsage(revoked, {
      eventType: "session_revoked",
      status: "succeeded",
      requestId,
      ...(clientInfo ? { clientInfo } : {}),
      auditReceipt: auditEvent,
    });
    return { ...revoked, tokenHash: "[REDACTED]" as const };
  }

  async #approvalBinding(
    tenantId: string,
    session: GatewaySession,
    resolved: ResolvedTool,
    args: unknown
  ): Promise<ApprovalBinding> {
    if (
      session.tenantId !== tenantId ||
      session.compositionId !== resolved.composition.id ||
      !resolved.decision.requiresApproval ||
      !resolved.decision.policyId ||
      !resolved.decision.policyVersion
    ) {
      throw new PlatformConflictError(
        "The approval execution context is incomplete or no longer current."
      );
    }

    const [storedSession, authority, composition, server, policy] = await Promise.all([
      this.store.get<GatewaySession>(tenantId, "sessions", session.id),
      this.getAuthority(tenantId),
      this.store.get<Composition>(tenantId, "compositions", session.compositionId),
      this.store.get<McpServerDefinition>(tenantId, "servers", resolved.server.id),
      this.store.get<Policy>(tenantId, "policies", resolved.decision.policyId),
    ]);
    if (
      !storedSession ||
      storedSession.revision !== session.revision ||
      storedSession.revokedAt ||
      Date.parse(storedSession.expiresAt) <= Date.now() ||
      storedSession.subject.id !== session.subject.id
    ) {
      throw new PlatformAuthorizationError(
        "The MCP session changed or expired before approval processing."
      );
    }
    const authorizationEpoch = storedSession.authorizationEpoch ?? 0;
    if (authority.frozen || authorizationEpoch !== authority.authorizationEpoch) {
      throw new PlatformAuthorizationError(
        "The MCP session authorization epoch is no longer current."
      );
    }
    if (
      !composition ||
      composition.status !== "published" ||
      composition.id !== resolved.composition.id ||
      composition.version !== resolved.composition.version
    ) {
      throw new PlatformConflictError(
        "The composition changed before approval processing; resolve the tool again."
      );
    }
    const namespace = resolved.canonicalName.slice(
      0,
      resolved.canonicalName.indexOf(".")
    );
    const member = composition.members.find(
      (entry) =>
        entry.enabled &&
        entry.namespace === namespace &&
        entry.serverId === resolved.server.id
    );
    if (
      !server ||
      !member ||
      member.pinnedVersion !== server.version ||
      server.version !== resolved.server.version
    ) {
      throw new PlatformConflictError(
        "The upstream server changed before approval processing; resolve the tool again."
      );
    }
    if (server.status !== "healthy" || server.driftStatus === "quarantined") {
      throw new PlatformAuthorizationError(
        "Approvals cannot authorize an unhealthy, unprobed, or quarantined upstream server."
      );
    }
    if (
      server.revision !== resolved.server.revision ||
      !server.tools.some((tool) => tool.name === resolved.upstreamName)
    ) {
      throw new PlatformConflictError(
        "The upstream server changed before approval processing; resolve the tool again."
      );
    }
    if (
      authority.activePolicyId !== resolved.decision.policyId ||
      !policy ||
      policy.version !== resolved.decision.policyVersion
    ) {
      throw new PlatformConflictError(
        "The authorization policy changed before approval processing."
      );
    }

    const sortedTools = (tools: ToolDefinition[]) =>
      [...tools].sort((left, right) => left.name.localeCompare(right.name));
    const executionConfig = (definition: McpServerDefinition) => ({
      transport: definition.transport,
      endpoint: definition.endpoint ?? null,
      command: definition.command ?? null,
    });
    const [
      argumentsHash,
      serverSchemaHash,
      resolvedServerSchemaHash,
      serverExecutionConfigHash,
      resolvedServerExecutionConfigHash,
    ] = await Promise.all([
      sha256(canonicalJson(args)),
      sha256(canonicalJson(sortedTools(server.tools))),
      sha256(canonicalJson(sortedTools(resolved.server.tools))),
      sha256(canonicalJson(executionConfig(server))),
      sha256(canonicalJson(executionConfig(resolved.server))),
    ]);
    if (
      serverSchemaHash !== resolvedServerSchemaHash ||
      serverExecutionConfigHash !== resolvedServerExecutionConfigHash
    ) {
      throw new PlatformConflictError(
        "The upstream schema or execution configuration changed before approval processing."
      );
    }
    const context = {
      compositionId: composition.id,
      compositionVersion: composition.version,
      sessionId: storedSession.id,
      serverId: server.id,
      serverVersion: server.version,
      serverRevision: server.revision,
      serverSchemaHash,
      serverExecutionConfigHash,
      policyId: policy.id,
      policyVersion: policy.version,
      authorizationEpoch,
      toolName: resolved.canonicalName,
      argumentsHash,
      requestedBy: storedSession.subject.id,
      matchedRuleIds: resolved.decision.matchedRuleIds.slice(0, 16),
    };
    const [slotHash, fingerprint] = await Promise.all([
      sha256(
        canonicalJson({
          tenantId,
          sessionId: storedSession.id,
          toolName: resolved.canonicalName,
          argumentsHash,
        })
      ),
      sha256(canonicalJson(context)),
    ]);
    return { id: `approval_${slotHash}`, ...context, fingerprint };
  }

  #approvalMatchesBinding(approval: ApprovalRequest, binding: ApprovalBinding) {
    return (
      approval.id === binding.id &&
      approval.compositionId === binding.compositionId &&
      approval.compositionVersion === binding.compositionVersion &&
      approval.sessionId === binding.sessionId &&
      approval.serverId === binding.serverId &&
      approval.serverVersion === binding.serverVersion &&
      approval.serverRevision === binding.serverRevision &&
      approval.serverSchemaHash === binding.serverSchemaHash &&
      approval.serverExecutionConfigHash === binding.serverExecutionConfigHash &&
      approval.policyId === binding.policyId &&
      approval.policyVersion === binding.policyVersion &&
      approval.authorizationEpoch === binding.authorizationEpoch &&
      approval.toolName === binding.toolName &&
      approval.argumentsHash === binding.argumentsHash &&
      approval.requestedBy === binding.requestedBy &&
      (approval.matchedRuleIds ?? []).join("\u0000") ===
        binding.matchedRuleIds.join("\u0000") &&
      approval.fingerprint === binding.fingerprint
    );
  }

  async createApprovalWithState(
    tenantId: string,
    session: GatewaySession,
    resolved: ResolvedTool,
    args: unknown,
    requestId: string
  ) {
    const binding = await this.#approvalBinding(tenantId, session, resolved, args);
    let approval: ApprovalRequest | null = null;
    let previousGeneration: number | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.store.get<ApprovalRequest>(
        tenantId,
        "approvals",
        binding.id
      );
      if (
        current &&
        this.#approvalMatchesBinding(current, binding) &&
        current.status === "pending" &&
        Date.parse(current.expiresAt) > Date.now()
      ) {
        return { approval: current, created: false as const };
      }
      const now = nowIso();
      previousGeneration = current?.generation ?? null;
      approval = {
        ...binding,
        tenantId,
        generation: (current?.generation ?? 0) + 1,
        encryptedArgumentsReference: `hash-only://${binding.argumentsHash}`,
        status: "pending",
        decidedBy: null,
        decisionReason: null,
        approvedAt: null,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        createdAt: now,
        updatedAt: now,
        revision: (current?.revision ?? 0) + 1,
      };
      try {
        approval = await this.store.put(tenantId, "approvals", approval, {
          expectedRevision: current?.revision ?? null,
        });
        break;
      } catch (error) {
        if (error instanceof StoreConflictError && attempt < 7) continue;
        throw error;
      }
    }
    if (!approval) {
      throw new PlatformConflictError(
        "The approval slot remained contended; retry the request."
      );
    }
    const auditEvent = await this.appendAudit(tenantId, {
      type: "approval.requested",
      actorId: session.subject.id,
      action: "request-approval",
      targetType: "tool",
      targetId: resolved.canonicalName,
      outcome: "pending",
      requestId,
      policyVersion: resolved.decision.policyVersion ?? undefined,
      explanation: resolved.decision.explanation,
      metadata: {
        approvalId: approval.id,
        argumentsHash: approval.argumentsHash,
        fingerprint: approval.fingerprint,
        generation: approval.generation,
        previousGeneration,
      },
    });
    this.recordSessionUsage(session, {
      eventType: "approval_required",
      status: "pending",
      requestId,
      namespace: resolved.canonicalName.slice(0, resolved.canonicalName.indexOf(".")),
      serverId: resolved.server.id,
      tool: resolved.canonicalName,
      aliasUsed: resolved.aliasUsed,
      risk: resolved.tool.risk,
      decisionEffect: resolved.decision.effect,
      matchedRuleIds: resolved.decision.matchedRuleIds,
      ...(resolved.decision.policyId ? { policyId: resolved.decision.policyId } : {}),
      ...(resolved.decision.policyVersion
        ? { policyVersion: resolved.decision.policyVersion }
        : {}),
      approvalId: approval.id,
      auditReceipt: auditEvent,
    });
    if (this.#approvalNotifier) {
      try {
        await this.#approvalNotifier({
          tenantId,
          approvalId: approval.id,
          toolName: approval.toolName,
          requestedBy: approval.requestedBy,
          expiresAt: approval.expiresAt,
        });
        await this.appendAudit(tenantId, {
          type: "approval.notification-sent",
          actorId: "system",
          actorType: "system",
          action: "notify",
          targetType: "approval",
          targetId: approval.id,
          outcome: "succeeded",
          requestId,
          explanation: "Sent the configured approval notification without arguments.",
          metadata: {
            fingerprint: approval.fingerprint,
            generation: approval.generation,
          },
        });
      } catch (error) {
        await this.appendAudit(tenantId, {
          type: "approval.notification-failed",
          actorId: "system",
          actorType: "system",
          action: "notify",
          targetType: "approval",
          targetId: approval.id,
          outcome: "failed",
          requestId,
          explanation: "The approval was recorded, but notification delivery failed.",
          metadata: {
            errorClass: error instanceof Error ? error.name : "UnknownError",
            fingerprint: approval.fingerprint,
            generation: approval.generation,
          },
        });
      }
    }
    return { approval, created: true as const };
  }

  async createApproval(
    tenantId: string,
    session: GatewaySession,
    resolved: ResolvedTool,
    args: unknown,
    requestId: string
  ) {
    return (
      await this.createApprovalWithState(tenantId, session, resolved, args, requestId)
    ).approval;
  }

  async decideApproval(
    tenantId: string,
    approvalId: string,
    input: unknown,
    approver: Subject,
    requestId: string
  ) {
    const parsed = approvalDecisionInputSchema.parse(input);
    if (!approver.roles.some((role) => ["owner", "admin", "approver"].includes(role))) {
      throw new PlatformAuthorizationError(
        "An owner, administrator, or approver role is required."
      );
    }
    const current = await this.store.get<ApprovalRequest>(
      tenantId,
      "approvals",
      approvalId
    );
    if (!current) throw new PlatformNotFoundError("Approval request");
    if (
      current.generation !== parsed.generation ||
      current.fingerprint !== parsed.fingerprint
    ) {
      throw new PlatformConflictError(
        "The approval generation changed; refresh before recording a decision."
      );
    }
    if (current.requestedBy === approver.id) {
      throw new PlatformAuthorizationError(
        "The requester cannot approve or deny their own action."
      );
    }
    if (current.status !== "pending") {
      throw new PlatformConflictError(
        `Approval ${approvalId} is already ${current.status}.`
      );
    }
    const now = nowIso();
    if (Date.parse(current.expiresAt) <= Date.now()) {
      const expired: ApprovalRequest = {
        ...current,
        status: "expired",
        updatedAt: now,
        revision: current.revision + 1,
      };
      await this.store.put(tenantId, "approvals", expired, {
        expectedRevision: current.revision,
      });
      throw new PlatformConflictError(`Approval ${approvalId} has expired.`);
    }
    const decided: ApprovalRequest = {
      ...current,
      status: parsed.decision,
      decidedBy: approver.id,
      decisionReason: parsed.reason,
      approvedAt: parsed.decision === "approved" ? now : null,
      updatedAt: now,
      revision: current.revision + 1,
    };
    await this.store.put(tenantId, "approvals", decided, {
      expectedRevision: current.revision,
    });
    const auditEvent = await this.appendAudit(tenantId, {
      type: `approval.${parsed.decision}`,
      actorId: approver.id,
      action: parsed.decision === "approved" ? "approve" : "deny",
      targetType: "approval",
      targetId: approvalId,
      outcome: parsed.decision === "approved" ? "succeeded" : "denied",
      requestId,
      explanation: parsed.reason,
      metadata: {
        requester: current.requestedBy,
        toolName: current.toolName,
        argumentsHash: current.argumentsHash,
        fingerprint: current.fingerprint,
        generation: current.generation,
      },
    });
    void Promise.all([
      this.store.get<GatewaySession>(tenantId, "sessions", current.sessionId),
      this.getSessionAttribution(tenantId, current.sessionId),
    ])
      .then(([approvalSession, clientInfo]) => {
        if (!approvalSession) return;
        this.recordSessionUsage(approvalSession, {
          eventType: "approval_decided",
          status: parsed.decision === "approved" ? "succeeded" : "denied",
          requestId,
          namespace: current.toolName.slice(0, current.toolName.indexOf(".")),
          serverId: current.serverId,
          tool: current.toolName,
          decisionEffect: "require-approval",
          matchedRuleIds: current.matchedRuleIds ?? [],
          policyId: current.policyId,
          policyVersion: current.policyVersion,
          approvalId: current.id,
          approvalLatencyMs: Math.max(
            0,
            Date.parse(now) - Date.parse(current.createdAt)
          ),
          ...(clientInfo ? { clientInfo } : {}),
          auditReceipt: auditEvent,
        });
      })
      .catch(() => {
        // Analytics enrichment must never change a committed approval decision.
      });
    return decided;
  }

  async consumeApprovalForCall(
    tenantId: string,
    session: GatewaySession,
    resolved: ResolvedTool,
    args: unknown,
    requestId: string
  ): Promise<
    | { state: "none" }
    | { state: "pending" | "denied"; approval: ApprovalRequest }
    | { state: "approved"; approval: ApprovalRequest }
  > {
    const binding = await this.#approvalBinding(tenantId, session, resolved, args);
    const candidate = await this.store.get<ApprovalRequest>(
      tenantId,
      "approvals",
      binding.id
    );
    if (!candidate || !this.#approvalMatchesBinding(candidate, binding)) {
      return { state: "none" };
    }
    if (Date.parse(candidate.expiresAt) <= Date.now()) {
      if (candidate.status !== "expired") {
        try {
          await this.store.put(
            tenantId,
            "approvals",
            {
              ...candidate,
              status: "expired",
              updatedAt: nowIso(),
              revision: candidate.revision + 1,
            },
            { expectedRevision: candidate.revision }
          );
        } catch (error) {
          if (!(error instanceof StoreConflictError)) throw error;
        }
      }
      return { state: "none" };
    }
    if (candidate.status === "pending") {
      return { state: "pending", approval: candidate };
    }
    if (candidate.status === "denied") {
      return { state: "denied", approval: candidate };
    }
    if (candidate.status === "approved" && !candidate.consumedAt) {
      const consumed: ApprovalRequest = {
        ...candidate,
        consumedAt: nowIso(),
        updatedAt: nowIso(),
        revision: candidate.revision + 1,
      };
      try {
        await this.store.put(tenantId, "approvals", consumed, {
          expectedRevision: candidate.revision,
        });
      } catch (error) {
        if (error instanceof StoreConflictError) {
          throw new PlatformConflictError(
            "This approval was already consumed by another invocation."
          );
        }
        throw error;
      }
      await this.appendAudit(tenantId, {
        type: "approval.consumed",
        actorId: session.subject.id,
        action: "consume",
        targetType: "approval",
        targetId: candidate.id,
        outcome: "succeeded",
        requestId,
        explanation: "Consumed an exact-context approval before upstream dispatch.",
        metadata: {
          toolName: candidate.toolName,
          argumentsHash: candidate.argumentsHash,
          fingerprint: candidate.fingerprint,
          generation: candidate.generation,
        },
      });
      return { state: "approved", approval: consumed };
    }
    return { state: "none" };
  }

  async appendAudit(tenantId: string, input: AuditInput) {
    const previous = this.#auditQueues.get(tenantId) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => {}).then(() => gate);
    this.#auditQueues.set(tenantId, queued);
    await previous.catch(() => {});

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const head = await this.store.get<AuditHead>(tenantId, "audit-heads", "head");
        const sequence = (head?.sequence ?? 0) + 1;
        const createdAt = nowIso();
        const id = `audit_${sequence.toString().padStart(12, "0")}_${crypto
          .randomUUID()
          .slice(0, 8)}`;
        const unsigned = {
          id,
          tenantId,
          sequence,
          type: input.type,
          actorId: input.actorId,
          actorType: input.actorType ?? "user",
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          outcome: input.outcome,
          requestId: input.requestId,
          ...(input.policyVersion ? { policyVersion: input.policyVersion } : {}),
          explanation: input.explanation,
          metadata: redactSecrets(input.metadata ?? {}) as Record<string, unknown>,
          previousHash: head?.hash ?? null,
          createdAt,
        };
        const event: AuditEvent = {
          ...unsigned,
          hash: await sha256(canonicalJson(unsigned)),
        };
        await this.store.put(tenantId, "audit-events", event, {
          expectedRevision: null,
        });
        const nextHead: AuditHead = {
          id: "head",
          tenantId,
          sequence,
          hash: event.hash,
          revision: (head?.revision ?? 0) + 1,
          updatedAt: createdAt,
        };
        try {
          await this.store.put(tenantId, "audit-heads", nextHead, {
            expectedRevision: head?.revision ?? null,
          });
          return event;
        } catch (error) {
          await this.store.delete(tenantId, "audit-events", event.id);
          if (error instanceof StoreConflictError && attempt < 4) continue;
          throw error;
        }
      }
      throw new StoreConflictError("Audit head remained contended after retries.");
    } finally {
      release();
      if (this.#auditQueues.get(tenantId) === queued) {
        this.#auditQueues.delete(tenantId);
      }
    }
  }

  async exportTenant(tenantId: string): Promise<PlatformExport> {
    const [
      organization,
      environments,
      servers,
      compositions,
      policies,
      roles,
      identityProviders,
    ] = await Promise.all([
      this.store.get<Organization>(tenantId, "organizations", tenantId),
      this.listEnvironments(tenantId),
      this.listServers(tenantId),
      this.listCompositions(tenantId),
      this.listPolicies(tenantId),
      this.listRoles(tenantId),
      this.listIdentityProviders(tenantId, true),
    ]);
    if (!organization) throw new PlatformNotFoundError("Organization");
    return {
      format: "litemcp.portable.v1",
      exportedAt: nowIso(),
      tenantId,
      organization,
      environments,
      servers: servers.map((server) => ({
        ...server,
        endpoint: endpointForDisclosure(server.endpoint),
        command: server.transport === "stdio" ? ["<redacted-command>"] : server.command,
      })),
      compositions,
      policies,
      roles,
      identityProviders: identityProviders.map((provider) => ({
        ...provider,
        clientId: "<configure-after-import>",
        secretReference: "<configure-after-import>",
      })),
      secretsIncluded: false,
    };
  }

  async importTenant(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    // This entire preflight intentionally runs before the first store read or write.
    // Apart from producing clearer failures, that guarantees malformed input cannot
    // erase the safe bootstrap configuration that makes imports possible.
    assertPortableNestedFields(input);
    const parsed = portableImportSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.length ? `${issue.path.map(String).join(".")}: ` : "";
      throw new PlatformValidationError(
        `Portable import is invalid. ${path}${issue?.message ?? "Schema validation failed."}`
      );
    }
    const value: ParsedPortableImport = parsed.data;
    const sourceTenantId = value.tenantId ?? value.organization.tenantId;
    if (
      value.organization.id !== sourceTenantId ||
      value.organization.tenantId !== sourceTenantId
    ) {
      throw new PlatformValidationError(
        "Portable organization identity must match the source tenant boundary."
      );
    }
    for (const [label, documents] of [
      ["environment", value.environments],
      ["server", value.servers],
      ["composition", value.compositions],
      ["policy", value.policies],
      ["role", value.roles],
      ["identity provider", value.identityProviders],
    ] as const) {
      const crossTenant = documents.find(
        (document: { tenantId: string }) => document.tenantId !== sourceTenantId
      );
      if (crossTenant) {
        throw new PlatformValidationError(
          `Portable ${label} ${crossTenant.id} crosses the source tenant boundary.`
        );
      }
      assertUniquePortableValues(
        documents as readonly { id: string; tenantId: string }[],
        (document) => document.id,
        `${label} id`
      );
    }
    assertUniquePortableValues(
      value.environments,
      (environment) => environment.slug,
      "environment slug"
    );
    assertUniquePortableValues(value.servers, (server) => server.slug, "server slug");
    assertUniquePortableValues(
      value.compositions,
      (composition) => composition.slug,
      "composition slug"
    );
    assertUniquePortableValues(value.roles, (role) => role.slug, "role slug");
    const quotas = await this.#quotaLimitsFor(tenantId);
    if (value.servers.length > quotas.servers) {
      throw new PlatformQuotaError(
        `Portable import exceeds the configured server limit of ${quotas.servers}.`
      );
    }
    if (value.compositions.length > quotas.compositions) {
      throw new PlatformQuotaError(
        `Portable import exceeds the configured composition limit of ${quotas.compositions}.`
      );
    }

    const roleSlugs = new Set(value.roles.map((role) => role.slug));
    for (const requiredRole of ["owner", "admin", "member"] as const) {
      const role = value.roles.find((candidate) => candidate.slug === requiredRole);
      if (!role?.builtin) {
        throw new PlatformValidationError(
          `Portable import must declare the built-in ${requiredRole} role.`
        );
      }
    }

    const normalizedEndpoints = new Map<string, string>();
    for (const server of value.servers) {
      assertUniquePortableValues(
        server.tools,
        (tool) => tool.name,
        `tool name on server ${server.id}`
      );
      if (server.transport === "streamable-http" || server.transport === "legacy-sse") {
        if (!server.endpoint || server.command !== undefined) {
          throw new PlatformValidationError(
            `Remote server ${server.id} must contain an endpoint and no command.`
          );
        }
        normalizedEndpoints.set(server.id, validateEndpointForStorage(server.endpoint));
      } else if (server.transport === "stdio") {
        if (
          server.endpoint !== undefined ||
          server.command?.length !== 1 ||
          server.command[0] !== "<redacted-command>"
        ) {
          throw new PlatformValidationError(
            `Portable stdio server ${server.id} must contain only the redacted command placeholder.`
          );
        }
      } else if (server.endpoint !== undefined || server.command !== undefined) {
        throw new PlatformValidationError(
          `Built-in server ${server.id} cannot contain an endpoint or command.`
        );
      }
      if (server.schemaHash) {
        const expectedSchemaHash = await sha256(
          canonicalJson(
            [...server.tools].sort((left, right) => left.name.localeCompare(right.name))
          )
        );
        if (!safeEqual(server.schemaHash, expectedSchemaHash)) {
          throw new PlatformValidationError(
            `Server ${server.id} has a tool schema hash that does not match its imported tools.`
          );
        }
      }
    }

    const environmentsById = new Map(
      value.environments.map((environment) => [environment.id, environment])
    );
    const serversById = new Map(value.servers.map((server) => [server.id, server]));
    const exposedToolNames = new Set<string>();
    for (const composition of value.compositions) {
      if (!environmentsById.has(composition.environmentId)) {
        throw new PlatformValidationError(
          `Composition ${composition.id} references unknown environment ${composition.environmentId}.`
        );
      }
      if (composition.status === "published" && composition.members.length === 0) {
        throw new PlatformValidationError(
          `Published composition ${composition.id} must contain at least one server.`
        );
      }
      assertUniquePortableValues(
        composition.members,
        (member) => member.namespace,
        `member namespace in composition ${composition.id}`
      );
      const targets = new Set<string>();
      for (const member of composition.members) {
        const server = serversById.get(member.serverId);
        if (!server) {
          throw new PlatformValidationError(
            `Composition ${composition.id} references unknown server ${member.serverId}.`
          );
        }
        if (server.version !== member.pinnedVersion) {
          throw new PlatformValidationError(
            `Composition ${composition.id} does not pin server ${member.serverId} at its imported version.`
          );
        }
        if (server.driftStatus === "quarantined") {
          throw new PlatformValidationError(
            `Composition ${composition.id} references quarantined server ${member.serverId}.`
          );
        }
        for (const tool of server.tools) {
          const toolName = `${member.namespace}.${tool.name}`;
          targets.add(toolName);
          exposedToolNames.add(toolName);
        }
      }
      const aliases = new Set<string>();
      for (const alias of composition.aliases) {
        if (!targets.has(alias.target)) {
          throw new PlatformValidationError(
            `Composition ${composition.id} alias ${alias.alias} references unknown target ${alias.target}.`
          );
        }
        if (targets.has(alias.alias) || aliases.has(alias.alias)) {
          throw new PlatformValidationError(
            `Composition ${composition.id} alias ${alias.alias} collides with another exposed tool.`
          );
        }
        aliases.add(alias.alias);
        exposedToolNames.add(alias.alias);
      }
    }

    const activePolicies = value.policies.filter(
      (policy) => policy.status === "active"
    );
    if (activePolicies.length > 1) {
      throw new PlatformValidationError(
        "Portable import may contain at most one active policy."
      );
    }
    for (const policy of value.policies) {
      assertUniquePortableValues(
        policy.rules,
        (rule) => rule.id,
        `rule id in policy ${policy.id}`
      );
      for (const rule of policy.rules) {
        for (const role of rule.roles ?? []) {
          if (!roleSlugs.has(role)) {
            throw new PlatformValidationError(
              `Policy ${policy.id} references unknown role ${role}.`
            );
          }
        }
        for (const selector of rule.tools ?? []) {
          if (selector === "*") continue;
          const escaped = selector.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
          const matcher = new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
          if (![...exposedToolNames].some((toolName) => matcher.test(toolName))) {
            throw new PlatformValidationError(
              `Policy ${policy.id} references tool selector ${selector}, which matches no imported composition tool.`
            );
          }
        }
      }
    }

    for (const provider of value.identityProviders) {
      if (
        provider.clientId !== "<configure-after-import>" ||
        provider.secretReference !== "<configure-after-import>"
      ) {
        throw new PlatformValidationError(
          `Identity provider ${provider.id} contains credentials instead of portable redaction placeholders.`
        );
      }
      const issuer = new URL(provider.issuer);
      if (
        issuer.protocol !== "https:" ||
        issuer.username ||
        issuer.password ||
        issuer.search ||
        issuer.hash
      ) {
        throw new PlatformValidationError(
          `Identity provider ${provider.id} must use a credential-free HTTPS issuer URL.`
        );
      }
      const domains = provider.domains.map((domain) => domain.toLowerCase());
      if (new Set(domains).size !== domains.length) {
        throw new PlatformValidationError(
          `Identity provider ${provider.id} contains duplicate domains.`
        );
      }
      for (const mapping of provider.groupMappings) {
        if (!roleSlugs.has(mapping.role)) {
          throw new PlatformValidationError(
            `Identity provider ${provider.id} maps to unknown role ${mapping.role}.`
          );
        }
      }
    }

    const importedAt = nowIso();
    const retenant = <T extends StoredDocument>(document: T): T => ({
      ...document,
      tenantId,
      updatedAt: importedAt,
      revision: 1,
    });
    const organization = retenant<Organization>({
      ...value.organization,
      id: tenantId,
      tenantId,
    });
    const environments = value.environments.map((environment) => retenant(environment));
    const servers = value.servers.map((server) =>
      retenant<McpServerDefinition>({
        ...server,
        ...(normalizedEndpoints.has(server.id)
          ? { endpoint: normalizedEndpoints.get(server.id) }
          : {}),
        ...(server.transport === "builtin"
          ? {}
          : {
              status: "unprobed",
              driftStatus: "current",
              lastProbedAt: null,
              lastProbeError: null,
            }),
      })
    );
    const compositions = value.compositions.map((composition) => retenant(composition));
    const policies = value.policies.map((policy) => retenant(policy));
    const roles = value.roles.map((role) => retenant(role));
    const identityProviders = value.identityProviders.map((provider) =>
      retenant<IdentityProvider>({
        ...provider,
        domains: provider.domains.map((domain) => domain.toLowerCase()),
        status: "disabled",
      })
    );

    // Read the complete target snapshot only after input is proven safe. Reads are
    // deliberately direct: getAuthority() may initialize missing state as a side effect.
    const [
      existingOrganization,
      existingEnvironments,
      existingServers,
      existingCompositions,
      existingPolicies,
      existingRoles,
      existingIdentityProviders,
      existingAuthority,
      existingAssignments,
      existingSessions,
      existingApprovals,
      existingPrincipals,
      existingOAuthClients,
    ] = await Promise.all([
      this.store.get<Organization>(tenantId, "organizations", tenantId),
      this.listEnvironments(tenantId),
      this.listServers(tenantId),
      this.listCompositions(tenantId),
      this.listPolicies(tenantId),
      this.listRoles(tenantId),
      this.listIdentityProviders(tenantId, true),
      this.store.get<TenantAuthority>(tenantId, "tenant-authority", "authority"),
      this.listRoleAssignments(tenantId),
      this.store.list<GatewaySession>(tenantId, "sessions", { limit: 1_000 }),
      this.store.list<ApprovalRequest>(tenantId, "approvals", { limit: 1_000 }),
      this.store.list<ServicePrincipal>(tenantId, "service-principals", {
        limit: 1_000,
      }),
      this.store.list<OAuthClient>(tenantId, "oauth-clients", { limit: 1_000 }),
    ]);
    const targetHasCatalogData =
      existingEnvironments.length > 0 ||
      existingServers.length > 0 ||
      existingCompositions.length > 0 ||
      existingPolicies.length > 0 ||
      existingRoles.length > 0 ||
      existingIdentityProviders.length > 0 ||
      Boolean(existingAuthority) ||
      existingAssignments.length > 0 ||
      existingSessions.items.length > 0 ||
      existingApprovals.items.length > 0 ||
      existingPrincipals.items.length > 0 ||
      existingOAuthClients.items.length > 0;
    if (!existingOrganization && targetHasCatalogData) {
      throw new PlatformConflictError(
        "Portable import cannot overwrite an incomplete tenant with existing product data."
      );
    }
    if (existingOrganization) {
      const existingRoleKeys = existingRoles
        .map((role) => `${role.id}:${role.slug}:${role.builtin}:${role.revision}`)
        .sort();
      const pristineBootstrap =
        existingOrganization.revision === 1 &&
        existingServers.length === 0 &&
        existingEnvironments.length === 1 &&
        existingEnvironments[0]?.id === "env_production" &&
        existingEnvironments[0].revision === 1 &&
        existingCompositions.length === 1 &&
        existingCompositions[0]?.id === "composition_default" &&
        existingCompositions[0].status === "draft" &&
        existingCompositions[0].members.length === 0 &&
        existingCompositions[0].revision === 1 &&
        existingPolicies.length === 1 &&
        existingPolicies[0]?.id === "policy_starter" &&
        existingPolicies[0].status === "active" &&
        existingPolicies[0].revision === 1 &&
        existingRoleKeys.join("|") ===
          [
            "role_admin:admin:true:1",
            "role_member:member:true:1",
            "role_owner:owner:true:1",
          ].join("|") &&
        existingIdentityProviders.length === 0 &&
        existingAuthority?.activePolicyId === "policy_starter" &&
        existingAuthority.authorizationEpoch === 1 &&
        existingAuthority.frozen === false &&
        existingAuthority.revision === 1 &&
        existingSessions.items.length === 0 &&
        existingApprovals.items.length === 0 &&
        existingPrincipals.items.length === 0 &&
        existingOAuthClients.items.length === 0;
      if (!pristineBootstrap) {
        throw new PlatformConflictError(
          "Portable import is allowed only before the target tenant has product data."
        );
      }
      const importedRoleIds = new Set(roles.map((role) => role.id));
      const danglingAssignment = existingAssignments.find(
        (assignment) => !importedRoleIds.has(assignment.roleId)
      );
      if (danglingAssignment) {
        throw new PlatformConflictError(
          `Portable import would orphan bootstrap role assignment ${danglingAssignment.id}.`
        );
      }
    }

    const putCollection = async <T extends StoredDocument>(
      collection: Parameters<DocumentStore["put"]>[1],
      documents: T[],
      existing: T[]
    ) => {
      const existingById = new Map(existing.map((document) => [document.id, document]));
      for (const document of documents) {
        const current = existingById.get(document.id);
        await this.store.put<T>(
          tenantId,
          collection,
          {
            ...document,
            createdAt: current?.createdAt ?? document.createdAt,
            updatedAt: importedAt,
            revision: (current?.revision ?? 0) + 1,
          },
          { expectedRevision: current?.revision ?? null }
        );
      }
    };

    // Catalog dependencies are installed first. The authority pointer is the final
    // authorization commit, so an interrupted non-transactional import remains on
    // the bootstrap default-deny policy instead of enforcing a half-written graph.
    await putCollection("roles", roles, existingRoles);
    await putCollection("environments", environments, existingEnvironments);
    await putCollection("servers", servers, existingServers);
    await putCollection("compositions", compositions, existingCompositions);
    await putCollection("policies", policies, existingPolicies);
    await putCollection(
      "identity-providers",
      identityProviders,
      existingIdentityProviders
    );
    await this.store.put<Organization>(
      tenantId,
      "organizations",
      {
        ...organization,
        createdAt: existingOrganization?.createdAt ?? organization.createdAt,
        revision: (existingOrganization?.revision ?? 0) + 1,
      },
      { expectedRevision: existingOrganization?.revision ?? null }
    );
    const authority: TenantAuthority = {
      id: "authority",
      tenantId,
      authorizationEpoch: (existingAuthority?.authorizationEpoch ?? 0) + 1,
      activePolicyId: activePolicies[0]?.id ?? null,
      frozen: false,
      freezeReason: null,
      createdAt: existingAuthority?.createdAt ?? importedAt,
      updatedAt: importedAt,
      revision: (existingAuthority?.revision ?? 0) + 1,
    };
    await this.store.put(tenantId, "tenant-authority", authority, {
      expectedRevision: existingAuthority?.revision ?? null,
    });

    const removeUnimported = async <T extends StoredDocument>(
      collection: Parameters<DocumentStore["delete"]>[1],
      existing: T[],
      imported: T[]
    ) => {
      const retainedIds = new Set(imported.map((document) => document.id));
      for (const document of existing) {
        if (!retainedIds.has(document.id)) {
          await this.store.delete(tenantId, collection, document.id, {
            expectedRevision: document.revision,
          });
        }
      }
    };
    await removeUnimported("compositions", existingCompositions, compositions);
    await removeUnimported(
      "identity-providers",
      existingIdentityProviders,
      identityProviders
    );
    await removeUnimported("servers", existingServers, servers);
    await removeUnimported("environments", existingEnvironments, environments);
    await removeUnimported("policies", existingPolicies, policies);
    await removeUnimported("roles", existingRoles, roles);

    await this.appendAudit(tenantId, {
      type: "tenant.imported",
      actorId,
      action: "import",
      targetType: "organization",
      targetId: tenantId,
      outcome: "succeeded",
      requestId,
      explanation:
        "Imported a validated secret-free portable tenant configuration; external credentials require reconfiguration.",
      metadata: {
        sourceTenantId,
        servers: servers.length,
        compositions: compositions.length,
        identityProvidersDisabled: identityProviders.length,
      },
    });
    return this.getOverview(tenantId, "");
  }
}
