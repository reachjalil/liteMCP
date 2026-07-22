import { MemoryAnalyticsStore } from "@litemcp/analytics";
import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import {
  createServerAnalyticsRuntime,
  createServerRuntime,
  parseServerAnalyticsConfig,
  parseServerQuotaConfig,
  type ServerAnalyticsFailure,
} from "./runtime.js";

const mintDemoSession = (runtime: Awaited<ReturnType<typeof createServerRuntime>>) =>
  runtime.app.request("/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      compositionId: "composition_company",
      environmentId: "env_production",
      subject: {
        type: "user",
        id: "user_employee",
        roles: ["employee"],
        groups: ["employees"],
        claims: {},
      },
      expiresInSeconds: 600,
    }),
  });

const analyticsAdminHeaders = { "x-litemcp-role": "finance-admin" };

describe("portable Node runtime", () => {
  it("starts against the in-memory demo adapter without external services", async () => {
    const runtime = await createServerRuntime({
      LITEMCP_DEMO_MODE: "true",
      API_ORIGIN: "http://localhost:8787",
      WEB_ORIGIN: "http://localhost:4321",
    });
    const response = await runtime.app.request("/health");
    expect(response.status).toBe(200);
    expect((await response.json()).storage.driver).toBe("memory");
    await runtime.close();
  });

  it("uses its actual loopback bind origin for default demo endpoints", async () => {
    const runtime = await createServerRuntime({
      LITEMCP_DEMO_MODE: "true",
      PORT: "9123",
    });
    const response = await mintDemoSession(runtime);
    expect(response.status).toBe(201);
    expect((await response.json()).data.endpoint).toBe(
      "http://127.0.0.1:9123/mcp/org_demo/company-tools"
    );
    await runtime.close();
  });

  it("fails closed at startup when persistent storage is not configured", async () => {
    await expect(createServerRuntime({})).rejects.toThrow("MONGODB_URI is required");
  });

  it("fails closed before connecting when production auth is not configured", async () => {
    await expect(
      createServerRuntime({ MONGODB_URI: "mongodb://unused.example/litemcp" })
    ).rejects.toThrow("BETTER_AUTH_SECRET is required");
  });

  it("permits an explicit insecure local-development runtime on memory storage", async () => {
    const runtime = await createServerRuntime({ LITEMCP_INSECURE_DEV: "true" });
    const response = await runtime.app.request("/api/v1/overview");
    expect(response.status).toBe(200);
    const readiness = await runtime.app.request("/ready");
    expect(readiness.status).toBe(200);
    await runtime.close();
  });

  it("requires production email delivery before opening registrations", async () => {
    await expect(
      createServerRuntime({
        MONGODB_URI: "mongodb://unused.example/litemcp",
        BETTER_AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
        SIGNUPS_ENABLED: "true",
      })
    ).rejects.toThrow("Email delivery is required");
  });

  it("rejects a weak auth secret before opening a MongoDB connection", async () => {
    await expect(
      createServerRuntime({
        MONGODB_URI: "mongodb://unused.example/litemcp",
        BETTER_AUTH_SECRET: "weak",
      })
    ).rejects.toThrow("at least 32");
  });

  it("rejects partial Resend configuration", async () => {
    await expect(
      createServerRuntime({
        LITEMCP_DEMO_MODE: "true",
        RESEND_API_KEY: "re_secret",
      })
    ).rejects.toThrow("RESEND_API_KEY and EMAIL_FROM");
  });

  it("parses bounded analytics configuration with portable defaults", () => {
    expect(parseServerAnalyticsConfig({})).toEqual({
      enabled: false,
      retentionSeconds: 90 * 24 * 60 * 60,
      maxQueueSize: 10_000,
      batchSize: 250,
      flushIntervalMs: 100,
    });
    expect(
      parseServerAnalyticsConfig({
        ANALYTICS_ENABLED: "1",
        ANALYTICS_RETENTION_DAYS: "30",
        ANALYTICS_MAX_QUEUE_SIZE: "800",
        ANALYTICS_BATCH_SIZE: "80",
        ANALYTICS_FLUSH_INTERVAL_MS: "0",
      })
    ).toEqual({
      enabled: true,
      retentionSeconds: 30 * 24 * 60 * 60,
      maxQueueSize: 800,
      batchSize: 80,
      flushIntervalMs: 0,
    });

    expect(() =>
      parseServerAnalyticsConfig({ ANALYTICS_ENABLED: "sometimes" })
    ).toThrow("ANALYTICS_ENABLED");
    expect(() => parseServerAnalyticsConfig({ ANALYTICS_RETENTION_DAYS: "0" })).toThrow(
      "ANALYTICS_RETENTION_DAYS"
    );
    expect(() => parseServerAnalyticsConfig({ ANALYTICS_BATCH_SIZE: "1.5" })).toThrow(
      "ANALYTICS_BATCH_SIZE"
    );
  });

  it("defaults self-hosted quotas to effectively unlimited and accepts local limits", () => {
    expect(parseServerQuotaConfig({})).toEqual({
      servers: Number.MAX_SAFE_INTEGER,
      compositions: Number.MAX_SAFE_INTEGER,
      activeSessions: Number.MAX_SAFE_INTEGER,
      toolCallsPerDay: Number.MAX_SAFE_INTEGER,
    });
    expect(
      parseServerQuotaConfig({
        LITEMCP_QUOTA_SERVERS: "12",
        LITEMCP_QUOTA_COMPOSITIONS: "14",
        LITEMCP_QUOTA_ACTIVE_SESSIONS: "30",
        LITEMCP_QUOTA_TOOL_CALLS_PER_DAY: "25000",
      })
    ).toEqual({
      servers: 12,
      compositions: 14,
      activeSessions: 30,
      toolCallsPerDay: 25_000,
    });

    expect(() => parseServerQuotaConfig({ LITEMCP_QUOTA_SERVERS: "-1" })).toThrow(
      "LITEMCP_QUOTA_SERVERS"
    );
    expect(() =>
      parseServerQuotaConfig({ LITEMCP_QUOTA_ACTIVE_SESSIONS: "1.5" })
    ).toThrow("LITEMCP_QUOTA_ACTIVE_SESSIONS");
  });

  it("reports unlimited defaults and enforces configured local quotas", async () => {
    const unlimited = await createServerRuntime({ LITEMCP_DEMO_MODE: "true" });
    const usage = await unlimited.app.request("/api/v1/usage", {
      headers: analyticsAdminHeaders,
    });
    expect(usage.status).toBe(200);
    expect((await usage.json()).data).toMatchObject({
      servers: { limit: Number.MAX_SAFE_INTEGER },
      compositions: { limit: Number.MAX_SAFE_INTEGER },
      activeSessions: { limit: Number.MAX_SAFE_INTEGER },
      toolCallsToday: { limit: Number.MAX_SAFE_INTEGER },
    });
    await unlimited.close();

    const configured = await createServerRuntime({
      LITEMCP_DEMO_MODE: "true",
      LITEMCP_QUOTA_ACTIVE_SESSIONS: "1",
    });
    expect((await mintDemoSession(configured)).status).toBe(201);
    const rejected = await mintDemoSession(configured);
    expect(rejected.status).toBe(429);
    expect((await rejected.json()).detail).toContain(
      "configured activeSessions limit of 1"
    );
    await configured.close();
  });

  it("keeps analytics disabled by default without constructing a store", async () => {
    const createMemoryStore = vi.fn(() => new MemoryAnalyticsStore());
    const runtime = await createServerRuntime(
      { LITEMCP_DEMO_MODE: "true" },
      { analytics: { createMemoryStore } }
    );

    expect(
      (
        await runtime.app.request("/api/v1/analytics/summary", {
          headers: analyticsAdminHeaders,
        })
      ).status
    ).toBe(503);
    const usage = await runtime.app.request("/api/v1/usage", {
      headers: analyticsAdminHeaders,
    });
    expect(usage.status).toBe(200);
    expect((await usage.json()).data.analyticsEnabled).toBe(false);
    expect(createMemoryStore).not.toHaveBeenCalled();
    await runtime.close();
  });

  it("records and queries in-memory analytics when explicitly enabled", async () => {
    const runtime = await createServerRuntime({
      LITEMCP_DEMO_MODE: "true",
      ANALYTICS_ENABLED: "true",
    });

    expect((await mintDemoSession(runtime)).status).toBe(201);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const recent = await runtime.app.request("/api/v1/analytics/recent", {
      headers: analyticsAdminHeaders,
    });
    expect(recent.status).toBe(200);
    expect((await recent.json()).data.events).toEqual([
      expect.objectContaining({
        tenantId: "org_demo",
        eventType: "session_minted",
        status: "succeeded",
      }),
    ]);
    const usage = await runtime.app.request("/api/v1/usage", {
      headers: analyticsAdminHeaders,
    });
    expect((await usage.json()).data.analyticsEnabled).toBe(true);
    await runtime.close();
  });

  it("selects Mongo analytics and forwards retention and batch settings", async () => {
    const store = new MemoryAnalyticsStore();
    const database = {} as Db;
    const createMongoStore = vi.fn(() => store);
    const createMemoryStore = vi.fn(() => store);
    const analytics = createServerAnalyticsRuntime(
      parseServerAnalyticsConfig({
        ANALYTICS_ENABLED: "true",
        ANALYTICS_RETENTION_DAYS: "45",
        ANALYTICS_MAX_QUEUE_SIZE: "900",
        ANALYTICS_BATCH_SIZE: "90",
        ANALYTICS_FLUSH_INTERVAL_MS: "250",
      }),
      database,
      { createMongoStore, createMemoryStore }
    );

    expect(analytics.enabled).toBe(true);
    expect(analytics.query).toBe(store);
    expect(createMemoryStore).not.toHaveBeenCalled();
    expect(createMongoStore).toHaveBeenCalledWith(
      database,
      expect.objectContaining({
        retentionSeconds: 45 * 24 * 60 * 60,
        maxQueueSize: 900,
        batchSize: 90,
        flushIntervalMs: 250,
        onError: expect.any(Function),
      })
    );
    await analytics.flush();
  });

  it("survives analytics initialization and query failures", async () => {
    const initializationFailures: ServerAnalyticsFailure[] = [];
    const unavailable = await createServerRuntime(
      {
        LITEMCP_DEMO_MODE: "true",
        ANALYTICS_ENABLED: "true",
      },
      {
        analytics: {
          createMemoryStore: () => {
            throw new Error("analytics unavailable");
          },
          onFailure: (failure) => initializationFailures.push(failure),
        },
      }
    );
    expect((await unavailable.app.request("/health")).status).toBe(200);
    expect(
      (
        await unavailable.app.request("/api/v1/analytics/summary", {
          headers: analyticsAdminHeaders,
        })
      ).status
    ).toBe(503);
    expect(initializationFailures).toEqual([
      expect.objectContaining({ source: "runtime", phase: "initialization" }),
    ]);
    await unavailable.close();

    class FailingQueryStore extends MemoryAnalyticsStore {
      override async summary(): Promise<never> {
        throw new Error("query failed");
      }
    }
    const failingQuery = await createServerRuntime(
      {
        LITEMCP_DEMO_MODE: "true",
        ANALYTICS_ENABLED: "true",
      },
      { analytics: { createMemoryStore: () => new FailingQueryStore() } }
    );
    expect(
      (
        await failingQuery.app.request("/api/v1/analytics/summary", {
          headers: analyticsAdminHeaders,
        })
      ).status
    ).toBe(500);
    expect((await failingQuery.app.request("/health")).status).toBe(200);
    await failingQuery.close();
  });

  it("keeps product requests and shutdown fail-open while flushing in order", async () => {
    const order: string[] = [];
    const failures: ServerAnalyticsFailure[] = [];
    class FailingAnalyticsStore extends MemoryAnalyticsStore {
      override async recordUsage(): Promise<void> {
        order.push("record:start");
        await Promise.resolve();
        order.push("record:failed");
        throw new Error("write failed");
      }

      async flush(): Promise<void> {
        order.push("store:flush");
        throw new Error("flush failed");
      }
    }
    const runtime = await createServerRuntime(
      {
        LITEMCP_DEMO_MODE: "true",
        ANALYTICS_ENABLED: "true",
      },
      {
        analytics: {
          createMemoryStore: () => new FailingAnalyticsStore(),
          onFailure: (failure) => failures.push(failure),
        },
      }
    );

    expect((await mintDemoSession(runtime)).status).toBe(201);
    await expect(runtime.close()).resolves.toBeUndefined();
    expect(order).toEqual(["record:start", "record:failed", "store:flush"]);
    expect(failures).toEqual([
      expect.objectContaining({ source: "recorder", phase: "sink" }),
      expect.objectContaining({ source: "runtime", phase: "store_flush" }),
    ]);
  });
});
