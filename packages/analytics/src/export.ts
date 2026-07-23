import type { UsageEvent } from "@litemcp/contracts";

export type AnalyticsCsvValue = string | number | boolean | null | undefined;
export type AnalyticsCsvRow = Readonly<Record<string, AnalyticsCsvValue>>;

const protectSpreadsheetFormula = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const escapeCsvCell = (value: AnalyticsCsvValue) => {
  const serialized = value == null ? "" : protectSpreadsheetFormula(String(value));
  return /[",\r\n]/.test(serialized)
    ? `"${serialized.replaceAll('"', '""')}"`
    : serialized;
};

/** Deterministic RFC 4180-compatible export with spreadsheet-formula hardening. */
export const analyticsRowsToCsv = (
  rows: readonly AnalyticsCsvRow[],
  columns?: readonly string[]
) => {
  const selectedColumns =
    columns ?? [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const lines = [selectedColumns.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(selectedColumns.map((column) => escapeCsvCell(row[column])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
};

export const analyticsResultToJson = (value: unknown) =>
  `${JSON.stringify(value, null, 2)}\n`;

const usageEventColumns = [
  "id",
  "tenantId",
  "sessionId",
  "subjectId",
  "subjectType",
  "roles",
  "clientName",
  "clientVersion",
  "userAgentClass",
  "sdk",
  "eventType",
  "compositionId",
  "environmentId",
  "namespace",
  "serverId",
  "tool",
  "aliasUsed",
  "risk",
  "decisionEffect",
  "matchedRuleIds",
  "policyId",
  "policyVersion",
  "approvalId",
  "approvalLatencyMs",
  "latencyTotalMs",
  "latencyUpstreamMs",
  "status",
  "errorCode",
  "requestBytes",
  "responseBytes",
  "toolsVisible",
  "toolsHidden",
  "visibleTools",
  "visibilityTruncated",
  "auditId",
  "auditSequence",
  "auditHash",
  "requestId",
  "ts",
  "protocolVersion",
] as const;

/** Exports the complete, payload-free UsageEvent contract in a stable column order. */
export const usageEventsToCsv = (events: readonly UsageEvent[]) =>
  analyticsRowsToCsv(
    events.map((event) => ({
      ...event,
      roles: event.roles.join("|"),
      matchedRuleIds: event.matchedRuleIds.join("|"),
      visibleTools: event.visibleTools?.join("|"),
    })),
    usageEventColumns
  );
