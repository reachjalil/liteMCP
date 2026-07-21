import { LiteMcpClient, McpSessionClient } from "@litemcp/sdk";

const baseUrl = process.env.LITEMCP_API_URL ?? "http://localhost:8787";
const control = new LiteMcpClient({
  baseUrl,
  tenantId: "org_demo",
  demoRole: "employee",
});
const issued = await control.createSession({
  compositionId: "composition_company",
  environmentId: "env_production",
  subject: {
    type: "user",
    id: "example_employee",
    roles: ["employee"],
    groups: ["employees"],
    claims: { example: "local-composition" },
  },
  approvedClients: ["example"],
  expiresInSeconds: 600,
});
const mcp = new McpSessionClient(issued.endpoint, issued.token);
console.log(await mcp.initialize());
console.log(await mcp.listTools());
console.log(await mcp.callTool("sum", { a: 20, b: 22 }));
console.log(await mcp.callTool("finance.list_invoices", { accountId: "acct_example" }));
