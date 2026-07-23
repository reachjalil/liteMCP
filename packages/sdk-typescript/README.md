# `@litemcp/sdk`

Typed, dependency-light clients for the LiteMCP Composer control plane and a
scoped MCP Streamable HTTP session. Tokens are sent in headers, never URLs.

The control-plane client covers environments, server probing and schema drift,
composition publishing, draft-policy activation, scoped sessions, roles, IdPs,
approvals, tenant freeze state, activation events, and portable import/export.

```ts
import { LiteMcpClient, McpSessionClient } from "@litemcp/sdk";

const control = new LiteMcpClient({ baseUrl: "http://localhost:8787" });
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
  approvedClients: ["example"],
  expiresInSeconds: 600,
});

const mcp = new McpSessionClient(issued.endpoint, issued.token);
await mcp.initialize();
console.log(await mcp.listTools());
```

## Management lifecycle

```ts
const server = await control.createServer({
  slug: "finance",
  name: "Finance",
  description: "Finance MCP server",
  transport: "streamable-http",
  endpoint: "https://finance.example.com/mcp",
  version: "1.0.0",
  visibility: "private",
  tags: ["finance"],
  tools: [],
});

const probed = await control.probeServer(server.id);
const composition = await control.createComposition({
  environmentId: "env_production",
  slug: "company",
  name: "Company tools",
  description: "Governed company MCP surface",
  members: [
    {
      serverId: probed.id,
      namespace: "finance",
      enabled: true,
      pinnedVersion: probed.version,
      priority: 100,
    },
  ],
  aliases: [],
});
await control.publishComposition(composition.id);
```

Policy create and update calls return both the draft and deterministic lint
results. `activatePolicy` performs the server-side authority swap; use
`authority`, `freeze`, and `unfreeze` for emergency state. List methods are
named `environments`, `servers`, `compositions`, `policies`, `sessions`,
`roles`, `roleAssignments`, `identityProviders`, `approvals`, and
`activationEvents`.

Approval decisions use optimistic concurrency and exact-request binding. Read
the current inbox entry and echo its `generation` and `fingerprint`; a stale or
modified request is rejected instead of deciding a different operation.

```ts
const [approval] = await control.approvals();
if (approval) {
  await control.decideApproval(approval.id, {
    decision: "approved",
    reason: "Reviewed against the finance change ticket.",
    generation: approval.generation,
    fingerprint: approval.fingerprint,
  });
}
```

`createServicePrincipal` returns its secret once. Automation can exchange that
secret for a scoped session with `createServicePrincipalSession`; the Basic
credential is sent only in the authorization header. Identity-provider and
session list responses expose explicit redacted types.

Browser callers can use the signed-in session cookie (`credentials: "include"`
is enabled). `tenantId`, `demoRole`, and `apiKey` options are available for
deployments that explicitly enable those authentication modes.
