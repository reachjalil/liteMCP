# Managed-cloud fair use

Effective snapshot: 2026-07-21. These are the enforced default guardrails for a
free managed-cloud organization. They are preview limits, not an SLA, capacity
promise, paid-plan entitlement, or statement that public signup is open.

## Published defaults

| Resource | Limit per organization | How it is counted |
| --- | ---: | --- |
| Registered MCP servers | 5 | Stored server definitions |
| Compositions | 5 | Stored compositions across lifecycle states |
| Active MCP sessions | 25 | Sessions that are neither revoked nor expired; OAuth access credentials use the same session authority |
| Tool calls | 1,000 per UTC day | Authorized call attempts admitted for dispatch after argument validation and any required approval |

The daily counter resets at `00:00 UTC`. A call still counts when it is admitted
but the pre-dispatch audit write, upstream, or returned tool result later fails.
Policy denials, invalid arguments, pending approvals, `initialize`, `ping`, and
`tools/list` do not consume the tool-call counter.

Revoke unused sessions to release the active-session allowance. Expired and
revoked sessions remain audit/history records but do not count as active.

## Enforcement behavior

Quota failures use HTTP `429`. MCP `tools/call` also returns JSON-RPC error code
`-32005` with `retryable: false`. Repeating the same request cannot bypass the
limit.

The managed-cloud hybrid store routes quota counters, sessions, servers, and
compositions through the per-tenant SQLite Durable Object. Creation uses
revision-checked, short-lived quota reservations so concurrent local tests do
not oversubscribe a limit. These are still preview abuse/cost guardrails rather
than billing meters: the current authority path has not passed deployed load,
failure, or multi-region testing, and multi-document workflows are not
transactions.

These numbers are customer-visible hosted-service policy, not the public
product's license boundary. The historical public composition used the legacy
`DEFAULT_FREE_QUOTAS` constructor default. Future operated-service plan
catalogs, contract overrides, and billing projection live in the proprietary
service sibling and enter the public core only through its deployment-provided
quota resolver. The public self-hosted Node runtime is effectively unlimited
unless its operator configures local guardrails.

## Exact usage standing versus analytics

`GET /api/v1/usage` reports each limit, exact used and remaining values, and the
next UTC daily reset for tool calls. It is owner/admin management-gated and
supports JSON or `?format=csv`. The console's quota strip reads this endpoint.

These values do not come from Workers Analytics Engine or the capped tenant
analytics feed. Analytics may be disabled, sampled, dropped, or evicted without
changing quota admission or standing. Conversely, enabling analytics does not
create a billing meter or change the published limits.

The analytics `requestBytes`, `responseBytes`, and call-attempt totals are
observability measures and can differ from the admitted-dispatch counter above.
Policy denials and approval-pending attempts appear in Insight views but do not
consume the daily tool-call allowance.

## Fair-use boundary

- Do not attempt to evade organization limits, rotate identities to avoid a
  limit, probe other tenants, disrupt availability, or use the preview for
  unlawful or abusive traffic.
- A valid quota allowance does not authorize access to an upstream system or
  override LiteMCP policy, approval, provider, or legal restrictions.
- Operators may freeze or restrict an organization to contain credible abuse
  or security risk. No response time, advance-notice period, or restoration SLA
  is promised for the preview.
- Application-wide request-rate limits, concurrency limits, WAF coverage, cost
  anomaly alerts, and production capacity evidence are not implemented or
  claimed by this policy.

Self-hosted LiteMCP Composer does not call the managed cloud for metering or
license enforcement. Operators of self-hosted deployments choose their own
capacity and abuse controls, subject to the same current implementation limits.

Because the project is pre-1.0, hosted defaults may change with a dated policy
update. A change to this customer-visible document does not change Apache
self-hosted capacity, create a license check, or authorize a mandatory call-home
path. See [`../OPEN_CORE.md`](../OPEN_CORE.md) for the permanent boundary.
