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
| `GET /api/v1/servers` | List server definitions | Active member |
| `POST /api/v1/servers` | Register a server | Owner/admin |
| `GET /api/v1/compositions` | List compositions | Active member |
| `POST /api/v1/compositions` | Create a composition | Owner/admin |
| `GET /api/v1/policies` | List policy versions | Active member |
| `POST /api/v1/policy/simulate` | Explain a discovery/execution decision | Owner/admin |
| `POST /api/v1/sessions` | Issue a scoped MCP session for the authenticated subject | Active member |
| `POST /api/v1/sessions/{id}/revoke` | Revoke an owned session; administrators may revoke any tenant session | Subject or owner/admin |
| `GET /api/v1/audit?limit=100` | List redacted audit events | Owner/admin |
| `GET /api/v1/identity-providers` | List configured provider metadata | Owner/admin |
| `GET /api/v1/approvals` | List pending/decided approval metadata | Owner/admin |
| `GET /api/v1/export` | Export non-secret portable configuration | Owner/admin |
| `POST /mcp/{tenantId}/{compositionSlug}` | MCP JSON-RPC initialize/list/call | Scoped MCP bearer token |

Create/update/delete coverage is intentionally incomplete in this early slice.
The absence of a route in this table means it is not yet a supported public
operation, even when a domain schema exists.

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

Control-plane methods currently include `overview`, `servers`, `compositions`,
`policies`, `audit`, `simulatePolicy`, `createSession`, `revokeSession`, and
`exportConfiguration`.

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

Implemented commands:

| Command | Purpose |
| --- | --- |
| `doctor` | Call `/health` and report local Node/API context |
| `status` | Show the tenant overview |
| `export` | Print non-secret portable configuration as JSON |
| `policy-test` | Explain one policy decision |
| `session-create` | Issue a short-lived scoped MCP session |

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
