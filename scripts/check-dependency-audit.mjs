#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["audit", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: process.env,
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  process.stderr.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  throw new Error(`pnpm audit did not return JSON: ${error.message}`);
}
if (report.error || (!report.advisories && !report.metadata)) {
  throw new Error(`pnpm audit failed: ${JSON.stringify(report.error ?? report)}`);
}

const allowlist = JSON.parse(
  readFileSync(
    resolve(process.cwd(), ".github/dependency-audit-allowlist.json"),
    "utf8"
  )
);
const exceptions = allowlist.exceptions ?? [];
if (!Array.isArray(exceptions)) {
  throw new Error("Dependency audit allowlist exceptions must be an array.");
}
const activeAdvisories = Object.values(report.advisories ?? {}).filter((advisory) =>
  ["high", "critical"].includes(advisory.severity)
);
const today = new Date().toISOString().slice(0, 10);
const used = new Set();
const errors = [];
const exceptionKeys = new Set();

for (const [index, exception] of exceptions.entries()) {
  const label = `exception ${index + 1}`;
  const expectedKeys = [
    "advisory",
    "package",
    "versions",
    "paths",
    "expires",
    "rationale",
  ].sort();
  const actualKeys = Object.keys(exception).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    errors.push(`${label} has unexpected or missing keys: ${actualKeys.join(", ")}.`);
  }
  if (!/^GHSA-[a-z0-9-]+$/.test(exception.advisory ?? "")) {
    errors.push(`${label} has an invalid GitHub advisory ID.`);
  }
  if (typeof exception.package !== "string" || !exception.package.trim()) {
    errors.push(`${label} has no package name.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.expires ?? "")) {
    errors.push(`${label} expiry must use YYYY-MM-DD.`);
  } else {
    const parsedExpiry = new Date(`${exception.expires}T00:00:00.000Z`);
    if (
      !Number.isFinite(parsedExpiry.valueOf()) ||
      parsedExpiry.toISOString().slice(0, 10) !== exception.expires
    ) {
      errors.push(`${label} has an invalid calendar expiry date.`);
    }
  }
  if (
    typeof exception.rationale !== "string" ||
    exception.rationale.trim().length < 40
  ) {
    errors.push(`${label} requires a substantive rationale.`);
  }
  for (const field of ["versions", "paths"]) {
    const values = exception[field];
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((value) => typeof value !== "string" || !value.trim())
    ) {
      errors.push(`${label} ${field} must be a nonempty string array.`);
    } else if (new Set(values).size !== values.length) {
      errors.push(`${label} ${field} contains duplicates.`);
    }
  }
  const key = `${exception.advisory}\u0000${exception.package}`;
  if (exceptionKeys.has(key)) errors.push(`${label} duplicates ${exception.advisory}.`);
  exceptionKeys.add(key);
}

for (const advisory of activeAdvisories) {
  const exception = exceptions.find(
    (candidate) =>
      candidate.advisory === advisory.github_advisory_id &&
      candidate.package === advisory.module_name
  );
  if (!exception) {
    errors.push(
      `${advisory.github_advisory_id} (${advisory.module_name}) has no reviewed exception.`
    );
    continue;
  }
  used.add(exception);
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(exception.expires ?? "") &&
    exception.expires < today
  ) {
    errors.push(`${exception.advisory} exception expired on ${exception.expires}.`);
  }
  if (!Array.isArray(advisory.findings) || advisory.findings.length === 0) {
    errors.push(`${exception.advisory} has no auditable finding paths.`);
    continue;
  }
  for (const finding of advisory.findings) {
    if (
      !Array.isArray(exception.versions) ||
      !exception.versions.includes(finding.version)
    ) {
      errors.push(
        `${exception.advisory} found unreviewed ${advisory.module_name}@${finding.version}.`
      );
    }
    if (!Array.isArray(finding.paths) || finding.paths.length === 0) {
      errors.push(
        `${exception.advisory} finding ${finding.version ?? "unknown"} has no dependency path.`
      );
      continue;
    }
    for (const path of finding.paths) {
      if (!Array.isArray(exception.paths) || !exception.paths.includes(path)) {
        errors.push(`${exception.advisory} found on unreviewed path ${path}.`);
      }
    }
  }
}

for (const exception of exceptions) {
  if (!used.has(exception)) {
    errors.push(`${exception.advisory} exception is stale and must be removed.`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  for (const exception of exceptions) {
    process.stdout.write(
      `ALLOW ${exception.advisory} only on ${exception.paths.join(", ")} through ${exception.expires}\n`
    );
  }
  process.stdout.write(
    `PASS  full dependency audit policy (${activeAdvisories.length} reviewed high/critical advisory)\n`
  );
}
