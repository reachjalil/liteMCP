import { describe, expect, it } from "vitest";

import { PlatformService } from "@litemcp/core";
import { MemoryDocumentStore } from "@litemcp/storage";

import {
  BuiltinExecutor,
  demoSubject,
  McpGateway,
  RemoteHttpExecutor,
  validateRemoteEndpoint,
  validateToolArguments,
} from "./index.js";

const setup = async (role: "employee" | "finance-admin") => {
  const platform = new PlatformService(new MemoryDocumentStore());
  await platform.ensureDemoTenant("org_demo", "https://gateway.test");
  const issued = await platform.createSession(
    "org_demo",
    {
      compositionId: "composition_company",
      environmentId: "env_production",
      subject: demoSubject(role),
      approvedClients: ["test"],
      expiresInSeconds: 600,
    },
    "test",
    "request_session",
    "https://gateway.test"
  );
  let upstreamCalls = 0;
  const upstreamFetch: typeof fetch = async () => {
    upstreamCalls += 1;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "upstream",
        result: {
          content: [{ type: "text", text: "invoice_100 · EUR 42.00" }],
          structuredContent: { invoices: [{ id: "invoice_100", amount: 42 }] },
        },
      }),
      { headers: { "content-type": "application/json" } }
    );
  };
  const gateway = new McpGateway({
    platform,
    executors: [new BuiltinExecutor(), new RemoteHttpExecutor(upstreamFetch)],
  });
  return {
    platform,
    gateway,
    token: issued.token,
    upstreamCalls: () => upstreamCalls,
  };
};

describe("McpGateway", () => {
  it("composes builtin and remote HTTP tools behind one session", async () => {
    const { gateway, token } = await setup("employee");
    const list = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_list",
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(JSON.stringify(list.body)).toContain("math.add");
    expect(JSON.stringify(list.body)).toContain("finance.list_invoices");

    const builtinCall = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_math",
      body: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "sum", arguments: { a: 2, b: 3 } },
      },
    });
    expect(JSON.stringify(builtinCall.body)).toContain('"sum":5');

    const remoteCall = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_finance",
      body: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "finance.list_invoices",
          arguments: { accountId: "acct_1" },
        },
      },
    });
    expect(JSON.stringify(remoteCall.body)).toContain("invoice_100");
  });

  it("denies a hidden tool even when its name is guessed", async () => {
    const { gateway, token } = await setup("employee");
    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_denied",
      body: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "finance.issue_refund",
          arguments: { invoiceId: "invoice_100", reason: "duplicate" },
        },
      },
    });
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).toContain("denied by policy");
  });

  it("pauses approval-gated calls without executing upstream", async () => {
    const { gateway, token } = await setup("finance-admin");
    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_approval",
      body: {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "finance.issue_refund",
          arguments: { invoiceId: "invoice_100", reason: "duplicate" },
        },
      },
    });
    expect(JSON.stringify(response.body)).toContain("approval_required");
  });

  it("rejects arguments that do not match the advertised tool schema", async () => {
    const { gateway, token, upstreamCalls } = await setup("employee");
    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_invalid_arguments",
      body: {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "finance.list_invoices",
          arguments: { unexpected: "value" },
        },
      },
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("Invalid tool arguments");
    expect(upstreamCalls()).toBe(0);
  });
});

describe("validateRemoteEndpoint", () => {
  it("blocks metadata and private-network destinations by default", () => {
    expect(() => validateRemoteEndpoint("http://169.254.169.254/latest")).toThrow(
      "blocked"
    );
    expect(() => validateRemoteEndpoint("http://localhost:8787/mcp")).toThrow(
      "blocked"
    );
    for (const endpoint of [
      "https://[::ffff:127.0.0.1]/mcp",
      "https://[fe90::1]/mcp",
      "https://[::]/mcp",
    ]) {
      expect(() => validateRemoteEndpoint(endpoint)).toThrow("blocked");
    }
    expect(() =>
      validateRemoteEndpoint("https://[2001:4860:4860::8888]/mcp")
    ).not.toThrow();
  });
});

describe("tool argument schema isolation", () => {
  it("does not share tenant-controlled schema IDs or resolve external references", () => {
    expect(
      validateToolArguments(
        {
          $id: "https://schemas.vendor.invalid/tool.json",
          type: "object",
          additionalProperties: true,
        },
        { attackerControlled: true }
      )
    ).toEqual([]);

    expect(
      validateToolArguments(
        { $ref: "https://schemas.vendor.invalid/tool.json" },
        { attackerControlled: true }
      )
    ).toEqual([
      {
        path: "/",
        keyword: "schema",
        message: "external JSON Schema references are not supported",
      },
    ]);
  });

  it("enforces standard formats and JSON Schema 2020-12 keywords", () => {
    const errors = validateToolArguments(
      {
        type: "object",
        required: ["email"],
        properties: { email: { type: "string", format: "email" } },
        unevaluatedProperties: false,
      },
      { email: "not-an-email", extra: true }
    );

    expect(errors.map((error) => error.keyword)).toEqual(
      expect.arrayContaining(["format", "unevaluatedProperties"])
    );
  });
});
