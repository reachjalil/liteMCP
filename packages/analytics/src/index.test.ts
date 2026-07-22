import { type UsageEvent, usageEventSchema } from "@litemcp/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  type AnalyticsSink,
  aggregateFlows,
  aggregatePolicyInsights,
  aggregateRecent,
  aggregateSessionTimeline,
  aggregateSummary,
  aggregateTimeseries,
  aggregateTop,
  analyticsResultToJson,
  analyticsRowsToCsv,
  CompositeAnalyticsSink,
  createFailOpenAnalyticsRecorder,
  MemoryAnalyticsStore,
  nearestRankPercentile,
  usageEventsToCsv,
} from "./index.js";

const from = "2026-07-21T00:00:00.000Z";
const to = "2026-07-21T01:00:00.000Z";
const range = { tenantId: "tenant_a", from, to };

let sequence = 0;
const event = (overrides: Partial<UsageEvent> = {}): UsageEvent => {
  sequence += 1;
  return usageEventSchema.parse({
    id: `usage_${String(sequence).padStart(3, "0")}`,
    tenantId: "tenant_a",
    sessionId: "session_1",
    subjectId: "user_1",
    subjectType: "user",
    roles: ["employee"],
    clientName: "Cursor",
    clientVersion: "1.0",
    userAgentClass: "cursor",
    sdk: false,
    eventType: "call",
    compositionId: "composition_1",
    environmentId: "environment_1",
    namespace: "crm",
    serverId: "server_crm",
    tool: "crm/read",
    aliasUsed: false,
    risk: "read",
    decisionEffect: "allow",
    matchedRuleIds: ["rule_allow"],
    policyId: "policy_1",
    policyVersion: "1",
    latencyTotalMs: 100,
    latencyUpstreamMs: 80,
    status: "succeeded",
    requestId: `request_${String(sequence).padStart(3, "0")}`,
    ts: "2026-07-21T00:01:00.000Z",
    protocolVersion: "2025-11-25",
    ...overrides,
  });
};

const fixture = () => {
  sequence = 0;
  return [
    event({
      eventType: "initialize",
      tool: undefined,
      latencyTotalMs: 10,
      latencyUpstreamMs: undefined,
      matchedRuleIds: [],
      ts: "2026-07-21T00:00:00.000Z",
    }),
    event({
      eventType: "discover",
      tool: undefined,
      latencyTotalMs: 15,
      latencyUpstreamMs: undefined,
      matchedRuleIds: ["rule_discover"],
      toolsVisible: 3,
      toolsHidden: 1,
      visibleTools: ["crm/read", "finance/pay", "unused/tool"],
      visibilityTruncated: false,
      ts: "2026-07-21T00:00:30.000Z",
    }),
    event({ ts: "2026-07-21T00:01:00.000Z", latencyTotalMs: 100 }),
    event({
      eventType: "denied",
      tool: "finance/pay",
      serverId: "server_finance",
      namespace: "finance",
      risk: "financial",
      decisionEffect: "deny",
      matchedRuleIds: ["rule_deny"],
      status: "denied",
      latencyTotalMs: 20,
      latencyUpstreamMs: undefined,
      ts: "2026-07-21T00:02:00.000Z",
    }),
    event({
      eventType: "approval_required",
      approvalId: "approval_1",
      tool: "finance/pay",
      serverId: "server_finance",
      namespace: "finance",
      risk: "financial",
      decisionEffect: "require-approval",
      matchedRuleIds: ["rule_approval"],
      status: "pending",
      latencyTotalMs: undefined,
      latencyUpstreamMs: undefined,
      requestId: "approval_request_call_1",
      ts: "2026-07-21T00:03:00.000Z",
    }),
    event({
      eventType: "approval_decided",
      approvalId: "approval_1",
      approvalLatencyMs: 240_000,
      tool: "finance/pay",
      serverId: "server_finance",
      namespace: "finance",
      risk: "financial",
      decisionEffect: "require-approval",
      matchedRuleIds: ["rule_approval"],
      status: "succeeded",
      latencyTotalMs: undefined,
      latencyUpstreamMs: undefined,
      requestId: "approval_decision_request_1",
      ts: "2026-07-21T00:08:00.000Z",
    }),
    event({
      tool: "finance/pay",
      serverId: "server_finance",
      namespace: "finance",
      risk: "financial",
      matchedRuleIds: ["rule_approval"],
      latencyTotalMs: 300,
      latencyUpstreamMs: 250,
      ts: "2026-07-21T00:09:00.000Z",
    }),
    event({
      eventType: "error",
      status: "failed",
      errorCode: "UPSTREAM_TIMEOUT",
      latencyTotalMs: 900,
      latencyUpstreamMs: 850,
      ts: "2026-07-21T00:09:30.000Z",
    }),
    event({
      sessionId: "session_2",
      subjectId: "user_2",
      clientName: "Claude Code",
      clientVersion: "2.0",
      userAgentClass: "claude-code",
      eventType: "discover",
      tool: undefined,
      matchedRuleIds: ["rule_discover"],
      latencyTotalMs: 12,
      latencyUpstreamMs: undefined,
      toolsVisible: 2,
      toolsHidden: 0,
      visibleTools: ["crm/read", "unused/tool"],
      visibilityTruncated: false,
      ts: "2026-07-21T00:11:00.000Z",
    }),
    event({
      sessionId: "session_2",
      subjectId: "user_2",
      clientName: "Claude Code",
      clientVersion: "2.0",
      userAgentClass: "claude-code",
      latencyTotalMs: 50,
      latencyUpstreamMs: 40,
      ts: "2026-07-21T00:12:00.000Z",
    }),
    event({
      sessionId: "session_2",
      subjectId: "user_2",
      clientName: "Claude Code",
      clientVersion: "2.0",
      userAgentClass: "claude-code",
      eventType: "approval_required",
      approvalId: "approval_2",
      tool: "finance/pay",
      serverId: "server_finance",
      namespace: "finance",
      risk: "financial",
      decisionEffect: "require-approval",
      matchedRuleIds: ["rule_approval"],
      status: "pending",
      latencyTotalMs: undefined,
      latencyUpstreamMs: undefined,
      ts: "2026-07-21T00:13:00.000Z",
    }),
    event({
      tenantId: "tenant_b",
      sessionId: "session_b",
      subjectId: "user_b",
      ts: "2026-07-21T00:14:00.000Z",
    }),
    event({ ts: to }),
  ];
};

const firstFixtureEvent = () => {
  const first = fixture()[0];
  if (!first) throw new Error("Analytics fixture unexpectedly produced no events.");
  return first;
};

describe("deterministic analytics aggregation", () => {
  it("uses nearest-rank percentiles and tenant-isolated half-open ranges", () => {
    expect(nearestRankPercentile([], 0.95)).toBeNull();
    expect(nearestRankPercentile([900, 20, 100, 300, 50], 0.5)).toBe(100);
    expect(aggregateSummary(fixture(), range)).toEqual({
      from,
      to,
      calls: 7,
      activeIdentities: 2,
      activeSessions: 2,
      denials: 1,
      denyRate: 1 / 7,
      errors: 1,
      errorRate: 1 / 7,
      latencyP50Ms: 100,
      latencyP95Ms: 900,
      pendingApprovals: 1,
    });
  });

  it("does not mark control-plane-only lifecycle subjects as active clients", () => {
    const lifecycle = [
      event({
        eventType: "session_minted",
        tool: undefined,
        matchedRuleIds: [],
        latencyTotalMs: undefined,
        latencyUpstreamMs: undefined,
      }),
      event({
        eventType: "session_revoked",
        tool: undefined,
        matchedRuleIds: [],
        latencyTotalMs: undefined,
        latencyUpstreamMs: undefined,
      }),
    ];

    expect(aggregateSummary(lifecycle, range)).toMatchObject({
      calls: 0,
      activeIdentities: 0,
      activeSessions: 0,
    });
  });

  it("zero-fills count series and keeps empty latency buckets null", () => {
    const calls = aggregateTimeseries(fixture(), {
      ...range,
      metric: "calls",
      interval: "5m",
    });
    expect(calls.points).toHaveLength(12);
    expect(calls.points.slice(0, 3).map((point) => point.value)).toEqual([3, 2, 2]);

    const latency = aggregateTimeseries([], {
      ...range,
      metric: "latency_p95",
      interval: "1h",
    });
    expect(latency.points).toEqual([{ ts: from, value: null }]);
  });

  it("ranks top dimensions with deterministic tie breaking", () => {
    expect(
      aggregateTop(fixture(), {
        ...range,
        dimension: "tool",
        metric: "calls",
        limit: 10,
      }).rows
    ).toEqual([
      { key: "finance/pay", value: 4, eventCount: 4 },
      { key: "crm/read", value: 3, eventCount: 3 },
    ]);
  });

  it("paginates recent events deterministically without crossing tenants", () => {
    const source = fixture();
    const first = aggregateRecent(source, { ...range, limit: 3 });
    expect(first.events).toHaveLength(3);
    expect(first.nextCursor).toBeDefined();
    const second = aggregateRecent(source, {
      ...range,
      limit: 20,
      cursor: first.nextCursor,
    });
    expect(second.events.every((item) => item.tenantId === "tenant_a")).toBe(true);
    expect(
      new Set([...first.events, ...second.events].map((item) => item.id)).size
    ).toBe(first.events.length + second.events.length);
    expect(() =>
      aggregateRecent(source, { ...range, limit: 10, cursor: "not-a-cursor" })
    ).toThrow("Invalid analytics recent cursor");
  });

  it("builds ordered session timelines with embedded audit receipts", () => {
    const source = fixture();
    source[2] = usageEventSchema.parse({
      ...source[2],
      auditId: "audit_1",
      auditSequence: 10,
      auditHash: "a".repeat(64),
    });
    const timeline = aggregateSessionTimeline(source, {
      ...range,
      sessionId: "session_1",
    });
    expect(timeline.startedAt).toBe(from);
    expect(timeline.items.map((item) => item.offsetMs)).toEqual([
      0, 30_000, 60_000, 120_000, 180_000, 480_000, 540_000, 570_000,
    ]);
    expect(timeline.items[2]?.event.auditSequence).toBe(10);
  });

  it("derives successful tool transitions per session", () => {
    expect(aggregateFlows(fixture(), { ...range, limit: 100 }).transitions).toEqual([
      {
        source: "crm/read",
        target: "finance/pay",
        count: 1,
        sessionCount: 1,
      },
    ]);
  });

  it("finds rule gaps, denial hotspots, conversion, approvals, and unused tools", () => {
    const insights = aggregatePolicyInsights(fixture(), {
      ...range,
      policyId: "policy_1",
      ruleIds: ["rule_allow", "rule_deny", "rule_never"],
    });
    expect(insights.zeroHitRuleIds).toEqual(["rule_never"]);
    expect(insights.denialHotspots[0]).toEqual({
      tool: "finance/pay",
      calls: 4,
      denials: 1,
      denyRate: 0.25,
    });
    expect(insights.unusedVisibleTools).toEqual([
      { tool: "unused/tool", discoveryCount: 2, callCount: 0 },
    ]);
    expect(insights.discoveryExecution).toEqual({
      discoveries: 2,
      toolsVisible: 5,
      discoveringSessions: 2,
      executingSessions: 2,
      conversionRate: 1,
    });
    expect(insights.approvals).toEqual({
      required: 2,
      decided: 1,
      approved: 1,
      denied: 0,
      pending: 1,
      latencyP50Ms: 240_000,
      latencyP95Ms: 240_000,
    });
  });

  it("tracks reused approval IDs as ordered cycles without counting decisions as rule hits", () => {
    const source = [
      event({
        id: "usage_required_1",
        eventType: "approval_required",
        approvalId: "approval_reused",
        decisionEffect: "require-approval",
        matchedRuleIds: ["rule_approval"],
        status: "pending",
        latencyTotalMs: undefined,
        latencyUpstreamMs: undefined,
        ts: "2026-07-21T00:01:00.000Z",
      }),
      event({
        id: "usage_decided_1",
        eventType: "approval_decided",
        approvalId: "approval_reused",
        approvalLatencyMs: 60_000,
        decisionEffect: "require-approval",
        matchedRuleIds: ["rule_approval"],
        status: "succeeded",
        latencyTotalMs: undefined,
        latencyUpstreamMs: undefined,
        ts: "2026-07-21T00:02:00.000Z",
      }),
      event({
        id: "usage_required_2",
        eventType: "approval_required",
        approvalId: "approval_reused",
        decisionEffect: "require-approval",
        matchedRuleIds: ["rule_approval"],
        status: "pending",
        latencyTotalMs: undefined,
        latencyUpstreamMs: undefined,
        ts: "2026-07-21T00:03:00.000Z",
      }),
    ];

    expect(aggregateSummary(source, range).pendingApprovals).toBe(1);
    expect(aggregatePolicyInsights(source, range)).toMatchObject({
      ruleHits: [{ ruleId: "rule_approval", events: 2, denials: 0 }],
      approvals: {
        required: 2,
        decided: 1,
        approved: 1,
        denied: 0,
        pending: 1,
        latencyP50Ms: 60_000,
        latencyP95Ms: 60_000,
      },
    });
  });

  it("treats denied and failed tool attempts as calls in governance funnels", () => {
    const source = [
      event({
        id: "usage_discover_denied",
        sessionId: "session_denied",
        eventType: "discover",
        tool: undefined,
        matchedRuleIds: ["rule_discover"],
        toolsVisible: 1,
        toolsHidden: 0,
        visibleTools: ["crm/denied"],
        visibilityTruncated: false,
        ts: "2026-07-21T00:01:00.000Z",
      }),
      event({
        id: "usage_denied_attempt",
        sessionId: "session_denied",
        eventType: "denied",
        tool: "crm/denied",
        status: "denied",
        decisionEffect: "deny",
        matchedRuleIds: ["rule_deny"],
        ts: "2026-07-21T00:02:00.000Z",
      }),
      event({
        id: "usage_discover_error",
        sessionId: "session_error",
        eventType: "discover",
        tool: undefined,
        matchedRuleIds: ["rule_discover"],
        toolsVisible: 1,
        toolsHidden: 0,
        visibleTools: ["crm/failing"],
        visibilityTruncated: false,
        ts: "2026-07-21T00:03:00.000Z",
      }),
      event({
        id: "usage_failed_attempt",
        sessionId: "session_error",
        eventType: "error",
        tool: "crm/failing",
        status: "failed",
        errorCode: "UPSTREAM_FAILURE",
        ts: "2026-07-21T00:04:00.000Z",
      }),
    ];

    const insights = aggregatePolicyInsights(source, range);
    expect(insights.discoveryExecution).toMatchObject({
      discoveringSessions: 2,
      executingSessions: 2,
      conversionRate: 1,
    });
    expect(insights.unusedVisibleTools).toEqual([]);
  });
});

describe("portable analytics store and recorder", () => {
  it("records clones and exposes every query through one interface", async () => {
    const store = new MemoryAnalyticsStore();
    const source = fixture().slice(0, 4);
    for (const item of source) await store.recordUsage(item);
    source[0]?.roles.push("mutated");
    expect(store.size).toBe(4);
    expect((await store.summary(range)).activeSessions).toBe(1);
    expect(
      (await store.timeseries({ ...range, metric: "calls", interval: "1h" })).points
    ).toHaveLength(1);
    expect(
      (await store.top({ ...range, dimension: "tool", metric: "calls" })).rows
    ).toHaveLength(2);
    expect((await store.recent({ ...range })).events[0]?.roles).not.toContain(
      "mutated"
    );
    expect(
      (await store.sessionTimeline({ ...range, sessionId: "session_1" })).items
    ).toHaveLength(4);
    expect((await store.flows({ ...range })).transitions).toHaveLength(0);
    expect((await store.policyInsights({ ...range })).ruleHits.length).toBeGreaterThan(
      0
    );
  });

  it("never lets validation, scheduling, diagnostics, or sink failures escape", async () => {
    const sink: AnalyticsSink = {
      recordUsage: vi.fn().mockRejectedValue(new Error("sink unavailable")),
    };
    const failures: string[] = [];
    const recorder = createFailOpenAnalyticsRecorder(sink, {
      defer: () => {
        throw new Error("runtime shutting down");
      },
      onError: (failure) => {
        failures.push(failure.phase);
        if (failure.phase === "validation") throw new Error("broken diagnostics");
      },
    });
    expect(() => recorder.recordUsage(firstFixtureEvent())).not.toThrow();
    expect(() =>
      recorder.recordUsage({
        ...firstFixtureEvent(),
        arguments: { secret: true },
      } as UsageEvent)
    ).not.toThrow();
    await expect(recorder.flush()).resolves.toBeUndefined();
    expect(failures).toEqual(["defer", "validation", "sink"]);
    expect(sink.recordUsage).toHaveBeenCalledTimes(1);
  });

  it("can disable analytics without touching the sink", async () => {
    const sink: AnalyticsSink = { recordUsage: vi.fn() };
    const recorder = createFailOpenAnalyticsRecorder(sink, { enabled: false });
    recorder.recordUsage(firstFixtureEvent());
    await recorder.flush();
    expect(sink.recordUsage).not.toHaveBeenCalled();
  });

  it("attempts every composite destination before reporting a failure", async () => {
    const first: AnalyticsSink = {
      recordUsage: vi.fn().mockRejectedValue(new Error("first failed")),
    };
    const second: AnalyticsSink = { recordUsage: vi.fn().mockResolvedValue(undefined) };
    const failures: string[] = [];
    const recorder = createFailOpenAnalyticsRecorder(
      new CompositeAnalyticsSink([first, second]),
      { onError: (failure) => failures.push(failure.phase) }
    );
    recorder.recordUsage(firstFixtureEvent());
    await expect(recorder.flush()).resolves.toBeUndefined();
    expect(first.recordUsage).toHaveBeenCalledTimes(1);
    expect(second.recordUsage).toHaveBeenCalledTimes(1);
    expect(failures).toEqual(["sink"]);
  });
});

describe("analytics export helpers", () => {
  it("writes deterministic, escaped, formula-safe CSV", () => {
    expect(
      analyticsRowsToCsv([{ label: '=HYPERLINK("bad")', count: 2 }], ["label", "count"])
    ).toBe('label,count\r\n"\'=HYPERLINK(""bad"")",2\r\n');
    expect(usageEventsToCsv([firstFixtureEvent()])).not.toContain("arguments");
  });

  it("writes stable pretty JSON with a trailing newline", () => {
    expect(analyticsResultToJson({ calls: 2 })).toBe('{\n  "calls": 2\n}\n');
  });
});
