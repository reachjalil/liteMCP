import type { UsageEvent } from "@litemcp/contracts";
import { usageEventSchema } from "@litemcp/contracts";
import type { Collection, Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import {
  ensureMongoAnalyticsCollection,
  MongoAnalyticsSetupError,
  MongoAnalyticsStore,
  type MongoUsageEventDocument,
  mongoDocumentToUsageEvent,
  usageEventToMongoDocument,
} from "./analytics.js";

let sequence = 0;
const usage = (overrides: Partial<UsageEvent> = {}) => {
  sequence += 1;
  return usageEventSchema.parse({
    id: `usage_${sequence}`,
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
    ts: `2026-07-21T00:${String(sequence).padStart(2, "0")}:00.000Z`,
    protocolVersion: "2025-11-25",
    ...overrides,
  });
};

class FakeMongoCollection {
  readonly documents: MongoUsageEventDocument[] = [];
  readonly indexes: unknown[] = [];
  readonly filters: unknown[] = [];
  insertFailure: unknown;
  insertCalls = 0;

  async createIndexes(indexes: unknown[]) {
    this.indexes.push(...indexes);
    return indexes.map((_, index) => `index-${index}`);
  }

  async insertMany(documents: MongoUsageEventDocument[]) {
    this.insertCalls += 1;
    if (this.insertFailure) throw this.insertFailure;
    this.documents.push(...structuredClone(documents));
    return { insertedCount: documents.length };
  }

  find(filter: { "meta.tenantId": string; ts: { $gte: Date; $lt: Date } }) {
    this.filters.push(filter);
    let limit = Number.POSITIVE_INFINITY;
    const cursor = {
      sort: () => cursor,
      limit: (value: number) => {
        limit = value;
        return cursor;
      },
      toArray: async () =>
        this.documents
          .filter(
            (document) =>
              document.meta.tenantId === filter["meta.tenantId"] &&
              document.ts >= filter.ts.$gte &&
              document.ts < filter.ts.$lt
          )
          .sort(
            (left, right) =>
              left.ts.getTime() - right.ts.getTime() || left.id.localeCompare(right.id)
          )
          .slice(0, limit)
          .map((document) => structuredClone(document)),
    };
    return cursor;
  }
}

class FakeMongoDatabase {
  readonly collectionValue = new FakeMongoCollection();
  readonly createCalls: Array<{ name: string; options: unknown }> = [];
  readonly commands: unknown[] = [];
  createFailure: unknown;
  existing:
    | {
        type?: string;
        options?: { timeseries?: { timeField?: string; metaField?: string } };
      }
    | undefined;

  listCollections() {
    return { toArray: async () => (this.existing ? [this.existing] : []) };
  }

  async createCollection(name: string, options: unknown) {
    if (this.createFailure) throw this.createFailure;
    this.createCalls.push({ name, options });
    this.existing = {
      type: "timeseries",
      options: { timeseries: { timeField: "ts", metaField: "meta" } },
    };
    return this.collectionValue;
  }

  collection() {
    return this.collectionValue;
  }

  async command(command: unknown) {
    this.commands.push(command);
    return { ok: 1 };
  }
}

const asDb = (database: FakeMongoDatabase) => database as unknown as Db;

describe("Mongo analytics collection setup and mapping", () => {
  it("creates a TTL time-series collection and tenant/range indexes", async () => {
    const database = new FakeMongoDatabase();
    const collection = await ensureMongoAnalyticsCollection(asDb(database), {
      retentionSeconds: 86_400,
    });
    expect(collection).toBe(database.collectionValue as unknown as Collection);
    expect(database.createCalls).toEqual([
      {
        name: "usage_events",
        options: {
          timeseries: {
            timeField: "ts",
            metaField: "meta",
            granularity: "seconds",
          },
          expireAfterSeconds: 86_400,
        },
      },
    ]);
    expect(database.collectionValue.indexes).toHaveLength(3);
    expect(database.collectionValue.indexes).toContainEqual({
      key: { "meta.tenantId": 1, sessionId: 1, ts: 1 },
      name: "usage_tenant_session_ts",
    });
  });

  it("updates retention on an existing time-series collection and rejects regular data", async () => {
    const database = new FakeMongoDatabase();
    database.existing = { type: "timeseries" };
    await ensureMongoAnalyticsCollection(asDb(database), {
      retentionSeconds: 7_200,
    });
    expect(database.commands).toEqual([
      { collMod: "usage_events", expireAfterSeconds: 7_200 },
    ]);

    database.existing = { type: "collection" };
    await expect(ensureMongoAnalyticsCollection(asDb(database))).rejects.toBeInstanceOf(
      MongoAnalyticsSetupError
    );
  });

  it("round-trips only the strict payload-free contract with tenant metadata", () => {
    const event = usage();
    const document = usageEventToMongoDocument(event);
    expect(document.meta).toEqual({ tenantId: "tenant_a" });
    expect(document).not.toHaveProperty("tenantId");
    expect(document.ts).toBeInstanceOf(Date);
    expect(JSON.stringify(document)).not.toContain("arguments");
    expect(mongoDocumentToUsageEvent(document)).toEqual(event);
    expect(() =>
      usageEventToMongoDocument({ ...event, result: "secret" } as UsageEvent)
    ).toThrow();
  });
});

describe("Mongo analytics queue", () => {
  it("bounds the queue, batches asynchronously, and accounts drops", async () => {
    const database = new FakeMongoDatabase();
    const store = new MongoAnalyticsStore(asDb(database), {
      skipSetup: true,
      maxQueueSize: 2,
      batchSize: 1,
      flushIntervalMs: 60_000,
    });
    await Promise.all([store.recordUsage(usage()), store.recordUsage(usage())]);
    await expect(store.recordUsage(usage())).resolves.toBeUndefined();
    expect(store.stats).toMatchObject({
      queued: 2,
      accepted: 2,
      dropped: 1,
      droppedQueueFull: 1,
    });
    await expect(store.flush()).resolves.toBeUndefined();
    expect(database.collectionValue.insertCalls).toBe(2);
    expect(store.stats).toMatchObject({ queued: 0, written: 2, dropped: 1 });
  });

  it("never rejects setup/write/validation failures", async () => {
    const database = new FakeMongoDatabase();
    database.collectionValue.insertFailure = new Error("offline");
    const failures = vi.fn(() => {
      throw new Error("diagnostics failed");
    });
    const store = new MongoAnalyticsStore(asDb(database), {
      skipSetup: true,
      flushIntervalMs: 60_000,
      onError: failures,
    });
    const valid = usage();
    await expect(
      store.recordUsage({ ...valid, arguments: { secret: true } } as UsageEvent)
    ).resolves.toBeUndefined();
    await store.recordUsage(valid);
    await expect(store.flush()).resolves.toBeUndefined();
    expect(store.stats).toMatchObject({
      written: 0,
      droppedInvalid: 1,
      droppedWriteFailure: 1,
      writeFailures: 1,
      dropped: 2,
    });
    expect(failures).toHaveBeenCalledTimes(2);
  });

  it("captures asynchronous collection setup failures without an unhandled write", async () => {
    const database = new FakeMongoDatabase();
    database.createFailure = new Error("Mongo unavailable during setup");
    const failures = vi.fn();
    const store = new MongoAnalyticsStore(asDb(database), {
      flushIntervalMs: 60_000,
      onError: failures,
    });
    await store.recordUsage(usage());
    await expect(store.flush()).resolves.toBeUndefined();
    expect(store.stats).toMatchObject({
      queued: 0,
      written: 0,
      droppedWriteFailure: 1,
      writeFailures: 1,
    });
    expect(failures).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "setup", droppedEvents: 1 })
    );
  });
});

describe("Mongo analytics queries", () => {
  it("uses bounded tenant/range reads and deterministic aggregators", async () => {
    const database = new FakeMongoDatabase();
    const events = [
      usage({ id: "usage_call_1", ts: "2026-07-21T00:01:00.000Z" }),
      usage({
        id: "usage_call_2",
        ts: "2026-07-21T00:02:00.000Z",
        tool: "crm/write",
      }),
      usage({
        id: "usage_other",
        tenantId: "tenant_b",
        ts: "2026-07-21T00:03:00.000Z",
      }),
    ];
    database.collectionValue.documents.push(...events.map(usageEventToMongoDocument));
    const store = new MongoAnalyticsStore(asDb(database), {
      skipSetup: true,
      maxQueryEvents: 10,
    });
    const range = {
      tenantId: "tenant_a",
      from: "2026-07-21T00:00:00.000Z",
      to: "2026-07-21T01:00:00.000Z",
    };
    await expect(store.summary(range)).resolves.toMatchObject({ calls: 2 });
    await expect(
      store.timeseries({ ...range, metric: "calls", interval: "1h" })
    ).resolves.toMatchObject({ points: [{ value: 2 }] });
    await expect(
      store.top({ ...range, dimension: "tool", metric: "calls" })
    ).resolves.toMatchObject({ rows: [{ key: "crm/read" }, { key: "crm/write" }] });
    await expect(store.recent(range)).resolves.toMatchObject({
      events: [{ id: "usage_call_2" }, { id: "usage_call_1" }],
    });
    await expect(
      store.sessionTimeline({ ...range, sessionId: "session_a" })
    ).resolves.toMatchObject({ items: [{}, {}] });
    await expect(store.flows(range)).resolves.toMatchObject({
      transitions: [{ source: "crm/read", target: "crm/write", count: 1 }],
    });
    await expect(store.policyInsights(range)).resolves.toHaveProperty("ruleHits");
    expect(database.collectionValue.filters.at(-1)).toMatchObject({
      "meta.tenantId": "tenant_a",
    });
  });

  it("rejects query ranges and scans beyond configured bounds", async () => {
    const database = new FakeMongoDatabase();
    database.collectionValue.documents.push(
      usageEventToMongoDocument(
        usage({ id: "usage_a", ts: "2026-07-21T00:01:00.000Z" })
      ),
      usageEventToMongoDocument(
        usage({ id: "usage_b", ts: "2026-07-21T00:01:10.000Z" })
      )
    );
    const store = new MongoAnalyticsStore(asDb(database), {
      skipSetup: true,
      maxQueryEvents: 1,
      maxQueryRangeMs: 60_000,
    });
    await expect(
      store.summary({
        tenantId: "tenant_a",
        from: "2026-07-21T00:00:00.000Z",
        to: "2026-07-21T00:02:00.000Z",
      })
    ).rejects.toThrow("may not exceed");
    await expect(
      store.summary({
        tenantId: "tenant_a",
        from: "2026-07-21T00:00:30.000Z",
        to: "2026-07-21T00:01:30.000Z",
      })
    ).rejects.toThrow("may scan at most 1");
  });
});
