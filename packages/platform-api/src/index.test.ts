import { describe, expect, it } from "vitest";

import { PlatformService } from "@litemcp/core";
import { McpGateway } from "@litemcp/mcp-gateway";
import { MemoryDocumentStore } from "@litemcp/storage";

import { createPlatformApp } from "./index.js";

const createTestApp = () => {
  const platform = new PlatformService(new MemoryDocumentStore());
  return createPlatformApp({
    platform,
    gateway: new McpGateway({ platform }),
    publicOrigin: "http://localhost:8787",
    webOrigins: ["http://localhost:4321"],
    demoMode: true,
  });
};

describe("platform API", () => {
  it("serves persisted demo state and generated OpenAPI", async () => {
    const app = createTestApp();
    const overview = await app.request("/api/v1/overview", {
      headers: { "x-litemcp-tenant": "org_demo" },
    });
    expect(overview.status).toBe(200);
    const payload = await overview.json();
    expect(payload.data.counts.servers).toBe(2);
    expect(payload.meta.requestId).toBe(overview.headers.get("x-request-id"));

    const openApi = await app.request("/api/v1/openapi.json");
    expect(openApi.status).toBe(200);
    expect((await openApi.json()).openapi).toBe("3.1.0");
  });

  it("rejects cross-tenant demo headers", async () => {
    const response = await createTestApp().request("/api/v1/servers", {
      headers: { "x-litemcp-tenant": "org_other" },
    });
    expect(response.status).toBe(403);
  });

  it("requires an explicit demo administrator for management mutations", async () => {
    const app = createTestApp();
    const body = JSON.stringify({
      slug: "demo-management-test",
      name: "Demo management test",
      description: "Proves that demo management is explicit.",
      transport: "streamable-http",
      endpoint: "https://mcp.example.com",
      version: "1.0.0",
      visibility: "private",
      tags: [],
      tools: [],
    });

    for (const role of [undefined, "employee", "unexpected"]) {
      const headers = new Headers({ "content-type": "application/json" });
      if (role) headers.set("x-litemcp-role", role);
      const denied = await app.request("/api/v1/servers", {
        method: "POST",
        headers,
        body,
      });
      expect(denied.status).toBe(403);
    }

    const allowed = await app.request("/api/v1/servers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-litemcp-role": "finance-admin",
      },
      body,
    });
    expect(allowed.status).toBe(201);
  });

  it("derives production gateway identity from the authenticated actor", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: {
        handler: () => new Response(null, { status: 204 }),
        api: {
          getSession: async () => ({
            user: { id: "user_member", role: "member" },
            session: { activeOrganizationId: "org_demo" },
          }),
          getActiveMemberRole: async () => ({ role: "member" }),
        },
      },
    });

    const response = await app.request("/api/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: {
          type: "user",
          id: "forged_admin",
          roles: ["finance-admin"],
          groups: ["finance"],
          claims: { forged: "true" },
        },
        approvedClients: ["test"],
        expiresInSeconds: 600,
      }),
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.session.subject).toEqual({
      type: "user",
      id: "user_member",
      roles: ["member"],
      groups: [],
      claims: {},
    });
  });

  it("rejects management mutations from an ordinary organization member", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: {
        handler: () => new Response(null, { status: 204 }),
        api: {
          getSession: async () => ({
            user: { id: "user_member" },
            session: { activeOrganizationId: "org_demo" },
          }),
          getActiveMemberRole: async () => ({ role: "member" }),
        },
      },
    });

    const response = await app.request("/api/v1/servers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "forged-server",
        name: "Forged server",
        description: "Must not be created by an ordinary member.",
        transport: "streamable-http",
        endpoint: "https://mcp.example.com",
        version: "1.0.0",
        visibility: "private",
        tags: [],
        tools: [],
      }),
    });

    expect(response.status).toBe(403);
    expect(await platform.listServers("org_demo")).toHaveLength(2);
  });

  it("does not grant control-plane administration to a finance domain role", async () => {
    const platform = new PlatformService(new MemoryDocumentStore());
    await platform.ensureDemoTenant("org_demo", "http://localhost:8787");
    const app = createPlatformApp({
      platform,
      gateway: new McpGateway({ platform }),
      publicOrigin: "http://localhost:8787",
      webOrigins: ["http://localhost:4321"],
      demoMode: false,
      auth: {
        handler: () => new Response(null, { status: 204 }),
        api: {
          getSession: async () => ({
            user: { id: "user_finance" },
            session: { activeOrganizationId: "org_demo" },
          }),
          getActiveMemberRole: async () => ({ role: "finance-admin" }),
        },
      },
    });

    const response = await app.request("/api/v1/audit");
    expect(response.status).toBe(403);
  });
});
