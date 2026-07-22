import type {
  AnalyticsFlowsQuery,
  AnalyticsFlowsResult,
  AnalyticsPolicyInsightsQuery,
  AnalyticsPolicyInsightsResult,
  AnalyticsRecentQuery,
  AnalyticsRecentResult,
  AnalyticsSessionTimelineQuery,
  AnalyticsSessionTimelineResult,
  AnalyticsSummaryQuery,
  AnalyticsSummaryResult,
  AnalyticsTimeseriesQuery,
  AnalyticsTimeseriesResult,
  AnalyticsTopQuery,
  AnalyticsTopResult,
  UsageEvent,
} from "@litemcp/contracts";

/** Append-only, fail-open emission boundary implemented by each runtime. */
export interface AnalyticsSink {
  recordUsage(event: UsageEvent): Promise<void>;
}

/** Tenant-filtered query boundary shared by managed and self-hosted adapters. */
export interface AnalyticsQuery {
  summary(query: AnalyticsSummaryQuery): Promise<AnalyticsSummaryResult>;
  timeseries(query: AnalyticsTimeseriesQuery): Promise<AnalyticsTimeseriesResult>;
  top(query: AnalyticsTopQuery): Promise<AnalyticsTopResult>;
  recent(query: AnalyticsRecentQuery): Promise<AnalyticsRecentResult>;
  sessionTimeline(
    query: AnalyticsSessionTimelineQuery
  ): Promise<AnalyticsSessionTimelineResult>;
  flows(query: AnalyticsFlowsQuery): Promise<AnalyticsFlowsResult>;
  policyInsights(
    query: AnalyticsPolicyInsightsQuery
  ): Promise<AnalyticsPolicyInsightsResult>;
}
