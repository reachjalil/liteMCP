import { DurableObject } from "cloudflare:workers";
import {
  type AnalyticsQuery,
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
  analyticsFlowsResultSchema,
  analyticsPolicyInsightsQuerySchema,
  analyticsPolicyInsightsResultSchema,
  analyticsRecentQuerySchema,
  analyticsRecentResultSchema,
  analyticsSessionTimelineQuerySchema,
  analyticsSessionTimelineResultSchema,
  analyticsSummaryQuerySchema,
  analyticsSummaryResultSchema,
  analyticsTimeseriesQuerySchema,
  analyticsTimeseriesResultSchema,
  analyticsTopQuerySchema,
  analyticsTopResultSchema,
  entityIdSchema,
  type UsageEvent,
  usageEventSchema,
} from "@litemcp/contracts";

export const analyticsEngineBlobLayout = [
  "rowKind",
  "eventId",
  "sessionId",
  "subjectId",
  "subjectType",
  "clientName",
  "clientVersion",
  "userAgentClass",
  "eventType",
  "compositionId",
  "environmentId",
  "serverId",
  "namespace",
  "tool",
  "risk",
  "decisionEffect",
  "status",
  "errorCode",
  "policyId",
  "detail",
] as const;

export const analyticsEngineDoubleLayout = [
  "timestampMs",
  "latencyTotalMs",
  "latencyUpstreamMs",
  "requestBytes",
  "responseBytes",
  "toolsVisible",
  "toolsHidden",
  "approvalLatencyMs",
  "sdk",
  "aliasUsed",
  "auditSequence",
] as const;

export type CloudflareAnalyticsEngineOptions = {
  emitRuleHitRows?: boolean;
  emitVisibleToolRows?: boolean;
  maxSupplementalRows?: number;
  onError?: (error: unknown, event: UsageEvent) => void;
};

export type CloudflareAnalyticsEngineStats = {
  eventsWritten: number;
  rowsWritten: number;
  droppedEvents: number;
  droppedRows: number;
};

const boundedSupplementalRows = (value: number | undefined) => {
  const resolved = value ?? 32;
  if (!Number.isInteger(resolved) || resolved < 0 || resolved > 80) {
    throw new RangeError("maxSupplementalRows must be an integer from 0 to 80.");
  }
  return resolved;
};

const optionalBlob = (value: string | undefined) => value ?? null;
const optionalDouble = (value: number | undefined) => value ?? -1;

const mainAnalyticsEnginePoint = (event: UsageEvent): AnalyticsEngineDataPoint => ({
  indexes: [event.tenantId],
  blobs: [
    "usage",
    event.id,
    event.sessionId,
    event.subjectId,
    event.subjectType,
    event.clientName,
    event.clientVersion,
    event.userAgentClass,
    event.eventType,
    event.compositionId,
    event.environmentId,
    optionalBlob(event.serverId),
    optionalBlob(event.namespace),
    optionalBlob(event.tool),
    optionalBlob(event.risk),
    optionalBlob(event.decisionEffect),
    event.status,
    optionalBlob(event.errorCode),
    optionalBlob(event.policyId),
    event.requestId,
  ],
  doubles: [
    Date.parse(event.ts),
    optionalDouble(event.latencyTotalMs),
    optionalDouble(event.latencyUpstreamMs),
    optionalDouble(event.requestBytes),
    optionalDouble(event.responseBytes),
    optionalDouble(event.toolsVisible),
    optionalDouble(event.toolsHidden),
    optionalDouble(event.approvalLatencyMs),
    event.sdk ? 1 : 0,
    event.aliasUsed ? 1 : 0,
    optionalDouble(event.auditSequence),
  ],
});

const supplementalAnalyticsEnginePoint = (
  event: UsageEvent,
  rowKind: "rule_hit" | "tool_visible",
  detail: string
): AnalyticsEngineDataPoint => {
  const point = mainAnalyticsEnginePoint(event);
  const blobs = [...(point.blobs ?? [])];
  blobs[0] = rowKind;
  blobs[19] = detail;
  if (rowKind === "tool_visible") blobs[13] = detail;
  return { ...point, blobs };
};

/** Strict, stable mapping with one main row and explicitly bounded fan-out. */
export const usageEventToAnalyticsEnginePoints = (
  value: UsageEvent,
  options: Pick<
    CloudflareAnalyticsEngineOptions,
    "emitRuleHitRows" | "emitVisibleToolRows" | "maxSupplementalRows"
  > = {}
): AnalyticsEngineDataPoint[] => {
  const event = usageEventSchema.parse(value);
  const supplemental: AnalyticsEngineDataPoint[] = [];
  const maximum = boundedSupplementalRows(options.maxSupplementalRows);
  if (options.emitRuleHitRows) {
    for (const ruleId of event.matchedRuleIds) {
      if (supplemental.length >= maximum) break;
      supplemental.push(supplementalAnalyticsEnginePoint(event, "rule_hit", ruleId));
    }
  }
  if (options.emitVisibleToolRows) {
    for (const tool of event.visibleTools ?? []) {
      if (supplemental.length >= maximum) break;
      supplemental.push(supplementalAnalyticsEnginePoint(event, "tool_visible", tool));
    }
  }
  return [mainAnalyticsEnginePoint(event), ...supplemental];
};

/** Analytics Engine writes are best-effort and never reject a product request. */
export class CloudflareAnalyticsEngineSink implements AnalyticsSink {
  readonly #options: Required<
    Pick<
      CloudflareAnalyticsEngineOptions,
      "emitRuleHitRows" | "emitVisibleToolRows" | "maxSupplementalRows"
    >
  > &
    Pick<CloudflareAnalyticsEngineOptions, "onError">;
  readonly #counters = {
    eventsWritten: 0,
    rowsWritten: 0,
    droppedEvents: 0,
    droppedRows: 0,
  };

  constructor(
    private readonly dataset: AnalyticsEngineDataset,
    options: CloudflareAnalyticsEngineOptions = {}
  ) {
    this.#options = {
      emitRuleHitRows: options.emitRuleHitRows ?? false,
      emitVisibleToolRows: options.emitVisibleToolRows ?? false,
      maxSupplementalRows: boundedSupplementalRows(options.maxSupplementalRows),
      onError: options.onError,
    };
  }

  get stats(): CloudflareAnalyticsEngineStats {
    return { ...this.#counters };
  }

  async recordUsage(value: UsageEvent): Promise<void> {
    const parsed = usageEventSchema.safeParse(value);
    if (!parsed.success) {
      this.#counters.droppedEvents += 1;
      try {
        this.#options.onError?.(parsed.error, value);
      } catch {
        // Analytics diagnostics remain fail-open.
      }
      return;
    }
    const points = usageEventToAnalyticsEnginePoints(parsed.data, this.#options);
    let eventWroteMainRow = false;
    for (const [index, point] of points.entries()) {
      try {
        this.dataset.writeDataPoint(point);
        this.#counters.rowsWritten += 1;
        if (index === 0) eventWroteMainRow = true;
      } catch (error) {
        this.#counters.droppedRows += 1;
        try {
          this.#options.onError?.(error, parsed.data);
        } catch {
          // Analytics diagnostics remain fail-open.
        }
      }
    }
    if (eventWroteMainRow) this.#counters.eventsWritten += 1;
    else this.#counters.droppedEvents += 1;
  }
}

export type TenantFeedAnalyticsQuery = AnalyticsQuery;

const tenantFeedOrigin = "https://tenant-feed.internal";

const tenantFeedUrl = (tenantId: string, path: string) => {
  const url = new URL(path, tenantFeedOrigin);
  url.searchParams.set("tenant", tenantId);
  return url;
};

const tenantFeedResponse = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });

export class TenantFeedRequestError extends Error {
  readonly code = "TENANT_FEED_REQUEST";

  constructor(message: string) {
    super(message);
    this.name = "TenantFeedRequestError";
  }
}

/** Binding client for the exact per-tenant feed Durable Object. */
export class CloudflareTenantFeedStore implements AnalyticsSink, AnalyticsQuery {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  #stub(tenantId: string) {
    return this.namespace.get(this.namespace.idFromName(tenantId));
  }

  async #request<T>(tenantId: string, path: string, body: unknown): Promise<T> {
    const response = await this.#stub(tenantId).fetch(tenantFeedUrl(tenantId, path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const problem = await response.text();
      throw new TenantFeedRequestError(
        `Tenant feed request failed (${response.status}): ${problem.slice(0, 500)}`
      );
    }
    return (await response.json()) as T;
  }

  async recordUsage(value: UsageEvent): Promise<void> {
    const event = usageEventSchema.parse(value);
    await this.#request(event.tenantId, "/event", event);
  }

  async summary(input: AnalyticsSummaryQuery): Promise<AnalyticsSummaryResult> {
    const query = analyticsSummaryQuerySchema.parse(input);
    return analyticsSummaryResultSchema.parse(
      await this.#request(query.tenantId, "/query/summary", query)
    );
  }

  async timeseries(
    input: AnalyticsTimeseriesQuery
  ): Promise<AnalyticsTimeseriesResult> {
    const query = analyticsTimeseriesQuerySchema.parse(input);
    return analyticsTimeseriesResultSchema.parse(
      await this.#request(query.tenantId, "/query/timeseries", query)
    );
  }

  async top(input: AnalyticsTopQuery): Promise<AnalyticsTopResult> {
    const query = analyticsTopQuerySchema.parse(input);
    return analyticsTopResultSchema.parse(
      await this.#request(query.tenantId, "/query/top", query)
    );
  }

  async recent(input: AnalyticsRecentQuery): Promise<AnalyticsRecentResult> {
    const query = analyticsRecentQuerySchema.parse(input);
    return analyticsRecentResultSchema.parse(
      await this.#request(query.tenantId, "/query/recent", query)
    );
  }

  async sessionTimeline(
    input: AnalyticsSessionTimelineQuery
  ): Promise<AnalyticsSessionTimelineResult> {
    const query = analyticsSessionTimelineQuerySchema.parse(input);
    return analyticsSessionTimelineResultSchema.parse(
      await this.#request(query.tenantId, "/query/session-timeline", query)
    );
  }

  async flows(input: AnalyticsFlowsQuery): Promise<AnalyticsFlowsResult> {
    const query = analyticsFlowsQuerySchema.parse(input);
    return analyticsFlowsResultSchema.parse(
      await this.#request(query.tenantId, "/query/flows", query)
    );
  }

  async policyInsights(
    input: AnalyticsPolicyInsightsQuery
  ): Promise<AnalyticsPolicyInsightsResult> {
    const query = analyticsPolicyInsightsQuerySchema.parse(input);
    return analyticsPolicyInsightsResultSchema.parse(
      await this.#request(query.tenantId, "/query/policy-insights", query)
    );
  }
}

type TenantFeedEnvironment = {
  TENANT_FEED_MAX_EVENTS?: string;
};

type TenantFeedMetadataRow = { value: string };
type TenantFeedEventRow = { event: string };

const tenantFeedMaximum = (value: string | undefined) => {
  const parsed = Number(value ?? "500");
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 10_000 ? parsed : 500;
};

/**
 * Exact, payload-free, capped sibling Durable Object. It has no access to or
 * coupling with TenantAuthorityDurableObject security state.
 */
export class TenantFeedDurableObject extends DurableObject<TenantFeedEnvironment> {
  readonly #storage: DurableObjectStorage;
  readonly #sql: SqlStorage;
  readonly #maxEvents: number;
  #tenantId: string | undefined;

  constructor(state: DurableObjectState, env: TenantFeedEnvironment = {}) {
    super(state, env);
    this.#storage = state.storage;
    this.#sql = state.storage.sql;
    this.#maxEvents = tenantFeedMaximum(env.TENANT_FEED_MAX_EVENTS);
    this.#sql.exec(`
      CREATE TABLE IF NOT EXISTS feed_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID
    `);
    this.#sql.exec(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        event TEXT NOT NULL
      ) WITHOUT ROWID
    `);
    this.#sql.exec(
      "CREATE INDEX IF NOT EXISTS usage_events_ts ON usage_events (ts, id)"
    );
    this.#sql.exec(
      "CREATE INDEX IF NOT EXISTS usage_events_session_ts ON usage_events (session_id, ts, id)"
    );
    this.#tenantId = this.#sql
      .exec<TenantFeedMetadataRow>(
        "SELECT value FROM feed_metadata WHERE key = 'tenant'"
      )
      .toArray()[0]?.value;
  }

  #bindTenant(tenantId: string) {
    if (this.#tenantId) {
      if (this.#tenantId !== tenantId) {
        throw new TenantFeedRequestError("Tenant feed boundary violation.");
      }
      return;
    }
    const bound = this.#storage.transactionSync(() => {
      this.#sql.exec(
        "INSERT OR IGNORE INTO feed_metadata (key, value) VALUES ('tenant', ?)",
        tenantId
      );
      return this.#sql
        .exec<TenantFeedMetadataRow>(
          "SELECT value FROM feed_metadata WHERE key = 'tenant'"
        )
        .toArray()[0]?.value;
    });
    if (bound !== tenantId) {
      throw new TenantFeedRequestError("Tenant feed boundary violation.");
    }
    this.#tenantId = bound;
  }

  #tenant(url: URL) {
    const parsed = entityIdSchema.safeParse(url.searchParams.get("tenant"));
    if (!parsed.success) {
      throw new TenantFeedRequestError("A valid tenant is required.");
    }
    const tenantId = parsed.data;
    this.#bindTenant(tenantId);
    return tenantId;
  }

  async #record(request: Request, url: URL) {
    const tenantId = this.#tenant(url);
    const event = usageEventSchema.parse(await request.json());
    if (event.tenantId !== tenantId) {
      throw new TenantFeedRequestError("Event tenant does not match feed tenant.");
    }
    this.#storage.transactionSync(() => {
      this.#sql.exec(
        `INSERT INTO usage_events (id, ts, session_id, event)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           ts = excluded.ts,
           session_id = excluded.session_id,
           event = excluded.event`,
        event.id,
        Date.parse(event.ts),
        event.sessionId,
        JSON.stringify(event)
      );
      this.#sql.exec(
        `DELETE FROM usage_events
         WHERE id IN (
           SELECT id FROM usage_events
           ORDER BY ts DESC, id DESC
           LIMIT -1 OFFSET ?
         )`,
        this.#maxEvents
      );
    });
    return tenantFeedResponse({ accepted: true }, 202);
  }

  #events(tenantId: string, from: string, to: string) {
    const rows = this.#sql
      .exec<TenantFeedEventRow>(
        `SELECT event FROM usage_events
         WHERE ts >= ? AND ts < ?
         ORDER BY ts, id
         LIMIT ?`,
        Date.parse(from),
        Date.parse(to),
        this.#maxEvents
      )
      .toArray();
    return rows.map((row) => {
      const event = usageEventSchema.parse(JSON.parse(row.event));
      if (event.tenantId !== tenantId) {
        throw new TenantFeedRequestError("Stored event crossed the tenant boundary.");
      }
      return event;
    });
  }

  async #query(request: Request, url: URL) {
    const tenantId = this.#tenant(url);
    const body = await request.json();
    switch (url.pathname) {
      case "/query/recent": {
        const query = analyticsRecentQuerySchema.parse(body);
        if (query.tenantId !== tenantId)
          throw new TenantFeedRequestError("Tenant mismatch.");
        return tenantFeedResponse(
          aggregateRecent(this.#events(tenantId, query.from, query.to), query)
        );
      }
      case "/query/summary": {
        const query = analyticsSummaryQuerySchema.parse(body);
        if (query.tenantId !== tenantId)
          throw new TenantFeedRequestError("Tenant mismatch.");
        return tenantFeedResponse(
          aggregateSummary(this.#events(tenantId, query.from, query.to), query)
        );
      }
      case "/query/timeseries": {
        const query = analyticsTimeseriesQuerySchema.parse(body);
        if (query.tenantId !== tenantId)
          throw new TenantFeedRequestError("Tenant mismatch.");
        return tenantFeedResponse(
          aggregateTimeseries(this.#events(tenantId, query.from, query.to), query)
        );
      }
      case "/query/top": {
        const query = analyticsTopQuerySchema.parse(body);
        if (query.tenantId !== tenantId)
          throw new TenantFeedRequestError("Tenant mismatch.");
        return tenantFeedResponse(
          aggregateTop(this.#events(tenantId, query.from, query.to), query)
        );
      }
      case "/query/session-timeline": {
        const query = analyticsSessionTimelineQuerySchema.parse(body);
        if (query.tenantId !== tenantId)
          throw new TenantFeedRequestError("Tenant mismatch.");
        return tenantFeedResponse(
          aggregateSessionTimeline(this.#events(tenantId, query.from, query.to), query)
        );
      }
      case "/query/flows": {
        const query = analyticsFlowsQuerySchema.parse(body);
        if (query.tenantId !== tenantId)
          throw new TenantFeedRequestError("Tenant mismatch.");
        return tenantFeedResponse(
          aggregateFlows(this.#events(tenantId, query.from, query.to), query)
        );
      }
      case "/query/policy-insights": {
        const query = analyticsPolicyInsightsQuerySchema.parse(body);
        if (query.tenantId !== tenantId)
          throw new TenantFeedRequestError("Tenant mismatch.");
        return tenantFeedResponse(
          aggregatePolicyInsights(this.#events(tenantId, query.from, query.to), query)
        );
      }
      default:
        return tenantFeedResponse({ code: "NOT_FOUND" }, 404);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/event") {
        return await this.#record(request, url);
      }
      if (request.method === "POST" && url.pathname.startsWith("/query/")) {
        return await this.#query(request, url);
      }
      return tenantFeedResponse({ code: "NOT_FOUND" }, 404);
    } catch (error) {
      if (error instanceof TenantFeedRequestError) {
        return tenantFeedResponse({ code: error.code, message: error.message }, 400);
      }
      if (error instanceof Error && error.name === "ZodError") {
        return tenantFeedResponse(
          { code: "INVALID_ANALYTICS_CONTRACT", message: error.message },
          400
        );
      }
      console.error("Tenant feed Durable Object request failed.", error);
      return tenantFeedResponse(
        { code: "INTERNAL_ERROR", message: "Tenant feed request failed." },
        500
      );
    }
  }
}
