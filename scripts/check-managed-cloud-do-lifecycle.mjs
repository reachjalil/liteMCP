#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const configPath = resolve(process.cwd(), "apps/managed-cloud/wrangler.jsonc");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const accountIdPattern = /^[0-9a-f]{32}$/i;
const kvNamespaceIdPattern = /^[0-9a-f]{32}$/;
const d1DatabaseIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const fail = (message) => {
  throw new Error(`Managed-cloud Durable Object lifecycle: ${message}`);
};

const targetConfiguration = (
  target,
  sourceConfig = config,
  { requireResourceIds = false } = {}
) => {
  if (!new Set(["production", "staging"]).has(target)) {
    fail("target must be production or staging.");
  }
  const targetConfig =
    target === "production" ? sourceConfig : sourceConfig.env?.staging;
  const workerName = targetConfig?.name;
  if (typeof workerName !== "string" || workerName.length === 0) {
    fail(`${target} Worker name is missing.`);
  }

  const migrations = targetConfig.migrations ?? sourceConfig.migrations;
  if (!Array.isArray(migrations) || migrations.length === 0) {
    fail("the checked-in legacy migrations array is empty.");
  }
  const tags = migrations.map((migration) => migration?.tag);
  if (
    tags.some((tag) => typeof tag !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(tag)) ||
    new Set(tags).size !== tags.length
  ) {
    fail("migration tags must be non-empty, unique lowercase identifiers.");
  }

  const expectedBindings = targetConfig?.durable_objects?.bindings;
  if (!Array.isArray(expectedBindings) || expectedBindings.length === 0) {
    fail(`${target} Durable Object bindings are missing.`);
  }
  const bindingKeys = new Set();
  for (const binding of expectedBindings) {
    if (
      typeof binding?.name !== "string" ||
      typeof binding?.class_name !== "string" ||
      binding.name.length === 0 ||
      binding.class_name.length === 0
    ) {
      fail(`${target} has an invalid Durable Object binding.`);
    }
    const key = `${binding.name}:${binding.class_name}`;
    if (bindingKeys.has(key)) fail(`${target} repeats Durable Object binding ${key}.`);
    bindingKeys.add(key);
  }

  const createdClasses = new Set(
    migrations.flatMap((migration) => [
      ...(migration.new_classes ?? []),
      ...(migration.new_sqlite_classes ?? []),
    ])
  );
  for (const binding of expectedBindings) {
    if (!createdClasses.has(binding.class_name)) {
      fail(
        `${target} binding ${binding.name} has no checked-in creation migration for ${binding.class_name}.`
      );
    }
  }

  const kv = targetConfig.kv_namespaces?.find(
    (binding) => binding?.binding === "DATA_KV"
  );
  const d1 = targetConfig.d1_databases?.find(
    (binding) => binding?.binding === "AUTH_DB"
  );
  if (!kv || !d1) {
    fail(`${target} DATA_KV and AUTH_DB bindings are required.`);
  }
  if (requireResourceIds) {
    if (!kvNamespaceIdPattern.test(kv.id ?? "")) {
      fail(
        `${target} DATA_KV id must be a reviewed lowercase 32-character hexadecimal namespace ID.`
      );
    }
    if (!d1DatabaseIdPattern.test(d1.database_id ?? "")) {
      fail(`${target} AUTH_DB database_id must be a reviewed canonical UUID.`);
    }
    const otherTarget =
      target === "production" ? sourceConfig.env?.staging : sourceConfig;
    const otherKv = otherTarget?.kv_namespaces?.find(
      (binding) => binding?.binding === "DATA_KV"
    );
    const otherD1 = otherTarget?.d1_databases?.find(
      (binding) => binding?.binding === "AUTH_DB"
    );
    if (otherKv?.id === kv.id) {
      fail("production and staging DATA_KV ids must differ.");
    }
    if (otherD1?.database_id === d1.database_id) {
      fail("production and staging AUTH_DB database_ids must differ.");
    }
  }

  return {
    d1DatabaseId: d1.database_id,
    d1DatabaseName: d1.database_name,
    expectedBindings,
    expectedTag: tags.at(-1),
    kvNamespaceId: kv.id,
    workerName,
  };
};

const routeFreeConfiguration = (target, sourceConfig = config) => {
  targetConfiguration(target, sourceConfig, { requireResourceIds: true });
  const lifecycleConfig = structuredClone(sourceConfig);
  delete lifecycleConfig.$schema;
  const selected =
    target === "production" ? lifecycleConfig : lifecycleConfig.env?.staging;
  if (selected?.workers_dev !== false) {
    fail(`${target} lifecycle config must disable workers.dev.`);
  }
  selected.routes = [];
  selected.preview_urls = false;
  // An empty object shadows inherited staging triggers while keeping `crons`
  // undefined. Wrangler only reconciles schedules when `crons` is present.
  selected.triggers = {};
  return lifecycleConfig;
};

const cloudflareCredentials = () => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (typeof accountId !== "string" || !accountIdPattern.test(accountId)) {
    fail("CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal account ID.");
  }
  if (typeof apiToken !== "string" || apiToken.length === 0) {
    fail("CLOUDFLARE_API_TOKEN is required for the credentialed check.");
  }
  return { accountId, apiToken };
};

const fetchCloudflareJson = async ({ accountId, apiToken, label, path }) => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      method: "GET",
      redirect: "error",
    }
  );
  if (!response.ok) {
    fail(`${label} failed with HTTP ${response.status}.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(`${label} returned invalid JSON.`);
  }
  if (payload?.success !== true) {
    fail(`${label} returned an unsuccessful Cloudflare response.`);
  }
  return payload;
};

const runIdentityCheck = async (target) => {
  const credentials = cloudflareCredentials();
  const expected = targetConfiguration(target, config, { requireResourceIds: true });
  const scripts = await fetchCloudflareJson({
    ...credentials,
    label: "Cloudflare account Worker access check",
    path: "workers/scripts",
  });
  if (!Array.isArray(scripts.result)) {
    fail("Cloudflare account Worker access check returned no readable script list.");
  }
  const kv = await fetchCloudflareJson({
    ...credentials,
    label: `${target} DATA_KV ownership check`,
    path: `storage/kv/namespaces/${expected.kvNamespaceId}`,
  });
  if (kv.result?.id !== expected.kvNamespaceId) {
    fail(`${target} DATA_KV ownership check returned a different namespace.`);
  }
  const d1 = await fetchCloudflareJson({
    ...credentials,
    label: `${target} AUTH_DB ownership check`,
    path: `d1/database/${expected.d1DatabaseId}`,
  });
  if (
    d1.result?.uuid !== expected.d1DatabaseId ||
    d1.result?.name !== expected.d1DatabaseName
  ) {
    fail(`${target} AUTH_DB ownership check returned a different database.`);
  }
  process.stdout.write(
    `PASS  ${target} lifecycle identity: account access and the reviewed DATA_KV/AUTH_DB resources match the selected target.\n`
  );
};

export const validateRemoteLifecycle = ({
  expectedBindings,
  expectedTag,
  payload,
  workerName,
}) => {
  if (
    payload?.success !== true ||
    !payload.result ||
    !Array.isArray(payload.result.bindings)
  ) {
    fail(`Cloudflare returned no readable settings for Worker ${workerName}.`);
  }
  if (payload.result.migration_tag !== expectedTag) {
    fail(
      `Worker ${workerName} reports migration tag ${JSON.stringify(
        payload.result.migration_tag ?? null
      )}; expected ${JSON.stringify(expectedTag)}. Apply the reviewed lifecycle deployment before version promotion.`
    );
  }
  const remoteBindings = payload.result.bindings.filter(
    (binding) => binding?.type === "durable_object_namespace"
  );
  if (remoteBindings.length !== expectedBindings.length) {
    fail(
      `Worker ${workerName} exposes ${remoteBindings.length} Durable Object bindings; expected exactly ${expectedBindings.length}.`
    );
  }
  for (const binding of expectedBindings) {
    const remote = remoteBindings.find(
      (candidate) =>
        candidate.name === binding.name && candidate.class_name === binding.class_name
    );
    if (
      !remote ||
      remote.script_name != null ||
      remote.environment != null ||
      remote.dispatch_namespace != null
    ) {
      fail(
        `Worker ${workerName} does not expose ${binding.name} as the internal ${binding.class_name} class.`
      );
    }
  }
  return expectedTag;
};

const runSelfTest = () => {
  const production = targetConfiguration("production");
  assert.equal(production.expectedTag, "v2-tenant-feed");
  const payload = {
    success: true,
    result: {
      bindings: production.expectedBindings.map((binding) => ({
        class_name: binding.class_name,
        name: binding.name,
        namespace_id: "a".repeat(32),
        type: "durable_object_namespace",
      })),
      migration_tag: production.expectedTag,
    },
  };
  assert.equal(validateRemoteLifecycle({ ...production, payload }), "v2-tenant-feed");
  assert.throws(
    () =>
      validateRemoteLifecycle({
        ...production,
        payload: {
          ...payload,
          result: { ...payload.result, migration_tag: "v1-tenant-authority" },
        },
      }),
    /reviewed lifecycle deployment/
  );
  assert.throws(
    () =>
      validateRemoteLifecycle({
        ...production,
        payload: {
          ...payload,
          result: { ...payload.result, bindings: payload.result.bindings.slice(0, 1) },
        },
      }),
    /expected exactly/
  );
  assert.throws(
    () =>
      validateRemoteLifecycle({
        ...production,
        payload: {
          ...payload,
          result: {
            ...payload.result,
            bindings: payload.result.bindings.map((binding, index) =>
              index === 0 ? { ...binding, script_name: "external-worker" } : binding
            ),
          },
        },
      }),
    /internal TenantAuthorityDurableObject/
  );
  assert.throws(
    () => validateRemoteLifecycle({ ...production, payload: { success: false } }),
    /no readable settings/
  );
  const productionLifecycle = routeFreeConfiguration("production");
  assert.deepEqual(productionLifecycle.routes, []);
  assert.equal(productionLifecycle.preview_urls, false);
  assert.deepEqual(productionLifecycle.triggers, {});
  assert.ok(productionLifecycle.env.staging.routes.length > 0);
  assert.throws(() => routeFreeConfiguration("staging"), /staging DATA_KV id/);
  const completeConfig = structuredClone(config);
  completeConfig.env.staging.kv_namespaces[0].id = "b".repeat(32);
  completeConfig.env.staging.d1_databases[0].database_id =
    "123e4567-e89b-42d3-a456-426614174001";
  const stagingLifecycle = routeFreeConfiguration("staging", completeConfig);
  assert.ok(stagingLifecycle.routes.length > 0);
  assert.deepEqual(stagingLifecycle.env.staging.routes, []);
  assert.equal(stagingLifecycle.env.staging.preview_urls, false);
  assert.deepEqual(stagingLifecycle.env.staging.triggers, {});
  const invalidConfig = structuredClone(completeConfig);
  invalidConfig.env.staging.kv_namespaces[0].id = "placeholder";
  assert.throws(
    () => routeFreeConfiguration("staging", invalidConfig),
    /lowercase 32-character/
  );
  const sharedConfig = structuredClone(completeConfig);
  sharedConfig.env.staging.kv_namespaces[0].id = sharedConfig.kv_namespaces[0].id;
  assert.throws(
    () => routeFreeConfiguration("staging", sharedConfig),
    /ids must differ/
  );
  process.stdout.write(
    "PASS  Managed-cloud Durable Object lifecycle self-test: exact migration tag/internal bindings and resource-qualified, preview/route/cron-safe lifecycle configs fail closed.\n"
  );
};

const writeRouteFreeConfiguration = (target, output) => {
  if (!isAbsolute(output)) {
    fail("route-free lifecycle config output must be an absolute path.");
  }
  const repositoryRelative = relative(process.cwd(), output);
  if (
    repositoryRelative === "" ||
    (!repositoryRelative.startsWith(`..${sep}`) && repositoryRelative !== "..")
  ) {
    fail("route-free lifecycle config must be written outside the repository.");
  }
  const serialized = `${JSON.stringify(routeFreeConfiguration(target), null, 2)}\n`;
  let descriptor;
  try {
    descriptor = openSync(output, "wx", 0o600);
    writeFileSync(descriptor, serialized, "utf8");
  } catch (error) {
    fail(`could not create new route-free config ${output}: ${error.message}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  process.stdout.write(
    `PASS  Wrote new route-free ${target} lifecycle config to ${output}.\n`
  );
};

const assertQualifiedCheckout = (candidateSha) => {
  if (typeof candidateSha !== "string" || !/^[0-9a-f]{40}$/.test(candidateSha)) {
    fail("lifecycle candidate SHA must be a lowercase full Git SHA.");
  }
  let head;
  let status;
  try {
    head = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    status = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=normal"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    ).trim();
  } catch {
    fail("could not verify the lifecycle Git checkout.");
  }
  if (head !== candidateSha) {
    fail("checked-out commit does not equal the qualified lifecycle candidate.");
  }
  if (status !== "") {
    fail("lifecycle config generation requires a clean working tree and index.");
  }
};

const writeQualifiedRouteFreeConfiguration = (target, output, candidateSha) => {
  assertQualifiedCheckout(candidateSha);
  writeRouteFreeConfiguration(target, output);
};

const runRemoteCheck = async (target) => {
  const credentials = cloudflareCredentials();
  const expected = targetConfiguration(target);
  const payload = await fetchCloudflareJson({
    ...credentials,
    label: `Cloudflare settings lookup for Worker ${expected.workerName}; a missing first deployment or unreadable Worker blocks version promotion`,
    path: `workers/scripts/${encodeURIComponent(expected.workerName)}/settings`,
  });
  const tag = validateRemoteLifecycle({ ...expected, payload });
  process.stdout.write(
    `PASS  Read-only ${target} Durable Object lifecycle preflight: ${expected.workerName} is at ${tag} with the checked-in bindings.\n`
  );
};

const args = process.argv.slice(2).filter((argument) => argument !== "--");
if (args.length === 1 && args[0] === "--self-test") {
  runSelfTest();
} else if (args.length === 4 && args[0] === "write-config") {
  writeQualifiedRouteFreeConfiguration(args[1], args[2], args[3]);
} else if (args.length === 2 && args[0] === "--identity") {
  await runIdentityCheck(args[1]);
} else if (args.length === 2 && args[0] === "--env") {
  await runRemoteCheck(args[1]);
} else if (args.length === 1 && args[0].startsWith("--env=")) {
  await runRemoteCheck(args[0].slice("--env=".length));
} else {
  process.stderr.write(
    "Usage: node scripts/check-managed-cloud-do-lifecycle.mjs --self-test | --identity staging|production | --env staging|production | write-config staging|production /absolute/new/path FULL_CANDIDATE_SHA\n"
  );
  process.exitCode = 2;
}
