---
name: litemcp-observability-change
description: Implement or review LiteMCP usage observability, analytics events, sinks, aggregation, quotas, exports, tenant feeds, API queries, operator dashboards, privacy behavior, or Insight Plane documentation. Use for packages/contracts analytics types, packages/analytics, adapter analytics files, gateway/core instrumentation, platform API usage routes, server wiring, or web observability UI.
---

# LiteMCP Observability Change

Evolve the Insight Plane without leaking payloads, changing product reliability,
or overstating a bounded operational feed as durable audit or billing truth.

## Invariants

- Derive tenant, actor, server, tool, request, and policy context from trusted
  execution state. Reject unknown or malformed public query inputs strictly.
- Never record tool arguments, tool results, credentials, bearer tokens, prompt
  text, arbitrary headers, or raw error bodies.
- Emit one terminal usage fact per execution path with stable outcome,
  latency/size counters, explicitly modeled measures only, and correlation
  identifiers. Do not invent billing or cost semantics.
- Analytics recording and querying fail open relative to MCP/control-plane
  availability. Audit integrity remains a separate fail-closed boundary.
- Keep time windows, buckets, pagination, cardinality, quotas, and export limits
  bounded. Enforce tenant isolation inside every sink and query, not only at the
  HTTP route.
- Preserve semantic parity across affected memory, MongoDB, Cloudflare, API,
  client, and UI surfaces. Do not widen unaffected SDKs merely to create
  superficial symmetry. Document backend precision and retention differences.
- Treat the Durable Object live feed as capped operational UX, not a durable
  billing ledger or compliance audit log.

## Change order

1. Read `docs/usage-observability.md`, `docs/managed-cloud-fair-use.md`, and the
   analytics sections of the contracts and requirements traceability.
2. Update portable contracts/types and validation first.
3. Update recorder/aggregation semantics and in-memory reference behavior.
4. Update each affected adapter with tenant-bound storage/query tests.
5. Instrument core/gateway terminal paths once; prove retries and failures do
   not double count.
6. Expose behavior through each affected API/client/UI surface with explicit
   authorization and bounded queries.
7. Update privacy, limitations, runbooks, configuration, and product claims.

## Focused evidence

```bash
pnpm --filter @litemcp/contracts test
pnpm --filter @litemcp/analytics test
pnpm --filter @litemcp/adapter-cloudflare test
pnpm --filter @litemcp/adapter-mongodb test
pnpm --filter @litemcp/mcp-gateway test
pnpm --filter @litemcp/core test
pnpm --filter @litemcp/platform-api test
pnpm --filter @litemcp/web types
pnpm check
```

When runtime composition wiring changes, also run the focused tests for
`@litemcp/server` and `@litemcp/managed-cloud`.

Report payload/privacy review, terminal-event semantics, tenant-isolation
evidence, failure isolation, backend parity, and any intentionally unsupported
billing or retention claim.
