import {
  type ApprovalRequest,
  type AuditEvent,
  type Composition,
  createCompositionInputSchema,
  createServerInputSchema,
  createSessionInputSchema,
  type Environment,
  type GatewaySession,
  type IdentityProvider,
  type McpServerDefinition,
  type Organization,
  type PlatformOverview,
  type Policy,
  type PolicyDecision,
  policySimulationInputSchema,
  type RiskClass,
  type Subject,
  type ToolDefinition,
} from "@litemcp/contracts";
import {
  type DocumentStore,
  StoreConflictError,
  type StoredDocument,
} from "@litemcp/storage";

import { evaluatePolicy } from "./policy-engine.js";
import {
  canonicalJson,
  nowIso,
  randomId,
  redactSecrets,
  safeEqual,
  sha256,
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
  identityProviders: IdentityProvider[];
  secretsIncluded: false;
};

export class PlatformService {
  readonly #auditQueues = new Map<string, Promise<void>>();

  constructor(readonly store: DocumentStore) {}

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
    const result = await this.store.list<Environment>(tenantId, "environments", {
      limit: 1_000,
    });
    return result.items;
  }

  async listServers(tenantId: string) {
    const result = await this.store.list<McpServerDefinition>(tenantId, "servers", {
      limit: 1_000,
    });
    return result.items;
  }

  async listCompositions(tenantId: string) {
    const result = await this.store.list<Composition>(tenantId, "compositions", {
      limit: 1_000,
    });
    return result.items;
  }

  async listPolicies(tenantId: string) {
    const result = await this.store.list<Policy>(tenantId, "policies", {
      limit: 1_000,
    });
    return result.items;
  }

  async listIdentityProviders(tenantId: string) {
    const result = await this.store.list<IdentityProvider>(
      tenantId,
      "identity-providers",
      { limit: 1_000 }
    );
    return result.items;
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
    const existingServers = await this.listServers(tenantId);
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
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "servers", server, {
      expectedRevision: null,
    });
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
    return server;
  }

  async createComposition(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string
  ) {
    const parsed = createCompositionInputSchema.parse(input);
    const [servers, environment, existingCompositions] = await Promise.all([
      this.listServers(tenantId),
      this.store.get<Environment>(tenantId, "environments", parsed.environmentId),
      this.listCompositions(tenantId),
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
    const serverIds = new Set(servers.map((server) => server.id));
    for (const member of parsed.members) {
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
    }
    const namespaceSet = new Set(parsed.members.map((member) => member.namespace));
    if (namespaceSet.size !== parsed.members.length) {
      throw new PlatformValidationError("Member namespaces must be unique.");
    }
    const targets = new Set(
      parsed.members.flatMap((member) => {
        const server = servers.find((entry) => entry.id === member.serverId);
        return (server?.tools ?? []).map((tool) => `${member.namespace}.${tool.name}`);
      })
    );
    const aliasNames = new Set<string>();
    for (const alias of parsed.aliases) {
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
    const now = nowIso();
    const composition: Composition = {
      ...parsed,
      id: randomId("composition"),
      tenantId,
      version: "0.1.0",
      status: "published",
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "compositions", composition, {
      expectedRevision: null,
    });
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

  async getCompositionBySlug(tenantId: string, slug: string) {
    const compositions = await this.listCompositions(tenantId);
    const composition = compositions.find((entry) => entry.slug === slug);
    if (!composition || composition.status !== "published") {
      throw new PlatformNotFoundError("Published composition");
    }
    return composition;
  }

  async activePolicy(tenantId: string) {
    const policies = await this.listPolicies(tenantId);
    return policies.find((policy) => policy.status === "active") ?? null;
  }

  async simulatePolicy(tenantId: string, input: unknown) {
    const parsed = policySimulationInputSchema.parse(input);
    const policy = parsed.policyId
      ? await this.store.get<Policy>(tenantId, "policies", parsed.policyId)
      : await this.activePolicy(tenantId);
    return evaluatePolicy(policy, parsed);
  }

  async listVisibleTools(
    tenantId: string,
    compositionId: string,
    subject: Subject,
    requestId: string,
    actorId = subject.id
  ): Promise<VisibleTool[]> {
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
    const [servers, policy] = await Promise.all([
      this.listServers(tenantId),
      this.activePolicy(tenantId),
    ]);
    const visible: VisibleTool[] = [];
    for (const member of composition.members
      .filter((entry) => entry.enabled)
      .sort((left, right) => left.priority - right.priority)) {
      const server = servers.find((entry) => entry.id === member.serverId);
      if (!server) continue;
      for (const tool of server.tools) {
        const canonicalName = `${member.namespace}.${tool.name}`;
        const decision = evaluatePolicy(policy, {
          subject,
          action: "discover",
          toolName: canonicalName,
          risk: tool.risk,
        });
        await this.appendAudit(tenantId, {
          type: "policy.discovery-decision",
          actorId,
          action: "discover",
          targetType: "tool",
          targetId: canonicalName,
          outcome: decision.allowed ? "allowed" : "denied",
          requestId,
          policyVersion: decision.policyVersion ?? undefined,
          explanation: decision.explanation,
          metadata: { matchedRuleIds: decision.matchedRuleIds },
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
    return visible;
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
    const policy = await this.activePolicy(tenantId);
    const decision = evaluatePolicy(policy, {
      subject,
      action: "execute",
      toolName: canonicalName,
      risk: tool.risk,
    });
    await this.appendAudit(tenantId, {
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
      throw new PlatformAuthorizationError(decision.explanation);
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
    };
  }

  async createSession(
    tenantId: string,
    input: unknown,
    actorId: string,
    requestId: string,
    gatewayOrigin: string
  ) {
    const parsed = createSessionInputSchema.parse(input);
    const composition = await this.store.get<Composition>(
      tenantId,
      "compositions",
      parsed.compositionId
    );
    if (!composition) throw new PlatformNotFoundError("Composition");
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
    const session: GatewaySession = {
      id,
      tenantId,
      compositionId: composition.id,
      environmentId: parsed.environmentId,
      subject: parsed.subject,
      tokenHash: await sha256(token),
      approvedClients: parsed.approvedClients,
      expiresAt: new Date(Date.now() + parsed.expiresInSeconds * 1_000).toISOString(),
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "sessions", session, {
      expectedRevision: null,
    });
    await this.appendAudit(tenantId, {
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
    const session = await this.store.get<GatewaySession>(
      tenantId,
      "sessions",
      match[2]
    );
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
      return null;
    }
    const tokenHash = await sha256(token);
    return safeEqual(tokenHash, session.tokenHash) ? session : null;
  }

  async revokeSession(
    tenantId: string,
    sessionId: string,
    actorId: string,
    requestId: string,
    canManageOthers = false
  ) {
    const session = await this.store.get<GatewaySession>(
      tenantId,
      "sessions",
      sessionId
    );
    if (!session) throw new PlatformNotFoundError("Gateway session");
    if (session.subject.id !== actorId && !canManageOthers) {
      throw new PlatformAuthorizationError(
        "A session may be revoked only by its subject or an organization administrator."
      );
    }
    if (session.revokedAt) {
      return { ...session, tokenHash: "[REDACTED]" as const };
    }
    const now = nowIso();
    const revoked: GatewaySession = {
      ...session,
      revokedAt: now,
      updatedAt: now,
      revision: session.revision + 1,
    };
    await this.store.put(tenantId, "sessions", revoked, {
      expectedRevision: session.revision,
    });
    await this.appendAudit(tenantId, {
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
    return { ...revoked, tokenHash: "[REDACTED]" as const };
  }

  async createApproval(
    tenantId: string,
    session: GatewaySession,
    resolved: ResolvedTool,
    args: unknown,
    requestId: string
  ) {
    const now = nowIso();
    const approval: ApprovalRequest = {
      id: randomId("approval"),
      tenantId,
      compositionId: session.compositionId,
      sessionId: session.id,
      toolName: resolved.canonicalName,
      argumentsHash: await sha256(canonicalJson(args)),
      encryptedArgumentsReference: `pending://${requestId}`,
      status: "pending",
      requestedBy: session.subject.id,
      decidedBy: null,
      decisionReason: null,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    await this.store.put(tenantId, "approvals", approval, {
      expectedRevision: null,
    });
    await this.appendAudit(tenantId, {
      type: "approval.requested",
      actorId: session.subject.id,
      action: "request-approval",
      targetType: "tool",
      targetId: resolved.canonicalName,
      outcome: "pending",
      requestId,
      policyVersion: resolved.decision.policyVersion ?? undefined,
      explanation: resolved.decision.explanation,
      metadata: { approvalId: approval.id, argumentsHash: approval.argumentsHash },
    });
    return approval;
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
      identityProviders,
    ] = await Promise.all([
      this.store.get<Organization>(tenantId, "organizations", tenantId),
      this.listEnvironments(tenantId),
      this.listServers(tenantId),
      this.listCompositions(tenantId),
      this.listPolicies(tenantId),
      this.listIdentityProviders(tenantId),
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
      identityProviders: identityProviders.map((provider) => ({
        ...provider,
        clientId: "<configure-after-import>",
        secretReference: "<configure-after-import>",
      })),
      secretsIncluded: false,
    };
  }
}
