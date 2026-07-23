# `@litemcp/analytics`

Portable Insight Plane contracts and deterministic reference aggregations.

- `AnalyticsSink` is the fail-open emission seam.
- `AnalyticsQuery` defines the tenant-filtered summary, timeseries, top, recent,
  session timeline, flow, and policy-insight queries.
- `MemoryAnalyticsStore` is the reference adapter for tests and local use.
- `createFailOpenAnalyticsRecorder` validates and schedules events without ever
  allowing analytics failures to fail a product request.

Time ranges use `[from, to)` semantics. Latency percentiles use deterministic
nearest-rank selection. Analytics contains bounded dimensions and measures only;
the strict `UsageEvent` contract rejects argument and result payload fields.
