import { describe, expect, it } from "vitest";

import type { Composition, Subject } from "@litemcp/contracts";
import { MemoryDocumentStore } from "@litemcp/storage";

import {
  PlatformAuthorizationError,
  PlatformService,
  PlatformValidationError,
} from "./platform-service.js";

const employee: Subject = {
  type: "user",
  id: "user_employee",
  roles: ["employee"],
  groups: ["employees"],
  claims: {},
};

describe("PlatformService vertical slice", () => {
  it("filters hidden tools and denies a guessed direct call", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const visible = await service.listVisibleTools(
      "org_demo",
      "composition_company",
      employee,
      "request_list"
    );
    expect(visible.map((tool) => tool.name)).toContain("math.add");
    expect(visible.map((tool) => tool.name)).not.toContain("finance.issue_refund");
    await expect(
      service.resolveTool(
        "org_demo",
        "composition_company",
        employee,
        "finance.issue_refund",
        "request_call"
      )
    ).rejects.toBeInstanceOf(PlatformAuthorizationError);
  });

  it("defaults unknown roles to no visible capabilities", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const visible = await service.listVisibleTools(
      "org_demo",
      "composition_company",
      { ...employee, id: "user_unknown", roles: ["external"], groups: [] },
      "request_unknown_role"
    );
    expect(visible).toEqual([]);
  });

  it("redacts secret-shaped audit metadata", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    await service.appendAudit("org_demo", {
      type: "test.secret",
      actorId: "system",
      actorType: "system",
      action: "test",
      targetType: "test",
      targetId: "test",
      outcome: "succeeded",
      requestId: "request_secret",
      explanation: "Test redaction",
      metadata: { accessToken: "do-not-store", nested: { password: "secret" } },
    });
    const events = await service.listAudit("org_demo");
    const event = events.find((entry) => entry.requestId === "request_secret");
    expect(event?.metadata).toEqual({
      accessToken: "[REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });

  it("serializes concurrent audit appends into one continuous chain", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.appendAudit("org_demo", {
          type: "test.concurrent",
          actorId: "system",
          actorType: "system",
          action: "append",
          targetType: "test",
          targetId: `target_${index}`,
          outcome: "succeeded",
          requestId: `request_concurrent_${index}`,
          explanation: "Concurrent audit regression test.",
        })
      )
    );

    const events = (await service.listAudit("org_demo", 100)).sort(
      (left, right) => left.sequence - right.sequence
    );
    expect(events.map((event) => event.sequence)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1)
    );
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index]?.previousHash).toBe(events[index - 1]?.hash);
    }
  });

  it("issues scoped tokens without storing their plaintext", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const result = await service.createSession(
      "org_demo",
      {
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: employee,
        approvedClients: ["codex"],
        expiresInSeconds: 600,
      },
      employee.id,
      "request_session",
      "http://localhost:8787"
    );
    expect(result.token).toMatch(/^lmcp_v1\./);
    const authenticated = await service.authenticateSession("org_demo", result.token);
    expect(authenticated?.subject.id).toBe(employee.id);
    expect(authenticated?.tokenHash).not.toContain(result.token);
    await service.revokeSession(
      "org_demo",
      result.session.id,
      employee.id,
      "request_revoke"
    );
    await expect(
      service.authenticateSession("org_demo", result.token)
    ).resolves.toBeNull();
  });

  it("rejects credentials embedded in an upstream endpoint", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    for (const [index, endpoint] of [
      "https://mcp.example.com/run?api_key=do-not-store",
      "https://mcp.example.com/run?token=do-not-store",
      "https://mcp.example.com/run?key=do-not-store",
      "https://mcp.example.com/token/do-not-store",
      "https://mcp.example.com/%74oken/do-not-store",
      "https://mcp.example.com/%E0%A4%A",
    ].entries()) {
      await expect(
        service.createServer(
          "org_demo",
          {
            slug: `unsafe-endpoint-${index}`,
            name: "Unsafe endpoint",
            description: "Must not persist URL credentials.",
            transport: "streamable-http",
            endpoint,
            version: "1.0.0",
            visibility: "private",
            tags: [],
            tools: [],
          },
          "user_admin",
          "request_server"
        )
      ).rejects.toBeInstanceOf(PlatformValidationError);
    }
  });

  it("refuses to issue a session for a draft composition", async () => {
    const store = new MemoryDocumentStore();
    const service = new PlatformService(store);
    await service.ensureDemoTenant();
    const composition = await store.get<Composition>(
      "org_demo",
      "compositions",
      "composition_company"
    );
    expect(composition).not.toBeNull();
    await store.put(
      "org_demo",
      "compositions",
      { ...composition!, status: "draft", revision: 2 },
      { expectedRevision: 1 }
    );

    await expect(
      service.createSession(
        "org_demo",
        {
          compositionId: "composition_company",
          environmentId: "env_production",
          subject: employee,
          approvedClients: ["codex"],
          expiresInSeconds: 600,
        },
        employee.id,
        "request_draft_session",
        "http://localhost:8787"
      )
    ).rejects.toBeInstanceOf(PlatformValidationError);
  });
});
