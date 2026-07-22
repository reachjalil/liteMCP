# API, SDK, and CLI reference

LiteMCP Composer exposes a control-plane API for management and a separate MCP
data-plane endpoint for clients. This document describes the implemented
vertical slice. The runtime OpenAPI document is available at
`GET /api/v1/openapi.json`.

## Base URLs

| Local surface | Default URL |
| --- | --- |
| Astro site and console | `http://localhost:4321` |
| Node control plane and MCP gateway | `http://localhost:8787` |
| OpenAPI document | `http://localhost:8787/api/v1/openapi.json` |

Managed and self-hosted installations should expose one HTTPS public origin for
the API and MCP paths. The static web origin may be the same origin or an exact
entry in the allowed-origin list.

## Authentication modes

### Explicit local demo

Demo mode accepts only the deterministic `org_demo` tenant and supports the
headers below for local testing:

```http
X-LiteMCP-Tenant: org_demo
X-LiteMCP-Role: employee
```

The supported demo roles are `employee` and `finance-admin`. These headers are
not a production authentication mechanism. Demo mode defaults off and the Node
server refuses a non-loopback bind unless the operator explicitly opts into an
unsafe isolated-test override.

### Production control plane

Production routes require a Better Auth browser session or supported bearer/API
credential. The active organization membership supplies the tenant and role;
the API ignores tenant/role demo headers and replaces any caller-supplied
session subject with the authenticated identity.

### MCP data plane

Use the short-lived session token returned by `POST /api/v1/sessions`:

```http
Authorization: Bearer lmcp_v1...
MCP-Protocol-Version: 2025-11-25
Content-Type: application/json
```

## Response envelopes

Successful control-plane responses use:

```json
{
  "data": {},
  "meta": { "requestId": "..." }
}
```

Failures use an RFC 9457-style problem document:

```json
{
  "type": "https://litemcp.dev/problems/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "Request validation failed.",
  "instance": "/api/v1/servers",
  "requestId": "...",
  "errors": [{ "path": "endpoint", "message": "..." }]
}
```

Keep `requestId` when opening an incident or correlating API and audit records.

## Implemented routes

| Method and path | Purpose | Production authority |
| --- | --- | --- |
| `GET /health` | Process and storage-capability health | Public probe |
| `GET /ready` | Auth/store readiness and dependency probe | Public probe |
| `GET /api/auth/*` / `POST /api/auth/*` | Better Auth routes | Provider/session specific |
| `GET /api/v1/openapi.json` | OpenAPI 3.1 document | Authenticated API boundary |
| `GET /api/v1/overview` | Tenant overview and counts | Active member |
| `GET /api/v1/environments` | List tenant environments | Active member |
| `GET /api/v1/servers` | List server definitions | Active member |
| `POST/PATCH/DELETE /api/v1/servers[/{id}]` | Register, update, or delete a server | Owner/admin |
| `POST /api/v1/servers/{id}/probe` | Initialize upstream, import tools, and evaluate drift | Owner/admin |
| `GET /api/v1/compositions` | List compositions | Active member |
| `POST/PATCH/DELETE /api/v1/compositions[/{id}]` | Create, update, or delete a composition | Owner/admin |
| `POST /api/v1/compositions/{id}/publish` | Publish a healthy pinned composition version | Owner/admin |
| `GET/POST/PATCH /api/v1/policies[/{id}]` | List, create, or update policy drafts | Owner/admin |
| `GET /api/v1/policies/{id}/lint` | Return deterministic conflict/unreachable findings | Owner/admin |
| `POST /api/v1/policies/{id}/activate` or `/archive` | Change policy lifecycle and authorization epoch | Owner/admin |
| `POST /api/v1/policy/simulate` | Explain a discovery/execution decision | Owner/admin |
| `POST /api/v1/sessions` | Issue a scoped MCP session for the authenticated subject | Active member |
| `GET /api/v1/sessions` | List redacted tenant sessions | Owner/admin |
| `POST /api/v1/sessions/{id}/revoke` | Revoke an owned session; administrators may revoke any tenant session | Subject or owner/admin |
| `/api/v1/roles` and `/api/v1/role-assignments` | Manage platform roles and subject assignments | Owner/admin |
| `GET /api/v1/audit?limit=100` | List redacted audit events | Owner/admin |
| `GET /api/v1/analytics/summary` | Usage KPIs, rates, latency percentiles, and pending approvals | Owner/admin |
| `GET /api/v1/analytics/timeseries?metric=...&interval=...` | Calls, denials, errors, or p95-latency buckets | Owner/admin |
| `GET /api/v1/analytics/top?dimension=...&metric=...` | Ranked tools, opaque subject IDs, reported clients, rules, or servers | Owner/admin |
| `GET /api/v1/analytics/recent` | Cursor-paginated payload-free usage facts | Owner/admin |
| `GET /api/v1/analytics/sessions/{id}/timeline` | Session timeline with request/audit receipts | Owner/admin |
| `GET /api/v1/analytics/flows` | Successful tool-to-tool transitions | Owner/admin |
| `GET /api/v1/analytics/policy-insights` | Rule hits, denial hotspots, conversion, and approval latency | Owner/admin |
| `GET /api/v1/usage` | Exact resource and UTC-day call quota standing | Owner/admin |
| `/api/v1/identity-providers` | Manage encrypted IdP control records | Owner/admin |
| `GET /api/v1/approvals` | List pending/decided approval metadata | Owner/admin |
| `POST /api/v1/approvals/{id}/decision` | Approve/deny the current generation and fingerprint | Owner/admin/approver other than requester |
| `GET /api/v1/authority`, `POST /api/v1/tenant/{freeze,unfreeze}` | Inspect or operate the emergency authority overlay | Owner/admin |
| `POST /api/v1/service-principals` | Create a one-time-secret workload identity | Owner/admin |
| `POST /api/v1/subjects/{id}/deprovision` | Remove assignments, disable matching principal, and revoke sessions | Owner/admin |
| `GET /api/v1/export`, `POST /api/v1/import` | Export/import validated non-secret portable configuration | Owner/admin |
| `/.well-known/...`, `/oauth/{tenantId}/{register,authorize,token,revoke}` | MCP OAuth metadata, consent, PKCE/token, and revocation | Public protocol endpoints plus authenticated consent |
| `POST /mcp/{tenantId}/{compositionSlug}` | MCP JSON-RPC initialize/list/call | Scoped MCP bearer token |

This table groups related lifecycle routes; the generated OpenAPI document is
the exact request/response inventory. Live identity-provider registration,
connected accounts, SCIM server routes, and complete service-principal
lifecycle are not implied by the control-record endpoints above.

## Insight Plane query rules

Analytics is separate from the audit chain. Usage emission is fail open and
may be disabled or lossy; required audit checkpoints remain fail closed. The
strict usage contract stores bounded dimensions and measures only and rejects
tool argument/result fields. `requestId` and an optional audit
ID/sequence/hash receipt provide correlation without treating analytics as
compliance evidence.

All `/analytics/*` and `/usage` routes require an owner/admin management role.
The server takes the tenant from the authenticated actor; `tenantId` is not an
accepted query selector. Analytics windows use `[from, to)`, default to the
previous 24 hours, and cannot exceed 30 days. Unknown or repeated query
parameters fail validation. Add `format=csv` for a private, non-cacheable CSV
download; JSON remains the default.

Client names and versions come from MCP `initialize` and are self-reported.
They are useful attribution labels, not verified application identity. Subject
analytics returns stable opaque subject IDs and does not join them to profile
display names or email addresses.

`GET /api/v1/usage` reads exact inventory and daily authority counters, not
Analytics Engine, Mongo samples, or the managed feed. It therefore remains
available when analytics is disabled. Other analytics routes return an
unavailable problem when no query adapter is configured.

In managed cloud, the current query adapter reads a per-tenant exact ring
capped at 500 newest events by default. Analytics Engine receives trend rows
but has no SQL query proxy in this revision, so a 30-day request is not a claim
that every 30-day event remains in the feed. Portable Mongo queries read the
tenant-filtered `usage_events` time-series collection within configured range
and scan caps. See
[`usage-observability.md`](./usage-observability.md) for the complete boundary.

## Curl walkthrough

Start the explicit demo runtime and then inspect the overview:

```bash
curl --fail-with-body http://localhost:8787/api/v1/overview \
  -H 'X-LiteMCP-Tenant: org_demo' \
  -H 'X-LiteMCP-Role: finance-admin'
```

Simulate policy:

```bash
curl --fail-with-body http://localhost:8787/api/v1/policy/simulate \
  -H 'Content-Type: application/json' \
  -H 'X-LiteMCP-Tenant: org_demo' \
  -H 'X-LiteMCP-Role: finance-admin' \
  --data '{
    "subject": {
      "type": "user",
      "id": "user_employee",
      "roles": ["employee"],
      "groups": ["employees"],
      "claims": {}
    },
    "action": "execute",
    "toolName": "finance.issue_refund",
    "risk": "financial"
  }'
```

Issue a demo session. Do not copy this subject-selection pattern into production
automation; production binds the authenticated caller instead:

```bash
curl --fail-with-body http://localhost:8787/api/v1/sessions \
  -H 'Content-Type: application/json' \
  -H 'X-LiteMCP-Tenant: org_demo' \
  -H 'X-LiteMCP-Role: employee' \
  --data '{
    "compositionId": "composition_company",
    "environmentId": "env_production",
    "subject": {
      "type": "user",
      "id": "user_employee",
      "roles": ["employee"],
      "groups": ["employees"],
      "claims": {}
    },
    "approvedClients": ["local-example"],
    "expiresInSeconds": 600
  }'
```

Send the returned token and endpoint to MCP:

```bash
curl --fail-with-body "$MCP_ENDPOINT" \
  -H "Authorization: Bearer $MCP_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

## TypeScript SDK

`@litemcp/sdk` provides `LiteMcpClient` and `McpSessionClient`:

```ts
import { LiteMcpClient, McpSessionClient } from "@litemcp/sdk";

const control = new LiteMcpClient({
  baseUrl: "http://localhost:8787",
  tenantId: "org_demo",
  demoRole: "employee",
});

const issued = await control.createSession({
  compositionId: "composition_company",
  environmentId: "env_production",
  subject: {
    type: "user",
    id: "user_employee",
    roles: ["employee"],
    groups: ["employees"],
    claims: {},
  },
  approvedClients: ["typescript-example"],
  expiresInSeconds: 600,
});

const mcp = new McpSessionClient(issued.endpoint, issued.token);
await mcp.initialize();
const tools = await mcp.listTools();
const result = await mcp.callTool("sum", { a: 2, b: 3 });
```

The control-plane client covers environments, server/composition/policy
lifecycle, sessions, roles/assignments, IdP records, approvals, authority,
service-principal creation/session issuance, activation events, and portable
import/export. See the package README for exact method names.

## Python SDK

The Python package is dependency-free at runtime:

```python
from litemcp import LiteMCPClient

control = LiteMCPClient(
    base_url="http://localhost:8787",
    tenant_id="org_demo",
    demo_role="employee",
)

overview = control.overview()
```

See [`../packages/sdk-python/README.md`](../packages/sdk-python/README.md) and
the source for the currently implemented method signatures. The Python SDK is
not yet published to a package index.

## CLI

Run the workspace CLI with:

```bash
pnpm --filter @litemcp/cli dev -- help
```

`litemcp help` lists the implemented registry/probe, composition/publish,
policy/lint/activation, session, role, IdP, approval, authority, service
principal, activation-event, and import/export commands. Create/update commands
accept `--file` or `--input`; approval decisions require the current generation
and fingerprint.

Global options include `--api`, `--tenant`, `--role`, and `--json`. Environment
fallbacks are `LITEMCP_API_URL`, `LITEMCP_TENANT_ID`, and
`LITEMCP_DEMO_ROLE`.

## API compatibility

The current API version is pre-1.0. Consumers should:

- pin package and container versions;
- treat undocumented fields as unstable;
- handle structured problem responses rather than string matching;
- retain request IDs;
- never persist a returned session token beyond its intended short lifetime;
- use the checked-in contracts or SDK instead of duplicating schemas;
- review [`release-and-lts-policy.md`](./release-and-lts-policy.md) before
  production adoption.
