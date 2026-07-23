import {
  createFailOpenAnalyticsRecorder,
  type FailOpenAnalyticsRecorder,
} from "@litemcp/analytics";
import {
  type Composition,
  type GatewaySession,
  type UsageEvent,
  usageEventSchema,
} from "@litemcp/contracts";
import { PlatformService } from "@litemcp/core";
import { MemoryDocumentStore } from "@litemcp/storage";
import { describe, expect, it } from "vitest";

import {
  BuiltinExecutor,
  demoSubject,
  McpGateway,
  RemoteHttpExecutor,
  validateRemoteEndpoint,
  validateToolArguments,
} from "./index.js";

const setup = async (
  role: "employee" | "finance-admin",
  upstreamOverride?: typeof fetch,
  analyticsRecorder?: FailOpenAnalyticsRecorder
) => {
  const usageEvents: UsageEvent[] = [];
  const platform = new PlatformService(new MemoryDocumentStore(), {
    analyticsEnabled: true,
    analyticsRecorder:
      analyticsRecorder ??
      ({
        recordUsage: (event) => usageEvents.push(event),
        flush: async () => undefined,
      } satisfies FailOpenAnalyticsRecorder),
  });
  await platform.ensureDemoTenant("org_demo", "https://gateway.example.net");
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
    "https://gateway.example.net"
  );
  let upstreamCalls = 0;
  const upstreamFetch: typeof fetch = async (input, init) => {
    upstreamCalls += 1;
    if (upstreamOverride) return upstreamOverride(input, init);
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
    usageEvents,
  };
};

describe("McpGateway", () => {
  it("persists bounded initialize attribution and emits aggregate payload-free facts", async () => {
    const { gateway, platform, token, usageEvents } = await setup("employee");
    usageEvents.length = 0;
    const initialized = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_initialize_attributed",
      body: {
        jsonrpc: "2.0",
        id: 100,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "Cursor", version: "1.0.0" },
        },
      },
    });
    expect(initialized.status).toBe(200);
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      eventType: "initialize",
      clientName: "Cursor",
      clientVersion: "1.0.0",
      userAgentClass: "cursor",
      status: "succeeded",
    });
    expect(JSON.stringify(usageEvents[0])).not.toContain("capabilities");

    const authenticated = await platform.authenticateSession("org_demo", token);
    expect(authenticated?.analyticsClientInfo?.name).toBe("Cursor");
    if (!authenticated)
      throw new Error("Expected the attributed session to authenticate.");
    expect(
      (
        await platform.store.get<GatewaySession>(
          "org_demo",
          "sessions",
          authenticated.id
        )
      )?.revision
    ).toBe(1);

    usageEvents.length = 0;
    await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_aggregate_discovery",
      body: { jsonrpc: "2.0", id: 101, method: "tools/list" },
    });
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      eventType: "discover",
      clientName: "Cursor",
      toolsVisible: 2,
      toolsHidden: 1,
      visibilityTruncated: false,
    });
    expect(usageEvents[0]?.visibleTools).toEqual(["math.add", "finance.list_invoices"]);

    usageEvents.length = 0;
    const call = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_measured_call",
      body: {
        jsonrpc: "2.0",
        id: 102,
        method: "tools/call",
        params: {
          name: "finance.list_invoices",
          arguments: { accountId: "acct_1" },
        },
      },
    });
    expect(call.status).toBe(200);
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      eventType: "call",
      status: "succeeded",
      tool: "finance.list_invoices",
      namespace: "finance",
      clientName: "Cursor",
      decisionEffect: "allow",
    });
    expect(usageEvents[0]?.latencyTotalMs).toBeGreaterThanOrEqual(
      usageEvents[0]?.latencyUpstreamMs ?? 0
    );
    expect(usageEvents[0]?.requestBytes).toBeGreaterThan(0);
    expect(usageEvents[0]?.responseBytes).toBeGreaterThan(0);
    expect(usageEvents[0]?.auditId).toMatch(/^audit_/);
    for (const event of usageEvents)
      expect(() => usageEventSchema.parse(event)).not.toThrow();
    expect(JSON.stringify(usageEvents[0])).not.toContain("acct_1");
    expect(JSON.stringify(usageEvents[0])).not.toContain("invoice_100");
  });

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

  it("accumulates retry measurements into one terminal call event", async () => {
    let attempt = 0;
    const { gateway, token, upstreamCalls, usageEvents } = await setup(
      "employee",
      async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("temporary transport failure");
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "upstream",
            result: { content: [{ type: "text", text: "recovered" }] },
          }),
          { headers: { "content-type": "application/json" } }
        );
      }
    );
    usageEvents.length = 0;
    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_retry_measurement",
      body: {
        jsonrpc: "2.0",
        id: 103,
        method: "tools/call",
        params: {
          name: "finance.list_invoices",
          arguments: { accountId: "acct_1" },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(upstreamCalls()).toBe(2);
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      eventType: "call",
      status: "succeeded",
      tool: "finance.list_invoices",
    });
    expect(usageEvents[0]?.requestBytes).toBeGreaterThan(200);
    expect(usageEvents[0]?.latencyUpstreamMs).toBeGreaterThanOrEqual(0);
  });

  it("never lets an unavailable analytics sink affect a tool call", async () => {
    const failures: string[] = [];
    const recorder = createFailOpenAnalyticsRecorder(
      {
        recordUsage: async () => {
          throw new Error("analytics unavailable");
        },
      },
      { onError: (failure) => failures.push(failure.phase) }
    );
    const { gateway, token } = await setup("employee", undefined, recorder);
    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_sink_down",
      body: {
        jsonrpc: "2.0",
        id: 104,
        method: "tools/call",
        params: { name: "sum", arguments: { a: 2, b: 3 } },
      },
    });
    await recorder.flush();

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain('"sum":5');
    expect(failures).toContain("sink");
  });

  it("records first-tool activation only after a successful tool result", async () => {
    const { gateway, platform, token } = await setup("employee");
    const firstToolEvents = async () =>
      (await platform.listActivationEvents("org_demo")).filter(
        (event) => event.name === "first_tool_call"
      );

    expect(await firstToolEvents()).toHaveLength(0);
    const succeeded = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_first_tool_success",
      body: {
        jsonrpc: "2.0",
        id: 105,
        method: "tools/call",
        params: { name: "sum", arguments: { a: 20, b: 22 } },
      },
    });

    expect(succeeded.status).toBe(200);
    expect(await firstToolEvents()).toMatchObject([
      { metadata: { toolName: "math.add" } },
    ]);

    await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_second_tool_success",
      body: {
        jsonrpc: "2.0",
        id: 106,
        method: "tools/call",
        params: {
          name: "finance.list_invoices",
          arguments: { accountId: "acct_1" },
        },
      },
    });
    expect(await firstToolEvents()).toHaveLength(1);
  });

  it("does not record first-tool activation for a tool-reported error", async () => {
    const { gateway, platform, token } = await setup(
      "employee",
      async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "upstream",
            result: {
              content: [{ type: "text", text: "sandbox failure" }],
              isError: true,
            },
          }),
          { headers: { "content-type": "application/json" } }
        )
    );
    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_tool_reported_error",
      body: {
        jsonrpc: "2.0",
        id: 107,
        method: "tools/call",
        params: {
          name: "finance.list_invoices",
          arguments: { accountId: "acct_1" },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain('"isError":true');
    expect(
      (await platform.listActivationEvents("org_demo")).filter(
        (event) => event.name === "first_tool_call"
      )
    ).toHaveLength(0);
  });

  it("does not activate when upstream execution fails", async () => {
    const { gateway, platform, token, upstreamCalls } = await setup(
      "employee",
      async () => {
        throw new Error("upstream unavailable");
      }
    );
    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_upstream_failed_before_activation",
      body: {
        jsonrpc: "2.0",
        id: 108,
        method: "tools/call",
        params: {
          name: "finance.list_invoices",
          arguments: { accountId: "acct_1" },
        },
      },
    });

    expect(response.status).toBe(502);
    expect(upstreamCalls()).toBe(2);
    expect(response.body).toMatchObject({ error: { code: -32002 } });
    expect(
      (await platform.listActivationEvents("org_demo")).filter(
        (event) => event.name === "first_tool_call"
      )
    ).toHaveLength(0);
  });

  it("never lets unavailable activation telemetry affect a successful call", async () => {
    const { gateway, platform, token, usageEvents } = await setup("employee");
    let activationAttempts = 0;
    platform.recordActivationEvent = async () => {
      activationAttempts += 1;
      throw new Error("activation telemetry unavailable");
    };
    usageEvents.length = 0;

    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_activation_down",
      body: {
        jsonrpc: "2.0",
        id: 109,
        method: "tools/call",
        params: { name: "sum", arguments: { a: 2, b: 3 } },
      },
    });

    expect(activationAttempts).toBe(1);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      result: { structuredContent: { sum: 5 } },
    });
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      eventType: "call",
      status: "succeeded",
      tool: "math.add",
    });
    expect(
      (await platform.listAudit("org_demo")).some(
        (event) =>
          event.requestId === "request_activation_down" &&
          event.type === "execution.completed" &&
          event.outcome === "succeeded"
      )
    ).toBe(true);
  });

  it("denies a hidden tool even when its name is guessed", async () => {
    const { gateway, token, usageEvents } = await setup("employee");
    usageEvents.length = 0;
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
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      eventType: "denied",
      status: "denied",
      errorCode: "POLICY_DENIED",
      tool: "finance.issue_refund",
      risk: "financial",
      decisionEffect: "deny",
    });
    expect(usageEvents[0]?.matchedRuleIds).toEqual(["rule_employee_refund_deny"]);
    expect(usageEvents[0]?.auditId).toMatch(/^audit_/);
  });

  it("revalidates an emergency freeze at the final dispatch boundary", async () => {
    const { gateway, platform, token, upstreamCalls } = await setup("employee");
    const appendAudit = platform.appendAudit.bind(platform);
    platform.appendAudit = async (tenantId, input) => {
      const event = await appendAudit(tenantId, input);
      if (input.type === "execution.dispatched") {
        await platform.setTenantFrozen(
          tenantId,
          true,
          "Dispatch-boundary regression test",
          "user_admin",
          "request_freeze_boundary"
        );
      }
      return event;
    };

    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: `Bearer ${token}`,
      requestId: "request_frozen_dispatch",
      body: {
        jsonrpc: "2.0",
        id: 41,
        method: "tools/call",
        params: {
          name: "finance.list_invoices",
          arguments: { accountId: "acct_1" },
        },
      },
    });

    expect(response.status).toBe(403);
    expect(upstreamCalls()).toBe(0);
    expect(
      (await platform.listActivationEvents("org_demo")).filter(
        (event) => event.name === "first_tool_call"
      )
    ).toHaveLength(0);
  });

  it("pauses approval-gated calls without executing upstream", async () => {
    const { gateway, platform, token, upstreamCalls, usageEvents } =
      await setup("finance-admin");
    usageEvents.length = 0;
    const call = () =>
      gateway.handle({
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
    const concurrent = await Promise.all(Array.from({ length: 12 }, () => call()));
    const response = concurrent[0]!;
    const retry = concurrent[1]!;
    expect(JSON.stringify(response.body)).toContain("approval_required");
    expect(JSON.stringify(response.body)).toContain('"isError":true');
    expect(upstreamCalls()).toBe(0);
    expect(
      usageEvents.filter((event) => event.eventType === "approval_required")
    ).toHaveLength(12);
    const approvals = await platform.listApprovals("org_demo");
    expect(approvals).toHaveLength(1);
    expect(JSON.stringify(retry.body)).toContain(approvals[0]!.id);

    await platform.decideApproval(
      "org_demo",
      approvals[0]!.id,
      {
        decision: "approved",
        reason: "Reviewed by a separate administrator",
        generation: approvals[0]!.generation,
        fingerprint: approvals[0]!.fingerprint,
      },
      {
        type: "user",
        id: "user_separate_approver",
        roles: ["admin"],
        groups: [],
        claims: {},
      },
      "request_decision"
    );

    const composition = (await platform.store.get<Composition>(
      "org_demo",
      "compositions",
      "composition_company"
    ))!;
    await platform.store.put(
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
    const staleApproval = await call();
    expect(JSON.stringify(staleApproval.body)).toContain("approval_required");
    expect(upstreamCalls()).toBe(0);
    const replacement = (await platform.listApprovals("org_demo"))[0]!;
    expect(replacement.id).toBe(approvals[0]!.id);
    expect(replacement.generation).toBe(approvals[0]!.generation + 1);
    expect(replacement.compositionVersion).toBe("2.0.0");
    expect(replacement.fingerprint).not.toBe(approvals[0]!.fingerprint);
    await platform.decideApproval(
      "org_demo",
      replacement.id,
      {
        decision: "approved",
        reason: "Reviewed against the new composition version",
        generation: replacement.generation,
        fingerprint: replacement.fingerprint,
      },
      {
        type: "user",
        id: "user_separate_approver",
        roles: ["admin"],
        groups: [],
        claims: {},
      },
      "request_replacement_decision"
    );

    const executed = await call();
    expect(executed.status).toBe(200);
    expect(upstreamCalls()).toBe(1);

    const replay = await call();
    expect(JSON.stringify(replay.body)).toContain("approval_required");
    expect(upstreamCalls()).toBe(1);
    const replayApproval = (await platform.listApprovals("org_demo"))[0]!;
    expect(replayApproval.id).toBe(replacement.id);
    expect(replayApproval.generation).toBe(replacement.generation + 1);
    expect(await platform.listApprovals("org_demo")).toHaveLength(1);
  });

  it("requires authorization before initialize and notification handling", async () => {
    const { gateway } = await setup("employee");
    const response = await gateway.handle({
      tenantId: "org_demo",
      compositionSlug: "company-tools",
      authorization: null,
      requestId: "request_initialize",
      body: { jsonrpc: "2.0", id: 8, method: "initialize" },
    });
    expect(response.status).toBe(401);
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

describe("upstream discovery", () => {
  it("initializes and imports bounded MCP tool definitions", async () => {
    const methods: string[] = [];
    const executor = new RemoteHttpExecutor(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { id: string; method: string };
      methods.push(body.method);
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result:
            body.method === "initialize"
              ? {
                  protocolVersion: "2025-11-25",
                  serverInfo: { name: "Acme", version: "2.0.0" },
                }
              : {
                  tools: [
                    {
                      name: "search",
                      description: "Searches records",
                      inputSchema: { type: "object" },
                      annotations: {
                        readOnlyHint: true,
                        idempotentHint: true,
                      },
                    },
                  ],
                },
        }),
        { headers: { "content-type": "application/json" } }
      );
    });
    const result = await executor.probe!(
      {
        id: "server_acme",
        tenantId: "org_acme",
        slug: "acme",
        name: "Acme",
        description: "Acme MCP",
        transport: "streamable-http",
        endpoint: "https://mcp.example.com",
        version: "1.0.0",
        status: "unprobed",
        visibility: "private",
        tags: [],
        tools: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        revision: 1,
      },
      { requestId: "request_probe" }
    );

    expect(methods).toEqual(["initialize", "tools/list"]);
    expect(result).toEqual({
      serverVersion: "2.0.0",
      tools: [
        {
          name: "search",
          title: "search",
          description: "Searches records",
          inputSchema: { type: "object" },
          risk: "write",
          readOnly: false,
          idempotent: false,
        },
      ],
    });
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
