#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const exactSha = (value, label) => {
  assert(
    typeof value === "string" && /^[0-9a-f]{40}$/.test(value),
    `${label} must be a lowercase full Git SHA.`
  );
  return value;
};

const digest = (value) => {
  assert(
    typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value),
    "Image digest must be an exact sha256 digest."
  );
  return value;
};

const positiveInteger = (value, label) => {
  const parsed = Number(value);
  assert(
    Number.isSafeInteger(parsed) && parsed > 0,
    `${label} must be a positive integer.`
  );
  return parsed;
};

const component = (value) => {
  assert(["server", "web"].includes(value), "Unsupported image component.");
  return value;
};

const repository = (value) => {
  assert(
    typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value),
    "Repository must be an owner/name pair."
  );
  return value;
};

const exactKeys = (value, expected) => {
  const actual = Object.keys(value).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `Image evidence keys differ: ${actual.join(", ")}`
  );
};

export const validateImageEvidence = (value, expected = {}) => {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    "Image evidence is missing."
  );
  exactKeys(value, [
    "version",
    "repository",
    "candidate_sha",
    "ci_run_id",
    "ci_run_attempt",
    "component",
    "digest",
  ]);
  assert(value.version === 1, "Unsupported image evidence version.");
  const validated = {
    version: 1,
    repository: repository(value.repository),
    candidate_sha: exactSha(value.candidate_sha, "Candidate SHA"),
    ci_run_id: positiveInteger(value.ci_run_id, "CI run ID"),
    ci_run_attempt: positiveInteger(value.ci_run_attempt, "CI run attempt"),
    component: component(value.component),
    digest: digest(value.digest),
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue === undefined) continue;
    const normalizedExpected =
      key === "ci_run_id" || key === "ci_run_attempt"
        ? positiveInteger(expectedValue, key)
        : String(expectedValue);
    assert(
      validated[key] === normalizedExpected,
      `Image evidence ${key} does not match the expected value.`
    );
  }
  return validated;
};

const writeEvidence = (path, args) => {
  const [repo, candidateSha, runId, runAttempt, imageComponent, imageDigest] = args;
  const evidence = validateImageEvidence({
    version: 1,
    repository: repo,
    candidate_sha: candidateSha,
    ci_run_id: Number(runId),
    ci_run_attempt: Number(runAttempt),
    component: imageComponent,
    digest: imageDigest,
  });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
};

const verifyEvidence = (path, args) => {
  const [repo, candidateSha, runId, runAttempt, imageComponent] = args;
  const evidence = validateImageEvidence(JSON.parse(readFileSync(path, "utf8")), {
    repository: repo,
    candidate_sha: candidateSha,
    ci_run_id: runId,
    ci_run_attempt: runAttempt,
    component: imageComponent,
  });
  process.stdout.write(`${evidence.digest}\n`);
};

const selfTest = () => {
  const directory = mkdtempSync(join(tmpdir(), "litemcp-image-evidence-"));
  const path = join(directory, "evidence.json");
  try {
    const sha = "a".repeat(40);
    const imageDigest = `sha256:${"b".repeat(64)}`;
    writeEvidence(path, ["reachjalil/liteMCP", sha, "101", "2", "server", imageDigest]);
    const value = JSON.parse(readFileSync(path, "utf8"));
    validateImageEvidence(value, {
      repository: "reachjalil/liteMCP",
      candidate_sha: sha,
      ci_run_id: 101,
      ci_run_attempt: 2,
      component: "server",
    });

    for (const mutation of [
      { digest: "sha256:short" },
      { component: "database" },
      { candidate_sha: "b".repeat(40) },
      { extra: true },
    ]) {
      let rejected = false;
      try {
        validateImageEvidence(
          { ...value, ...mutation },
          {
            repository: "reachjalil/liteMCP",
            candidate_sha: sha,
            ci_run_id: 101,
            ci_run_attempt: 2,
            component: "server",
          }
        );
      } catch {
        rejected = true;
      }
      assert(rejected, `Self-test accepted mutation ${JSON.stringify(mutation)}.`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  process.stdout.write("PASS  image evidence validation self-test\n");
};

const [mode, path, ...args] = process.argv.slice(2);
if (mode === "--self-test") {
  selfTest();
} else if (mode === "write" && path && args.length === 6) {
  writeEvidence(path, args);
} else if (mode === "verify" && path && args.length === 5) {
  verifyEvidence(path, args);
} else {
  process.stderr.write(
    "Usage: verify-image-evidence.mjs --self-test | write PATH REPOSITORY SHA RUN_ID RUN_ATTEMPT COMPONENT DIGEST | verify PATH REPOSITORY SHA RUN_ID RUN_ATTEMPT COMPONENT\n"
  );
  process.exitCode = 2;
}
