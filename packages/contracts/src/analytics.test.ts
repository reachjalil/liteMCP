import { describe, expect, it } from "vitest";

import {
  analyticsSummaryResultSchema,
  analyticsTimeRangeSchema,
  sessionClientInfoSchema,
  usageEventSchema,
  usageStandingSchema,
} from "./index.js";

const validEvent = {
  id: "usage_001",
  tenantId: "tenant_a",
  sessionId: "session_a",
  subjectId: "user_a",
  subjectType: "user" as const,
  roles: ["employee"],
  clientName: "Cursor",
  clientVersion: "1.2.3",
  userAgentClass: "cursor" as const,
  sdk: false,
  eventType: "call" as const,
  compositionId: "composition_a",
  environmentId: "environment_a",
  namespace: "github",
  serverId: "server_a",
  tool: "github/search",
  aliasUsed: false,
  risk: "read" as const,
  decisionEffect: "allow" as const,
  matchedRuleIds: ["rule_a"],
  policyId: "policy_a",
  policyVersion: "1",
  latencyTotalMs: 120,
  latencyUpstreamMs: 80,
  status: "succeeded" as const,
  requestBytes: 40,
  responseBytes: 200,
  auditId: "audit_001",
  auditSequence: 4,
  auditHash: "a".repeat(64),
  requestId: "request_001",
  ts: "2026-07-21T10:00:00.000Z",
  protocolVersion: "2025-11-25",
};

describe("usage-event contracts", () => {
  it("accepts bounded dimensions and a complete audit receipt", () => {
    expect(usageEventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it("rejects payload material and partial audit receipts", () => {
    expect(
      usageEventSchema.safeParse({ ...validEvent, arguments: { query: "secret" } })
        .success
    ).toBe(false);
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        auditSequence: undefined,
        auditHash: undefined,
      }).success
    ).toBe(false);
  });

  it("rejects duplicate/capped dimensions and impossible latency", () => {
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        matchedRuleIds: ["rule_a", "rule_a"],
      }).success
    ).toBe(false);
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        latencyTotalMs: 50,
        latencyUpstreamMs: 51,
      }).success
    ).toBe(false);
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        roles: Array.from({ length: 9 }, (_, index) => `role-${index}`),
      }).success
    ).toBe(false);
  });

  it("requires discovery detail on one event and forbids it elsewhere", () => {
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        eventType: "discover",
        tool: undefined,
        toolsVisible: 2,
        toolsHidden: 1,
        visibleTools: ["github/search", "github/read"],
        visibilityTruncated: false,
      }).success
    ).toBe(true);
    expect(usageEventSchema.safeParse({ ...validEvent, toolsVisible: 2 }).success).toBe(
      false
    );
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        eventType: "discover",
        toolsVisible: 1,
        toolsHidden: 0,
        visibleTools: ["one", "two"],
        visibilityTruncated: false,
      }).success
    ).toBe(false);
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        eventType: "discover",
        tool: undefined,
        toolsVisible: 2,
        toolsHidden: 0,
        visibleTools: ["github/search"],
        visibilityTruncated: false,
      }).success
    ).toBe(false);
    expect(
      usageEventSchema.safeParse({
        ...validEvent,
        eventType: "discover",
        tool: undefined,
        toolsVisible: 1,
        toolsHidden: 0,
        visibleTools: ["github/search"],
        visibilityTruncated: true,
      }).success
    ).toBe(false);
  });
});

describe("analytics query and result contracts", () => {
  it("uses ordered time ranges", () => {
    expect(
      analyticsTimeRangeSchema.safeParse({
        tenantId: "tenant_a",
        from: "2026-07-21T10:00:00.000Z",
        to: "2026-07-21T09:00:00.000Z",
      }).success
    ).toBe(false);
  });

  it("keeps results and session attribution strict", () => {
    expect(
      sessionClientInfoSchema.safeParse({
        name: "Cursor",
        version: "1.0",
        protocolVersion: "2025-11-25",
        initializedAt: "2026-07-21T10:00:00.000Z",
        userAgentClass: "cursor",
        sdk: false,
        email: "should-not-be-here@example.com",
      }).success
    ).toBe(false);
    expect(
      analyticsSummaryResultSchema.safeParse({
        from: "2026-07-21T10:00:00.000Z",
        to: "2026-07-21T11:00:00.000Z",
        calls: 0,
        activeIdentities: 0,
        activeSessions: 0,
        denials: 0,
        denyRate: 0,
        errors: 0,
        errorRate: 0,
        latencyP50Ms: null,
        latencyP95Ms: null,
        pendingApprovals: 0,
        extra: true,
      }).success
    ).toBe(false);
  });

  it("models exact usage standing separately from sampled analytics", () => {
    expect(
      usageStandingSchema.parse({
        generatedAt: "2026-07-21T10:00:00.000Z",
        analyticsEnabled: true,
        servers: { limit: 5, used: 2, remaining: 3 },
        compositions: { limit: 3, used: 1, remaining: 2 },
        activeSessions: { limit: 20, used: 4, remaining: 16 },
        toolCallsToday: {
          limit: 1_000,
          used: 25,
          remaining: 975,
          resetsAt: "2026-07-22T00:00:00.000Z",
        },
      }).toolCallsToday.remaining
    ).toBe(975);
  });
});
