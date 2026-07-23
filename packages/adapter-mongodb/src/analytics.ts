import {
  type AnalyticsQuery,
  AnalyticsQueryLimitError,
  type AnalyticsSink,
  aggregateFlows,
  aggregatePolicyInsights,
  aggregateRecent,
  aggregateSessionTimeline,
  aggregateSummary,
  aggregateTimeseries,
  aggregateTop,
} from "@litemcp/analytics";
import {
  type AnalyticsFlowsQuery,
  type AnalyticsFlowsResult,
  type AnalyticsPolicyInsightsQuery,
  type AnalyticsPolicyInsightsResult,
  type AnalyticsRecentQuery,
  type AnalyticsRecentResult,
  type AnalyticsSessionTimelineQuery,
  type AnalyticsSessionTimelineResult,
  type AnalyticsSummaryQuery,
  type AnalyticsSummaryResult,
  type AnalyticsTimeseriesQuery,
  type AnalyticsTimeseriesResult,
  type AnalyticsTopQuery,
  type AnalyticsTopResult,
  analyticsFlowsQuerySchema,
  analyticsPolicyInsightsQuerySchema,
  analyticsRecentQuerySchema,
  analyticsSessionTimelineQuerySchema,
  analyticsSummaryQuerySchema,
  analyticsTimeseriesQuerySchema,
  analyticsTopQuerySchema,
  type UsageEvent,
  usageEventSchema,
} from "@litemcp/contracts";
import type { Collection, Db, Document } from "mongodb";

const defaultCollectionName = "usage_events";
const defaultRetentionSeconds = 90 * 24 * 60 * 60;
const defaultMaximumQueryRangeMs = 90 * 24 * 60 * 60 * 1_000;

export type MongoUsageEventDocument = Omit<UsageEvent, "tenantId" | "ts"> &
  Document & {
    ts: Date;
    meta: { tenantId: string };
  };

export type MongoAnalyticsFailure = {
  phase: "validation" | "setup" | "write";
  error: unknown;
  droppedEvents: number;
};

export type MongoAnalyticsOptions = {
  collectionName?: string;
  retentionSeconds?: number;
  maxQueueSize?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueryEvents?: number;
  maxQueryRangeMs?: number;
  skipSetup?: boolean;
  onError?: (failure: MongoAnalyticsFailure) => void;
};

export type MongoAnalyticsStats = {
  queued: number;
  accepted: number;
  written: number;
  dropped: number;
  droppedInvalid: number;
  droppedQueueFull: number;
  droppedWriteFailure: number;
  writeFailures: number;
};

type NormalizedMongoAnalyticsOptions = Required<
  Omit<MongoAnalyticsOptions, "onError">
> &
  Pick<MongoAnalyticsOptions, "onError">;

const boundedInteger = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string
) => {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return resolved;
};

const normalizeOptions = (
  options: MongoAnalyticsOptions
): NormalizedMongoAnalyticsOptions => ({
  collectionName: options.collectionName ?? defaultCollectionName,
  retentionSeconds: boundedInteger(
    options.retentionSeconds,
    defaultRetentionSeconds,
    3_600,
    10 * 365 * 24 * 60 * 60,
    "retentionSeconds"
  ),
  maxQueueSize: boundedInteger(
    options.maxQueueSize,
    10_000,
    1,
    100_000,
    "maxQueueSize"
  ),
  batchSize: boundedInteger(options.batchSize, 250, 1, 1_000, "batchSize"),
  flushIntervalMs: boundedInteger(
    options.flushIntervalMs,
    100,
    0,
    60_000,
    "flushIntervalMs"
  ),
  maxQueryEvents: boundedInteger(
    options.maxQueryEvents,
    25_000,
    1,
    100_000,
    "maxQueryEvents"
  ),
  maxQueryRangeMs: boundedInteger(
    options.maxQueryRangeMs,
    defaultMaximumQueryRangeMs,
    60_000,
    10 * 365 * 24 * 60 * 60 * 1_000,
    "maxQueryRangeMs"
  ),
  skipSetup: options.skipSetup ?? false,
  onError: options.onError,
});

export const usageEventToMongoDocument = (
  value: UsageEvent
): MongoUsageEventDocument => {
  const parsed = usageEventSchema.parse(value);
  const { tenantId, ts, ...event } = parsed;
  return {
    ...event,
    ts: new Date(ts),
    meta: { tenantId },
  };
};

export const mongoDocumentToUsageEvent = (
  value: MongoUsageEventDocument
): UsageEvent => {
  const { _id: _ignoredId, meta, ts, ...event } = value;
  return usageEventSchema.parse({
    ...event,
    tenantId: meta.tenantId,
    ts: ts.toISOString(),
  });
};

export class MongoAnalyticsSetupError extends Error {
  readonly code = "MONGO_ANALYTICS_SETUP";

  constructor(message: string) {
    super(message);
    this.name = "MongoAnalyticsSetupError";
  }
}

export const ensureMongoAnalyticsCollection = async (
  database: Db,
  options: Pick<MongoAnalyticsOptions, "collectionName" | "retentionSeconds"> = {}
): Promise<Collection<MongoUsageEventDocument>> => {
  const collectionName = options.collectionName ?? defaultCollectionName;
  const retentionSeconds = boundedInteger(
    options.retentionSeconds,
    defaultRetentionSeconds,
    3_600,
    10 * 365 * 24 * 60 * 60,
    "retentionSeconds"
  );
  const existing = (
    await database.listCollections({ name: collectionName }).toArray()
  )[0] as
    | {
        type?: string;
        options?: { timeseries?: { timeField?: string; metaField?: string } };
      }
    | undefined;

  if (!existing) {
    try {
      await database.createCollection<MongoUsageEventDocument>(collectionName, {
        timeseries: {
          timeField: "ts",
          metaField: "meta",
          granularity: "seconds",
        },
        expireAfterSeconds: retentionSeconds,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 48) throw error;
    }
  } else {
    const timeSeries = existing.options?.timeseries;
    if (
      (existing.type !== "timeseries" && !timeSeries) ||
      (timeSeries !== undefined &&
        (timeSeries.timeField !== "ts" || timeSeries.metaField !== "meta"))
    ) {
      throw new MongoAnalyticsSetupError(
        `${collectionName} exists but is not a ts/meta time-series collection.`
      );
    }
    await database.command({
      collMod: collectionName,
      expireAfterSeconds: retentionSeconds,
    });
  }

  const collection = database.collection<MongoUsageEventDocument>(collectionName);
  await collection.createIndexes([
    {
      key: { "meta.tenantId": 1, ts: -1 },
      name: "usage_tenant_ts",
    },
    {
      key: { "meta.tenantId": 1, sessionId: 1, ts: 1 },
      name: "usage_tenant_session_ts",
    },
    {
      key: { "meta.tenantId": 1, eventType: 1, ts: -1 },
      name: "usage_tenant_type_ts",
    },
  ]);
  return collection;
};

/**
 * Mongo time-series analytics adapter. Emission only enqueues validated facts;
 * setup and batch failures are accounted and dropped without rejecting callers.
 */
export class MongoAnalyticsStore implements AnalyticsSink, AnalyticsQuery {
  readonly #collection: Collection<MongoUsageEventDocument>;
  readonly #options: NormalizedMongoAnalyticsOptions;
  readonly #ready: Promise<unknown>;
  readonly #queue: MongoUsageEventDocument[] = [];
  readonly #counters = {
    accepted: 0,
    written: 0,
    droppedInvalid: 0,
    droppedQueueFull: 0,
    droppedWriteFailure: 0,
    writeFailures: 0,
  };
  #flushPromise: Promise<void> | undefined;
  #setupError: unknown;
  #setupFailed = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(database: Db, options: MongoAnalyticsOptions = {}) {
    this.#options = normalizeOptions(options);
    this.#collection = database.collection<MongoUsageEventDocument>(
      this.#options.collectionName
    );
    const setup = this.#options.skipSetup
      ? Promise.resolve()
      : ensureMongoAnalyticsCollection(database, this.#options);
    this.#ready = setup.catch((error: unknown) => {
      this.#setupFailed = true;
      this.#setupError = error;
    });
  }

  get stats(): MongoAnalyticsStats {
    const dropped =
      this.#counters.droppedInvalid +
      this.#counters.droppedQueueFull +
      this.#counters.droppedWriteFailure;
    return {
      queued: this.#queue.length,
      ...this.#counters,
      dropped,
    };
  }

  #report(failure: MongoAnalyticsFailure) {
    try {
      this.#options.onError?.(failure);
    } catch {
      // Analytics diagnostics remain fail-open.
    }
  }

  #scheduleFlush() {
    if (this.#timer || this.#flushPromise) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.flush();
    }, this.#options.flushIntervalMs);
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    const parsed = usageEventSchema.safeParse(event);
    if (!parsed.success) {
      this.#counters.droppedInvalid += 1;
      this.#report({
        phase: "validation",
        error: parsed.error,
        droppedEvents: 1,
      });
      return;
    }
    if (this.#queue.length >= this.#options.maxQueueSize) {
      this.#counters.droppedQueueFull += 1;
      return;
    }
    this.#queue.push(usageEventToMongoDocument(parsed.data));
    this.#counters.accepted += 1;
    this.#scheduleFlush();
  }

  async #drain() {
    try {
      await this.#ready;
      if (this.#setupFailed) throw this.#setupError;
    } catch (error) {
      const droppedEvents = this.#queue.length;
      this.#queue.length = 0;
      this.#counters.droppedWriteFailure += droppedEvents;
      this.#counters.writeFailures += 1;
      this.#report({ phase: "setup", error, droppedEvents });
      return;
    }
    while (this.#queue.length > 0) {
      const batch = this.#queue.splice(0, this.#options.batchSize);
      try {
        await this.#collection.insertMany(batch, { ordered: false });
        this.#counters.written += batch.length;
      } catch (error) {
        this.#counters.droppedWriteFailure += batch.length;
        this.#counters.writeFailures += 1;
        this.#report({ phase: "write", error, droppedEvents: batch.length });
      }
    }
  }

  /** Drains accepted events and always resolves, including setup/write failures. */
  async flush(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    if (this.#flushPromise) return this.#flushPromise;
    this.#flushPromise = this.#drain().finally(() => {
      this.#flushPromise = undefined;
      if (this.#queue.length > 0) this.#scheduleFlush();
    });
    return this.#flushPromise;
  }

  async #readRange(query: { tenantId: string; from: string; to: string }) {
    const from = Date.parse(query.from);
    const to = Date.parse(query.to);
    if (to - from > this.#options.maxQueryRangeMs) {
      throw new AnalyticsQueryLimitError(
        `Mongo analytics ranges may not exceed ${this.#options.maxQueryRangeMs}ms.`
      );
    }
    await this.#ready;
    if (this.#setupFailed) throw this.#setupError;
    const rows = await this.#collection
      .find({
        "meta.tenantId": query.tenantId,
        ts: { $gte: new Date(from), $lt: new Date(to) },
      })
      .sort({ ts: 1, id: 1 })
      .limit(this.#options.maxQueryEvents + 1)
      .toArray();
    if (rows.length > this.#options.maxQueryEvents) {
      throw new AnalyticsQueryLimitError(
        `Mongo analytics queries may scan at most ${this.#options.maxQueryEvents} events.`
      );
    }
    return rows.map(mongoDocumentToUsageEvent);
  }

  async summary(input: AnalyticsSummaryQuery): Promise<AnalyticsSummaryResult> {
    const query = analyticsSummaryQuerySchema.parse(input);
    return aggregateSummary(await this.#readRange(query), query);
  }

  async timeseries(
    input: AnalyticsTimeseriesQuery
  ): Promise<AnalyticsTimeseriesResult> {
    const query = analyticsTimeseriesQuerySchema.parse(input);
    return aggregateTimeseries(await this.#readRange(query), query);
  }

  async top(input: AnalyticsTopQuery): Promise<AnalyticsTopResult> {
    const query = analyticsTopQuerySchema.parse(input);
    return aggregateTop(await this.#readRange(query), query);
  }

  async recent(input: AnalyticsRecentQuery): Promise<AnalyticsRecentResult> {
    const query = analyticsRecentQuerySchema.parse(input);
    return aggregateRecent(await this.#readRange(query), query);
  }

  async sessionTimeline(
    input: AnalyticsSessionTimelineQuery
  ): Promise<AnalyticsSessionTimelineResult> {
    const query = analyticsSessionTimelineQuerySchema.parse(input);
    return aggregateSessionTimeline(await this.#readRange(query), query);
  }

  async flows(input: AnalyticsFlowsQuery): Promise<AnalyticsFlowsResult> {
    const query = analyticsFlowsQuerySchema.parse(input);
    return aggregateFlows(await this.#readRange(query), query);
  }

  async policyInsights(
    input: AnalyticsPolicyInsightsQuery
  ): Promise<AnalyticsPolicyInsightsResult> {
    const query = analyticsPolicyInsightsQuerySchema.parse(input);
    return aggregatePolicyInsights(await this.#readRange(query), query);
  }
}
