# `@litemcp/adapter-cloudflare`

Cloudflare implementation of the portable `DocumentStore`.

`CloudflareHybridDocumentStore` keeps non-authoritative records such as
organizations, environments, and activation events in Workers KV. It routes
sessions, tenant authority, roles/assignments, identity providers,
servers/compositions/policies, approvals, service principals, audit events and
heads, quota counters, and OAuth clients/codes/refresh/grants through one SQLite
Durable Object per tenant. Its revision-aware writes and deletes are serialized
and atomic per document within that tenant object.

The aggregate store capabilities remain intentionally conservative: KV-backed
collections are eventually consistent, and the adapter does not expose
cross-document transactions. `CloudflareKvDocumentStore` remains available for
KV-only use cases; managed cloud composes the hybrid adapter and exports
`TenantAuthorityDurableObject` from its Worker entrypoint.

## Insight Plane

The analytics adapter is separate from document authority:

- `CloudflareAnalyticsEngineSink` writes one strict, payload-free main data
  point per usage event. The only index is `tenantId`; the exported 20-blob and
  11-double layouts are stable and bounded. Optional rule-hit and visible-tool
  supplemental rows are disabled by default and capped when enabled.
- `TenantFeedDurableObject` is a sibling, per-tenant SQLite Durable Object for
  exact recent events and session/flow/policy drill-downs. It maintains an
  idempotent newest-event ring (500 events by default, configurable from 100 to
  10,000) and never reads or mutates `TenantAuthorityDurableObject` state.
- `CloudflareTenantFeedStore` is the binding client and implements the exact
  feed sink plus the complete portable query interface: `summary`,
  `timeseries`, `top`, `recent`, `sessionTimeline`, `flows`, and
  `policyInsights`.

Every feed query is exact only for the newest events retained by that capped
tenant ring; it is not the historical dashboard store. Analytics Engine
remains the durable trend surface. Managed runtimes should fan both
sinks through `createFailOpenAnalyticsRecorder`/`CompositeAnalyticsSink` and
pass the resulting promise to `ctx.waitUntil`. This package does not add a
binding or export to any Worker configuration automatically.
