/// <reference types="node" />

import { DatabaseSync, type StatementSync } from "node:sqlite";

import { type UsageEvent, usageEventSchema } from "@litemcp/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {},
}));

import {
  analyticsEngineBlobLayout,
  analyticsEngineDoubleLayout,
  CloudflareAnalyticsEngineSink,
  CloudflareTenantFeedStore,
  TenantFeedDurableObject,
  usageEventToAnalyticsEnginePoints,
} from "./analytics.js";

let sequence = 0;
const usage = (overrides: Partial<UsageEvent> = {}) => {
  sequence += 1;
  return usageEventSchema.parse({
    id: `usage_${String(sequence).padStart(3, "0")}`,
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
    requestId: `request_${sequence}`,
    ts: "2026-07-21T00:01:00.000Z",
    protocolVersion: "2025-11-25",
    ...overrides,
  });
};

const discovery = (overrides: Partial<UsageEvent> = {}) =>
  usage({
    eventType: "discover",
    tool: undefined,
    latencyUpstreamMs: undefined,
    matchedRuleIds: ["rule_discover"],
    toolsVisible: 2,
    toolsHidden: 1,
    visibleTools: ["crm/read", "unused/tool"],
    visibilityTruncated: false,
    ...overrides,
  });

describe("Cloudflare Analytics Engine sink", () => {
  it("maps one payload-free main row with stable bounded layouts", () => {
    const event = discovery();
    const [point] = usageEventToAnalyticsEnginePoints(event);
    expect(analyticsEngineBlobLayout).toHaveLength(20);
    expect(analyticsEngineDoubleLayout).toHaveLength(11);
    expect(point?.indexes).toEqual(["tenant_a"]);
    expect(point?.blobs).toHaveLength(20);
    expect(point?.doubles).toHaveLength(11);
    expect(point?.blobs?.[0]).toBe("usage");
    expect(point?.blobs?.[19]).toBe(event.requestId);
    expect(JSON.stringify(point)).not.toContain("arguments");
    expect(JSON.stringify(point)).not.toContain("visibleTools");
  });

  it("caps optional rule and visible-tool rows", () => {
    const event = discovery({ matchedRuleIds: ["rule_a", "rule_b"] });
    const points = usageEventToAnalyticsEnginePoints(event, {
      emitRuleHitRows: true,
      emitVisibleToolRows: true,
      maxSupplementalRows: 3,
    });
    expect(points).toHaveLength(4);
    expect(points.map((point) => point.blobs?.[0])).toEqual([
      "usage",
      "rule_hit",
      "rule_hit",
      "tool_visible",
    ]);
    expect(points[3]?.blobs?.[13]).toBe("crm/read");
  });

  it("attempts every row and accounts failures without rejecting", async () => {
    const points: AnalyticsEngineDataPoint[] = [];
    let calls = 0;
    const dataset: AnalyticsEngineDataset = {
      writeDataPoint: vi.fn((point) => {
        calls += 1;
        if (calls === 2) throw new Error("sampled outage");
        if (point) points.push(point);
      }),
    };
    const errors = vi.fn(() => {
      throw new Error("broken diagnostics");
    });
    const sink = new CloudflareAnalyticsEngineSink(dataset, {
      emitRuleHitRows: true,
      onError: errors,
    });
    await expect(
      sink.recordUsage(discovery({ matchedRuleIds: ["rule_a", "rule_b"] }))
    ).resolves.toBeUndefined();
    expect(dataset.writeDataPoint).toHaveBeenCalledTimes(3);
    expect(points).toHaveLength(2);
    expect(sink.stats).toEqual({
      eventsWritten: 1,
      rowsWritten: 2,
      droppedEvents: 0,
      droppedRows: 1,
    });
    expect(errors).toHaveBeenCalledTimes(1);

    const event = usage();
    await expect(
      sink.recordUsage({ ...event, arguments: { secret: true } } as UsageEvent)
    ).resolves.toBeUndefined();
    expect(sink.stats.droppedEvents).toBe(1);
  });
});

type SqlBinding = string | number | null;

class NodeSqlStorage {
  readonly database = new DatabaseSync(":memory:");

  exec<T extends Record<string, SqlBinding>>(query: string, ...bindings: SqlBinding[]) {
    const statement = this.database.prepare(query);
    const rows =
      statement.columns().length > 0
        ? statement.all(...bindings)
        : this.#run(statement, bindings);
    return { toArray: () => rows as T[] } as SqlStorageCursor<T>;
  }

  #run(statement: StatementSync, bindings: SqlBinding[]) {
    statement.run(...bindings);
    return [];
  }

  close() {
    this.database.close();
  }
}

class NodeDurableObjectStorage {
  readonly sqlStorage = new NodeSqlStorage();
  readonly sql = this.sqlStorage as unknown as SqlStorage;

  transactionSync<T>(callback: () => T): T {
    this.sqlStorage.database.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.sqlStorage.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlStorage.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.sqlStorage.close();
  }
}

const createFeed = (maximum = "500") => {
  const storage = new NodeDurableObjectStorage();
  const feed = new TenantFeedDurableObject(
    { storage } as unknown as DurableObjectState,
    { TENANT_FEED_MAX_EVENTS: maximum }
  );
  return { feed, storage };
};

class FakeTenantFeedNamespace {
  readonly #objects = new Map<string, ReturnType<typeof createFeed>>();

  idFromName(name: string) {
    return { name } as unknown as DurableObjectId;
  }

  get(id: DurableObjectId) {
    const name = id.name;
    if (!name) throw new Error("A named Durable Object is required.");
    let entry = this.#objects.get(name);
    if (!entry) {
      entry = createFeed();
      this.#objects.set(name, entry);
    }
    return {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        entry.feed.fetch(new Request(input, init)),
    } as unknown as DurableObjectStub;
  }

  getFeed(name: string) {
    return this.#objects.get(name);
  }

  close() {
    for (const entry of this.#objects.values()) entry.storage.close();
  }
}

describe("TenantFeedDurableObject and client", () => {
  const namespaces: FakeTenantFeedNamespace[] = [];

  afterEach(() => {
    for (const namespace of namespaces) namespace.close();
    namespaces.length = 0;
  });

  const createStore = () => {
    const namespace = new FakeTenantFeedNamespace();
    namespaces.push(namespace);
    return {
      namespace,
      store: new CloudflareTenantFeedStore(
        namespace as unknown as DurableObjectNamespace
      ),
    };
  };

  it("serves the full deterministic query interface from the exact capped feed", async () => {
    sequence = 0;
    const { store } = createStore();
    const events = [
      discovery({ ts: "2026-07-21T00:01:00.000Z" }),
      usage({ ts: "2026-07-21T00:02:00.000Z" }),
      usage({
        ts: "2026-07-21T00:03:00.000Z",
        tool: "crm/write",
      }),
      usage({
        ts: "2026-07-21T00:04:00.000Z",
        eventType: "denied",
        status: "denied",
        decisionEffect: "deny",
        tool: "crm/delete",
        matchedRuleIds: ["rule_deny"],
        latencyUpstreamMs: undefined,
      }),
    ];
    for (const event of events) await store.recordUsage(event);
    const range = {
      tenantId: "tenant_a",
      from: "2026-07-21T00:00:00.000Z",
      to: "2026-07-21T01:00:00.000Z",
    };
    await expect(store.summary(range)).resolves.toMatchObject({
      calls: 3,
      denials: 1,
      activeSessions: 1,
    });
    await expect(
      store.timeseries({ ...range, metric: "calls", interval: "1h" })
    ).resolves.toMatchObject({ points: [{ value: 3 }] });
    await expect(
      store.top({ ...range, dimension: "tool", metric: "calls" })
    ).resolves.toMatchObject({
      rows: [
        { key: "crm/delete", value: 1 },
        { key: "crm/read", value: 1 },
        { key: "crm/write", value: 1 },
      ],
    });
    const recent = await store.recent({ ...range, limit: 10 });
    expect(recent.events.map((event) => event.tool ?? event.eventType)).toEqual([
      "crm/delete",
      "crm/write",
      "crm/read",
      "discover",
    ]);
    await expect(
      store.sessionTimeline({ ...range, sessionId: "session_a" })
    ).resolves.toMatchObject({ items: [{}, {}, {}, {}] });
    await expect(store.flows(range)).resolves.toMatchObject({
      transitions: [{ source: "crm/read", target: "crm/write", count: 1 }],
    });
    await expect(
      store.policyInsights({ ...range, ruleIds: ["rule_allow", "rule_never"] })
    ).resolves.toMatchObject({
      zeroHitRuleIds: ["rule_never"],
      denialHotspots: [{ tool: "crm/delete", denials: 1 }],
      unusedVisibleTools: [{ tool: "unused/tool", discoveryCount: 1 }],
    });
  });

  it("pins a feed to its tenant and rejects payload fields", async () => {
    const { namespace, store } = createStore();
    const event = usage();
    await store.recordUsage(event);
    const feed = namespace.getFeed("tenant_a");
    expect(feed).toBeDefined();
    const crossed = await feed?.feed.fetch(
      new Request("https://tenant-feed.internal/event?tenant=tenant_b", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...event, tenantId: "tenant_b" }),
      })
    );
    expect(crossed?.status).toBe(400);
    const invalid = await feed?.feed.fetch(
      new Request("https://tenant-feed.internal/event?tenant=tenant_a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...event, arguments: { secret: true } }),
      })
    );
    expect(invalid?.status).toBe(400);
  });

  it("keeps an exact bounded ring and idempotently replaces event IDs", async () => {
    sequence = 0;
    const { feed, storage } = createFeed("100");
    for (let index = 0; index < 101; index += 1) {
      const event = usage({
        id: `usage_ring_${String(index).padStart(3, "0")}`,
        ts: new Date(
          Date.parse("2026-07-21T00:00:00.000Z") + index * 1_000
        ).toISOString(),
      });
      const response = await feed.fetch(
        new Request("https://tenant-feed.internal/event?tenant=tenant_a", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(event),
        })
      );
      expect(response.status).toBe(202);
    }
    const rows = storage.sqlStorage.database
      .prepare("SELECT id FROM usage_events ORDER BY ts")
      .all() as Array<{ id: string }>;
    expect(rows).toHaveLength(100);
    expect(rows[0]?.id).toBe("usage_ring_001");

    const summaryResponse = await feed.fetch(
      new Request("https://tenant-feed.internal/query/summary?tenant=tenant_a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: "tenant_a",
          from: "2026-07-21T00:00:00.000Z",
          to: "2026-07-21T01:00:00.000Z",
        }),
      })
    );
    await expect(summaryResponse.json()).resolves.toMatchObject({ calls: 100 });

    const replacement = usage({
      id: "usage_ring_100",
      ts: "2026-07-21T00:05:00.000Z",
      tool: "crm/replaced",
    });
    await feed.fetch(
      new Request("https://tenant-feed.internal/event?tenant=tenant_a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(replacement),
      })
    );
    expect(
      storage.sqlStorage.database
        .prepare("SELECT COUNT(*) AS count FROM usage_events")
        .get()
    ).toEqual({ count: 100 });
    storage.close();
  });
});
