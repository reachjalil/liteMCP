import { describe, expect, it } from "vitest";

import type { Policy, Subject } from "@litemcp/contracts";

import { evaluatePolicy } from "./policy-engine.js";

const policy: Policy = {
  id: "policy_test",
  tenantId: "org_test",
  name: "Test",
  description: "Test policy",
  version: "1.0.0",
  status: "active",
  defaultEffect: "allow",
  rules: [
    {
      id: "rule_employee_deny",
      description: "Employees cannot refund",
      priority: 100,
      effect: "deny",
      roles: ["employee"],
      tools: ["finance.issue_refund"],
    },
    {
      id: "rule_admin_approval",
      description: "Admins require approval",
      priority: 90,
      effect: "require-approval",
      roles: ["finance-admin"],
      tools: ["finance.*"],
      actions: ["execute"],
    },
  ],
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
  revision: 1,
};

const subject = (role: string): Subject => ({
  type: "user",
  id: "user_test",
  roles: [role],
  groups: [],
  claims: {},
});

describe("evaluatePolicy", () => {
  it("uses the same explicit deny for discovery and execution", () => {
    for (const action of ["discover", "execute"] as const) {
      const decision = evaluatePolicy(policy, {
        subject: subject("employee"),
        action,
        toolName: "finance.issue_refund",
        risk: "financial",
      });
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRuleIds).toContain("rule_employee_deny");
    }
  });

  it("requires approval for matching finance administrators", () => {
    const decision = evaluatePolicy(policy, {
      subject: subject("finance-admin"),
      action: "execute",
      toolName: "finance.issue_refund",
      risk: "financial",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it("never lets a higher-priority allow override an explicit deny", () => {
    const decision = evaluatePolicy(
      {
        ...policy,
        rules: [
          {
            id: "rule_lower_priority_deny",
            description: "Safety deny",
            priority: 10,
            effect: "deny",
            roles: ["employee"],
            tools: ["finance.issue_refund"],
          },
          {
            id: "rule_higher_priority_allow",
            description: "Broad allow",
            priority: 11,
            effect: "allow",
            roles: ["employee"],
            tools: ["finance.*"],
          },
        ],
      },
      {
        subject: subject("employee"),
        action: "execute",
        toolName: "finance.issue_refund",
        risk: "financial",
      }
    );

    expect(decision.effect).toBe("deny");
    expect(decision.matchedRuleIds).toEqual(["rule_lower_priority_deny"]);
  });
});
