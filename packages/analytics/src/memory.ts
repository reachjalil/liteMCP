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
  type UsageEvent,
  usageEventSchema,
} from "@litemcp/contracts";

import {
  aggregateFlows,
  aggregatePolicyInsights,
  aggregateRecent,
  aggregateSessionTimeline,
  aggregateSummary,
  aggregateTimeseries,
  aggregateTop,
} from "./aggregate.js";
import type { AnalyticsQuery, AnalyticsSink } from "./types.js";

/** Portable reference adapter used in tests and single-process development. */
export class MemoryAnalyticsStore implements AnalyticsSink, AnalyticsQuery {
  readonly #events: UsageEvent[] = [];

  get size() {
    return this.#events.length;
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    this.#events.push(structuredClone(usageEventSchema.parse(event)));
  }

  clear() {
    this.#events.length = 0;
  }

  async summary(query: AnalyticsSummaryQuery): Promise<AnalyticsSummaryResult> {
    return aggregateSummary(this.#events, query);
  }

  async timeseries(
    query: AnalyticsTimeseriesQuery
  ): Promise<AnalyticsTimeseriesResult> {
    return aggregateTimeseries(this.#events, query);
  }

  async top(query: AnalyticsTopQuery): Promise<AnalyticsTopResult> {
    return aggregateTop(this.#events, query);
  }

  async recent(query: AnalyticsRecentQuery): Promise<AnalyticsRecentResult> {
    return aggregateRecent(this.#events, query);
  }

  async sessionTimeline(
    query: AnalyticsSessionTimelineQuery
  ): Promise<AnalyticsSessionTimelineResult> {
    return aggregateSessionTimeline(this.#events, query);
  }

  async flows(query: AnalyticsFlowsQuery): Promise<AnalyticsFlowsResult> {
    return aggregateFlows(this.#events, query);
  }

  async policyInsights(
    query: AnalyticsPolicyInsightsQuery
  ): Promise<AnalyticsPolicyInsightsResult> {
    return aggregatePolicyInsights(this.#events, query);
  }
}
