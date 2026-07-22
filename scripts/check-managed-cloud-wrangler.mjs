#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), "apps/managed-cloud/wrangler.jsonc");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const requireStagingResourceIds = process.argv.includes(
  "--require-staging-resource-ids"
);
const kvNamespaceIdPattern = /^[0-9a-f]{32}$/;
const d1DatabaseIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const fail = (message) => {
  throw new Error(`Managed-cloud Wrangler configuration: ${message}`);
};

const requireValue = (condition, message) => {
  if (!condition) fail(message);
};

const readTarget = (label, target) => {
  requireValue(target && typeof target === "object", `${label} is missing.`);
  requireValue(target.workers_dev === false, `${label} must disable workers.dev.`);
  requireValue(
    target.vars?.LITEMCP_DEMO_MODE === "false",
    `${label} must explicitly disable demo mode.`
  );
  requireValue(
    ["false", "true"].includes(target.vars?.SIGNUPS_ENABLED),
    `${label} must explicitly set SIGNUPS_ENABLED to true or false.`
  );
  requireValue(
    ["false", "true"].includes(target.vars?.ANALYTICS_ENABLED),
    `${label} must explicitly set ANALYTICS_ENABLED to true or false.`
  );
  const tenantFeedMaximum = Number(target.vars?.TENANT_FEED_MAX_EVENTS);
  requireValue(
    Number.isInteger(tenantFeedMaximum) &&
      tenantFeedMaximum >= 100 &&
      tenantFeedMaximum <= 10_000,
    `${label} TENANT_FEED_MAX_EVENTS must be an integer from 100 to 10000.`
  );
  requireValue(
    target.secrets?.required?.includes("BETTER_AUTH_SECRET"),
    `${label} must declare BETTER_AUTH_SECRET as required.`
  );
  requireValue(
    target.secrets?.required?.includes("CREDENTIAL_MASTER_KEY"),
    `${label} must declare CREDENTIAL_MASTER_KEY as required.`
  );
  requireValue(
    target.secrets?.required?.includes("SENTRY_DSN"),
    `${label} must declare SENTRY_DSN as required.`
  );
  if (target.vars.SIGNUPS_ENABLED === "true") {
    requireValue(
      target.secrets.required.includes("RESEND_API_KEY") &&
        target.secrets.required.includes("EMAIL_FROM"),
      `${label} must require RESEND_API_KEY and EMAIL_FROM before signup is enabled.`
    );
  }

  let origin;
  try {
    origin = new URL(target.vars?.PUBLIC_ORIGIN);
  } catch {
    fail(`${label} PUBLIC_ORIGIN must be an absolute URL.`);
  }
  requireValue(origin.protocol === "https:", `${label} origin must use HTTPS.`);
  requireValue(
    origin.origin === target.vars.PUBLIC_ORIGIN,
    `${label} PUBLIC_ORIGIN must be an origin without a path or trailing slash.`
  );
  const webOrigins = String(target.vars?.WEB_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  requireValue(
    webOrigins.includes(origin.origin),
    `${label} WEB_ORIGINS must include its PUBLIC_ORIGIN.`
  );

  const routes = target.routes ?? [];
  requireValue(routes.length > 0, `${label} must declare an account-owned route.`);
  requireValue(
    routes.some(
      (route) => route?.custom_domain === true && route.pattern === origin.hostname
    ),
    `${label} must bind its PUBLIC_ORIGIN hostname as a custom domain.`
  );

  const kv = target.kv_namespaces?.find((binding) => binding.binding === "DATA_KV");
  const d1 = target.d1_databases?.find((binding) => binding.binding === "AUTH_DB");
  const authority = target.durable_objects?.bindings?.find(
    (binding) => binding.name === "TENANT_AUTHORITY"
  );
  const tenantFeed = target.durable_objects?.bindings?.find(
    (binding) => binding.name === "TENANT_FEED"
  );
  const usageAnalytics = target.analytics_engine_datasets?.find(
    (binding) => binding.binding === "USAGE_ANALYTICS"
  );
  requireValue(kv, `${label} DATA_KV binding is missing.`);
  requireValue(d1, `${label} AUTH_DB binding is missing.`);
  requireValue(d1.database_name, `${label} AUTH_DB database_name is missing.`);
  requireValue(
    authority?.class_name === "TenantAuthorityDurableObject",
    `${label} TENANT_AUTHORITY Durable Object binding is missing.`
  );
  requireValue(
    tenantFeed?.class_name === "TenantFeedDurableObject",
    `${label} TENANT_FEED Durable Object binding is missing.`
  );
  requireValue(
    usageAnalytics?.dataset,
    `${label} USAGE_ANALYTICS dataset binding is missing.`
  );

  return {
    authority,
    d1,
    kv,
    origin,
    routes,
    tenantFeed,
    usageAnalytics,
  };
};

const production = readTarget("production", config);
const stagingConfig = config.env?.staging;
const staging = readTarget("staging", stagingConfig);

requireValue(config.name, "production Worker name is missing.");
requireValue(stagingConfig.name, "staging Worker name is missing.");
requireValue(
  config.name !== stagingConfig.name,
  "production and staging must use different Worker names."
);
requireValue(
  production.origin.origin !== staging.origin.origin,
  "production and staging must use different public origins."
);
requireValue(
  production.d1.database_name !== staging.d1.database_name,
  "production and staging must use different D1 database names."
);
requireValue(
  production.usageAnalytics.dataset !== staging.usageAnalytics.dataset,
  "production and staging must use different Analytics Engine dataset names."
);
requireValue(
  config.migrations?.some(
    (migration) =>
      migration.tag === "v2-tenant-feed" &&
      migration.new_sqlite_classes?.includes("TenantFeedDurableObject")
  ),
  "TenantFeedDurableObject must have its own SQLite migration."
);
requireValue(
  kvNamespaceIdPattern.test(production.kv.id ?? ""),
  "production DATA_KV id must be a lowercase 32-character hexadecimal namespace ID."
);
requireValue(
  d1DatabaseIdPattern.test(production.d1.database_id ?? ""),
  "production AUTH_DB database_id must be a canonical UUID."
);

const productionRoutes = new Set(production.routes.map((route) => route.pattern));
requireValue(
  staging.routes.every((route) => !productionRoutes.has(route.pattern)),
  "production and staging routes must not overlap."
);
if (production.kv.id && staging.kv.id) {
  requireValue(
    production.kv.id !== staging.kv.id,
    "production and staging must use different KV namespace IDs."
  );
}
if (production.d1.database_id && staging.d1.database_id) {
  requireValue(
    production.d1.database_id !== staging.d1.database_id,
    "production and staging must use different D1 database IDs."
  );
}
if (requireStagingResourceIds) {
  requireValue(
    kvNamespaceIdPattern.test(staging.kv.id ?? ""),
    "staging DATA_KV id must be a reviewed lowercase 32-character hexadecimal namespace ID before deployment is enabled."
  );
  requireValue(
    d1DatabaseIdPattern.test(staging.d1.database_id ?? ""),
    "staging AUTH_DB database_id must be a reviewed canonical UUID before deployment is enabled."
  );
}

process.stdout.write(
  `PASS  isolated Wrangler targets: ${config.name} and ${stagingConfig.name}\n`
);
