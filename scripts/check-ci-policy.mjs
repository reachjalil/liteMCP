#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";

const workflowDirectory = resolve(process.cwd(), ".github/workflows");
const workflowFiles = readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort();
const expectedWorkflowFiles = [
  "ci.yml",
  "deploy-managed-cloud-staging.yml",
  "deploy-managed-cloud.yml",
  "publish-images.yml",
];
const workflows = new Map();
const errors = [];

const fail = (file, message) => errors.push(`${file}: ${message}`);
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const includesAll = (value, required) =>
  required.every((entry) => String(value ?? "").includes(entry));
const sortedJson = (value) =>
  JSON.stringify(
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        )
      : value
  );
const exactObject = (actual, expected) => sortedJson(actual) === sortedJson(expected);
const sameSet = (actual, expected) =>
  JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const requireOrderedSteps = (file, job, requiredNames) => {
  const stepNames = asArray(job?.steps)
    .map((step) => step?.name)
    .filter(Boolean);
  let previousIndex = -1;
  for (const name of requiredNames) {
    const index = stepNames.indexOf(name);
    if (index === -1) {
      fail(file, `required ordered step is missing: ${name}`);
    } else if (index <= previousIndex) {
      fail(file, `deployment step is out of order: ${name}`);
    }
    previousIndex = index;
  }
};

if (!sameSet(workflowFiles, expectedWorkflowFiles)) {
  fail(
    ".github/workflows",
    `workflow inventory must be exactly ${expectedWorkflowFiles.join(", ")}`
  );
}

const workflowPolicy = {
  "ci.yml": {
    triggers: ["pull_request", "push", "workflow_dispatch"],
    permissions: { contents: "read" },
    jobPermissions: {
      "candidate-images": { contents: "read", packages: "write" },
    },
  },
  "deploy-managed-cloud-staging.yml": {
    triggers: ["workflow_dispatch", "workflow_run"],
    permissions: { actions: "read", contents: "read" },
    jobPermissions: {},
  },
  "deploy-managed-cloud.yml": {
    triggers: ["workflow_dispatch"],
    permissions: { actions: "read", contents: "read" },
    jobPermissions: {},
  },
  "publish-images.yml": {
    triggers: ["workflow_run"],
    permissions: { actions: "read", contents: "read", packages: "write" },
    jobPermissions: {},
  },
};

const parseWorkflow = (file) => {
  const text = readFileSync(resolve(workflowDirectory, file), "utf8");
  const document = parseDocument(text, { uniqueKeys: true });
  for (const error of document.errors) fail(file, `invalid YAML: ${error.message}`);
  const workflow = document.toJS();
  workflows.set(file, { text, workflow });
  return workflow;
};

const workflowRunGuards = [
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event == 'push'",
  "github.event.workflow_run.head_branch == 'main'",
  "github.event.workflow_run.head_repository.full_name == github.repository",
];

for (const file of workflowFiles) {
  const workflow = parseWorkflow(file);
  const jobs = workflow?.jobs ?? {};
  const policy = workflowPolicy[file];
  if (!policy) continue;

  if (!sameSet(Object.keys(workflow?.on ?? {}), policy.triggers)) {
    fail(file, `trigger inventory must be exactly ${policy.triggers.join(", ")}`);
  }
  if (Object.hasOwn(workflow?.on ?? {}, "pull_request_target")) {
    fail(file, "pull_request_target is forbidden");
  }
  if (!exactObject(workflow?.permissions, policy.permissions)) {
    fail(
      file,
      `workflow permissions must be exactly ${sortedJson(policy.permissions)}`
    );
  }
  if (JSON.stringify(workflow?.env ?? {}).includes("${{ secrets.")) {
    fail(file, "secrets must not be scoped at workflow level");
  }

  for (const [jobName, job] of Object.entries(jobs)) {
    if (job["runs-on"] !== "ubuntu-24.04") {
      fail(file, `${jobName} must run on ubuntu-24.04`);
    }
    if (JSON.stringify(job.env ?? {}).includes("${{ secrets.")) {
      fail(file, `${jobName} scopes secrets above an individual step`);
    }
    const expectedPermissions = policy.jobPermissions[jobName];
    if (expectedPermissions) {
      if (!exactObject(job.permissions, expectedPermissions)) {
        fail(
          file,
          `${jobName} permissions must be exactly ${sortedJson(expectedPermissions)}`
        );
      }
    } else if (job.permissions !== undefined) {
      fail(file, `${jobName} has an unapproved job-level permission override`);
    }

    for (const [index, step] of asArray(job.steps).entries()) {
      if (!step?.uses) continue;
      const action = String(step.uses);
      if (!action.startsWith("./")) {
        const revision = action.slice(action.lastIndexOf("@") + 1);
        if (!/^[0-9a-f]{40}$/.test(revision)) {
          fail(
            file,
            `${jobName} step ${index + 1} action is not full-SHA pinned: ${action}`
          );
        }
      }
      if (
        action.startsWith("actions/checkout@") &&
        step.with?.["persist-credentials"] !== false
      ) {
        fail(file, `${jobName} checkout must set persist-credentials: false`);
      }
      if (action.startsWith("aquasecurity/trivy-action@")) {
        if (
          step.with?.["ignore-unfixed"] !== false ||
          step.with?.["exit-code"] !== "1" ||
          step.with?.severity !== "HIGH,CRITICAL"
        ) {
          fail(
            file,
            `${jobName} Trivy gate must fail on every HIGH/CRITICAL finding without a blanket unfixed exception`
          );
        }
      }
    }
  }

  if (workflow?.on?.workflow_run) {
    const memo = new Map();
    const isGuarded = (jobName, trail = new Set()) => {
      if (memo.has(jobName)) return memo.get(jobName);
      if (trail.has(jobName)) return false;
      const job = jobs[jobName];
      if (!job) return false;
      if (includesAll(job.if, workflowRunGuards)) {
        memo.set(jobName, true);
        return true;
      }
      const dependencies = asArray(job.needs);
      const guarded =
        dependencies.length > 0 &&
        dependencies.every((dependency) =>
          isGuarded(dependency, new Set([...trail, jobName]))
        );
      memo.set(jobName, guarded);
      return guarded;
    };
    for (const jobName of Object.keys(jobs)) {
      if (!isGuarded(jobName)) {
        fail(
          file,
          `${jobName} is not transitively gated by every same-repository successful-main guard`
        );
      }
    }
  }
}

const requireWorkflow = (name) => {
  const entry = workflows.get(name);
  if (!entry) throw new Error(`Required workflow ${name} is missing.`);
  return entry;
};

const { workflow: ci } = requireWorkflow("ci.yml");
if (!sameSet(asArray(ci.on?.push?.branches), ["main"])) {
  fail("ci.yml", "push must be restricted to main");
}
const requiredCiJobs = [
  "format",
  "types",
  "test",
  "python-sdk",
  "build",
  "harness-config",
  "security-audit",
  "workflow-policy",
  "managed-cloud-wrangler",
  "secret-scan",
  "dependency-review",
  "helm",
  "compose",
  "containers",
  "candidate-images",
];
const actualCiJobs = Object.keys(ci.jobs ?? {}).filter((name) => name !== "required");
if (!sameSet(actualCiJobs, requiredCiJobs)) {
  fail("ci.yml", "CI job inventory changed without a required-gate policy update");
}
if (!sameSet(asArray(ci.jobs?.required?.needs), requiredCiJobs)) {
  fail("ci.yml", "required.needs must aggregate every CI job exactly once");
}
if (ci.jobs?.required?.if !== "always()") {
  fail("ci.yml", "required aggregator must run under always()");
}

const candidate = ci.jobs?.["candidate-images"];
const candidatePrerequisites = requiredCiJobs.filter(
  (name) => !["dependency-review", "candidate-images"].includes(name)
);
if (!sameSet(asArray(candidate?.needs), candidatePrerequisites)) {
  fail(
    "ci.yml",
    "candidate publication must wait for every push-relevant quality gate"
  );
}
if (
  !includesAll(candidate?.if, [
    "github.event_name == 'push'",
    "github.ref == 'refs/heads/main'",
    "github.repository == 'reachjalil/liteMCP'",
  ])
) {
  fail(
    "ci.yml",
    "candidate image publication must be canonical-repository main push only"
  );
}
if (!JSON.stringify(ci.jobs?.["workflow-policy"]).includes("pnpm ci:policy")) {
  fail("ci.yml", "workflow policy job must run the complete pnpm ci:policy gate");
}
if (
  !JSON.stringify(ci.jobs?.["managed-cloud-wrangler"]).includes(
    "managed-cloud:auth-migration-window -- --self-test"
  )
) {
  fail("ci.yml", "managed-cloud CI must exercise the migration-window policy");
}
if (
  !JSON.stringify(ci.jobs?.["managed-cloud-wrangler"]).includes(
    "managed-cloud:do-lifecycle -- --self-test"
  )
) {
  fail("ci.yml", "managed-cloud CI must exercise the Durable Object lifecycle policy");
}
const managedCloudCiText = JSON.stringify(ci.jobs?.["managed-cloud-wrangler"]);
for (const control of [
  "build-managed-cloud-artifact.sh production",
  "build-managed-cloud-artifact.sh staging",
  "managed-cloud-artifact-production-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}",
  "managed-cloud-artifact-staging-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}",
  "managed-cloud-production.tar.gz",
  "managed-cloud-staging.tar.gz",
]) {
  if (!managedCloudCiText.includes(control)) {
    fail("ci.yml", `managed-cloud CI artifact gate is missing ${control}`);
  }
}
const candidateText = JSON.stringify(candidate);
for (const control of [
  "candidate-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}",
  "provenance",
  "sbom",
  "aquasecurity/trivy-action@",
  "steps.build.outputs.digest",
  "verify-image-evidence.mjs write",
  "github.run_id",
  "github.run_attempt",
]) {
  if (!candidateText.includes(control)) {
    fail("ci.yml", `candidate image gate is missing ${control}`);
  }
}
const containerText = JSON.stringify(ci.jobs?.containers);
if (
  !containerText.includes("aquasecurity/trivy-action@") ||
  !containerText.includes('"load":true')
) {
  fail("ci.yml", "fork-safe container builds must load and scan both local images");
}
const requiredScript = asArray(ci.jobs?.required?.steps)
  .map((step) => step.run ?? "")
  .join("\n");
for (const control of [
  'process.env.CI_EVENT !== "pull_request"',
  'name === "candidate-images"',
  'process.env.CI_EVENT !== "push"',
  'process.env.CI_REPOSITORY !== "reachjalil/liteMCP"',
]) {
  if (!requiredScript.includes(control)) {
    fail(
      "ci.yml",
      `required aggregator is missing conditional skip control ${control}`
    );
  }
}

const { workflow: publisher, text: publisherText } =
  requireWorkflow("publish-images.yml");
if (!sameSet(asArray(publisher.on?.workflow_run?.workflows), ["CI"])) {
  fail("publish-images.yml", "publisher must consume only CI workflow runs");
}
if (!sameSet(asArray(publisher.on?.workflow_run?.branches), ["main"])) {
  fail("publish-images.yml", "publisher workflow_run must be restricted to main");
}
if (publisher.concurrency?.["cancel-in-progress"] !== false) {
  fail("publish-images.yml", "publication must be serialized without supersession");
}
if (Object.keys(publisher.jobs ?? {}).length !== 1) {
  fail("publish-images.yml", "publication must use one sequential promotion job");
}
const promote = publisher.jobs?.promote;
if (!promote || promote.strategy?.matrix) {
  fail("publish-images.yml", "promotion must not use a matrix");
}
if (!String(promote?.if ?? "").includes("github.repository == 'reachjalil/liteMCP'")) {
  fail(
    "publish-images.yml",
    "publisher must be disabled outside the canonical repository"
  );
}
if (publisherText.includes("docker/build-push-action@")) {
  fail("publish-images.yml", "publisher must promote CI digests without rebuilding");
}
const promoteText = JSON.stringify(promote);
for (const control of [
  "verify-workflow-evidence.mjs ci",
  "verify-workflow-evidence.mjs latest",
  "workflow_run.run_attempt",
  "verify-image-evidence.mjs verify",
  "candidate-$CANDIDATE_SHA-run-$CI_RUN_ID-attempt-$CI_RUN_ATTEMPT",
  "repository@$expected",
  "imagetools inspect",
  "Immutable alias",
  "imagetools create --prefer-index=false",
  "sha-$CANDIDATE_SHA",
  "immutable_inspect_error",
  "manifest unknown|: not found",
  "Refusing immutable alias write because registry inspection did not prove absence",
  "repository:edge",
]) {
  if (!promoteText.includes(control)) {
    fail("publish-images.yml", `digest promotion is missing ${control}`);
  }
}
if (
  promoteText.split("verify-workflow-evidence.mjs latest").length - 1 < 2 ||
  !promoteText.includes("Recheck freshness immediately before moving edge")
) {
  fail(
    "publish-images.yml",
    "publisher must recheck the latest successful main candidate immediately before edge mutation"
  );
}
requireOrderedSteps("publish-images.yml", promote, [
  "Refuse to supersede a newer successful main CI run",
  "Verify candidates and create immutable aliases",
  "Recheck freshness immediately before moving edge",
  "Move edge aliases to the qualified digests",
]);

const { workflow: staging, text: stagingSource } = requireWorkflow(
  "deploy-managed-cloud-staging.yml"
);
if (!sameSet(Object.keys(staging.jobs ?? {}), ["qualify", "deploy"])) {
  fail("deploy-managed-cloud-staging.yml", "staging must qualify before deployment");
}
if (!sameSet(asArray(staging.jobs?.deploy?.needs), ["qualify"])) {
  fail("deploy-managed-cloud-staging.yml", "staging deploy must depend on qualify");
}
if (staging.jobs?.deploy?.environment?.name !== "managed-cloud-staging") {
  fail(
    "deploy-managed-cloud-staging.yml",
    "staging deploy must use managed-cloud-staging"
  );
}
if (staging.concurrency?.["cancel-in-progress"] !== false) {
  fail(
    "deploy-managed-cloud-staging.yml",
    "staging mutation must be serialized without supersession"
  );
}
const stagingText = JSON.stringify(staging);
for (const control of [
  "CUSTOMER_OWNED_REFERENCE_DEPLOY",
  "verify-workflow-evidence.mjs ci",
  "verify-workflow-evidence.mjs latest",
  "ci_run_attempt",
  "managed-cloud-staging-evidence-${{ needs.qualify.outputs.candidate_sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}",
  "managed-cloud:auth-migration-window",
  "managed-cloud:do-lifecycle -- --env staging",
  "BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA",
  "SCIM_WRITES_FROZEN",
  "CLOUDFLARE_DEPLOY_API_TOKEN",
  "CLOUDFLARE_MIGRATION_API_TOKEN",
  "managed-cloud-artifact-staging-$CANDIDATE_SHA-run-$CI_RUN_ID-attempt-$CI_RUN_ATTEMPT",
  "verify-managed-cloud-artifact.mjs verify",
  "versions upload",
  "--no-bundle",
  "versions deploy",
  "verify-deployment",
  "artifact_sha256",
  "worker_version_id",
  "verify-workflow-evidence.mjs staging-evidence",
]) {
  if (!stagingText.includes(control)) {
    fail("deploy-managed-cloud-staging.yml", `staging promotion is missing ${control}`);
  }
}
if (
  !stagingSource.includes(
    'test "$CLOUDFLARE_DEPLOY_API_TOKEN" != "$CLOUDFLARE_MIGRATION_API_TOKEN"'
  ) ||
  !stagingSource.includes("version: 3")
) {
  fail(
    "deploy-managed-cloud-staging.yml",
    "staging must reject token reuse and emit current evidence"
  );
}
if (stagingText.includes("secrets.CLOUDFLARE_API_TOKEN")) {
  fail(
    "deploy-managed-cloud-staging.yml",
    "staging must use separately scoped migration and deploy tokens"
  );
}
if (
  stagingText.split("managed-cloud:auth-migration-window -- --env staging").length - 1 <
  2
) {
  fail(
    "deploy-managed-cloud-staging.yml",
    "staging must run migration preflight and postflight"
  );
}
if (stagingText.includes("deploy:staging")) {
  fail(
    "deploy-managed-cloud-staging.yml",
    "staging must upload the prebuilt CI archive without running a deployment build"
  );
}
requireOrderedSteps("deploy-managed-cloud-staging.yml", staging.jobs?.deploy, [
  "Recheck latest CI after staging environment admission",
  "Verify remote staging Durable Object lifecycle",
  "Verify the Better Auth migration window",
  "Upload the prebuilt staging Worker version",
  "Apply checked-in staging D1 migrations",
  "Verify staging migration postflight",
  "Route staging traffic to the uploaded Worker version",
  "Verify staging routes only to the uploaded Worker version",
  "Run public and authenticated MCP staging smoke",
  "Write non-secret staging evidence",
]);
if (stagingText.split("verify-workflow-evidence.mjs latest").length - 1 < 2) {
  fail(
    "deploy-managed-cloud-staging.yml",
    "staging must recheck the latest successful CI run after environment admission"
  );
}

const { workflow: production, text: productionSource } = requireWorkflow(
  "deploy-managed-cloud.yml"
);
if (!sameSet(Object.keys(production.jobs ?? {}), ["preflight", "qualify", "deploy"])) {
  fail("deploy-managed-cloud.yml", "production must preflight, qualify, then deploy");
}
if (!production.on?.workflow_dispatch?.inputs?.candidate_sha?.required) {
  fail(
    "deploy-managed-cloud.yml",
    "production candidate_sha input is missing or optional"
  );
}
if (!production.on?.workflow_dispatch?.inputs?.staging_run_id?.required) {
  fail(
    "deploy-managed-cloud.yml",
    "production staging_run_id input is missing or optional"
  );
}
if (production.jobs?.preflight?.if !== undefined) {
  fail("deploy-managed-cloud.yml", "manual production preflight must always run");
}
if (!sameSet(asArray(production.jobs?.qualify?.needs), ["preflight"])) {
  fail("deploy-managed-cloud.yml", "production qualification must depend on preflight");
}
if (!sameSet(asArray(production.jobs?.deploy?.needs), ["qualify"])) {
  fail("deploy-managed-cloud.yml", "production deploy must depend on qualify");
}
if (production.jobs?.deploy?.environment?.name !== "managed-cloud") {
  fail("deploy-managed-cloud.yml", "production deploy must use managed-cloud");
}
if (production.concurrency?.["cancel-in-progress"] !== false) {
  fail(
    "deploy-managed-cloud.yml",
    "production mutation must be serialized without supersession"
  );
}
const productionText = JSON.stringify(production);
for (const control of [
  "CUSTOMER_OWNED_REFERENCE_DEPLOY",
  "verify-workflow-evidence.mjs staging",
  "verify-workflow-evidence.mjs ci",
  "ci_run_attempt",
  "refs/heads/main",
  "managed-cloud:auth-migration-window",
  "managed-cloud:do-lifecycle -- --env production",
  "BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA",
  "SCIM_WRITES_FROZEN",
  "CLOUDFLARE_DEPLOY_API_TOKEN",
  "CLOUDFLARE_MIGRATION_API_TOKEN",
  "managed-cloud-artifact-production-$CANDIDATE_SHA-run-$CI_RUN_ID-attempt-$CI_RUN_ATTEMPT",
  "verify-managed-cloud-artifact.mjs verify",
  "versions upload",
  "--no-bundle",
  "versions deploy",
  "verify-deployment",
  "managed-cloud-production-evidence-${{ inputs.candidate_sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}",
  "staging_artifact_sha256",
  "worker_version_id",
]) {
  if (!productionText.includes(control)) {
    fail("deploy-managed-cloud.yml", `production promotion is missing ${control}`);
  }
}
if (
  !productionSource.includes(
    'test "$CLOUDFLARE_DEPLOY_API_TOKEN" != "$CLOUDFLARE_MIGRATION_API_TOKEN"'
  ) ||
  !productionSource.includes("version: 1")
) {
  fail(
    "deploy-managed-cloud.yml",
    "production must reject token reuse and emit current evidence"
  );
}
if (productionText.includes("secrets.CLOUDFLARE_API_TOKEN")) {
  fail(
    "deploy-managed-cloud.yml",
    "production must use separately scoped migration and deploy tokens"
  );
}
if (
  productionText.split("managed-cloud:auth-migration-window -- --env production")
    .length -
    1 <
  2
) {
  fail(
    "deploy-managed-cloud.yml",
    "production must run migration preflight and postflight"
  );
}
if (productionText.includes("managed-cloud:deploy")) {
  fail(
    "deploy-managed-cloud.yml",
    "production must upload the prebuilt CI archive without running a deployment build"
  );
}
requireOrderedSteps("deploy-managed-cloud.yml", production.jobs?.deploy, [
  "Verify remote production Durable Object lifecycle",
  "Verify the Better Auth migration window",
  "Upload the prebuilt production Worker version",
  "Apply checked-in production D1 migrations",
  "Verify production migration postflight",
  "Route production traffic to the uploaded Worker version",
  "Verify production routes only to the uploaded Worker version",
  "Run public and authenticated MCP production smoke",
  "Write and verify non-secret production evidence",
]);

const durableObjectLifecycleCheck = readFileSync(
  resolve(process.cwd(), "scripts/check-managed-cloud-do-lifecycle.mjs"),
  "utf8"
);
for (const control of [
  "/settings",
  'method: "GET"',
  "migration_tag",
  "durable_object_namespace",
  "reviewed lifecycle deployment",
  "routeFreeConfiguration",
  "requireResourceIds: true",
  "selected.routes = []",
  "selected.preview_urls = false",
  "selected.triggers = {}",
  "remote.script_name != null",
  "remote.environment != null",
  "remote.dispatch_namespace != null",
  "workers/scripts",
  "storage/kv/namespaces/",
  "d1/database/",
  "assertQualifiedCheckout",
  '"status", "--porcelain=v1", "--untracked-files=normal"',
  "write-config",
]) {
  if (!durableObjectLifecycleCheck.includes(control)) {
    fail(
      "scripts/check-managed-cloud-do-lifecycle.mjs",
      `Durable Object remote preflight is missing ${control}`
    );
  }
}

const lifecycleRunbook = readFileSync(
  resolve(process.cwd(), "docs/operations/cloudflare-durable-object-lifecycle.md"),
  "utf8"
);
for (const control of [
  "verify-workflow-evidence.mjs ci",
  "verify-workflow-evidence.mjs latest",
  "gh run download",
  "managed-cloud-artifact-${LITEMCP_LIFECYCLE_TARGET}-${LITEMCP_CANDIDATE_SHA}-run-${LITEMCP_CI_RUN_ID}-attempt-${LITEMCP_CI_RUN_ATTEMPT}",
  "verify-managed-cloud-artifact.mjs verify",
  "--identity staging",
  "--no-experimental-provision",
  "--no-experimental-auto-create",
  "verify-lifecycle-tag",
  "Lifecycle CI archive sha256:",
  "parse-version",
  "verify-deployment",
  "triggers deploy",
  "Brand-new target with an empty D1 database",
  "Existing Worker with a legacy D1 database",
]) {
  if (!lifecycleRunbook.includes(control)) {
    fail(
      "docs/operations/cloudflare-durable-object-lifecycle.md",
      `lifecycle procedure is missing ${control}`
    );
  }
}

const rootPackage = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8")
);
const managedCloudPackage = JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/managed-cloud/package.json"), "utf8")
);
for (const [label, command] of [
  ["root production deploy", rootPackage.scripts?.["managed-cloud:deploy"]],
  ["root staging deploy", rootPackage.scripts?.["managed-cloud:deploy:staging"]],
  ["package production deploy", managedCloudPackage.scripts?.deploy],
  ["package staging deploy", managedCloudPackage.scripts?.["deploy:staging"]],
]) {
  if (!String(command ?? "").includes("guard-managed-cloud-deploy.mjs")) {
    fail("package.json", `${label} must fail through the managed-cloud deploy guard`);
  }
}

const artifactVerifier = readFileSync(
  resolve(process.cwd(), "scripts/verify-managed-cloud-artifact.mjs"),
  "utf8"
);
for (const control of [
  "Current) Version ID",
  "lmc-lifecycle-",
  "verify-lifecycle-tag",
]) {
  if (!artifactVerifier.includes(control)) {
    fail(
      "scripts/verify-managed-cloud-artifact.mjs",
      `managed-cloud lifecycle evidence is missing ${control}`
    );
  }
}

const artifactBuilder = readFileSync(
  resolve(process.cwd(), "scripts/build-managed-cloud-artifact.sh"),
  "utf8"
);
for (const control of [
  "wrangler deploy",
  "--dry-run",
  "GNU tar is required",
  "--sort=name",
  "gzip -n",
  "-type l",
  "! -type f ! -type d",
  "verify-managed-cloud-artifact.mjs write",
  "verify-managed-cloud-artifact.mjs verify",
]) {
  if (!artifactBuilder.includes(control)) {
    fail(
      "scripts/build-managed-cloud-artifact.sh",
      `managed-cloud artifact builder is missing ${control}`
    );
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `PASS  deny-by-default structural workflow policy (${workflowFiles.length} files)\n`
  );
}
