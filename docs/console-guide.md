# Management console guide

The Astro application mounts a React management console at `/app`. The console
uses only the public control-plane API; it does not import deployment adapters
or mutate storage directly.

The current console is an early, connected vertical slice. Screens described as
“read-only” or “preview” are not complete enterprise workflows.

## Authentication modes

### Authenticated mode

In production, Better Auth supplies the user, active organization, and
membership role. The server ignores demo tenant/role headers and replaces a
caller-supplied session subject with the authenticated user. The login UI can
create a first organization and the server bootstraps its starter environment,
roles, empty composition, and policy idempotently. Configure email and identity
providers before exposing this mode publicly; no deployed first-admin journey
has passed.

### Explicit demo mode

`/app?demo=1` enables deterministic local demo headers for `org_demo`. Use it
only with a loopback demo server and disposable data. The banner remains visible
while active. It is not an impersonation or production support mechanism.

## Navigation

| Area | Current functionality | Availability |
| --- | --- | --- |
| Overview | Organization/environment summary, gateway endpoint/protocol/store, counts, setup progress, and recent audit | Available now |
| MCP catalog | Create/list/update/delete servers, manually probe/import tools, review health/drift, and accept an intentional drift | Preview; no authenticated or scheduled upstream discovery E2E |
| Composer | Create/edit multi-member pinned compositions, aliases, publish a version bump, and delete unused compositions | Preview; immutable diff/rollback history is absent |
| Identity & sessions | Issue/list/revoke short-lived sessions; manage roles/assignments and encrypted IdP control records; create a service principal with one-time secret display | Preview; live IdP/member and complete principal lifecycle are absent |
| Policy simulator | Create/edit/lint/activate/archive policy drafts, simulate decisions, and operate the emergency freeze overlay | Preview; multi-record transaction/rollback and external identity proof are absent |
| Approvals | View bound approval metadata and approve/deny using the current generation/fingerprint | Preview; retry remains client-driven and no deployed two-user notification journey exists |
| Observability | Six API-backed Insight views, date ranges, exact quota standing, payload-free event/audit linkage, and CSV export | Preview; no browser/deployment proof, complete managed history, push live transport, OTel, alerts, or SIEM |
| Settings | Organization/environment/runtime/authority details, freeze controls, and portable import/export | Preview; import is restricted to a pristine target and no live cross-target journey exists |

The URL hash selects an area, for example `/app#composer` or `/app#policy`.

## Register a server

1. Open **MCP catalog**.
2. Enter a stable name and slug.
3. Select the transport.
4. For remote HTTP, provide a credential-free HTTP(S) endpoint.
5. Create the server, then run **Probe + import** to perform upstream
   `initialize` and `tools/list`.
6. Review imported schemas, health, version pin, and any drift quarantine before
   publishing a composition.

Remote endpoints cannot include credentials, query strings, fragments, invalid
percent encoding, or credential-like path segments. Connected-account and
credential-profile selection are not available yet.

## Create a composition

1. Register at least one server.
2. Open **Composer**.
3. Choose the active environment.
4. Select a pinned server version.
5. Set a stable namespace.
6. Create the composition.

The form supports multiple enabled members, stable namespaces, pinned versions,
and aliases. Save changes as a draft, then publish after every selected member
has a healthy accepted probe. Draft compositions cannot issue a session or
execute. Immutable graph history, schema diff UX, and rollback remain absent.

## Simulate policy

The simulator evaluates a subject, action, public tool name, and risk class. Use
it to verify both discovery and execution outcomes. An allowed discovery result
does not bypass the execution-time recheck.

For each simulation, inspect:

- final effect;
- matched rule and explanation;
- role/group/tool/risk inputs;
- request ID when the API reports an error.

The same area can create/edit drafts, show lint findings, activate a valid draft,
archive an inactive policy, and freeze/unfreeze the tenant. Activation advances
the authorization epoch. Version comparison, rollback history, and deployed
distributed invalidation proof remain absent.

## Issue and revoke a session

The console can issue a scoped token for a published composition and active
environment. The token is returned once; only its hash is stored. Copy it only
into an approved client and avoid screenshots, tickets, chat messages, and shell
history.

In authenticated production mode, subject fields in the request are not an
impersonation mechanism: the server binds the authenticated identity. The
console lists sessions and can revoke an active token. Authorization epochs
cover LiteMCP role/policy/IdP/freeze changes, but automatic propagation from
Better Auth logout/ban/membership removal and SCIM is not wired.

## Audit and approvals

The audit view contains redacted metadata, sequence/hash linkage, outcome, and
request correlation. It intentionally does not show raw credentials. Payload
capture is not a current feature.

Approval-required execution creates a pending record before upstream dispatch.
The console lists the full non-payload binding and lets a different
owner/admin/approver approve or deny using the current generation and
fingerprint. An approval is consumed once only when the original client retries
the exact execution context. The server does not store arguments or resume a
call after a crash, and no native email/Slack or deployed multi-user workflow is
proved.

## Usage observability

Observability is a separate, management-gated Insight Plane rather than a
relabelled audit table:

1. **Dashboard** shows tool-attempt KPIs, denial/error rates, p50/p95 latency,
   top tools, self-reported clients, opaque subject IDs, and exact quota
   standing.
2. **Live** shows the recent payload-free event tail, active sessions, pending
   approvals, and a calls-per-minute sparkline. It polls every five seconds
   only while the view is open and pauses while the document is hidden.
3. **Tools** ranks canonical tools and drills into volume, denials, errors,
   latency, callers, clients, rules, and servers.
4. **Identities** groups events by opaque `subjectId`; the API does not join
   profile display names or email addresses into analytics.
5. **Sessions** renders a relative timeline and total/upstream latency
   waterfall, with `requestId` and available audit ID/sequence/hash receipts.
6. **Policy insights** shows rule hits/zero-hit rules, denial hotspots,
   discovery-to-execution conversion, unused visible tools, approval latency,
   and successful tool-to-tool flows.

Use the 24-hour, 7-day, and 30-day presets or refresh the current range. Export
downloads the selected view as CSV. Client name/version labels are supplied by
the connecting MCP client's `initialize` request and are self-reported, not a
verified named-client attestation.

Analytics never contains tool arguments or results. It is fail open and may be
incomplete; audit remains the fail-closed evidence path. Managed-cloud queries
currently read a capped exact event feed, so a selected date range can exceed
the retained feed history. There is no WebSocket/SSE live path or browser E2E
proof in this revision. See
[`usage-observability.md`](./usage-observability.md).

## Errors and recovery

- A page-level alert reports partial refresh failures while retaining successful
  sections.
- Mutation notices include a request ID when available.
- Validation errors should identify field paths.
- Authentication failures require signing in/selecting an organization or
  returning to explicit local demo mode.
- Readiness failures indicate a server dependency problem and should not be
  worked around in the browser.

If a mutation result is uncertain, refresh before retrying. Mutating API
idempotency is not complete, so avoid blind repeated submissions.

## Planned enterprise surfaces

The product contract still requires complete organization/member administration,
connected accounts and credential profiles, immutable composition/policy
diff/rollback, health/region/credential routing, complete service-principal
lifecycle, triggers, OpenTelemetry, alerts/SIEM, production API credentials,
and deployment diagnostics. Insight O-F (alerts, digests, and SIEM push) remains
outstanding. These are tracked in
[`feature-reference.md`](./feature-reference.md) and
[`requirements-traceability.md`](./requirements-traceability.md); they should
not be inferred from navigation labels alone.
