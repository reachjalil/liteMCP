import {
  Composition,
  GatewaySession,
  IdentityProvider,
  McpServerDefinition,
  Policy,
  SessionClientInfo,
  Subject,
  UsageEvent,
  usageEventSchema,
} from "@litemcp/contracts";
import {
  type CollectionName,
  MemoryDocumentStore,
  type PutOptions,
  type StoredDocument,
} from "@litemcp/storage";
import { describe, expect, it } from "vitest";

import {
  PlatformAuthorizationError,
  PlatformConflictError,
  PlatformQuotaError,
  PlatformService,
  PlatformValidationError,
} from "./platform-service.js";
import { CredentialCipher, sha256Base64Url } from "./security.js";

const employee: Subject = {
  type: "user",
  id: "user_employee",
  roles: ["employee"],
  groups: ["employees"],
  claims: {},
};

class ActivationFailingStore extends MemoryDocumentStore {
  override async put<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    document: T,
    options?: PutOptions
  ): Promise<T> {
    if (collection === "activation-events") {
      throw new Error("activation telemetry unavailable");
    }
    return super.put(tenantId, collection, document, options);
  }
}

describe("PlatformService vertical slice", () => {
  it("keeps lifecycle operations fail-open when activation storage is unavailable", async () => {
    const failures: Array<{ operation: "read" | "write"; errorName: string }> = [];
    const service = new PlatformService(new ActivationFailingStore(), {
      activationFailureReporter: (failure) => failures.push(failure),
    });
    await expect(service.ensureDemoTenant()).resolves.toMatchObject({
      id: "org_demo",
    });
    const issued = await service.createSession(
      "org_demo",
      {
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: employee,
        approvedClients: ["test"],
        expiresInSeconds: 600,
      },
      employee.id,
      "request_activation_failure",
      "https://gateway.example.net"
    );

    expect(issued.session.subject.id).toBe(employee.id);
    await expect(
      service.recordActivationEvent(
        "org_demo",
        "first_tool_call",
        employee.id,
        {},
        true
      )
    ).resolves.toBeNull();
    await expect(service.listActivationEvents("org_demo")).resolves.toEqual([]);
    expect(failures).toHaveLength(2);
    expect(failures).toEqual(
      expect.arrayContaining([{ operation: "write", errorName: "Error" }])
    );
  });

  it("binds initialize attribution first-write-wins without changing authorization revision", async () => {
    const store = new MemoryDocumentStore();
    const service = new PlatformService(store);
    await service.ensureDemoTenant();
    const issued = await service.createSession(
      "org_demo",
      {
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: employee,
        approvedClients: ["test"],
        expiresInSeconds: 600,
      },
      employee.id,
      "request_attribution_session",
      "https://gateway.example.net"
    );
    const cursor: SessionClientInfo = {
      name: "Cursor",
      version: "1.2.3",
      protocolVersion: "2025-11-25",
      initializedAt: "2026-07-21T10:00:00.000Z",
      userAgentClass: "cursor",
      sdk: false,
    };
    const claude: SessionClientInfo = {
      ...cursor,
      name: "Claude Code",
      userAgentClass: "claude-code",
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.bindSessionAttribution(
          "org_demo",
          issued.session.id,
          index % 2 === 0 ? cursor : claude
        )
      )
    );
    expect(new Set(results.map((entry) => entry.name)).size).toBe(1);
    expect(await service.getSessionAttribution("org_demo", issued.session.id)).toEqual(
      results[0]
    );
    expect(
      (await store.get<GatewaySession>("org_demo", "sessions", issued.session.id))
        ?.revision
    ).toBe(1);
  });

  it("emits lifecycle facts once and reports standing from exact counters", async () => {
    const events: UsageEvent[] = [];
    const store = new MemoryDocumentStore();
    const analyticsRecorder = {
      recordUsage: (event: UsageEvent) => events.push(event),
      flush: async () => undefined,
    };
    const service = new PlatformService(store, {
      analyticsEnabled: true,
      analyticsRecorder,
    });
    await service.ensureDemoTenant();
    const issued = await service.createSession(
      "org_demo",
      {
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: employee,
        approvedClients: ["test"],
        expiresInSeconds: 600,
      },
      employee.id,
      "request_usage_session",
      "https://gateway.example.net"
    );
    await service.consumeToolCallQuota("org_demo");
    const active = await service.getUsageStanding("org_demo");
    expect(active).toMatchObject({
      analyticsEnabled: true,
      activeSessions: { used: 1, remaining: 24 },
      toolCallsToday: { used: 1, remaining: 999 },
    });

    await service.bindSessionAttribution("org_demo", issued.session.id, {
      name: "Cursor",
      version: "1.2.3",
      protocolVersion: "2025-11-25",
      initializedAt: "2026-07-21T10:00:00.000Z",
      userAgentClass: "cursor",
      sdk: false,
    });
    const restarted = new PlatformService(store, {
      analyticsEnabled: true,
      analyticsRecorder,
    });

    await restarted.revokeSession(
      "org_demo",
      issued.session.id,
      employee.id,
      "request_usage_revoke"
    );
    await restarted.revokeSession(
      "org_demo",
      issued.session.id,
      employee.id,
      "request_usage_revoke_again"
    );
    expect(events.map((event) => event.eventType)).toEqual([
      "session_minted",
      "session_revoked",
    ]);
    expect(events.at(-1)).toMatchObject({
      clientName: "Cursor",
      clientVersion: "1.2.3",
      userAgentClass: "cursor",
    });
    for (const event of events)
      expect(() => usageEventSchema.parse(event)).not.toThrow();
    expect((await service.getUsageStanding("org_demo")).activeSessions.used).toBe(0);
  });

  it("emits one approval lifecycle fact per committed generation and decision", async () => {
    const events: UsageEvent[] = [];
    const store = new MemoryDocumentStore();
    const analyticsRecorder = {
      recordUsage: (event: UsageEvent) => events.push(event),
      flush: async () => undefined,
    };
    const service = new PlatformService(store, {
      analyticsRecorder,
    });
    await service.ensureDemoTenant();
    const requester: Subject = {
      type: "user",
      id: "user_analytics_requester",
      roles: ["finance-admin"],
      groups: ["finance-admins"],
      claims: {},
    };
    const issued = await service.createSession(
      "org_demo",
      {
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: requester,
        expiresInSeconds: 600,
      },
      requester.id,
      "request_approval_session",
      "https://gateway.example.net"
    );
    const session = await service.authenticateSession("org_demo", issued.token);
    if (!session) throw new Error("Expected the approval session to authenticate.");
    await service.bindSessionAttribution("org_demo", session.id, {
      name: "Claude Code",
      version: "2.1.0",
      protocolVersion: "2025-11-25",
      initializedAt: "2026-07-21T10:00:00.000Z",
      userAgentClass: "claude-code",
      sdk: false,
    });
    const resolved = await service.resolveTool(
      "org_demo",
      "composition_company",
      session.subject,
      "finance.issue_refund",
      "request_approval_resolve"
    );
    events.length = 0;
    const approvals = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.createApproval(
          "org_demo",
          session,
          resolved,
          { invoiceId: "invoice_100", reason: "duplicate" },
          `request_approval_analytics_${index}`
        )
      )
    );
    expect(
      events.filter((event) => event.eventType === "approval_required")
    ).toHaveLength(1);
    const approval = approvals[0];
    if (!approval) throw new Error("Expected an approval request.");
    const restarted = new PlatformService(store, { analyticsRecorder });
    await restarted.decideApproval(
      "org_demo",
      approval.id,
      {
        decision: "approved",
        reason: "Reviewed by another administrator",
        generation: approval.generation,
        fingerprint: approval.fingerprint,
      },
      { ...requester, id: "user_analytics_approver", roles: ["admin"] },
      "request_approval_decision"
    );
    await Promise.resolve();
    await Promise.resolve();
    const decided = events.filter((event) => event.eventType === "approval_decided");
    expect(decided).toHaveLength(1);
    expect(decided[0]).toMatchObject({
      approvalId: approval.id,
      tool: "finance.issue_refund",
      status: "succeeded",
      decisionEffect: "require-approval",
      clientName: "Claude Code",
      clientVersion: "2.1.0",
    });
    expect(decided[0]?.approvalLatencyMs).toBeGreaterThanOrEqual(0);
    expect(decided[0]?.matchedRuleIds).toEqual(["rule_finance_refund_approval"]);
    expect(JSON.stringify(events)).not.toContain("invoice_100");
    for (const event of events)
      expect(() => usageEventSchema.parse(event)).not.toThrow();
  });

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

  it("bootstraps a safe production tenant and invalidates sessions on role changes", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.bootstrapTenant("org_acme", "Acme Security", "user_owner", ["owner"]);

    expect(await service.listEnvironments("org_acme")).toHaveLength(1);
    expect((await service.listCompositions("org_acme"))[0]).toMatchObject({
      status: "draft",
      members: [],
    });
    expect((await service.activePolicy("org_acme"))?.defaultEffect).toBe("deny");
    expect((await service.listRoles("org_acme")).map((role) => role.slug)).toEqual([
      "admin",
      "member",
      "owner",
    ]);

    const server = await service.createServer(
      "org_acme",
      {
        slug: "data",
        name: "Data tools",
        description: "Test server",
        transport: "builtin",
        version: "1.0.0",
        visibility: "private",
        tags: [],
        tools: [
          {
            name: "read",
            title: "Read",
            description: "Reads data",
            inputSchema: { type: "object" },
            risk: "read",
            readOnly: true,
            idempotent: true,
          },
        ],
      },
      "user_owner",
      "request_server"
    );
    await service.recordServerProbe(
      "org_acme",
      server.id,
      { tools: server.tools },
      false,
      "user_owner",
      "request_probe"
    );
    const draft = (await service.listCompositions("org_acme"))[0]!;
    await service.updateComposition(
      "org_acme",
      draft.id,
      {
        members: [
          {
            serverId: server.id,
            namespace: "data",
            enabled: true,
            pinnedVersion: "1.0.0",
            priority: 1,
          },
        ],
      },
      "user_owner",
      "request_compose"
    );
    const published = await service.publishComposition(
      "org_acme",
      draft.id,
      "user_owner",
      "request_publish"
    );
    const issued = await service.createSession(
      "org_acme",
      {
        compositionId: published.id,
        environmentId: published.environmentId,
        subject: {
          type: "user",
          id: "user_owner",
          roles: ["owner"],
          groups: [],
          claims: {},
        },
        expiresInSeconds: 600,
      },
      "user_owner",
      "request_session",
      "https://gateway.test"
    );
    expect(await service.authenticateSession("org_acme", issued.token)).not.toBeNull();

    const analyst = await service.createRole(
      "org_acme",
      { slug: "analyst", name: "Analyst", description: "Data analyst" },
      "user_owner",
      "request_role"
    );
    await service.assignRole(
      "org_acme",
      { subjectId: "user_owner", roleId: analyst.id },
      "user_owner",
      "request_assignment"
    );
    await expect(
      service.authenticateSession("org_acme", issued.token)
    ).resolves.toBeNull();
  });

  it("activates exactly one policy through the authoritative pointer", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const create = (name: string) =>
      service.createPolicy(
        "org_demo",
        {
          name,
          description: `${name} policy`,
          defaultEffect: "deny",
          rules: [],
        },
        "user_admin",
        `request_${name}`
      );
    const [{ policy: left }, { policy: right }] = await Promise.all([
      create("Policy left"),
      create("Policy right"),
    ]);
    const results = await Promise.allSettled([
      service.activatePolicy("org_demo", left.id, "user_admin", "activate_left"),
      service.activatePolicy("org_demo", right.id, "user_admin", "activate_right"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (results.find((result) => result.status === "rejected") as PromiseRejectedResult)
        .reason
    ).toBeInstanceOf(PlatformConflictError);
    expect([left.id, right.id]).toContain((await service.activePolicy("org_demo"))?.id);
  });

  it("deduplicates concurrent approval slots and one-shot consumes each generation", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const requester: Subject = {
      type: "user",
      id: "user_requester",
      roles: ["finance-admin"],
      groups: ["finance-admins"],
      claims: {},
    };
    const issued = await service.createSession(
      "org_demo",
      {
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: requester,
        expiresInSeconds: 600,
      },
      requester.id,
      "request_session",
      "https://gateway.test"
    );
    const session = (await service.authenticateSession("org_demo", issued.token))!;
    const resolved = await service.resolveTool(
      "org_demo",
      "composition_company",
      session.subject,
      "finance.issue_refund",
      "request_resolve"
    );
    const args = { invoiceId: "invoice_100", reason: "duplicate" };
    const concurrent = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.createApproval(
          "org_demo",
          session,
          resolved,
          args,
          `request_approval_${index}`
        )
      )
    );
    const first = concurrent[0]!;
    expect(new Set(concurrent.map((approval) => approval.id))).toEqual(
      new Set([first.id])
    );
    expect(new Set(concurrent.map((approval) => approval.generation))).toEqual(
      new Set([1])
    );
    expect(first).toMatchObject({
      compositionId: "composition_company",
      compositionVersion: "1.0.0",
      sessionId: session.id,
      serverId: "server_finance",
      serverVersion: "1.0.0",
      serverRevision: 1,
      policyId: "policy_company",
      policyVersion: "1.0.0",
      authorizationEpoch: session.authorizationEpoch,
      toolName: "finance.issue_refund",
      requestedBy: requester.id,
      generation: 1,
    });
    expect(first.serverSchemaHash).toHaveLength(64);
    expect(first.serverExecutionConfigHash).toHaveLength(64);
    expect(first.fingerprint).toHaveLength(64);
    expect(JSON.stringify(first)).not.toContain("invoice_100");
    expect(JSON.stringify(first)).not.toContain("duplicate");
    expect(await service.listApprovals("org_demo")).toHaveLength(1);
    await expect(
      service.decideApproval(
        "org_demo",
        first.id,
        {
          decision: "approved",
          reason: "self approval",
          generation: first.generation,
          fingerprint: first.fingerprint,
        },
        { ...requester, roles: ["admin"] },
        "request_self"
      )
    ).rejects.toBeInstanceOf(PlatformAuthorizationError);
    await service.decideApproval(
      "org_demo",
      first.id,
      {
        decision: "approved",
        reason: "Reviewed against invoice policy",
        generation: first.generation,
        fingerprint: first.fingerprint,
      },
      { ...requester, id: "user_approver", roles: ["admin"] },
      "request_decide"
    );
    const consumeResults = await Promise.allSettled(
      Array.from({ length: 2 }, (_, index) =>
        service.consumeApprovalForCall(
          "org_demo",
          session,
          resolved,
          args,
          `request_consume_${index}`
        )
      )
    );
    expect(
      consumeResults.filter(
        (result) => result.status === "fulfilled" && result.value.state === "approved"
      )
    ).toHaveLength(1);
    await expect(
      service.consumeApprovalForCall(
        "org_demo",
        session,
        resolved,
        args,
        "request_consume_again"
      )
    ).resolves.toEqual({ state: "none" });
    await expect(
      service.consumeApprovalForCall(
        "org_demo",
        session,
        resolved,
        { ...args, reason: "changed" },
        "request_changed"
      )
    ).resolves.toEqual({ state: "none" });

    const nextGeneration = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        service.createApproval(
          "org_demo",
          session,
          resolved,
          args,
          `request_next_generation_${index}`
        )
      )
    );
    expect(new Set(nextGeneration.map((approval) => approval.id))).toEqual(
      new Set([first.id])
    );
    expect(new Set(nextGeneration.map((approval) => approval.generation))).toEqual(
      new Set([2])
    );
    expect(await service.listApprovals("org_demo")).toHaveLength(1);
    await expect(
      service.decideApproval(
        "org_demo",
        first.id,
        {
          decision: "approved",
          reason: "Stale dashboard decision",
          generation: first.generation,
          fingerprint: first.fingerprint,
        },
        { ...requester, id: "user_approver", roles: ["admin"] },
        "request_stale_decision"
      )
    ).rejects.toBeInstanceOf(PlatformConflictError);

    const differentArguments = await service.createApproval(
      "org_demo",
      session,
      resolved,
      { ...args, reason: "customer request" },
      "request_different_arguments"
    );
    expect(differentArguments.id).not.toBe(first.id);
    expect(differentArguments.generation).toBe(1);
    expect(differentArguments.status).toBe("pending");
    expect(await service.listApprovals("org_demo")).toHaveLength(2);
    const firstGenerationAudit = (await service.listAudit("org_demo", 1_000)).filter(
      (event) =>
        ["approval.requested", "approval.approved", "approval.consumed"].includes(
          event.type
        ) &&
        event.metadata.fingerprint === first.fingerprint &&
        event.metadata.generation === first.generation
    );
    expect(firstGenerationAudit.map((event) => event.type).sort()).toEqual([
      "approval.approved",
      "approval.consumed",
      "approval.requested",
    ]);
    expect(
      firstGenerationAudit.every(
        (event) =>
          event.metadata.generation === first.generation &&
          event.metadata.fingerprint === first.fingerprint
      )
    ).toBe(true);
  });

  it("never applies an approval to another session or a changed composition", async () => {
    const store = new MemoryDocumentStore();
    const service = new PlatformService(store);
    await service.ensureDemoTenant();
    const requester: Subject = {
      type: "user",
      id: "user_requester",
      roles: ["finance-admin"],
      groups: ["finance-admins"],
      claims: {},
    };
    const issueSession = (requestId: string) =>
      service.createSession(
        "org_demo",
        {
          compositionId: "composition_company",
          environmentId: "env_production",
          subject: requester,
          expiresInSeconds: 600,
        },
        requester.id,
        requestId,
        "https://gateway.test"
      );
    const [firstIssued, secondIssued] = await Promise.all([
      issueSession("request_session_first"),
      issueSession("request_session_second"),
    ]);
    const firstSession = (await service.authenticateSession(
      "org_demo",
      firstIssued.token
    ))!;
    const secondSession = (await service.authenticateSession(
      "org_demo",
      secondIssued.token
    ))!;
    const resolved = await service.resolveTool(
      "org_demo",
      "composition_company",
      firstSession.subject,
      "finance.issue_refund",
      "request_resolve"
    );
    const args = { invoiceId: "invoice_100", reason: "duplicate" };
    const approval = await service.createApproval(
      "org_demo",
      firstSession,
      resolved,
      args,
      "request_approval"
    );
    await service.decideApproval(
      "org_demo",
      approval.id,
      {
        decision: "approved",
        reason: "Reviewed against invoice policy",
        generation: approval.generation,
        fingerprint: approval.fingerprint,
      },
      { ...requester, id: "user_approver", roles: ["admin"] },
      "request_decide"
    );
    await expect(
      service.consumeApprovalForCall(
        "org_demo",
        secondSession,
        resolved,
        args,
        "request_other_session"
      )
    ).resolves.toEqual({ state: "none" });

    const composition = (await store.get<Composition>(
      "org_demo",
      "compositions",
      "composition_company"
    ))!;
    await store.put(
      "org_demo",
      "compositions",
      {
        ...composition,
        version: "2.0.0",
        updatedAt: new Date().toISOString(),
        revision: composition.revision + 1,
      },
      { expectedRevision: composition.revision }
    );
    const changedResolved = await service.resolveTool(
      "org_demo",
      "composition_company",
      firstSession.subject,
      "finance.issue_refund",
      "request_resolve_changed"
    );
    await expect(
      service.consumeApprovalForCall(
        "org_demo",
        firstSession,
        changedResolved,
        args,
        "request_changed_composition"
      )
    ).resolves.toEqual({ state: "none" });
    const replacement = await service.createApproval(
      "org_demo",
      firstSession,
      changedResolved,
      args,
      "request_replacement"
    );
    expect(replacement.id).toBe(approval.id);
    expect(replacement.generation).toBe(approval.generation + 1);
    expect(replacement.compositionVersion).toBe("2.0.0");
    expect(replacement.fingerprint).not.toBe(approval.fingerprint);
    expect(await service.listApprovals("org_demo")).toHaveLength(1);

    await service.decideApproval(
      "org_demo",
      replacement.id,
      {
        decision: "approved",
        reason: "Reviewed after composition publication",
        generation: replacement.generation,
        fingerprint: replacement.fingerprint,
      },
      { ...requester, id: "user_approver", roles: ["admin"] },
      "request_decide_replacement"
    );
    const server = (await store.get<McpServerDefinition>(
      "org_demo",
      "servers",
      "server_finance"
    ))!;
    await store.put(
      "org_demo",
      "servers",
      {
        ...server,
        endpoint: "https://gateway.test/changed-upstream",
        updatedAt: new Date().toISOString(),
        revision: server.revision + 1,
      },
      { expectedRevision: server.revision }
    );
    const rerouted = await service.resolveTool(
      "org_demo",
      "composition_company",
      firstSession.subject,
      "finance.issue_refund",
      "request_resolve_rerouted"
    );
    await expect(
      service.consumeApprovalForCall(
        "org_demo",
        firstSession,
        rerouted,
        args,
        "request_rerouted"
      )
    ).resolves.toEqual({ state: "none" });
    const reroutedApproval = await service.createApproval(
      "org_demo",
      firstSession,
      rerouted,
      args,
      "request_rerouted_approval"
    );
    expect(reroutedApproval.id).toBe(approval.id);
    expect(reroutedApproval.generation).toBe(replacement.generation + 1);
    expect(reroutedApproval.serverRevision).toBe(server.revision + 1);
    expect(reroutedApproval.serverExecutionConfigHash).not.toBe(
      replacement.serverExecutionConfigHash
    );

    await service.decideApproval(
      "org_demo",
      reroutedApproval.id,
      {
        decision: "approved",
        reason: "Reviewed after upstream reroute",
        generation: reroutedApproval.generation,
        fingerprint: reroutedApproval.fingerprint,
      },
      { ...requester, id: "user_approver", roles: ["admin"] },
      "request_decide_rerouted"
    );
    const reroutedServer = (await store.get<McpServerDefinition>(
      "org_demo",
      "servers",
      "server_finance"
    ))!;
    await store.put(
      "org_demo",
      "servers",
      {
        ...reroutedServer,
        tools: reroutedServer.tools.map((tool) =>
          tool.name === "issue_refund"
            ? {
                ...tool,
                inputSchema: {
                  ...tool.inputSchema,
                  properties: {
                    ...((tool.inputSchema.properties as
                      | Record<string, unknown>
                      | undefined) ?? {}),
                    ticketId: { type: "string" },
                  },
                },
              }
            : tool
        ),
        updatedAt: new Date().toISOString(),
        revision: reroutedServer.revision + 1,
      },
      { expectedRevision: reroutedServer.revision }
    );
    const schemaChanged = await service.resolveTool(
      "org_demo",
      "composition_company",
      firstSession.subject,
      "finance.issue_refund",
      "request_resolve_schema_changed"
    );
    await expect(
      service.consumeApprovalForCall(
        "org_demo",
        firstSession,
        schemaChanged,
        args,
        "request_schema_changed"
      )
    ).resolves.toEqual({ state: "none" });
    const schemaApproval = await service.createApproval(
      "org_demo",
      firstSession,
      schemaChanged,
      args,
      "request_schema_approval"
    );
    expect(schemaApproval.id).toBe(approval.id);
    expect(schemaApproval.generation).toBe(reroutedApproval.generation + 1);
    expect(schemaApproval.serverSchemaHash).not.toBe(reroutedApproval.serverSchemaHash);
    await service.decideApproval(
      "org_demo",
      schemaApproval.id,
      {
        decision: "approved",
        reason: "Reviewed after schema update",
        generation: schemaApproval.generation,
        fingerprint: schemaApproval.fingerprint,
      },
      { ...requester, id: "user_approver", roles: ["admin"] },
      "request_decide_schema"
    );

    const schemaChangedServer = (await store.get<McpServerDefinition>(
      "org_demo",
      "servers",
      "server_finance"
    ))!;
    await store.put(
      "org_demo",
      "servers",
      {
        ...schemaChangedServer,
        status: "degraded",
        updatedAt: new Date().toISOString(),
        revision: schemaChangedServer.revision + 1,
      },
      { expectedRevision: schemaChangedServer.revision }
    );
    await expect(
      service.resolveTool(
        "org_demo",
        "composition_company",
        firstSession.subject,
        "finance.issue_refund",
        "request_resolve_degraded"
      )
    ).rejects.toBeInstanceOf(PlatformAuthorizationError);
  });

  it.each([
    { status: "unprobed" as const, driftStatus: "current" as const },
    { status: "offline" as const, driftStatus: "current" as const },
    { status: "degraded" as const, driftStatus: "current" as const },
    { status: "healthy" as const, driftStatus: "quarantined" as const },
  ])(
    "rejects approval consumption for $status/$driftStatus upstreams",
    async ({ status, driftStatus }) => {
      const store = new MemoryDocumentStore();
      const service = new PlatformService(store);
      await service.ensureDemoTenant();
      const requester: Subject = {
        type: "user",
        id: "user_requester",
        roles: ["finance-admin"],
        groups: ["finance-admins"],
        claims: {},
      };
      const issued = await service.createSession(
        "org_demo",
        {
          compositionId: "composition_company",
          environmentId: "env_production",
          subject: requester,
          expiresInSeconds: 600,
        },
        requester.id,
        "request_session",
        "https://gateway.test"
      );
      const session = (await service.authenticateSession("org_demo", issued.token))!;
      const resolved = await service.resolveTool(
        "org_demo",
        "composition_company",
        session.subject,
        "finance.issue_refund",
        "request_resolve"
      );
      const args = { invoiceId: "invoice_100", reason: "duplicate" };
      await service.createApproval(
        "org_demo",
        session,
        resolved,
        args,
        "request_approval"
      );
      const server = (await store.get<McpServerDefinition>(
        "org_demo",
        "servers",
        "server_finance"
      ))!;
      await store.put(
        "org_demo",
        "servers",
        {
          ...server,
          status,
          driftStatus,
          updatedAt: new Date().toISOString(),
          revision: server.revision + 1,
        },
        { expectedRevision: server.revision }
      );
      await expect(
        service.consumeApprovalForCall(
          "org_demo",
          session,
          resolved,
          args,
          "request_consume_unhealthy"
        )
      ).rejects.toBeInstanceOf(PlatformAuthorizationError);
    }
  );

  it("rejects approval consumption after the authorization epoch changes", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const requester: Subject = {
      type: "user",
      id: "user_requester",
      roles: ["finance-admin"],
      groups: ["finance-admins"],
      claims: {},
    };
    const issued = await service.createSession(
      "org_demo",
      {
        compositionId: "composition_company",
        environmentId: "env_production",
        subject: requester,
        expiresInSeconds: 600,
      },
      requester.id,
      "request_session",
      "https://gateway.test"
    );
    const session = (await service.authenticateSession("org_demo", issued.token))!;
    const resolved = await service.resolveTool(
      "org_demo",
      "composition_company",
      session.subject,
      "finance.issue_refund",
      "request_resolve"
    );
    const args = { invoiceId: "invoice_100", reason: "duplicate" };
    await service.createApproval(
      "org_demo",
      session,
      resolved,
      args,
      "request_approval"
    );
    await service.bumpAuthorizationEpoch("org_demo");
    await expect(
      service.consumeApprovalForCall(
        "org_demo",
        session,
        resolved,
        args,
        "request_stale_epoch"
      )
    ).rejects.toBeInstanceOf(PlatformAuthorizationError);
  });

  it("quarantines upstream schema drift until explicitly accepted", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const initial = await service.recordServerProbe(
      "org_demo",
      "server_finance",
      {
        tools: [
          {
            name: "read",
            title: "Read",
            description: "Read",
            inputSchema: { type: "object" },
            risk: "read",
            readOnly: true,
            idempotent: true,
          },
        ],
      },
      false,
      "user_admin",
      "probe_initial"
    );
    expect(initial.status).toBe("healthy");
    const drifted = await service.recordServerProbe(
      "org_demo",
      "server_finance",
      {
        tools: [
          {
            name: "write",
            title: "Write",
            description: "Write",
            inputSchema: { type: "object" },
            risk: "write",
            readOnly: false,
            idempotent: false,
          },
        ],
      },
      false,
      "user_admin",
      "probe_drift"
    );
    expect(drifted).toMatchObject({ status: "degraded", driftStatus: "quarantined" });
    expect(drifted.tools[0]?.name).toBe("read");
    const accepted = await service.recordServerProbe(
      "org_demo",
      "server_finance",
      {
        tools: [
          {
            name: "write",
            title: "Write",
            description: "Write",
            inputSchema: { type: "object" },
            risk: "write",
            readOnly: false,
            idempotent: false,
          },
        ],
      },
      true,
      "user_admin",
      "probe_accept"
    );
    expect(accepted).toMatchObject({ status: "healthy", driftStatus: "current" });
    expect(accepted.tools[0]?.name).toBe("write");
  });

  it("encrypts identity provider secrets before persistence", async () => {
    const store = new MemoryDocumentStore();
    const service = new PlatformService(store, {
      credentialCipher: new CredentialCipher(
        "a-production-master-key-that-is-long-enough"
      ),
    });
    await service.ensureDemoTenant();
    const created = await service.createIdentityProvider(
      "org_demo",
      {
        name: "Acme Entra",
        protocol: "oidc",
        issuer: "https://login.example.com/tenant/v2.0",
        domains: ["acme.example"],
        clientId: "client-id",
        clientSecret: "a-very-secret-client-value",
        status: "active",
        groupMappings: [{ claim: "groups", value: "analysts", role: "member" }],
      },
      "user_admin",
      "request_idp"
    );
    expect(created.secretReference).toBe("[REDACTED]");
    const stored = await store.get<IdentityProvider>(
      "org_demo",
      "identity-providers",
      created.id
    );
    expect(stored?.secretReference).toMatch(/^enc:v1:/);
    expect(stored?.secretReference).not.toContain("a-very-secret-client-value");
  });

  it("completes PKCE authorization-code and rotating-refresh token flows", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const client = await service.registerOAuthClient("org_demo", {
      client_name: "Test MCP client",
      redirect_uris: ["https://client.example/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
    });
    const verifier = "a".repeat(64);
    const code = await service.issueOAuthAuthorizationCode("org_demo", {
      clientId: client.clientId,
      redirectUri: "https://client.example/callback",
      compositionSlug: "company-tools",
      codeChallenge: await sha256Base64Url(verifier),
      scopes: ["mcp:composition:company-tools", "offline_access"],
      subject: employee,
    });
    const tokens = await service.exchangeOAuthAuthorizationCode(
      "org_demo",
      {
        clientId: client.clientId,
        code,
        codeVerifier: verifier,
        redirectUri: "https://client.example/callback",
      },
      "https://gateway.test",
      "request_token"
    );
    await expect(
      service.authenticateSession("org_demo", tokens.access_token)
    ).resolves.toMatchObject({ subject: { id: employee.id } });
    expect(tokens.refresh_token).toMatch(/^lmcp_refresh_/);
    if (!tokens.refresh_token) throw new Error("Refresh token was not issued.");
    const rotated = await service.rotateOAuthRefreshToken(
      "org_demo",
      { clientId: client.clientId, refreshToken: tokens.refresh_token },
      "https://gateway.test",
      "request_refresh"
    );
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    await expect(
      service.authenticateSession("org_demo", tokens.access_token)
    ).resolves.toBeNull();
    await expect(
      service.authenticateSession("org_demo", rotated.access_token)
    ).resolves.toMatchObject({ subject: { id: employee.id } });
    await expect(
      service.rotateOAuthRefreshToken(
        "org_demo",
        { clientId: client.clientId, refreshToken: tokens.refresh_token },
        "https://gateway.test",
        "request_reuse"
      )
    ).rejects.toBeInstanceOf(PlatformAuthorizationError);
    await expect(
      service.authenticateSession("org_demo", rotated.access_token)
    ).resolves.toBeNull();
    await expect(
      service.rotateOAuthRefreshToken(
        "org_demo",
        { clientId: client.clientId, refreshToken: rotated.refresh_token },
        "https://gateway.test",
        "request_family_revoked"
      )
    ).rejects.toBeInstanceOf(PlatformAuthorizationError);
  });

  it("issues no refresh token without explicit offline_access consent", async () => {
    const service = new PlatformService(new MemoryDocumentStore());
    await service.ensureDemoTenant();
    const client = await service.registerOAuthClient("org_demo", {
      client_name: "Online-only MCP client",
      redirect_uris: ["https://client.example/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
    });
    const verifier = "b".repeat(64);
    const code = await service.issueOAuthAuthorizationCode("org_demo", {
      clientId: client.clientId,
      redirectUri: "https://client.example/callback",
      compositionSlug: "company-tools",
      codeChallenge: await sha256Base64Url(verifier),
      scopes: ["mcp:composition:company-tools"],
      subject: employee,
    });
    const tokens = await service.exchangeOAuthAuthorizationCode(
      "org_demo",
      {
        clientId: client.clientId,
        code,
        codeVerifier: verifier,
        redirectUri: "https://client.example/callback",
      },
      "https://gateway.test",
      "request_online_token"
    );

    expect(tokens.refresh_token).toBeUndefined();
    await expect(
      service.authenticateSession("org_demo", tokens.access_token)
    ).resolves.toMatchObject({ subject: { id: employee.id } });
  });

  it("validates an entire portable import before mutating the pristine bootstrap", async () => {
    const source = new PlatformService(new MemoryDocumentStore());
    await source.bootstrapTenant("org_source", "Source workspace");
    const portable = await source.exportTenant("org_source");

    const store = new MemoryDocumentStore();
    const target = new PlatformService(store);
    await target.bootstrapTenant("org_target", "Target workspace", "user_owner", [
      "owner",
    ]);
    const snapshot = async () => ({
      organization: await store.get("org_target", "organizations", "org_target"),
      environments: await target.listEnvironments("org_target"),
      servers: await target.listServers("org_target"),
      compositions: await target.listCompositions("org_target"),
      policies: await target.listPolicies("org_target"),
      roles: await target.listRoles("org_target"),
      assignments: await target.listRoleAssignments("org_target"),
      providers: await target.listIdentityProviders("org_target", true),
      authority: await store.get("org_target", "tenant-authority", "authority"),
      audit: await target.listAudit("org_target", 1_000),
    });
    const before = await snapshot();

    const danglingEnvironment = structuredClone(portable);
    const importedComposition = danglingEnvironment.compositions[0];
    if (!importedComposition) throw new Error("Expected the bootstrap composition.");
    importedComposition.environmentId = "env_missing";
    await expect(
      target.importTenant(
        "org_target",
        danglingEnvironment,
        "user_owner",
        "request_bad_environment"
      )
    ).rejects.toBeInstanceOf(PlatformValidationError);

    const unknownRole = structuredClone(portable);
    const roleRule = unknownRole.policies[0]?.rules[0];
    if (!roleRule) throw new Error("Expected the bootstrap policy rule.");
    roleRule.roles = ["undeclared-role"];
    await expect(
      target.importTenant("org_target", unknownRole, "user_owner", "request_bad_role")
    ).rejects.toBeInstanceOf(PlatformValidationError);

    const unknownTool = structuredClone(portable);
    const toolRule = unknownTool.policies[0]?.rules[0];
    if (!toolRule) throw new Error("Expected the bootstrap policy rule.");
    toolRule.tools = ["missing.tool"];
    await expect(
      target.importTenant("org_target", unknownTool, "user_owner", "request_bad_tool")
    ).rejects.toBeInstanceOf(PlatformValidationError);

    const malformedRole = structuredClone(portable) as unknown as {
      roles: Array<Record<string, unknown>>;
    };
    const importedRole = malformedRole.roles[0];
    if (!importedRole) throw new Error("Expected the bootstrap roles.");
    importedRole.revision = "not-a-revision";
    await expect(
      target.importTenant(
        "org_target",
        malformedRole,
        "user_owner",
        "request_malformed_role"
      )
    ).rejects.toBeInstanceOf(PlatformValidationError);

    expect(await snapshot()).toEqual(before);
  });

  it("rejects credentials and unknown fields in nominally secret-free imports", async () => {
    const source = new PlatformService(new MemoryDocumentStore());
    await source.bootstrapTenant("org_source", "Source workspace");
    const portable = await source.exportTenant("org_source");
    const target = new PlatformService(new MemoryDocumentStore());
    await target.bootstrapTenant("org_target", "Target workspace");

    const credentialBearing = structuredClone(portable);
    credentialBearing.identityProviders.push({
      id: "idp_unsafe",
      tenantId: "org_source",
      name: "Unsafe identity provider",
      protocol: "oidc",
      issuer: "https://login.example.com",
      domains: ["example.com"],
      clientId: "real-client-id",
      secretReference: "secret://production/client-secret",
      status: "active",
      groupMappings: [{ claim: "groups", value: "owners", role: "owner" }],
      createdAt: portable.exportedAt,
      updatedAt: portable.exportedAt,
      revision: 1,
    });
    await expect(
      target.importTenant(
        "org_target",
        credentialBearing,
        "user_owner",
        "request_credentials"
      )
    ).rejects.toBeInstanceOf(PlatformValidationError);

    const stdioCommand = structuredClone(portable);
    stdioCommand.servers.push({
      id: "server_stdio",
      tenantId: "org_source",
      slug: "local-tools",
      name: "Local tools",
      description: "A command that must not cross the portable boundary.",
      transport: "stdio",
      command: ["node", "server.js", "--token", "do-not-export"],
      version: "1.0.0",
      status: "healthy",
      visibility: "private",
      tags: [],
      tools: [],
      createdAt: portable.exportedAt,
      updatedAt: portable.exportedAt,
      revision: 1,
    });
    await expect(
      target.importTenant(
        "org_target",
        stdioCommand,
        "user_owner",
        "request_stdio_secret"
      )
    ).rejects.toBeInstanceOf(PlatformValidationError);

    const unknownField = structuredClone(portable) as unknown as {
      organization: Record<string, unknown>;
    };
    unknownField.organization.apiKey = "do-not-import";
    await expect(
      target.importTenant(
        "org_target",
        unknownField,
        "user_owner",
        "request_unknown_secret"
      )
    ).rejects.toBeInstanceOf(PlatformValidationError);
  });

  it("imports a validated graph and disables redacted identity providers", async () => {
    const source = new PlatformService(new MemoryDocumentStore());
    await source.bootstrapTenant("org_source", "Portable source");
    const portable = await source.exportTenant("org_source");
    portable.identityProviders.push({
      id: "idp_portable",
      tenantId: "org_source",
      name: "Portable identity provider",
      protocol: "oidc",
      issuer: "https://login.example.com",
      domains: ["example.com"],
      clientId: "<configure-after-import>",
      secretReference: "<configure-after-import>",
      status: "active",
      groupMappings: [{ claim: "groups", value: "owners", role: "owner" }],
      createdAt: portable.exportedAt,
      updatedAt: portable.exportedAt,
      revision: 1,
    });

    const store = new MemoryDocumentStore();
    const target = new PlatformService(store);
    await target.bootstrapTenant("org_target", "Empty target", "user_owner", ["owner"]);
    await target.importTenant("org_target", portable, "user_owner", "request_import");

    expect(await store.get("org_target", "organizations", "org_target")).toMatchObject({
      id: "org_target",
      tenantId: "org_target",
      name: "Portable source",
    });
    expect(await target.listIdentityProviders("org_target", true)).toEqual([
      expect.objectContaining({
        id: "idp_portable",
        tenantId: "org_target",
        clientId: "<configure-after-import>",
        secretReference: "<configure-after-import>",
        status: "disabled",
      }),
    ]);
    expect(await target.listRoleAssignments("org_target", "user_owner")).toHaveLength(
      1
    );
    await expect(
      target.importTenant("org_target", portable, "user_owner", "request_import_again")
    ).rejects.toBeInstanceOf(PlatformConflictError);
  });

  it("never publishes a concurrently edited draft through the authority pointer", async () => {
    const store = new MemoryDocumentStore();
    const service = new PlatformService(store);
    await service.ensureDemoTenant();
    const created = await service.createPolicy(
      "org_demo",
      {
        name: "Concurrent policy",
        description: "Original linted revision",
        defaultEffect: "deny",
        rules: [],
      },
      "user_admin",
      "request_policy_create"
    );
    const draft = created.policy;
    await Promise.allSettled([
      service.activatePolicy(
        "org_demo",
        draft.id,
        "user_admin",
        "request_policy_activate"
      ),
      service.updatePolicy(
        "org_demo",
        draft.id,
        { description: "Concurrent unlinted edit" },
        "user_editor",
        "request_policy_edit"
      ),
    ]);

    const authority = await service.getAuthority("org_demo");
    const stored = await store.get<Policy>("org_demo", "policies", draft.id);
    if (authority.activePolicyId === draft.id) {
      expect(stored).toMatchObject({
        status: "active",
        description: "Original linted revision",
      });
    } else {
      expect(stored?.status).toBe("draft");
      expect(await service.activePolicy("org_demo")).not.toMatchObject({
        id: draft.id,
      });
    }
  });

  it("enforces configurable deployment session quotas", async () => {
    const service = new PlatformService(new MemoryDocumentStore(), {
      quotas: { activeSessions: 1 },
    });
    await service.ensureDemoTenant();
    const input = {
      compositionId: "composition_company",
      environmentId: "env_production",
      subject: employee,
      expiresInSeconds: 600,
    };
    await service.createSession(
      "org_demo",
      input,
      employee.id,
      "request_first",
      "https://gateway.test"
    );
    await expect(
      service.createSession(
        "org_demo",
        input,
        employee.id,
        "request_second",
        "https://gateway.test"
      )
    ).rejects.toBeInstanceOf(PlatformQuotaError);
  });

  it("resolves tenant quotas asynchronously and observes updated limits", async () => {
    let activeSessionLimit = 1;
    const resolvedTenants: string[] = [];
    const service = new PlatformService(new MemoryDocumentStore(), {
      quotas: { activeSessions: 3, toolCallsPerDay: 3 },
      quotaResolver: async (tenantId) => {
        await Promise.resolve();
        resolvedTenants.push(tenantId);
        return {
          activeSessions: activeSessionLimit,
          toolCallsPerDay: 1,
        };
      },
    });
    await service.ensureDemoTenant();
    const input = {
      compositionId: "composition_company",
      environmentId: "env_production",
      subject: employee,
      expiresInSeconds: 600,
    };

    await service.createSession(
      "org_demo",
      input,
      employee.id,
      "request_resolved_first",
      "https://gateway.test"
    );
    await expect(
      service.createSession(
        "org_demo",
        input,
        employee.id,
        "request_resolved_second",
        "https://gateway.test"
      )
    ).rejects.toThrow("configured activeSessions limit of 1");

    activeSessionLimit = 2;
    await expect(
      service.createSession(
        "org_demo",
        input,
        employee.id,
        "request_resolved_after_update",
        "https://gateway.test"
      )
    ).resolves.toBeDefined();

    await service.consumeToolCallQuota("org_demo");
    await expect(service.consumeToolCallQuota("org_demo")).rejects.toThrow(
      "configured daily tool-call limit of 1"
    );
    const standing = await service.getUsageStanding("org_demo");
    expect(standing).toMatchObject({
      activeSessions: { limit: 2, used: 2, remaining: 0 },
      toolCallsToday: { limit: 1, used: 1, remaining: 0 },
    });
    expect(resolvedTenants.length).toBeGreaterThanOrEqual(6);
    expect(new Set(resolvedTenants)).toEqual(new Set(["org_demo"]));
  });

  it("serializes concurrent active-session quota reservations", async () => {
    const service = new PlatformService(new MemoryDocumentStore(), {
      quotas: { activeSessions: 2 },
    });
    await service.ensureDemoTenant();
    const input = {
      compositionId: "composition_company",
      environmentId: "env_production",
      subject: employee,
      expiresInSeconds: 600,
    };
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        service.createSession(
          "org_demo",
          input,
          employee.id,
          `request_concurrent_session_${index}`,
          "https://gateway.test"
        )
      )
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(
      results
        .filter((result) => result.status === "rejected")
        .every((result) => result.reason instanceof PlatformQuotaError)
    ).toBe(true);
  });

  it("counts active sessions after more than one storage page of history", async () => {
    const store = new MemoryDocumentStore();
    const service = new PlatformService(store, {
      quotas: { activeSessions: 1 },
    });
    await service.ensureDemoTenant();
    const timestamp = new Date(0).toISOString();
    await Promise.all(
      Array.from({ length: 1_005 }, (_, index) => {
        const suffix = index.toString(16).padStart(32, "0");
        return store.put(
          "org_demo",
          "sessions",
          {
            id: `session_${suffix}`,
            tenantId: "org_demo",
            compositionId: "composition_company",
            environmentId: "env_production",
            subject: employee,
            authorizationEpoch: 1,
            tokenHash: "0".repeat(64),
            approvedClients: [],
            expiresAt: timestamp,
            revokedAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
            revision: 1,
          },
          { expectedRevision: null }
        );
      })
    );
    const input = {
      compositionId: "composition_company",
      environmentId: "env_production",
      subject: employee,
      expiresInSeconds: 600,
    };
    await service.createSession(
      "org_demo",
      input,
      employee.id,
      "request_after_history",
      "https://gateway.test"
    );

    expect(await service.listSessions("org_demo")).toHaveLength(1_006);
    await expect(
      service.createSession(
        "org_demo",
        input,
        employee.id,
        "request_over_history_quota",
        "https://gateway.test"
      )
    ).rejects.toBeInstanceOf(PlatformQuotaError);
  });
});
