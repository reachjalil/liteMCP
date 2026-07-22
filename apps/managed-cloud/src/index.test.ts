import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {},
  waitUntil: (work: Promise<unknown>) => void work,
}));

import {
  getCanonicalRedirect,
  isSafeDemoOrigin,
  type ManagedAnalyticsRuntime,
  resolveManagedAnalyticsRuntime,
  resolveManagedCloudAuthConfiguration,
  shouldRouteToWorker,
} from "./index.js";

type ManagedUsageEvent = Parameters<
  NonNullable<ManagedAnalyticsRuntime["recorder"]>["recordUsage"]
>[0];

const usageEvent = (): ManagedUsageEvent => ({
  id: "usage_managed_1",
  tenantId: "tenant_a",
  sessionId: "session_a",
  subjectId: "user_a",
  subjectType: "user",
  roles: ["employee"],
  clientName: "Cursor",
  clientVersion: "1.0",
  userAgentClass: "cursor",
  sdk: false,
  eventType: "call",
  compositionId: "composition_a",
  environmentId: "environment_a",
  namespace: "crm",
  serverId: "server_a",
  tool: "crm/read",
  aliasUsed: false,
  risk: "read",
  decisionEffect: "allow",
  matchedRuleIds: ["rule_allow"],
  policyId: "policy_a",
  policyVersion: "1",
  latencyTotalMs: 100,
  latencyUpstreamMs: 80,
  status: "succeeded",
  requestId: "request_managed_1",
  ts: "2026-07-21T00:01:00.000Z",
  protocolVersion: "2025-11-25",
});

const tenantFeedNamespace = (fetch: DurableObjectStub["fetch"]) =>
  ({
    idFromName: vi.fn(() => ({ name: "tenant_a" })),
    get: vi.fn(() => ({ fetch })),
  }) as unknown as DurableObjectNamespace;

describe("managed-cloud demo guard", () => {
  it("allows only loopback origins", () => {
    expect(isSafeDemoOrigin("http://localhost:8787")).toBe(true);
    expect(isSafeDemoOrigin("http://studio.localhost:8787")).toBe(true);
    expect(isSafeDemoOrigin("http://127.0.0.1:8787")).toBe(true);
    expect(isSafeDemoOrigin("https://litemcpcomposer.com")).toBe(false);
    expect(isSafeDemoOrigin("not-a-url")).toBe(false);
  });
});

describe("managed-cloud canonical domain", () => {
  it("redirects the www route to the configured apex origin", () => {
    expect(
      getCanonicalRedirect(
        "https://www.litemcpcomposer.com/docs?source=www",
        "https://litemcpcomposer.com"
      )
    ).toBe("https://litemcpcomposer.com/docs?source=www");
    expect(
      getCanonicalRedirect(
        "https://litemcpcomposer.com/docs",
        "https://litemcpcomposer.com"
      )
    ).toBeUndefined();
  });
});

describe("managed-cloud worker routing", () => {
  it("keeps OAuth discovery and authorization endpoints out of static assets", () => {
    expect(shouldRouteToWorker("/.well-known/oauth-protected-resource/mcp/acme")).toBe(
      true
    );
    expect(
      shouldRouteToWorker("/.well-known/oauth-authorization-server/oauth/acme")
    ).toBe(true);
    expect(shouldRouteToWorker("/oauth/acme/authorize")).toBe(true);
    expect(shouldRouteToWorker("/docs")).toBe(false);
  });
});

describe("managed-cloud auth configuration", () => {
  it("preserves local demo registration without external email", () => {
    expect(
      resolveManagedCloudAuthConfiguration({
        PUBLIC_ORIGIN: "http://localhost:8787",
        LITEMCP_DEMO_MODE: "true",
      })
    ).toMatchObject({ demoMode: true, signupsEnabled: true });
  });

  it("fails closed when the production auth secret is missing", () => {
    expect(() =>
      resolveManagedCloudAuthConfiguration({
        PUBLIC_ORIGIN: "https://litemcpcomposer.com",
      })
    ).toThrow("BETTER_AUTH_SECRET is required");
  });

  it("keeps production registration disabled by default", () => {
    expect(
      resolveManagedCloudAuthConfiguration({
        PUBLIC_ORIGIN: "https://litemcpcomposer.com",
        BETTER_AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
      })
    ).toMatchObject({ demoMode: false, signupsEnabled: false });
  });

  it("requires configured email delivery before production registration opens", () => {
    expect(() =>
      resolveManagedCloudAuthConfiguration({
        PUBLIC_ORIGIN: "https://litemcpcomposer.com",
        BETTER_AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
        SIGNUPS_ENABLED: "true",
      })
    ).toThrow("Email delivery is required");
  });

  it("accepts complete Resend configuration for production registration", () => {
    expect(
      resolveManagedCloudAuthConfiguration({
        PUBLIC_ORIGIN: "https://litemcpcomposer.com",
        BETTER_AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
        SIGNUPS_ENABLED: "true",
        RESEND_API_KEY: "re_secret",
        EMAIL_FROM: "LiteMCP <hello@example.com>",
      })
    ).toMatchObject({ demoMode: false, signupsEnabled: true });
  });

  it("rejects partial Resend configuration", () => {
    expect(() =>
      resolveManagedCloudAuthConfiguration({
        PUBLIC_ORIGIN: "http://localhost:8787",
        LITEMCP_DEMO_MODE: "true",
        EMAIL_FROM: "hello@example.com",
      })
    ).toThrow("RESEND_API_KEY and EMAIL_FROM");
  });
});

describe("managed-cloud analytics runtime", () => {
  it("stays fully disabled without requiring analytics bindings", () => {
    expect(
      resolveManagedAnalyticsRuntime({ ANALYTICS_ENABLED: "false" }, vi.fn())
    ).toEqual({ enabled: false });
  });

  it("fails configuration when enabled bindings are incomplete", () => {
    expect(() =>
      resolveManagedAnalyticsRuntime({ ANALYTICS_ENABLED: "true" }, vi.fn())
    ).toThrow("requires USAGE_ANALYTICS and TENANT_FEED");
  });

  it("uses the exact tenant feed as the current full product query source", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      if (url.pathname !== "/query/summary") return Response.json({}, { status: 404 });
      return Response.json({
        from: "2026-07-21T00:00:00.000Z",
        to: "2026-07-21T01:00:00.000Z",
        calls: 2,
        activeIdentities: 1,
        activeSessions: 1,
        denials: 0,
        denyRate: 0,
        errors: 0,
        errorRate: 0,
        latencyP50Ms: 100,
        latencyP95Ms: 100,
        pendingApprovals: 0,
      });
    });
    const runtime = resolveManagedAnalyticsRuntime(
      {
        ANALYTICS_ENABLED: "true",
        TENANT_FEED: tenantFeedNamespace(fetch),
        USAGE_ANALYTICS: { writeDataPoint: vi.fn() },
      },
      vi.fn()
    );
    await expect(
      runtime.query?.summary({
        tenantId: "tenant_a",
        from: "2026-07-21T00:00:00.000Z",
        to: "2026-07-21T01:00:00.000Z",
      })
    ).resolves.toMatchObject({ calls: 2 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("defers composite emission and never surfaces binding failures", async () => {
    const feedFetch = vi.fn().mockRejectedValue(new Error("feed unavailable"));
    const engineWrite = vi.fn(() => {
      throw new Error("analytics engine unavailable");
    });
    const deferred: Promise<void>[] = [];
    const runtime = resolveManagedAnalyticsRuntime(
      {
        ANALYTICS_ENABLED: "true",
        TENANT_FEED: tenantFeedNamespace(feedFetch),
        USAGE_ANALYTICS: { writeDataPoint: engineWrite },
      },
      (work) => deferred.push(work)
    );

    expect(() => runtime.recorder?.recordUsage(usageEvent())).not.toThrow();
    await expect(runtime.recorder?.flush()).resolves.toBeUndefined();
    expect(deferred).toHaveLength(1);
    expect(engineWrite).toHaveBeenCalledTimes(1);
    expect(feedFetch).toHaveBeenCalledTimes(1);
  });
});
