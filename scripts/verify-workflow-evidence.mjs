#!/usr/bin/env node

import { readFileSync } from "node:fs";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const exactKeys = (value, expected, label) => {
  const actual = Object.keys(value).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `${label} keys differ: ${actual.join(", ")}`
  );
};

const exactSha = (value, label) => {
  assert(
    typeof value === "string" && /^[0-9a-f]{40}$/i.test(value),
    `${label} must be a full Git SHA.`
  );
  return value.toLowerCase();
};

const positiveInteger = (value, label) => {
  const parsed = Number(value);
  assert(
    Number.isSafeInteger(parsed) && parsed > 0,
    `${label} must be a positive integer.`
  );
  return parsed;
};

const validateCommonRun = (run, expectedRunId, repository, workflowPath) => {
  assert(run && typeof run === "object", "Workflow run metadata is missing.");
  assert(run.id === expectedRunId, "Workflow run ID does not match the requested run.");
  assert(run.status === "completed", "Workflow run is not complete.");
  assert(run.conclusion === "success", "Workflow run did not conclude successfully.");
  assert(
    run.head_repository?.full_name === repository,
    "Workflow run did not originate from this repository."
  );
  assert(run.path === workflowPath, `Workflow run path must be ${workflowPath}.`);
};

export const validateCiRun = ({ run, candidateSha, runId, runAttempt, repository }) => {
  const candidate = exactSha(candidateSha, "Candidate SHA");
  const expectedRunId = positiveInteger(runId, "CI run ID");
  validateCommonRun(run, expectedRunId, repository, ".github/workflows/ci.yml");
  const actualRunAttempt = positiveInteger(run.run_attempt, "CI run attempt");
  if (runAttempt !== undefined && runAttempt !== "") {
    assert(
      actualRunAttempt === positiveInteger(runAttempt, "Expected CI run attempt"),
      "CI run attempt does not match the requested attempt."
    );
  }
  assert(run.name === "CI", "The supplied run is not the CI workflow.");
  assert(run.event === "push", "CI evidence must come from a push event.");
  assert(run.head_branch === "main", "CI evidence must come from main.");
  assert(
    exactSha(run.head_sha, "CI head SHA") === candidate,
    "CI validated a different SHA."
  );
  return { runAttempt: actualRunAttempt };
};

export const validateLatestCiRun = ({ payload, candidateSha, runId, runAttempt }) => {
  const latest = payload?.workflow_runs?.[0];
  assert(latest, "No successful main CI run was returned.");
  assert(
    latest.id === positiveInteger(runId, "CI run ID") &&
      latest.run_attempt === positiveInteger(runAttempt, "CI run attempt") &&
      exactSha(latest.head_sha, "Latest CI head SHA") ===
        exactSha(candidateSha, "Candidate SHA"),
    "A newer successful main CI run exists; refusing to promote an older candidate."
  );
};

export const validateStagingEvidence = ({
  evidence,
  candidateSha,
  runId,
  runAttempt,
  repository,
}) => {
  const candidate = exactSha(candidateSha, "Candidate SHA");
  const expectedRunId = positiveInteger(runId, "Staging run ID");
  const expectedRunAttempt = positiveInteger(runAttempt, "Staging run attempt");
  assert(evidence?.version === 3, "Unsupported staging evidence version.");
  exactKeys(
    evidence,
    [
      "version",
      "repository",
      "candidate_sha",
      "ci_run_id",
      "ci_run_attempt",
      "staging_run_id",
      "staging_run_attempt",
      "deployment_target",
      "deployment_url",
      "artifact_target",
      "artifact_sha256",
      "worker_version_id",
      "worker_version_tag",
      "migration_ids",
      "public_smoke",
      "authenticated_mcp_smoke",
      "accepted_at",
    ],
    "Staging evidence"
  );
  assert(
    evidence.repository === repository,
    "Staging evidence names another repository."
  );
  assert(
    positiveInteger(evidence.staging_run_id, "Evidence staging run ID") ===
      expectedRunId,
    "Staging evidence belongs to another run."
  );
  assert(
    positiveInteger(evidence.staging_run_attempt, "Evidence run attempt") ===
      expectedRunAttempt,
    "Staging evidence belongs to another run attempt."
  );
  assert(
    exactSha(evidence.candidate_sha, "Evidence candidate SHA") === candidate,
    "Staging accepted a different SHA."
  );
  positiveInteger(evidence.ci_run_id, "Evidence CI run ID");
  positiveInteger(evidence.ci_run_attempt, "Evidence CI run attempt");
  assert(
    evidence.deployment_target === "staging",
    "Staging evidence names another target."
  );
  assert(
    evidence.artifact_target === "staging",
    "Staging used another target's artifact."
  );
  assert(
    typeof evidence.artifact_sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(evidence.artifact_sha256),
    "Staging artifact digest is invalid."
  );
  assert(
    typeof evidence.worker_version_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        evidence.worker_version_id
      ),
    "Staging Worker version ID is invalid."
  );
  const expectedVersionTag = `lmc-stg-${candidate}-${evidence.ci_run_id}-${evidence.ci_run_attempt}-${expectedRunId}-${evidence.staging_run_attempt}`;
  assert(
    evidence.worker_version_tag === expectedVersionTag,
    "Staging Worker version tag is not bound to the exact CI and staging attempts."
  );
  let deploymentUrl;
  try {
    deploymentUrl = new URL(evidence.deployment_url);
  } catch {
    throw new Error("Staging deployment URL is invalid.");
  }
  assert(
    deploymentUrl.protocol === "https:" &&
      deploymentUrl.origin === evidence.deployment_url,
    "Staging deployment URL must be an exact HTTPS origin."
  );
  assert(
    Array.isArray(evidence.migration_ids) &&
      evidence.migration_ids.length > 0 &&
      evidence.migration_ids.every(
        (name) => typeof name === "string" && /^\d{4}_[a-z0-9_]+\.sql$/.test(name)
      ) &&
      JSON.stringify(evidence.migration_ids) ===
        JSON.stringify([...new Set(evidence.migration_ids)].sort()),
    "Staging migration IDs must be a sorted, unique SQL migration set."
  );
  const acceptedAt = Date.parse(evidence.accepted_at);
  const age = Date.now() - acceptedAt;
  assert(
    Number.isFinite(acceptedAt),
    "Staging evidence has an invalid acceptance time."
  );
  assert(age >= -300_000, "Staging evidence acceptance time is in the future.");
  assert(age <= 31 * 24 * 60 * 60 * 1000, "Staging evidence is older than 31 days.");
  assert(evidence.public_smoke === true, "Public staging smoke did not pass.");
  assert(
    evidence.authenticated_mcp_smoke === true,
    "Authenticated MCP staging smoke did not pass."
  );
};

export const validateStagingRun = ({
  run,
  evidence,
  candidateSha,
  runId,
  repository,
}) => {
  const expectedRunId = positiveInteger(runId, "Staging run ID");
  validateCommonRun(
    run,
    expectedRunId,
    repository,
    ".github/workflows/deploy-managed-cloud-staging.yml"
  );
  assert(
    run.name === "Deploy customer-owned Cloudflare reference staging",
    "The supplied run is not the managed-cloud staging workflow."
  );
  assert(
    ["workflow_run", "workflow_dispatch"].includes(run.event),
    "Staging evidence came from an unsupported trigger."
  );
  assert(
    run.head_branch === "main",
    "Staging workflow controls did not run from main."
  );
  validateStagingEvidence({
    evidence,
    candidateSha,
    runId: expectedRunId,
    runAttempt: run.run_attempt,
    repository,
  });
};

export const validateProductionEvidence = ({
  evidence,
  candidateSha,
  runId,
  repository,
}) => {
  const candidate = exactSha(candidateSha, "Candidate SHA");
  const expectedRunId = positiveInteger(runId, "Production run ID");
  assert(evidence?.version === 1, "Unsupported production evidence version.");
  exactKeys(
    evidence,
    [
      "version",
      "repository",
      "candidate_sha",
      "ci_run_id",
      "ci_run_attempt",
      "staging_run_id",
      "staging_run_attempt",
      "staging_artifact_sha256",
      "staging_worker_version_id",
      "production_run_id",
      "production_run_attempt",
      "deployment_target",
      "deployment_url",
      "artifact_target",
      "artifact_sha256",
      "worker_version_id",
      "worker_version_tag",
      "migration_ids",
      "public_smoke",
      "authenticated_mcp_smoke",
      "accepted_at",
    ],
    "Production evidence"
  );
  assert(
    evidence.repository === repository,
    "Production evidence names another repository."
  );
  assert(
    exactSha(evidence.candidate_sha, "Production candidate SHA") === candidate,
    "Production evidence names another candidate."
  );
  const ciRunId = positiveInteger(evidence.ci_run_id, "Production evidence CI run ID");
  const ciRunAttempt = positiveInteger(
    evidence.ci_run_attempt,
    "Production evidence CI run attempt"
  );
  positiveInteger(evidence.staging_run_id, "Production evidence staging run ID");
  positiveInteger(
    evidence.staging_run_attempt,
    "Production evidence staging run attempt"
  );
  assert(
    positiveInteger(evidence.production_run_id, "Evidence production run ID") ===
      expectedRunId,
    "Production evidence belongs to another run."
  );
  const productionAttempt = positiveInteger(
    evidence.production_run_attempt,
    "Evidence production run attempt"
  );
  assert(
    evidence.deployment_target === "production" &&
      evidence.artifact_target === "production",
    "Production evidence names another target."
  );
  for (const [label, value] of [
    ["Production artifact digest", evidence.artifact_sha256],
    ["Staging artifact digest", evidence.staging_artifact_sha256],
  ]) {
    assert(
      typeof value === "string" && /^[0-9a-f]{64}$/.test(value),
      `${label} is invalid.`
    );
  }
  for (const [label, value] of [
    ["Production Worker version ID", evidence.worker_version_id],
    ["Staging Worker version ID", evidence.staging_worker_version_id],
  ]) {
    assert(
      typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value
        ),
      `${label} is invalid.`
    );
  }
  assert(
    evidence.worker_version_tag ===
      `lmc-prod-${candidate}-${ciRunId}-${ciRunAttempt}-${expectedRunId}-${productionAttempt}`,
    "Production Worker version tag is not bound to the exact CI and production attempts."
  );
  let deploymentUrl;
  try {
    deploymentUrl = new URL(evidence.deployment_url);
  } catch {
    throw new Error("Production deployment URL is invalid.");
  }
  assert(
    deploymentUrl.protocol === "https:" &&
      deploymentUrl.origin === evidence.deployment_url,
    "Production deployment URL must be an exact HTTPS origin."
  );
  assert(
    Array.isArray(evidence.migration_ids) &&
      evidence.migration_ids.length > 0 &&
      evidence.migration_ids.every(
        (name) => typeof name === "string" && /^\d{4}_[a-z0-9_]+\.sql$/.test(name)
      ) &&
      JSON.stringify(evidence.migration_ids) ===
        JSON.stringify([...new Set(evidence.migration_ids)].sort()),
    "Production migration IDs must be a sorted, unique SQL migration set."
  );
  assert(evidence.public_smoke === true, "Public production smoke did not pass.");
  assert(
    evidence.authenticated_mcp_smoke === true,
    "Authenticated MCP production smoke did not pass."
  );
  const acceptedAt = Date.parse(evidence.accepted_at);
  const age = Date.now() - acceptedAt;
  assert(
    Number.isFinite(acceptedAt),
    "Production evidence has an invalid acceptance time."
  );
  assert(age >= -300_000, "Production evidence acceptance time is in the future.");
  assert(age <= 31 * 24 * 60 * 60 * 1000, "Production evidence is older than 31 days.");
};

const selfTest = () => {
  const sha = "a".repeat(40);
  const repository = "reachjalil/liteMCP";
  const ciRun = {
    id: 101,
    run_attempt: 3,
    status: "completed",
    conclusion: "success",
    name: "CI",
    event: "push",
    head_branch: "main",
    head_sha: sha,
    path: ".github/workflows/ci.yml",
    head_repository: { full_name: repository },
  };
  validateCiRun({
    run: ciRun,
    candidateSha: sha,
    runId: 101,
    runAttempt: 3,
    repository,
  });
  validateLatestCiRun({
    payload: { workflow_runs: [ciRun] },
    candidateSha: sha,
    runId: 101,
    runAttempt: 3,
  });

  const stagingRun = {
    id: 202,
    run_attempt: 2,
    status: "completed",
    conclusion: "success",
    name: "Deploy customer-owned Cloudflare reference staging",
    event: "workflow_run",
    head_branch: "main",
    path: ".github/workflows/deploy-managed-cloud-staging.yml",
    head_repository: { full_name: repository },
  };
  const evidence = {
    version: 3,
    repository,
    candidate_sha: sha,
    ci_run_id: 101,
    ci_run_attempt: 3,
    staging_run_id: 202,
    staging_run_attempt: 2,
    deployment_target: "staging",
    deployment_url: "https://staging.example.com",
    artifact_target: "staging",
    artifact_sha256: "b".repeat(64),
    worker_version_id: "123e4567-e89b-42d3-a456-426614174000",
    worker_version_tag: `lmc-stg-${sha}-101-3-202-2`,
    migration_ids: ["0001_better_auth.sql"],
    public_smoke: true,
    authenticated_mcp_smoke: true,
    accepted_at: new Date().toISOString(),
  };
  validateStagingRun({
    run: stagingRun,
    evidence,
    candidateSha: sha,
    runId: 202,
    repository,
  });

  const productionEvidence = {
    version: 1,
    repository,
    candidate_sha: sha,
    ci_run_id: 101,
    ci_run_attempt: 3,
    staging_run_id: 202,
    staging_run_attempt: 2,
    staging_artifact_sha256: "b".repeat(64),
    staging_worker_version_id: "123e4567-e89b-42d3-a456-426614174000",
    production_run_id: 303,
    production_run_attempt: 4,
    deployment_target: "production",
    deployment_url: "https://example.com",
    artifact_target: "production",
    artifact_sha256: "c".repeat(64),
    worker_version_id: "123e4567-e89b-42d3-a456-426614174001",
    worker_version_tag: `lmc-prod-${sha}-101-3-303-4`,
    migration_ids: ["0001_better_auth.sql"],
    public_smoke: true,
    authenticated_mcp_smoke: true,
    accepted_at: new Date().toISOString(),
  };
  validateProductionEvidence({
    evidence: productionEvidence,
    candidateSha: sha,
    runId: 303,
    repository,
  });

  let rejected = false;
  try {
    validateProductionEvidence({
      evidence: { ...productionEvidence, ci_run_attempt: 4 },
      candidateSha: sha,
      runId: 303,
      repository,
    });
  } catch {
    rejected = true;
  }
  assert(
    rejected,
    "Self-test did not reject production evidence detached from its CI attempt."
  );

  rejected = false;
  try {
    validateProductionEvidence({
      evidence: {
        ...productionEvidence,
        accepted_at: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
      },
      candidateSha: sha,
      runId: 303,
      repository,
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "Self-test did not reject stale production evidence.");

  rejected = false;
  try {
    validateStagingRun({
      run: stagingRun,
      evidence: { ...evidence, candidate_sha: "b".repeat(40) },
      candidateSha: sha,
      runId: 202,
      repository,
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "Self-test did not reject mismatched staging evidence.");

  rejected = false;
  try {
    validateCiRun({
      run: ciRun,
      candidateSha: sha,
      runId: 101,
      runAttempt: 2,
      repository,
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "Self-test did not reject a mismatched CI run attempt.");

  rejected = false;
  try {
    validateLatestCiRun({
      payload: {
        workflow_runs: [{ ...ciRun, id: 303, head_sha: "b".repeat(40) }],
      },
      candidateSha: sha,
      runId: 101,
      runAttempt: 3,
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "Self-test did not reject a newer successful CI run.");
  process.stdout.write("PASS  workflow evidence validation self-test\n");
};

const [mode, ...args] = process.argv.slice(2);
if (mode === "--self-test") {
  selfTest();
} else if (mode === "ci") {
  const [runPath, candidateSha, runId, repository, runAttempt] = args;
  const result = validateCiRun({
    run: readJson(runPath),
    candidateSha,
    runId,
    runAttempt,
    repository,
  });
  process.stdout.write(
    `PASS  CI run ${runId} attempt ${result.runAttempt} validated ${candidateSha}\n`
  );
} else if (mode === "latest") {
  const [payloadPath, candidateSha, runId, runAttempt] = args;
  validateLatestCiRun({
    payload: readJson(payloadPath),
    candidateSha,
    runId,
    runAttempt,
  });
  process.stdout.write(
    `PASS  CI run ${runId} attempt ${runAttempt} is the latest successful main candidate\n`
  );
} else if (mode === "staging") {
  const [runPath, evidencePath, candidateSha, runId, repository] = args;
  validateStagingRun({
    run: readJson(runPath),
    evidence: readJson(evidencePath),
    candidateSha,
    runId,
    repository,
  });
  process.stdout.write(`PASS  staging run ${runId} accepted ${candidateSha}\n`);
} else if (mode === "staging-evidence") {
  const [evidencePath, candidateSha, runId, runAttempt, repository] = args;
  validateStagingEvidence({
    evidence: readJson(evidencePath),
    candidateSha,
    runId,
    runAttempt,
    repository,
  });
  process.stdout.write(
    `PASS  staging evidence for run ${runId} attempt ${runAttempt} accepted ${candidateSha}\n`
  );
} else if (mode === "production") {
  const [evidencePath, candidateSha, runId, repository] = args;
  validateProductionEvidence({
    evidence: readJson(evidencePath),
    candidateSha,
    runId,
    repository,
  });
  process.stdout.write(`PASS  production run ${runId} accepted ${candidateSha}\n`);
} else {
  process.stderr.write(
    "Usage: verify-workflow-evidence.mjs --self-test | ci RUN_JSON SHA RUN_ID REPOSITORY [RUN_ATTEMPT] | latest RUNS_JSON SHA RUN_ID RUN_ATTEMPT | staging RUN_JSON EVIDENCE_JSON SHA RUN_ID REPOSITORY | staging-evidence EVIDENCE_JSON SHA RUN_ID RUN_ATTEMPT REPOSITORY | production EVIDENCE_JSON SHA RUN_ID REPOSITORY\n"
  );
  process.exitCode = 2;
}
