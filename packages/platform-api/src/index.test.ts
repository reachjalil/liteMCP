import { type AnalyticsQuery, AnalyticsQueryLimitError } from "@litemcp/analytics";
import type {
  AnalyticsFlowsQuery,
  AnalyticsPolicyInsightsQuery,
  AnalyticsRecentQuery,
  AnalyticsSessionTimelineQuery,
  AnalyticsSummaryQuery,
  AnalyticsTimeseriesQuery,
  AnalyticsTopQuery,
  UsageEvent,
} from "@litemcp/contracts";
import { PlatformService } from "@litemcp/core";
import { McpGateway } from "@litemcp/mcp-gateway";
import { MemoryDocumentStore } from "@litemcp/storage";
import { describe, expect, it } from "vitest";

import { createPlatformApp } from "./index.js";

const createTestApp = () => {
  const platform = new PlatformService(new MemoryDocumentStore());
  return createPlatformApp({
    platform,
    gateway: new McpGateway({ platform }),
    publicOrigin: "http://localhost:8787",
    webOrigins: ["http://localhost:4321"],
    demoMode: true,
  });
};

const productionAuth = (input: {
  userId?: string;
  tenantId?: string;
  role?: string;
  groups?: unknown;
  claims?: unknown;
}) => ({
  handler: () => new Response(null, { status: 204 }),
  api: {
    getSession: async () => ({
      user: {
        id: input.userId ?? "user_test",
        groups: input.groups,
        claims: input.claims,
      },
      session: {
        activeOrganizationId: input.tenantId ?? "org_demo",
        activeOrganizationName: "Test organization",
      },
    }),
    getActiveMemberRole: async () => ({ role: input.role ?? "member" }),
  },
});

const pkceChallenge = async (verifier: string) => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );
  return btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const usageEventFixture = (tenantId: string, ts: string): UsageEvent => ({
  id: "usage_event_1",
  tenantId,
  sessionId: "session_demo",
  subjectId: "user_member",
  subjectType: "user",
  roles: ["employee"],
  clientName: "=reported-client",
  clientVersion: "1.0.0",
  userAgentClass: "other",
  sdk: false,
  eventType: "call",
  compositionId: "composition_demo",
  environmentId: "environment_demo",
  namespace: "finance",
  serverId: "server_demo",
  tool: "finance.lookup",
  aliasUsed: false,
  risk: "read",
  decisionEffect: "allow",
  matchedRuleIds: ["rule_allow_read"],
  policyId: "policy_demo",
  policyVersion: "1",
  latencyTotalMs: 18,
  latencyUpstreamMs: 11,
  status: "succeeded",
  requestBytes: 20,
  responseBytes: 40,
  auditId: "audit_receipt_1",
  auditSequence: 42,
  auditHash: "a".repeat(64),
  requestId: "request_analytics_1",
  ts,
  protocolVersion: "2025-11-25",
});

type AnalyticsCall = { method: keyof AnalyticsQuery; query: { tenantId: string } };

const analyticsFixture = () => {
  const calls: AnalyticsCall[] = [];
  const remember = <T extends { tenantId: string }>(
    method: keyof AnalyticsQuery,
    query: T
  ) => {
    calls.push({ method, query });
    return query;
  };
  const analytics: AnalyticsQuery = {
    summary: async (input: AnalyticsSummaryQuery) => {
      const query = remember("summary", input);
      return {
        from: query.from,
        to: query.to,
        calls: 7,
        activeIdentities: 2,
        activeSessions: 3,
        denials: 1,
        denyRate: 1 / 7,
        errors: 1,
        errorRate: 1 / 7,
        latencyP50Ms: 12,
        latencyP95Ms: 30,
        pendingApprovals: 1,
      };
    },
    timeseries: async (input: AnalyticsTimeseriesQuery) => {
      const query = remember("timeseries", input);
      return {
        from: query.from,
        to: query.to,
        metric: query.metric,
        interval: query.interval,
        points: [{ ts: query.from, value: 7 }],
      };
    },
    top: async (input: AnalyticsTopQuery) => {
      const query = remember("top", input);
      return {
        from: query.from,
        to: query.to,
        dimension: query.dimension,
        metric: query.metric,
        rows: [{ key: "=SUM(1,1)", value: 7, eventCount: 7 }],
      };
    },
    recent: async (input: AnalyticsRecentQuery) => {
      const query = remember("recent", input);
      return {
        events: [usageEventFixture(query.tenantId, query.from)],
        nextCursor: "cursor_next",
      };
    },
    sessionTimeline: async (input: AnalyticsSessionTimelineQuery) => {
      const query = remember("sessionTimeline", input);
      return {
        sessionId: query.sessionId,
        startedAt: query.from,
        endedAt: query.to,
        durationMs: Date.parse(query.to) - Date.parse(query.from),
        items: [
          {
            offsetMs: 0,
            event: usageEventFixture(query.tenantId, query.from),
          },
        ],
      };
    },
    flows: async (input: AnalyticsFlowsQuery) => {
      const query = remember("flows", input);
      return {
        from: query.from,
        to: query.to,
        transitions: [
          { source: "@source.tool", target: "+target.tool", count: 2, sessionCount: 1 },
        ],
      };
    },
    policyInsights: async (input: AnalyticsPolicyInsightsQuery) => {
      const query = remember("policyInsights", input);
      const ruleIds = query.ruleIds ?? [];
      const firstRule = ruleIds[0];
      return {
        from: query.from,
        to: query.to,
        ruleHits: firstRule ? [{ ruleId: firstRule, events: 3, denials: 1 }] : [],
        zeroHitRuleIds: ruleIds.slice(1),
        denialHotspots: [
          { tool: "-danger.tool", calls: 4, denials: 3, denyRate: 0.75 },
        ],
        unusedVisibleTools: [{ tool: "=unused.tool", discoveryCount: 3, callCount: 0 }],
        discoveryExecution: {
          discoveries: 4,
          toolsVisible: 10,
          discoveringSessions: 3,
          executingSessions: 2,
          conversionRate: 2 / 3,
        },
        approvals: {
          required: 2,
          decided: 1,
          approved: 1,
          denied: 0,
          pending: 1,
          latencyP50Ms: 1_000,
          latencyP95Ms: 1_000,
        },
      };
    },
  };
  return { analytics, calls };
};

const insightRoutes = [
  "/api/v1/analytics/summary",
  "/api/v1/analytics/timeseries?metric=calls",
  "/api/v1/analytics/top?dimension=tool&metric=calls",
  "/api/v1/analytics/sessions/session_demo/timeline",
  "/api/v1/analytics/flows",
  "/api/v1/analytics/policy-insights",
  "/api/v1/analytics/recent",
] as const;

const insightAndUsageRoutes = [...insightRoutes, "/api/v1/usage"] as const;

const withQuery = (path: string, query: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${query}`;

const createInsightTestApp = async (
  options: {
    role?: string;
    tenantId?: string;
    includeAnalytics?: boolean;
    analytics?: AnalyticsQuery;
  } = {}
) => {
  const tenantId = options.tenantId ?? "org_demo";
  const platform = new PlatformService(new MemoryDocumentStore());
  await platform.ensureDemoTenant(tenantId, "http://localhost:8787");
  const fixture = analyticsFixture();
  const analytics = options.analytics ?? fixture.analytics;
  const app = createPlatformApp({
    platform,
    gateway: new McpGateway({ platform }),
    ...(options.includeAnalytics === false ? {} : { analytics }),
    publicOrigin: "http://localhost:8787",
    webOrigins: ["http://localhost:4321"],
    demoMode: false,
    auth: productionAuth({
      tenantId,
      role: options.role ?? "owner",
      userId: "user_analytics_admin",
    }),
  });
  return { analytics, app, calls: fixture.calls, platform, tenantId };
};

describe("platform API", () => {
  it("serves persisted demo state and generated OpenAPI", async () => {
    const app = createTestApp();
    const overview = await app.request("/api/v1/overview", {
      headers: { "x-litemcp-tenant": "org_demo" },
    });
    expect(overview.status).toBe(200);
    const payload = await overview.json();
    expect(payload.data.counts.servers).toBe(2);
    expect(payload.meta.requestId).toBe(overview.headers.get("x-request-id"));

    const openApi = await app.request("/api/v1/openapi.json");
    expect(openApi.status).toBe(200);
    const document = await openApi.json();
    expect(document.openapi).toBe("3.1.0");
    expect(document.components.schemas.ApprovalDecisionInput.required).toEqual([
      "decision",
      "reason",
      "generation",
      "fingerprint",
    ]);
    expect(
      document.paths["/api/v1/approvals/{approvalId}/decision"].post.requestBody
        .content["application/json"].schema.$ref
    ).toBe("#/components/schemas/ApprovalDecisionInput");
  });

  it("rejects cross-tenant demo headers", async () => {
    const response = await createTestApp().request("/api/v1/servers", {
      headers: { "x-litemcp-tenant": "org_other" },
    });
    expect(response.status).toBe(403);
  });

  it("requires an explicit demo administrator for management mutations", async () => {
    const app = createTestApp();
    const body = JSON.stringify({
      slug: "demo-management-test",
      name: "Demo management test",
      description: "Proves that demo management is explicit.",
      transport: "streamable-http",
      endpoint: "https://mcp.example.com",
      version: "1.0.0",
      visibility: "private",
      tags: [],
      tools: [],
    });

    for (const role of [undefined, "employee", "unexpected"]) {
      const headers = new Headers({ "content-type": "application/json" });
      if (role) headers.set("x-litemcp-role", role);
      const denied = await app.request("/api/v1/servers", {
        method: "POST",
        headers,
        body,
      });
      expect(denied.status).toBe(403);
    }

    const allowed = await app.request("/api/v1/servers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-litemcp-role": "finance-admin",
      },
      body,
    });
    expect(allowed.status).toBe(201);
  });

  it("derives production gateway identity from the authenticated actor", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: {
        handler: () => new Response(null, { status: 204 }),
        api: {
          getSession: async () => ({
            user: {
              id: "user_member",
              role: "member",
              groups: ["finance", "", 42, "finance"],
              claims: {
                department: "finance",
                numeric: 42,
                constructor: "ignored",
              },
            },
            session: { activeOrganizationId: "org_demo" },
          }),
          getActiveMemberRole: async () => ({ role: "member" }),
        },
      },
    });

    const response = await app.request("/api/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: {
          type: "user",
          id: "forged_admin",
          roles: ["finance-admin"],
          groups: ["finance"],
          claims: { forged: "true" },
        },
        approvedClients: ["test"],
        expiresInSeconds: 600,
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.session.subject).toEqual({
      type: "user",
      id: "user_member",
      roles: ["member"],
      groups: ["finance"],
      claims: { department: "finance" },
    });
  });

  it("rejects management mutations from an ordinary organization member", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: {
        handler: () => new Response(null, { status: 204 }),
        api: {
          getSession: async () => ({
            user: { id: "user_member" },
            session: { activeOrganizationId: "org_demo" },
          }),
          getActiveMemberRole: async () => ({ role: "member" }),
        },
      },
    });

    const response = await app.request("/api/v1/servers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "forged-server",
        name: "Forged server",
        description: "Must not be created by an ordinary member.",
        transport: "streamable-http",
        endpoint: "https://mcp.example.com",
        version: "1.0.0",
        visibility: "private",
        tags: [],
        tools: [],
      }),
    });

    expect(response.status).toBe(403);
    expect(await platform.listServers("org_demo")).toHaveLength(2);
  });

  it("does not grant control-plane administration to a finance domain role", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: {
        handler: () => new Response(null, { status: 204 }),
        api: {
          getSession: async () => ({
            user: { id: "user_finance" },
            session: { activeOrganizationId: "org_demo" },
          }),
          getActiveMemberRole: async () => ({ role: "finance-admin" }),
        },
      },
    });

    const response = await app.request("/api/v1/audit");
    expect(response.status).toBe(403);
  });

  it("keeps OpenAPI public while management reads remain role-gated", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: productionAuth({ role: "member" }),
    });

    const openApi = await app.request("/api/v1/openapi.json");
    expect(openApi.status).toBe(200);
    const document = await openApi.json();
    expect(document.paths["/oauth/{tenantId}/token"]).toBeDefined();
    expect(document.paths["/api/v1/servers/{serverId}/probe"]).toBeDefined();

    const policies = await app.request("/api/v1/policies");
    expect(policies.status).toBe(403);
  });

  it("rejects disallowed CORS origins without a credentialed fallback", async () => {
    const app = createTestApp();
    const denied = await app.request("/api/v1/openapi.json", {
      headers: { origin: "https://attacker.example" },
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect(denied.headers.get("access-control-allow-credentials")).toBeNull();

    const allowed = await app.request("/api/v1/openapi.json", {
      headers: { origin: "http://localhost:4321" },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:4321"
    );
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("bootstraps production tenants idempotently", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: productionAuth({
        tenantId: "org_new",
        userId: "user_member",
        role: "member",
        groups: ["finance", "", 42, "finance"],
        claims: { department: "finance", numeric: 42, constructor: "ignored" },
      }),
    });

    expect((await app.request("/api/v1/overview")).status).toBe(200);
    expect((await app.request("/api/v1/overview")).status).toBe(200);
    expect(await platform.listEnvironments("org_new")).toHaveLength(1);
    expect(await platform.listCompositions("org_new")).toHaveLength(1);
    expect(await platform.listPolicies("org_new")).toHaveLength(1);
  });

  it("serves OAuth metadata and completes DCR, PKCE code exchange, and refresh", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: productionAuth({ role: "owner", userId: "user_oauth" }),
    });

    const metadata = await app.request(
      "/.well-known/oauth-protected-resource/mcp/org_demo/company-tools"
    );
    expect(metadata.status).toBe(200);
    expect((await metadata.json()).authorization_servers).toEqual([
      "http://localhost:8787/oauth/org_demo",
    ]);
    const authorizationServer = await app.request(
      "/.well-known/oauth-authorization-server/oauth/org_demo"
    );
    expect(authorizationServer.status).toBe(200);
    expect((await authorizationServer.json()).issuer).toBe(
      "http://localhost:8787/oauth/org_demo"
    );

    const registration = await app.request("/oauth/org_demo/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Test MCP client",
        redirect_uris: ["https://client.example/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      }),
    });
    expect(registration.status).toBe(201);
    const client = await registration.json();

    const verifier = "v".repeat(64);
    const challenge = await pkceChallenge(verifier);
    const authorize = new URL("http://localhost/oauth/org_demo/authorize");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", client.client_id);
    authorize.searchParams.set("redirect_uri", "https://client.example/callback");
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("scope", "mcp offline_access");
    authorize.searchParams.set(
      "resource",
      "http://localhost:8787/mcp/org_demo/company-tools"
    );
    authorize.searchParams.set("state", "state-123");
    const consent = await app.request(`${authorize.pathname}${authorize.search}`);
    expect(consent.status).toBe(200);
    expect(consent.headers.get("cache-control")).toBe("no-store");
    expect(await consent.text()).toContain("Authorize MCP access");
    expect(
      (await platform.store.list("org_demo", "oauth-codes", { limit: 10 })).items
    ).toHaveLength(0);

    const authorization = await app.request(authorize.pathname, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost:8787",
      },
      body: new URLSearchParams([
        ...authorize.searchParams.entries(),
        ["decision", "approve"],
      ]).toString(),
    });
    expect(authorization.status).toBe(302);
    const location = authorization.headers.get("location");
    expect(location).not.toBeNull();
    if (!location) throw new Error("OAuth authorization did not redirect.");
    const callback = new URL(location);
    expect(callback.searchParams.get("state")).toBe("state-123");
    const code = callback.searchParams.get("code");
    expect(code).not.toBeNull();
    if (!code) throw new Error("OAuth authorization code was not returned.");

    const token = await app.request("/oauth/org_demo/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code,
        code_verifier: verifier,
        redirect_uri: "https://client.example/callback",
      }).toString(),
    });
    expect(token.status).toBe(200);
    expect(token.headers.get("cache-control")).toBe("no-store");
    const tokens = await token.json();
    expect(tokens.access_token).toMatch(/^lmcp_v1\./);
    expect(tokens.refresh_token).toMatch(/^lmcp_refresh_/);

    const refresh = await app.request("/oauth/org_demo/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: client.client_id,
        refresh_token: tokens.refresh_token,
      }).toString(),
    });
    expect(refresh.status).toBe(200);
    const rotated = await refresh.json();
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);

    const revoke = await app.request("/oauth/org_demo/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        token: rotated.refresh_token,
        token_type_hint: "refresh_token",
      }).toString(),
    });
    expect(revoke.status).toBe(200);

    const revokedRefresh = await app.request("/oauth/org_demo/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: client.client_id,
        refresh_token: rotated.refresh_token,
      }).toString(),
    });
    expect(revokedRefresh.status).toBe(400);
  });

  it("requires login and explicit same-origin OAuth consent", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const unauthenticated = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: {
        handler: () => new Response(null, { status: 204 }),
        api: {
          getSession: async () => null,
          getActiveMemberRole: async () => null,
        },
      },
    });
    const client = await platform.registerOAuthClient("org_demo", {
      client_name: "Consent client",
      redirect_uris: ["https://client.example/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
    });
    const verifier = "c".repeat(64);
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client.clientId,
      redirect_uri: "https://client.example/callback",
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
      resource: "http://localhost:8787/mcp/org_demo/company-tools",
      state: "consent-state",
    });
    const login = await unauthenticated.request(
      `/oauth/org_demo/authorize?${query.toString()}`
    );
    expect(login.status).toBe(302);
    expect(new URL(login.headers.get("location") ?? "http://invalid").pathname).toBe(
      "/login"
    );

    let reportedError: unknown;
    const authenticated = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: productionAuth({ role: "owner", userId: "user_consent" }),
      reportError: ({ error }) => {
        reportedError = error;
      },
    });
    const deniedCrossSite = await authenticated.request("/oauth/org_demo/authorize", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://attacker.example",
      },
      body: new URLSearchParams([
        ...query.entries(),
        ["decision", "approve"],
      ]).toString(),
    });
    expect(deniedCrossSite.status).toBe(403);
    expect(
      (await platform.store.list("org_demo", "oauth-codes", { limit: 10 })).items
    ).toHaveLength(0);

    const deniedByUser = await authenticated.request("/oauth/org_demo/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([...query.entries(), ["decision", "deny"]]).toString(),
    });
    if (deniedByUser.status !== 302 && reportedError instanceof Error) {
      throw reportedError;
    }
    expect(deniedByUser.status).toBe(302);
    const deniedLocation = new URL(
      deniedByUser.headers.get("location") ?? "http://invalid"
    );
    expect(deniedLocation.searchParams.get("error")).toBe("access_denied");
    expect(deniedLocation.searchParams.get("state")).toBe("consent-state");
  });

  it("advertises protected-resource metadata on MCP authentication failures", async () => {
    const app = createTestApp();
    const response = await app.request("/mcp/org_demo/company-tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="http://localhost:8787/.well-known/oauth-protected-resource/mcp/org_demo/company-tools"'
    );

    const issued = await app.request("/api/v1/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-litemcp-role": "finance-admin",
      },
      body: JSON.stringify({
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: {
          type: "user",
          id: "user_finance_admin",
          roles: ["finance-admin"],
          groups: [],
          claims: {},
        },
        expiresInSeconds: 600,
      }),
    });
    const token = (await issued.json()).data.token;
    const mismatch = await app.request("/mcp/org_other/company-tools", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(mismatch.status).toBe(403);
  });

  it("issues scoped sessions to authenticated service principals", async () => {
    const app = createTestApp();
    const created = await app.request("/api/v1/service-principals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-litemcp-role": "finance-admin",
      },
      body: JSON.stringify({ name: "Build agent", roles: ["member"] }),
    });
    expect(created.status).toBe(201);
    const credential = (await created.json()).data;
    const authorization = `Basic ${btoa(
      `${credential.principal.clientId}:${credential.secret}`
    )}`;
    const session = await app.request("/api/v1/service-principal-sessions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify({
        tenantId: "org_demo",
        compositionId: "composition_company",
        environmentId: "env_production",
        approvedClients: ["ci"],
        expiresInSeconds: 600,
      }),
    });
    expect(session.status).toBe(201);
    expect((await session.json()).data.session.subject.type).toBe("service-principal");
  });

  it("imports a portable export only while the authenticated target is empty", async () => {
    const source = new PlatformService(new MemoryDocumentStore());
    await source.ensureDemoTenant("org_demo", "http://localhost:8787");
    const portable = await source.exportTenant("org_demo");

    const platform = new PlatformService(new MemoryDocumentStore());
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: productionAuth({ tenantId: "org_import", role: "owner" }),
    });
    const imported = await app.request("/api/v1/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(portable),
    });
    expect(imported.status).toBe(200);
    expect(await platform.listServers("org_import")).toHaveLength(2);

    const conflict = await app.request("/api/v1/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(portable),
    });
    expect(conflict.status).toBe(409);
  });

  it("maps quota errors to 429 and isolates error-reporting failures", async () => {
    const platform = new PlatformService(new MemoryDocumentStore(), {
      quotas: { servers: 0 },
    });
    let reports = 0;
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: true,
      reportError: () => {
        reports += 1;
        throw new Error("reporting unavailable");
      },
    });
    const response = await app.request("/api/v1/servers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-litemcp-role": "finance-admin",
      },
      body: JSON.stringify({
        slug: "over-quota",
        name: "Over quota",
        description: "Exercises quota problem mapping.",
        transport: "streamable-http",
        endpoint: "https://mcp.example.com",
        version: "1.0.0",
        visibility: "private",
        tags: [],
        tools: [],
      }),
    });
    expect(response.status).toBe(429);
    expect(reports).toBe(1);
  });

  it("publishes the complete tenant Insight API in OpenAPI", async () => {
    const { app } = await createInsightTestApp();
    const response = await app.request("/api/v1/openapi.json");
    expect(response.status).toBe(200);
    const document = await response.json();
    for (const path of [
      "/api/v1/analytics/summary",
      "/api/v1/analytics/timeseries",
      "/api/v1/analytics/top",
      "/api/v1/analytics/sessions/{sessionId}/timeline",
      "/api/v1/analytics/flows",
      "/api/v1/analytics/policy-insights",
      "/api/v1/analytics/recent",
      "/api/v1/usage",
    ]) {
      expect(document.paths[path]?.get).toBeDefined();
    }
  });

  it("enforces the owner/admin Insight route matrix", async () => {
    for (const role of ["owner", "admin"]) {
      const { app } = await createInsightTestApp({ role });
      for (const route of insightAndUsageRoutes) {
        expect((await app.request(route)).status, `${role} ${route}`).toBe(200);
      }
    }

    for (const role of ["member", "approver", "finance-admin"]) {
      const { app } = await createInsightTestApp({ role });
      for (const route of insightAndUsageRoutes) {
        expect((await app.request(route)).status, `${role} ${route}`).toBe(403);
      }
    }
  });

  it("injects the authenticated tenant and active policy context only", async () => {
    const { app, calls, platform, tenantId } = await createInsightTestApp({
      tenantId: "org_insight",
    });
    const summary = await app.request("/api/v1/analytics/summary");
    expect(summary.status).toBe(200);
    expect(summary.headers.get("cache-control")).toBe("private, no-store");
    const summaryCall = calls.find((call) => call.method === "summary");
    expect(summaryCall?.query.tenantId).toBe(tenantId);
    expect(summaryCall?.query).not.toHaveProperty("format");
    const summaryBody = await summary.json();
    expect(Date.parse(summaryBody.data.to) - Date.parse(summaryBody.data.from)).toBe(
      24 * 60 * 60 * 1_000
    );

    const tenantOverride = await app.request(
      "/api/v1/analytics/summary?tenantId=org_attacker"
    );
    expect(tenantOverride.status).toBe(422);
    expect(calls.filter((call) => call.method === "summary")).toHaveLength(1);

    const policyOverride = await app.request(
      "/api/v1/analytics/policy-insights?policyId=policy_attacker"
    );
    expect(policyOverride.status).toBe(422);
    expect(calls.some((call) => call.method === "policyInsights")).toBe(false);

    const policyResponse = await app.request("/api/v1/analytics/policy-insights");
    expect(policyResponse.status).toBe(200);
    const policyCall = calls.find((call) => call.method === "policyInsights")?.query as
      | AnalyticsPolicyInsightsQuery
      | undefined;
    const activePolicy = await platform.activePolicy(tenantId);
    expect(policyCall).toMatchObject({
      tenantId,
      policyId: activePolicy?.id,
      ruleIds: activePolicy?.rules.map((rule) => rule.id),
    });
  });

  it("exports every Insight response as hardened endpoint-specific CSV", async () => {
    const { app } = await createInsightTestApp();
    for (const route of insightAndUsageRoutes) {
      const response = await app.request(withQuery(route, "format=csv"));
      expect(response.status, route).toBe(200);
      expect(response.headers.get("content-type"), route).toBe(
        "text/csv; charset=UTF-8"
      );
      expect(response.headers.get("cache-control"), route).toBe("private, no-store");
      expect(response.headers.get("content-disposition"), route).toMatch(
        /^attachment; filename="litemcp-[a-z-]+\.csv"$/
      );
      expect((await response.text()).endsWith("\r\n"), route).toBe(true);
    }

    expect(
      await (
        await app.request(
          "/api/v1/analytics/top?dimension=tool&metric=calls&format=csv"
        )
      ).text()
    ).toContain("'=SUM(1,1)");
    expect(
      await (await app.request("/api/v1/analytics/recent?format=csv")).text()
    ).toContain("'=reported-client");
    expect(
      await (await app.request("/api/v1/analytics/flows?format=csv")).text()
    ).toContain("'@source.tool");
    const policyCsv = await (
      await app.request("/api/v1/analytics/policy-insights?format=csv")
    ).text();
    expect(policyCsv).toContain("'-danger.tool");
    expect(policyCsv).toContain("'=unused.tool");
  });

  it("preserves audit receipts in session timeline JSON and CSV", async () => {
    const { app } = await createInsightTestApp();
    const response = await app.request(
      "/api/v1/analytics/sessions/session_demo/timeline"
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.items[0].event).toMatchObject({
      auditId: "audit_receipt_1",
      auditSequence: 42,
      auditHash: "a".repeat(64),
      requestId: "request_analytics_1",
    });

    const csv = await app.request(
      "/api/v1/analytics/sessions/session_demo/timeline?format=csv"
    );
    const text = await csv.text();
    expect(text).toContain("auditId,auditSequence,auditHash");
    expect(text).toContain("audit_receipt_1,42,");
    expect(text).toContain("a".repeat(64));
  });

  it("rejects invalid, repeated, unknown, and overlong Insight queries", async () => {
    const { app, calls } = await createInsightTestApp();
    const overlong = new URLSearchParams({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    }).toString();
    for (const route of insightRoutes) {
      const response = await app.request(withQuery(route, overlong));
      expect(response.status, route).toBe(422);
      const body = await response.json();
      expect(body.errors[0].path, route).toBe("from");
    }
    expect(calls).toHaveLength(0);

    expect(
      (await app.request("/api/v1/analytics/timeseries?metric=calls&metric=errors"))
        .status
    ).toBe(422);
    expect((await app.request("/api/v1/analytics/recent?unknown=true")).status).toBe(
      422
    );
    expect(
      (await app.request("/api/v1/analytics/summary?__proto__=ignored")).status
    ).toBe(422);
    expect((await app.request("/api/v1/analytics/sessions/x/timeline")).status).toBe(
      422
    );
    expect((await app.request("/api/v1/usage?from=2026-01-01")).status).toBe(422);
  });

  it("isolates analytics backend absence and failures from other API surfaces", async () => {
    const unavailable = await createInsightTestApp({ includeAnalytics: false });
    for (const route of insightRoutes) {
      const response = await unavailable.app.request(route);
      expect(response.status, route).toBe(503);
      expect((await response.json()).title, route).toBe("Analytics Unavailable");
    }
    expect((await unavailable.app.request("/api/v1/usage")).status).toBe(200);
    expect((await unavailable.app.request("/api/v1/overview")).status).toBe(200);

    const fixture = analyticsFixture();
    fixture.analytics.summary = async () => {
      throw new Error("secret backend detail");
    };
    const failing = await createInsightTestApp({ analytics: fixture.analytics });
    const response = await failing.app.request("/api/v1/analytics/summary");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret backend detail");
    expect((await failing.app.request("/api/v1/overview")).status).toBe(200);
  });

  it("returns a bounded problem response when an analytics scan exceeds its limit", async () => {
    const fixture = analyticsFixture();
    fixture.analytics.summary = async () => {
      throw new AnalyticsQueryLimitError("Narrow the requested analytics window.");
    };
    const { app } = await createInsightTestApp({ analytics: fixture.analytics });

    const response = await app.request("/api/v1/analytics/summary");
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      title: "Analytics Query Limit",
      detail: "Narrow the requested analytics window.",
    });
    expect((await app.request("/api/v1/overview")).status).toBe(200);
  });
});
