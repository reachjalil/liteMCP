# Usage observability and analytics

The LiteMCP Composer Insight Plane is the tenant-facing, payload-free usage
analytics path. It is implemented in the current working tree and covered by
focused local tests, but it has not been deployed or exercised with staging
traffic or a named MCP client.

## Analytics and audit are different records

| Property | Usage analytics | Audit chain |
| --- | --- | --- |
| Purpose | Usage, latency, client, policy, approval, and flow analysis | Compliance and security evidence |
| Failure behavior | Fail open; a rejected, full, or disabled sink cannot block a product request | Required pre-dispatch checkpoints fail closed |
| Contents | Bounded dimensions and numeric measures only | Redacted security and provenance metadata |
| Integrity | Query-optimized and intentionally lossy where configured | Tenant-scoped sequence/hash linkage |

The strict `UsageEvent` contract rejects unmodelled fields. Tool arguments,
tool results, email addresses, and display names are not analytics fields.
Request and response byte counts are measures, not retained bodies.

`requestId` correlates analytics with the audit chain. Where an audit write has
completed, a usage event may also carry its audit event ID, sequence, and hash
as one all-or-nothing receipt. That linkage does not make analytics a durable
or tamper-evident substitute for audit. HTTP request IDs are server-generated
UUIDs; caller-provided correlation headers never become audit or analytics
dimensions.

## Attribution and event semantics

MCP `initialize` supplies `clientInfo.name`, `clientInfo.version`, and the
protocol version. These strings are bounded and classified for analytics, but
they are **self-reported by the connecting client**. They are not proof of a
specific application and do not satisfy the named-client compatibility matrix.

The first valid initialize for a session wins. LiteMCP stores that attribution
as a separate tenant-scoped `session-attributions` document using a create-only
revision check. It does not rewrite the security-sensitive session document or
advance its authorization revision. Concurrent initializers therefore converge
on one attribution record without turning analytics metadata into authority.
Attribution lookup is fail open.

The gateway and platform service emit the following facts:

- one aggregate `discover` event for each `tools/list`, with canonical visible
  and hidden counts and a capped visible-tool sample instead of one record per
  tool;
- exactly one terminal analytics fact for each valid `tools/call` attempt,
  including success, policy or validation denial, approval pending/denied,
  quota rejection, upstream error, and tool-reported failure;
- session mint/revoke and approval required/decided lifecycle events;
- canonical tool/server/composition/environment identity, alias use, risk,
  policy effect and version, matched rule IDs, and opaque subject/session IDs;
- total gateway latency and remote-upstream latency. Upstream time and byte
  counts are measured around each remote `fetch` and accumulated across safe
  retry attempts; total latency covers the complete gateway request path.

Subject rankings and identity views intentionally show opaque `subjectId`
values. The analytics query path does not join those IDs to profile display
names or email addresses.

## Storage and query boundaries

Provider implementations plug into the same tenant-filtered `AnalyticsSink`
and `AnalyticsQuery` seams; a deployment may compose distinct sink and query
adapters.

- Memory is deterministic test/local storage.
- Portable Node uses MongoDB `usage_events`, a time-series collection with
  `ts` as the time field and tenant metadata. The default TTL is 90 days.
  Emission uses a bounded 10,000-event queue, 250-event batches, and a 100 ms
  flush interval; all are configurable. Queries are capped at 90 days and
  25,000 scanned events by default.
- Managed cloud emits a tenant-indexed main row to Workers Analytics Engine and
  sends the same event to a sibling per-tenant `TenantFeed` Durable Object. The
  feed is an exact, idempotent newest-event ring capped at 500 events by default
  (configurable from 100 to 10,000) and backs the current query API.

Analytics Engine is currently an **emission-only trend sink**. There is no
Workers Analytics Engine SQL proxy in this revision. Consequently, the managed
API's summary, time-series, top, recent, session, flow, and policy results cover
only events still present in the capped exact feed, even when the requested
time window is longer. The UI and API must not present those results as a
complete historical ledger.

Mongo TTL is configurable retention for self-hosted analytics. Managed feed
retention is count-based. Audit retention controls and SIEM delivery remain
outstanding; CSV download is not a SIEM pipeline.

## Tenant API

Every Insight route requires the same owner/admin management gate as audit. The
server derives `tenantId` from the authenticated actor and injects it into the
query; callers cannot select a tenant with a query parameter. Analytics ranges
use `[from, to)` semantics, default to the previous 24 hours, and are limited to
30 days at the HTTP boundary.

| Route | Result |
| --- | --- |
| `GET /api/v1/analytics/summary` | Calls, active identities/sessions, denial/error rates, p50/p95 latency, and pending approvals |
| `GET /api/v1/analytics/timeseries` | Calls, denials, errors, or p95 latency in `5m`, `1h`, or `1d` buckets |
| `GET /api/v1/analytics/top` | Tool, subject ID, self-reported client, rule, or server rankings |
| `GET /api/v1/analytics/recent` | Cursor-paginated payload-free event tail |
| `GET /api/v1/analytics/sessions/:id/timeline` | Session-relative event timeline and audit receipts |
| `GET /api/v1/analytics/flows` | Successful tool-to-tool transitions by session |
| `GET /api/v1/analytics/policy-insights` | Rule hits, zero-hit rules, denial hotspots, discovery conversion, and approval latency |
| `GET /api/v1/usage` | Exact server, composition, active-session, and UTC-day call quota standing |

All routes support JSON and `?format=csv`; CSV responses are private,
non-cacheable downloads. Query parameters are strict and duplicate or unknown
parameters are rejected. Analytics routes return unavailable when the runtime
has no query adapter, while `/usage` remains available because it reads exact
authority/counter state rather than analytics samples.

## Console

The Observability area has six API-backed views: Dashboard, Live, Tools,
Identities, Sessions, and Policy insights. It includes 24-hour, 7-day, and
30-day ranges, CSV export, explicit loading/empty/error states, total and
upstream latency detail, quota standing, flow visualization, and audit-receipt
links.

Live uses five-second polling only while its view is open and pauses while the
page is hidden. There is no WebSocket or server-sent-event transport in this
revision.

## Configuration

Portable analytics defaults off with `ANALYTICS_ENABLED=false`. When enabled,
`ANALYTICS_RETENTION_DAYS`, `ANALYTICS_MAX_QUEUE_SIZE`,
`ANALYTICS_BATCH_SIZE`, and `ANALYTICS_FLUSH_INTERVAL_MS` configure Mongo
retention and emission buffering. The runtime drains accepted analytics before
closing MongoDB on shutdown. See
[`configuration-reference.md`](./configuration-reference.md) for accepted
ranges and deployment-specific bindings.

## Requirement status and remaining proof

| Requirement | Current evidence | Still required |
| --- | --- | --- |
| OBS-001 | Structured usage facts cover gateway, policy, approval, session, and upstream boundaries with request/audit correlation and latency/byte measures | OpenTelemetry traces/metrics and auth-refresh/trigger/worker coverage |
| OBS-002 | Tenant-gated JSON/CSV APIs and six console views cover usage, errors, latency, denials, approvals, sessions, tools, identities, and policy patterns | Queue/concurrency/fallback/refresh views, browser E2E, and deployed acceptance |
| OBS-004 | Strict analytics contracts and tests prohibit tool payload fields; capture remains off | Formal privacy review and controls before any future capture mode exists |
| OBS-005 | Exact organization quota standing, fair-use errors, Mongo analytics TTL, and bounded managed feed exist | Identity-specific quotas, general rate controls, audit retention, alerts, and SIEM delivery |

O-F remains outstanding. There is no staging or deployment proof, named-client
proof, Playwright acceptance, load result, WebSocket/SSE live transport, Mongo
change-stream transport, Analytics Engine SQL query path, OpenTelemetry
exporter, configured alerting, weekly digest, Slack/email alert delivery, or
SIEM webhook in this revision. Approval lifecycle analytics also need an explicit
generation field to distinguish reuse following an expired or otherwise
undecided approval generation exactly.
