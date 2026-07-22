import { describe, expect, it } from "vitest";

import { LiteMcpClient, McpSessionClient } from "./index.js";

describe("LiteMcpClient", () => {
  it("sets tenant headers without putting credentials in URLs", async () => {
    let captured: Request | undefined;
    const fakeFetch: typeof fetch = async (input, init) => {
      captured = new Request(input, init);
      return new Response(
        JSON.stringify({
          data: { counts: { servers: 2 } },
          meta: { requestId: "test" },
        }),
        { headers: { "content-type": "application/json" } }
      );
    };
    const client = new LiteMcpClient({
      baseUrl: "https://api.example.test",
      tenantId: "org_test",
      apiKey: "secret-token",
      fetch: fakeFetch,
    });
    await client.overview();
    expect(captured?.headers.get("x-litemcp-tenant")).toBe("org_test");
    expect(captured?.url).not.toContain("secret-token");
  });

  it("maps management methods to the control-plane lifecycle routes", async () => {
    const captured: Request[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      captured.push(new Request(input, init));
      return new Response(JSON.stringify({ data: {}, meta: { requestId: "test" } }), {
        headers: { "content-type": "application/json" },
      });
    };
    const client = new LiteMcpClient({
      baseUrl: "https://api.example.test/",
      tenantId: "org_test",
      fetch: fakeFetch,
    });

    await client.environments();
    await client.createServer({
      slug: "finance",
      name: "Finance",
      description: "Finance tools",
      transport: "streamable-http",
      endpoint: "https://finance.example.test/mcp",
      version: "1.0.0",
      visibility: "private",
      tags: [],
      tools: [],
    });
    await client.updateServer("server/finance", { name: "Finance v2" });
    await client.probeServer("server_finance", { acceptDrift: true });
    await client.createComposition({
      environmentId: "env_production",
      slug: "company",
      name: "Company",
      description: "Company tools",
      members: [],
      aliases: [],
    });
    await client.publishComposition("composition_company");
    await client.createPolicy({
      name: "Production policy",
      description: "Default deny",
      defaultEffect: "deny",
      rules: [],
    });
    await client.lintPolicy("policy_draft");
    await client.activatePolicy("policy_draft");
    await client.sessions();
    await client.roles();
    await client.assignRole({ subjectId: "user_one", roleId: "role_admin" });
    await client.roleAssignments("user/one");
    await client.identityProviders();
    await client.approvals();
    await client.decideApproval("approval_one", {
      decision: "approved",
      reason: "Reviewed by the finance owner.",
      generation: 3,
      fingerprint: "a".repeat(64),
    });
    await client.freeze("Incident response");
    await client.unfreeze();
    await client.activationEvents();

    expect(
      captured.map((request) => [request.method, new URL(request.url).pathname])
    ).toEqual([
      ["GET", "/api/v1/environments"],
      ["POST", "/api/v1/servers"],
      ["PATCH", "/api/v1/servers/server%2Ffinance"],
      ["POST", "/api/v1/servers/server_finance/probe"],
      ["POST", "/api/v1/compositions"],
      ["POST", "/api/v1/compositions/composition_company/publish"],
      ["POST", "/api/v1/policies"],
      ["GET", "/api/v1/policies/policy_draft/lint"],
      ["POST", "/api/v1/policies/policy_draft/activate"],
      ["GET", "/api/v1/sessions"],
      ["GET", "/api/v1/roles"],
      ["POST", "/api/v1/role-assignments"],
      ["GET", "/api/v1/role-assignments"],
      ["GET", "/api/v1/identity-providers"],
      ["GET", "/api/v1/approvals"],
      ["POST", "/api/v1/approvals/approval_one/decision"],
      ["POST", "/api/v1/tenant/freeze"],
      ["POST", "/api/v1/tenant/unfreeze"],
      ["GET", "/api/v1/activation-events"],
    ]);
    const assignmentRequest = captured[12];
    if (!assignmentRequest) throw new Error("Role-assignment request was not sent.");
    expect(new URL(assignmentRequest.url).searchParams.get("subjectId")).toBe(
      "user/one"
    );
    const approvalRequest = captured[15];
    if (!approvalRequest) throw new Error("Approval decision request was not sent.");
    await expect(approvalRequest.json()).resolves.toEqual({
      decision: "approved",
      reason: "Reviewed by the finance owner.",
      generation: 3,
      fingerprint: "a".repeat(64),
    });
  });

  it("uses Basic credentials for service-principal session issuance", async () => {
    let captured: Request | undefined;
    const fakeFetch: typeof fetch = async (input, init) => {
      captured = new Request(input, init);
      return new Response(JSON.stringify({ data: {}, meta: { requestId: "test" } }), {
        headers: { "content-type": "application/json" },
      });
    };
    const client = new LiteMcpClient({
      baseUrl: "https://api.example.test",
      apiKey: "management-token",
      fetch: fakeFetch,
    });

    await client.createServicePrincipalSession(
      {
        tenantId: "org_test",
        compositionId: "composition_company",
        environmentId: "env_production",
        approvedClients: ["automation"],
      },
      { clientId: "sp_123", secret: "lmcp_sp_secret" }
    );

    expect(captured?.headers.get("authorization")).toBe(
      `Basic ${btoa("sp_123:lmcp_sp_secret")}`
    );
  });
});

describe("McpSessionClient", () => {
  it("sends bearer credentials in headers only", async () => {
    let captured: Request | undefined;
    const fakeFetch: typeof fetch = async (input, init) => {
      captured = new Request(input, init);
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }),
        { headers: { "content-type": "application/json" } }
      );
    };
    const client = new McpSessionClient(
      "https://gateway.example.test/mcp/org/composition",
      "secret-session",
      fakeFetch
    );
    await client.listTools();
    expect(captured?.headers.get("authorization")).toBe("Bearer secret-session");
    expect(captured?.url).not.toContain("secret-session");
  });
});
