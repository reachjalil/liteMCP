import type {
  Policy,
  PolicyDecision,
  PolicyEffect,
  PolicyRule,
  RiskClass,
  Subject,
} from "@litemcp/contracts";

export type PolicyContext = {
  subject: Subject;
  action: "discover" | "execute";
  toolName: string;
  risk: RiskClass;
};

const globMatches = (pattern: string, value: string) => {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === value;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`).test(value);
};

const intersects = (left: string[], right: string[]) =>
  left.some((value) => right.includes(value));

const ruleMatches = (rule: PolicyRule, context: PolicyContext) => {
  if (rule.actions && !rule.actions.includes(context.action)) return false;
  if (rule.roles && !intersects(rule.roles, context.subject.roles)) return false;
  if (rule.groups && !intersects(rule.groups, context.subject.groups)) return false;
  if (rule.risks && !rule.risks.includes(context.risk)) return false;
  if (
    rule.tools &&
    !rule.tools.some((pattern) => globMatches(pattern, context.toolName))
  ) {
    return false;
  }
  return true;
};

const effectOrder: Record<PolicyEffect, number> = {
  deny: 0,
  "require-approval": 1,
  allow: 2,
};

export const evaluatePolicy = (
  policy: Policy | null,
  context: PolicyContext
): PolicyDecision => {
  if (!policy || policy.status !== "active") {
    return {
      effect: "deny",
      allowed: false,
      requiresApproval: false,
      matchedRuleIds: [],
      explanation: "No active policy is bound; secure default is deny.",
      policyId: policy?.id ?? null,
      policyVersion: policy?.version ?? null,
    };
  }

  const matched = policy.rules
    .filter((rule) => ruleMatches(rule, context))
    .sort((left, right) => {
      return (
        effectOrder[left.effect] - effectOrder[right.effect] ||
        right.priority - left.priority ||
        left.id.localeCompare(right.id)
      );
    });
  const winner = matched[0];
  const effect = winner?.effect ?? policy.defaultEffect;
  const matchedRuleIds = winner
    ? matched
        .filter(
          (rule) => rule.effect === winner.effect && rule.priority === winner.priority
        )
        .map((rule) => rule.id)
    : [];
  const explanation = winner
    ? `${winner.effect} by ${winner.id}: ${winner.description}`
    : `${policy.defaultEffect} by policy default because no rule matched.`;
  return {
    effect,
    allowed: effect === "allow" || effect === "require-approval",
    requiresApproval: effect === "require-approval",
    matchedRuleIds,
    explanation,
    policyId: policy.id,
    policyVersion: policy.version,
  };
};
