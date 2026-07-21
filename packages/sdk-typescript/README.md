# `@litemcp/sdk`

Typed, dependency-light clients for the LiteMCP Composer control plane and a
scoped MCP Streamable HTTP session. Tokens are sent in headers, never URLs.

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
