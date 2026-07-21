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
caller-supplied session subject with the authenticated user. Configure identity
providers and first-admin bootstrap before exposing this mode publicly; the
bootstrap journey is not complete today.

### Explicit demo mode

`/app?demo=1` enables deterministic local demo headers for `org_demo`. Use it
only with a loopback demo server and disposable data. The banner remains visible
while active. It is not an impersonation or production support mechanism.

## Navigation

| Area | Current functionality | Availability |
| --- | --- | --- |
| Overview | Organization/environment summary, gateway endpoint/protocol/store, counts, setup progress, and recent audit | Available now |
| MCP catalog | List registered servers and register one definition with transport, endpoint/command metadata, version, tools, visibility, and tags | Available now for create/list; lifecycle is Preview |
| Composer | List compositions and create a first pinned, namespaced member in the active environment | Available now for the slice; graph editor/diff/promotion are Designed |
| Identity & sessions | List provider metadata and issue a short-lived session; token is displayed once | Preview; production identity comes from the authenticated session |
| Policy simulator | Select policy context and explain allow/deny/approval for subject/action/tool/risk | Available now for the current policy model |
| Approvals | View pending approval metadata and correlated audit events | Preview; decision/resume workflow is not implemented |
| Observability | Gateway state, audit totals, and redacted audit ledger | Preview; OTel/traces/metrics/SIEM are Designed |
| Settings | Organization/environment/runtime details and portable export action | Preview; full configuration lifecycle/import is not implemented |

The URL hash selects an area, for example `/app#composer` or `/app#policy`.

## Register a server

1. Open **MCP catalog**.
2. Enter a stable name and slug.
3. Select the transport.
4. For remote HTTP, provide a credential-free HTTP(S) endpoint.
5. Provide a version and tool metadata.
6. Submit and retain the returned request ID shown in the notice.

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

The current form creates one initial member. The domain/API support member and
alias arrays, but the full multi-member graph, schema conflict/diff, promotion,
and rollback experience remains planned. Draft compositions cannot issue a
session or execute.

## Simulate policy

The simulator evaluates a subject, action, public tool name, and risk class. Use
it to verify both discovery and execution outcomes. An allowed discovery result
does not bypass the execution-time recheck.

For each simulation, inspect:

- final effect;
- matched rule and explanation;
- role/group/tool/risk inputs;
- request ID when the API reports an error.

Policy edit, activation, diff, rollback, and distributed invalidation are not
complete in the current console.

## Issue and revoke a session

The console can issue a scoped token for a published composition and active
environment. The token is returned once; only its hash is stored. Copy it only
into an approved client and avoid screenshots, tickets, chat messages, and shell
history.

In authenticated production mode, subject fields in the request are not an
impersonation mechanism: the server binds the authenticated identity. Explicit
revoke is implemented through the API/SDK. A session inventory and revoke
button are still required in the console, as are automatic revocation epochs
for logout, SCIM deprovisioning, and role/group changes.

## Audit and approvals

The audit view contains redacted metadata, sequence/hash linkage, outcome, and
request correlation. It intentionally does not show raw credentials. Payload
capture is not a current feature.

Approval-required execution creates a pending record before upstream dispatch.
The console lists those records but does not yet authorize an independent
approver decision or resume the exact request. Do not present the current view
as a complete approval workflow.

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

The product contract also requires onboarding, organization/workspace/project
administration, users/groups/custom roles/service principals, connected
accounts and credential profiles, composition graph/diff/promotion, route and
health editor, session inventory, independent approval decisions, triggers,
traces/metrics, API credentials, import, and deployment diagnostics. These are
tracked in [`feature-reference.md`](./feature-reference.md) and
[`requirements-traceability.md`](./requirements-traceability.md); they should
not be inferred from navigation labels alone.
