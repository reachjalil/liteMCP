import assert from "node:assert/strict";

import { type IssuedSession, LiteMcpClient, McpSessionClient } from "@litemcp/sdk";

const baseUrl = process.env.LITEMCP_API_URL ?? "http://127.0.0.1:8787";
const tenantId = "org_demo";

const fetchWithRequestId =
  (requestId: string): typeof fetch =>
  async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("x-request-id", requestId);
    return fetch(input, { ...init, headers });
  };

const sessionClient = (issued: IssuedSession, requestId: string) =>
  new McpSessionClient(issued.endpoint, issued.token, fetchWithRequestId(requestId));

const admin = new LiteMcpClient({
  baseUrl,
  tenantId,
  demoRole: "finance-admin",
});

const firstToolCalls = async () =>
  (await admin.activationEvents()).filter((event) => event.name === "first_tool_call");

const employeeSession = await admin.createSession({
  compositionId: "composition_company",
  environmentId: "env_production",
  subject: {
    type: "user",
    id: "proof_employee",
    roles: ["employee"],
    groups: ["employees"],
    claims: { example: "local-composition-proof" },
  },
  approvedClients: ["@litemcp/example-local-composition"],
  expiresInSeconds: 600,
});

assert.equal((await firstToolCalls()).length, 0);

const initialized = await sessionClient(
  employeeSession,
  "proof_employee_initialize"
).initialize();
assert.equal(initialized.protocolVersion, "2025-11-25");
assert.equal(initialized.serverInfo.name, "LiteMCP Composer");

const employeeDiscovery = await sessionClient(
  employeeSession,
  "proof_employee_discovery"
).listTools();
const employeeToolNames = employeeDiscovery.tools.map((tool) => String(tool.name));
assert.deepEqual(employeeToolNames.sort(), [
  "finance.list_invoices",
  "math.add",
  "sum",
]);
assert.ok(!employeeToolNames.includes("finance.issue_refund"));

const sum = await sessionClient(employeeSession, "proof_builtin_allowed").callTool(
  "sum",
  { a: 20, b: 22 }
);
assert.equal(sum.isError, undefined);
assert.deepEqual(sum.structuredContent, { a: 20, b: 22, sum: 42 });

const activationAfterFirstSuccess = await firstToolCalls();
assert.deepEqual(
  activationAfterFirstSuccess.map((event) => ({
    actorId: event.actorId,
    name: event.name,
    metadata: event.metadata,
  })),
  [
    {
      actorId: "proof_employee",
      name: "first_tool_call",
      metadata: { toolName: "math.add" },
    },
  ]
);

const privateAccountId = "acct_proof_private";
const invoices = await sessionClient(employeeSession, "proof_remote_allowed").callTool(
  "finance.list_invoices",
  { accountId: privateAccountId }
);
assert.equal(invoices.isError, undefined);
const invoiceRows = invoices.structuredContent?.invoices;
assert.ok(Array.isArray(invoiceRows));
assert.deepEqual(invoiceRows[0], {
  id: "invoice_100",
  accountId: privateAccountId,
  currency: "EUR",
  amount: 42,
  status: "open",
});
assert.equal((await firstToolCalls()).length, 1);

await assert.rejects(
  () =>
    sessionClient(employeeSession, "proof_hidden_denied").callTool(
      "finance.issue_refund",
      { invoiceId: "invoice_100", reason: "must-not-reach-upstream" }
    ),
  /denied by policy/i
);

const financeSession = await admin.createSession({
  compositionId: "composition_company",
  environmentId: "env_production",
  subject: {
    type: "user",
    id: "proof_finance_requester",
    roles: ["finance-admin"],
    groups: ["finance"],
    claims: { example: "local-composition-proof" },
  },
  approvedClients: ["@litemcp/example-local-composition"],
  expiresInSeconds: 600,
});

await sessionClient(financeSession, "proof_finance_initialize").initialize();
const financeDiscovery = await sessionClient(
  financeSession,
  "proof_finance_discovery"
).listTools();
assert.ok(financeDiscovery.tools.some((tool) => tool.name === "finance.issue_refund"));

const refundArguments = {
  invoiceId: "invoice_100",
  reason: "proof-private-reason",
};
const approvalPause = await sessionClient(
  financeSession,
  "proof_approval_requested"
).callTool("finance.issue_refund", refundArguments);
assert.equal(approvalPause.isError, true);
assert.equal(approvalPause.structuredContent?.status, "approval_required");
const approvalId = approvalPause.structuredContent?.approvalId;
assert.equal(typeof approvalId, "string");

const approval = (await admin.approvals()).find(
  (candidate) => candidate.id === approvalId
);
assert.ok(approval);
assert.equal(approval.status, "pending");
assert.equal(approval.requestedBy, "proof_finance_requester");
assert.equal(approval.toolName, "finance.issue_refund");

const decidingAdmin = new LiteMcpClient({
  baseUrl,
  tenantId,
  demoRole: "finance-admin",
  fetch: fetchWithRequestId("proof_approval_decided"),
});
const decided = await decidingAdmin.decideApproval(approval.id, {
  decision: "approved",
  reason: "Separate local-demo administrator reviewed the exact request.",
  generation: approval.generation,
  fingerprint: approval.fingerprint,
});
assert.equal(decided.status, "approved");
assert.notEqual(decided.decidedBy, decided.requestedBy);

const changedContext = await sessionClient(
  financeSession,
  "proof_approval_wrong_context"
).callTool("finance.issue_refund", {
  ...refundArguments,
  reason: "different-context-must-not-use-approval",
});
assert.equal(changedContext.isError, true);
assert.equal(changedContext.structuredContent?.status, "approval_required");
assert.notEqual(changedContext.structuredContent?.approvalId, approval.id);

const approvedRefund = await sessionClient(
  financeSession,
  "proof_approval_executed"
).callTool("finance.issue_refund", refundArguments);
assert.equal(approvedRefund.isError, false);
assert.deepEqual(approvedRefund.structuredContent?.refund, {
  id: "refund_invoice_100",
  invoiceId: "invoice_100",
  reason: refundArguments.reason,
  status: "succeeded",
  sandbox: true,
});

const consumed = (await admin.approvals()).find(
  (candidate) => candidate.id === approval.id
);
assert.ok(consumed);
assert.ok(consumed.consumedAt);

const replay = await sessionClient(
  financeSession,
  "proof_approval_replay_denied"
).callTool("finance.issue_refund", refundArguments);
assert.equal(replay.isError, true);
assert.equal(replay.structuredContent?.status, "approval_required");
assert.equal(replay.structuredContent?.approvalId, approval.id);
const replayedApproval = (await admin.approvals()).find(
  (candidate) => candidate.id === approval.id
);
assert.ok(replayedApproval);
assert.ok(replayedApproval.generation > consumed.generation);
assert.equal(replayedApproval.status, "pending");

await admin.revokeSession(employeeSession.session.id);
await assert.rejects(() =>
  sessionClient(employeeSession, "proof_revoked_session").listTools()
);

const audit = await admin.audit(500);
const hasAudit = (
  requestId: string,
  type: string,
  outcome: "allowed" | "denied" | "pending" | "succeeded" | "failed"
) =>
  audit.some(
    (event) =>
      event.requestId === requestId && event.type === type && event.outcome === outcome
  );

assert.ok(hasAudit("proof_builtin_allowed", "execution.completed", "succeeded"));
assert.ok(hasAudit("proof_remote_allowed", "execution.completed", "succeeded"));
assert.ok(hasAudit("proof_hidden_denied", "policy.execution-decision", "denied"));
assert.ok(hasAudit("proof_approval_requested", "approval.requested", "pending"));
assert.ok(hasAudit("proof_approval_decided", "approval.approved", "succeeded"));
assert.ok(hasAudit("proof_approval_executed", "approval.consumed", "succeeded"));
assert.ok(hasAudit("proof_approval_executed", "execution.completed", "succeeded"));
assert.ok(hasAudit("proof_approval_wrong_context", "approval.requested", "pending"));
assert.ok(hasAudit("proof_approval_replay_denied", "approval.requested", "pending"));

const serializedAudit = JSON.stringify(audit);
for (const privateValue of [
  employeeSession.token,
  financeSession.token,
  privateAccountId,
  refundArguments.reason,
]) {
  assert.ok(!serializedAudit.includes(privateValue));
}

console.log("PASS real loopback MCP initialize and filtered discovery");
console.log("PASS builtin and remote governed tool execution");
console.log("PASS hidden denial, exact-context approval, and replay pause");
console.log("PASS payload-free activation and redacted audit evidence");
console.log("PASS revoked session denied at the gateway boundary");
