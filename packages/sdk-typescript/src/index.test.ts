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
