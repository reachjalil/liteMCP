#!/usr/bin/env node

import strictAssert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const exactSha = (value, label = "Candidate SHA") => {
  assert(
    typeof value === "string" && /^[0-9a-f]{40}$/.test(value),
    `${label} must be a lowercase full Git SHA.`
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

const target = (value) => {
  assert(
    value === "production" || value === "staging",
    "Managed-cloud target must be production or staging."
  );
  return value;
};

const repository = (value) => {
  assert(
    typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value),
    "Repository must be an owner/name pair."
  );
  return value;
};

const digest = (value, label = "Archive digest") => {
  assert(
    typeof value === "string" && /^[0-9a-f]{64}$/.test(value),
    `${label} must be a lowercase SHA-256 digest.`
  );
  return value;
};

const versionId = (value) => {
  assert(
    typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      ),
    "Worker Version ID must be a UUID."
  );
  return value.toLowerCase();
};

const versionTag = (value) => {
  assert(
    typeof value === "string" &&
      /^lmc-(stg|prod)-[0-9a-f]{40}-[1-9][0-9]*-[1-9][0-9]*-[1-9][0-9]*-[1-9][0-9]*$/.test(
        value
      ),
    "Worker version tag is not bound to an exact candidate and run attempts."
  );
  return value;
};

const lifecycleVersionTag = (value) => {
  assert(
    typeof value === "string" &&
      /^lmc-lifecycle-(stg|prod)-[0-9a-f]{40}-[1-9][0-9]*-[1-9][0-9]*$/.test(value),
    "Worker lifecycle version tag is not bound to an exact candidate and CI run attempt."
  );
  return value;
};

const exactKeys = (value, expected, label) => {
  const actual = Object.keys(value).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `${label} keys differ: ${actual.join(", ")}`
  );
};

const archiveName = (deploymentTarget) =>
  `managed-cloud-${target(deploymentTarget)}.tar.gz`;

const sha256File = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

export const validateArtifactEvidence = (value, expected = {}) => {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    "Managed-cloud artifact evidence is missing."
  );
  exactKeys(
    value,
    [
      "version",
      "repository",
      "candidate_sha",
      "ci_run_id",
      "ci_run_attempt",
      "target",
      "archive_name",
      "archive_sha256",
    ],
    "Managed-cloud artifact evidence"
  );
  assert(value.version === 1, "Unsupported managed-cloud artifact evidence version.");
  const validated = {
    version: 1,
    repository: repository(value.repository),
    candidate_sha: exactSha(value.candidate_sha),
    ci_run_id: positiveInteger(value.ci_run_id, "CI run ID"),
    ci_run_attempt: positiveInteger(value.ci_run_attempt, "CI run attempt"),
    target: target(value.target),
    archive_name: String(value.archive_name),
    archive_sha256: digest(value.archive_sha256),
  };
  assert(
    validated.archive_name === archiveName(validated.target),
    "Managed-cloud archive name does not match its target."
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue === undefined) continue;
    const normalizedExpected =
      key === "ci_run_id" || key === "ci_run_attempt"
        ? positiveInteger(expectedValue, key)
        : String(expectedValue);
    assert(
      validated[key] === normalizedExpected,
      `Managed-cloud artifact ${key} does not match the expected value.`
    );
  }
  return validated;
};

export const parseUploadedVersionId = (output) => {
  const matches = [
    ...String(output).matchAll(
      /(?:Worker|Current) Version ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/gi
    ),
  ].map((match) => versionId(match[1]));
  assert(
    matches.length === 1,
    "Wrangler output must contain exactly one Worker or Current Version ID."
  );
  return matches[0];
};

export const validateDeployment = (payload, expectedVersionId) => {
  assert(
    Array.isArray(payload) && payload.length > 0,
    "Wrangler returned no deployment records."
  );
  const expected = versionId(expectedVersionId);
  const latest = payload.at(-1);
  assert(
    latest && Array.isArray(latest.versions) && latest.versions.length === 1,
    "Latest deployment must route to exactly one Worker version."
  );
  const deployed = latest.versions[0];
  assert(
    versionId(deployed.version_id) === expected && Number(deployed.percentage) === 100,
    "Latest deployment does not route 100% of traffic to the uploaded Worker version."
  );
  return expected;
};

const writeArtifactEvidence = (metadataPath, archivePath, args) => {
  const [repo, candidateSha, runId, runAttempt, deploymentTarget] = args;
  const evidence = validateArtifactEvidence({
    version: 1,
    repository: repo,
    candidate_sha: candidateSha,
    ci_run_id: Number(runId),
    ci_run_attempt: Number(runAttempt),
    target: deploymentTarget,
    archive_name: archiveName(deploymentTarget),
    archive_sha256: sha256File(archivePath),
  });
  writeFileSync(metadataPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
};

const verifyArtifactEvidence = (metadataPath, archivePath, args) => {
  const [repo, candidateSha, runId, runAttempt, deploymentTarget] = args;
  const evidence = validateArtifactEvidence(
    JSON.parse(readFileSync(metadataPath, "utf8")),
    {
      repository: repo,
      candidate_sha: candidateSha,
      ci_run_id: runId,
      ci_run_attempt: runAttempt,
      target: deploymentTarget,
    }
  );
  assert(
    sha256File(archivePath) === evidence.archive_sha256,
    "Managed-cloud archive bytes do not match their CI evidence."
  );
  return evidence.archive_sha256;
};

const selfTest = () => {
  const directory = mkdtempSync(join(tmpdir(), "litemcp-managed-artifact-"));
  try {
    const sha = "a".repeat(40);
    const archivePath = join(directory, "managed-cloud-staging.tar.gz");
    const metadataPath = join(directory, "metadata.json");
    writeFileSync(archivePath, "stable archive bytes\n");
    writeArtifactEvidence(metadataPath, archivePath, [
      "reachjalil/liteMCP",
      sha,
      "101",
      "2",
      "staging",
    ]);
    verifyArtifactEvidence(metadataPath, archivePath, [
      "reachjalil/liteMCP",
      sha,
      "101",
      "2",
      "staging",
    ]);

    const uploaded = parseUploadedVersionId(
      "Uploaded litemcp-managed-staging (1 sec)\nWorker Version ID: 123e4567-e89b-42d3-a456-426614174000\n"
    );
    strictAssert.equal(uploaded, "123e4567-e89b-42d3-a456-426614174000");
    strictAssert.equal(
      parseUploadedVersionId(
        "Deployed litemcp-managed-staging (1 sec)\nCurrent Version ID: 123e4567-e89b-42d3-a456-426614174001\n"
      ),
      "123e4567-e89b-42d3-a456-426614174001"
    );
    strictAssert.throws(
      () =>
        parseUploadedVersionId(
          `Worker Version ID: ${uploaded}\nCurrent Version ID: 123e4567-e89b-42d3-a456-426614174001\n`
        ),
      /exactly one/
    );
    strictAssert.equal(
      validateDeployment(
        [
          {
            created_on: "2026-07-22T00:00:00.000Z",
            versions: [{ version_id: uploaded, percentage: 100 }],
          },
        ],
        uploaded
      ),
      uploaded
    );
    strictAssert.equal(
      versionTag(`lmc-stg-${sha}-101-2-202-3`),
      `lmc-stg-${sha}-101-2-202-3`
    );
    strictAssert.equal(
      lifecycleVersionTag(`lmc-lifecycle-stg-${sha}-101-2`),
      `lmc-lifecycle-stg-${sha}-101-2`
    );
    strictAssert.throws(
      () => lifecycleVersionTag(`lmc-lifecycle-prod-${sha}-101-0`),
      /lifecycle version tag/
    );

    writeFileSync(archivePath, "tampered archive bytes\n");
    strictAssert.throws(
      () =>
        verifyArtifactEvidence(metadataPath, archivePath, [
          "reachjalil/liteMCP",
          sha,
          "101",
          "2",
          "staging",
        ]),
      /archive bytes/
    );
    strictAssert.throws(
      () =>
        validateDeployment(
          [
            {
              versions: [{ version_id: uploaded, percentage: 50 }],
            },
          ],
          uploaded
        ),
      /100%/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  process.stdout.write("PASS  managed-cloud artifact and Worker version self-test\n");
};

const [mode, ...args] = process.argv.slice(2);
if (mode === "--self-test") {
  selfTest();
} else if (mode === "write" && args.length === 7) {
  const [metadataPath, archivePath, ...evidenceArgs] = args;
  writeArtifactEvidence(metadataPath, archivePath, evidenceArgs);
} else if (mode === "verify" && args.length === 7) {
  const [metadataPath, archivePath, ...evidenceArgs] = args;
  process.stdout.write(
    `${verifyArtifactEvidence(metadataPath, archivePath, evidenceArgs)}\n`
  );
} else if (mode === "parse-version" && args.length === 1) {
  process.stdout.write(`${parseUploadedVersionId(readFileSync(args[0], "utf8"))}\n`);
} else if (mode === "verify-deployment" && args.length === 2) {
  process.stdout.write(
    `${validateDeployment(JSON.parse(readFileSync(args[0], "utf8")), args[1])}\n`
  );
} else if (mode === "verify-tag" && args.length === 1) {
  process.stdout.write(`${versionTag(args[0])}\n`);
} else if (mode === "verify-lifecycle-tag" && args.length === 1) {
  process.stdout.write(`${lifecycleVersionTag(args[0])}\n`);
} else {
  process.stderr.write(
    "Usage: verify-managed-cloud-artifact.mjs --self-test | write META ARCHIVE REPOSITORY SHA RUN_ID RUN_ATTEMPT TARGET | verify META ARCHIVE REPOSITORY SHA RUN_ID RUN_ATTEMPT TARGET | parse-version UPLOAD_LOG | verify-deployment DEPLOYMENTS_JSON VERSION_ID | verify-tag VERSION_TAG | verify-lifecycle-tag VERSION_TAG\n"
  );
  process.exitCode = 2;
}
