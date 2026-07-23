#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationName = "0003_better_auth_1_7_scim.sql";
const fullCommitShaPattern = /^[0-9a-f]{40}$/;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const schemaTables = [
  "jwks",
  "scimProvider",
  "scimGroup",
  "scimGroupMember",
  "scimGroupRole",
  "scimGroupRoleGrant",
];
const schemaFingerprintQuery = `
  SELECT "type", "name", "tbl_name", "sql"
  FROM "sqlite_schema"
  WHERE
    "type" IN ('table', 'index', 'trigger')
    AND "sql" IS NOT NULL
    AND "name" NOT LIKE 'sqlite_%'
    AND "name" NOT IN ('d1_migrations', '_cf_METADATA')
  ORDER BY "type", "name", "tbl_name";
`;
const normalizeSchemaSql = (sql) =>
  String(sql ?? "")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\s*([(),])\s*/g, "$1")
    .trim();
const isD1OwnedMetadata = ({ name, tbl_name: table, type }) =>
  type === "table" && name === "_cf_METADATA" && table === "_cf_METADATA";
const fingerprintSchemaRows = (rows) =>
  new Map(
    rows
      .filter((row) => !isD1OwnedMetadata(row))
      .map(({ type, name, tbl_name: table, sql }) => [
        `${type}:${name}:${table}`,
        normalizeSchemaSql(sql),
      ])
  );
const rowsFromFingerprint = (fingerprint) =>
  [...fingerprint].map(([key, sql]) => {
    const [type, name, table] = key.split(":");
    return { name, sql, tbl_name: table, type };
  });

const readLocalSchemaFingerprint = (database) =>
  fingerprintSchemaRows(database.prepare(schemaFingerprintQuery).all());

// The canonical schema objects cover column order/type/nullability, constraints,
// explicit indexes, triggers, and inline foreign keys. Derive both accepted
// states from the checked-in migration prefix so a drifted legacy database fails
// before the incompatible transition starts. Any later AUTH_DB migration must
// intentionally update this compatibility gate.
const expectedSchemas = (() => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    const migrationDirectory = resolve(process.cwd(), "apps/managed-cloud/migrations");
    const migrationFiles = readdirSync(migrationDirectory)
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    const targetIndex = migrationFiles.indexOf(migrationName);
    if (targetIndex === -1) {
      throw new Error(`The checked-in ${migrationName} file is missing.`);
    }
    for (const file of migrationFiles.slice(0, targetIndex)) {
      database.exec(readFileSync(resolve(migrationDirectory, file), "utf8"));
    }
    const legacy = readLocalSchemaFingerprint(database);
    database.exec(
      readFileSync(resolve(migrationDirectory, migrationFiles[targetIndex]), "utf8")
    );
    const upgraded = readLocalSchemaFingerprint(database);
    if (
      legacy.size === 0 ||
      legacy.has("table:scimGroup:scimGroup") ||
      schemaTables.some((table) => !upgraded.has(`table:${table}:${table}`))
    ) {
      throw new Error(
        "Checked-in migrations do not produce the expected legacy and 1.7 schemas."
      );
    }
    return { legacy, upgraded };
  } finally {
    database.close();
  }
})();
const expectedLegacySchema = expectedSchemas.legacy;
const expectedUpgradeSchema = expectedSchemas.upgraded;
const reservedAccountProviderIds = [
  "credential",
  "email-otp",
  "magic-link",
  "phone-number",
  "anonymous",
  "siwe",
];
const reservedAccountProviderSql = reservedAccountProviderIds
  .map((providerId) => `'${providerId.replaceAll("'", "''")}'`)
  .join(", ");

const parseArguments = (argv) => {
  const args = argv.filter((argument) => argument !== "--");
  if (args.length === 1 && args[0] === "--self-test") {
    return { selfTest: true };
  }

  let target;
  if (args.length === 2 && args[0] === "--env") {
    target = args[1];
  } else if (args.length === 1 && args[0].startsWith("--env=")) {
    target = args[0].slice("--env=".length);
  }
  if (!new Set(["staging", "production"]).has(target)) {
    throw new Error(
      "Usage: pnpm managed-cloud:auth-migration-window -- --env staging|production\n" +
        "       pnpm managed-cloud:auth-migration-window -- --self-test"
    );
  }
  return { selfTest: false, target };
};

const assertMigrationState = ({ migrationApplied, schemaUpgraded }) => {
  if (migrationApplied !== schemaUpgraded) {
    throw new Error(
      `The ${migrationName} ledger entry and SCIM schema disagree; ` +
        "stop and restore a known-good database state before deployment."
    );
  }
};

const assertUpgradeSchemaFingerprint = ({ migrationApplied, rows }) => {
  const actual = fingerprintSchemaRows(rows);
  const matches = (expected) =>
    actual.size === expected.size &&
    [...expected].every(([key, sql]) => actual.get(key) === sql);
  const schemaLegacy = matches(expectedLegacySchema);
  const schemaUpgraded = matches(expectedUpgradeSchema);

  if (!schemaLegacy && !schemaUpgraded) {
    const expected = migrationApplied ? expectedUpgradeSchema : expectedLegacySchema;
    const keys = new Set([...actual.keys(), ...expected.keys()]);
    const mismatched = [...keys]
      .filter((key) => actual.get(key) !== expected.get(key))
      .sort()
      .slice(0, 8);
    throw new Error(
      `The ${migrationName} schema is partial or drifted (${mismatched.join(", ")}); ` +
        "stop and restore a known-good database state before deployment."
    );
  }
  assertMigrationState({ migrationApplied, schemaUpgraded });
  return schemaUpgraded;
};

const assertPendingMigrationAttestation = ({ environment, migrationApplied }) => {
  if (migrationApplied) {
    return;
  }
  if (environment.SCIM_WRITES_FROZEN !== "true") {
    throw new Error(
      `Pending ${migrationName} requires SCIM_WRITES_FROZEN=true while all SCIM/auth writes are blocked.`
    );
  }

  const candidateSha = environment.CANDIDATE_SHA;
  if (typeof candidateSha !== "string" || !fullCommitShaPattern.test(candidateSha)) {
    throw new Error(
      `Pending ${migrationName} requires CANDIDATE_SHA to be a full lowercase 40-character commit SHA.`
    );
  }

  const approvedSha = environment.BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA;
  if (typeof approvedSha !== "string" || !fullCommitShaPattern.test(approvedSha)) {
    throw new Error(
      `Pending ${migrationName} requires BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA to be a full lowercase 40-character commit SHA.`
    );
  }
  if (approvedSha !== candidateSha) {
    throw new Error(
      `Pending ${migrationName} requires BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA to equal CANDIDATE_SHA exactly.`
    );
  }
};

const runSelfTest = () => {
  const candidateSha = "0123456789abcdef0123456789abcdef01234567";
  const validPendingEnvironment = {
    BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA: candidateSha,
    CANDIDATE_SHA: candidateSha,
    SCIM_WRITES_FROZEN: "true",
  };

  assert.doesNotThrow(() =>
    assertPendingMigrationAttestation({
      environment: validPendingEnvironment,
      migrationApplied: false,
    })
  );
  assert.throws(
    () =>
      assertPendingMigrationAttestation({
        environment: { ...validPendingEnvironment, SCIM_WRITES_FROZEN: "false" },
        migrationApplied: false,
      }),
    /SCIM_WRITES_FROZEN=true/
  );
  assert.throws(
    () =>
      assertPendingMigrationAttestation({
        environment: { ...validPendingEnvironment, CANDIDATE_SHA: "main" },
        migrationApplied: false,
      }),
    /CANDIDATE_SHA to be a full lowercase 40-character commit SHA/
  );
  assert.throws(
    () =>
      assertPendingMigrationAttestation({
        environment: {
          ...validPendingEnvironment,
          BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA:
            "fedcba9876543210fedcba9876543210fedcba98",
        },
        migrationApplied: false,
      }),
    /to equal CANDIDATE_SHA exactly/
  );
  assert.doesNotThrow(() =>
    assertPendingMigrationAttestation({
      environment: {},
      migrationApplied: true,
    })
  );

  assert.doesNotThrow(() =>
    assertMigrationState({ migrationApplied: false, schemaUpgraded: false })
  );
  assert.doesNotThrow(() =>
    assertMigrationState({ migrationApplied: true, schemaUpgraded: true })
  );
  assert.throws(
    () => assertMigrationState({ migrationApplied: true, schemaUpgraded: false }),
    /ledger entry and SCIM schema disagree/
  );
  assert.throws(
    () => assertMigrationState({ migrationApplied: false, schemaUpgraded: true }),
    /ledger entry and SCIM schema disagree/
  );
  const expectedLegacyRows = rowsFromFingerprint(expectedLegacySchema);
  const expectedUpgradeRows = rowsFromFingerprint(expectedUpgradeSchema);
  assert.equal(
    assertUpgradeSchemaFingerprint({
      migrationApplied: true,
      rows: [
        ...expectedUpgradeRows,
        {
          name: "_cf_METADATA",
          sql: "CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY,value BLOB)",
          tbl_name: "_cf_METADATA",
          type: "table",
        },
      ],
    }),
    true
  );
  assert.equal(
    assertUpgradeSchemaFingerprint({
      migrationApplied: false,
      rows: expectedLegacyRows,
    }),
    false
  );
  assert.throws(
    () =>
      assertUpgradeSchemaFingerprint({
        migrationApplied: true,
        rows: expectedUpgradeRows.map((row) =>
          row.type === "table" && row.name === "scimProvider"
            ? { ...row, sql: row.sql.replace(" UNIQUE", "") }
            : row
        ),
      }),
    /schema is partial or drifted/
  );
  assert.throws(
    () =>
      assertUpgradeSchemaFingerprint({
        migrationApplied: false,
        rows: expectedLegacyRows.map((row) =>
          row.type === "table" && row.name === "jwks"
            ? {
                ...row,
                sql: 'CREATE TABLE "jwks" ("id" text NOT NULL PRIMARY KEY)',
              }
            : row
        ),
      }),
    /schema is partial or drifted/
  );
  assert.throws(
    () =>
      assertUpgradeSchemaFingerprint({
        migrationApplied: true,
        rows: [
          ...expectedUpgradeRows,
          {
            name: "bad_jwks_alg",
            sql: 'CREATE UNIQUE INDEX "bad_jwks_alg" ON "jwks" ("alg")',
            tbl_name: "jwks",
            type: "index",
          },
        ],
      }),
    /schema is partial or drifted/
  );
  assert.throws(
    () =>
      assertUpgradeSchemaFingerprint({
        migrationApplied: true,
        rows: [
          ...expectedUpgradeRows,
          {
            name: "scimProvider_legacy_1_6_23",
            sql: 'CREATE TABLE "scimProvider_legacy_1_6_23" ("id" text)',
            tbl_name: "scimProvider_legacy_1_6_23",
            type: "table",
          },
        ],
      }),
    /schema is partial or drifted/
  );
  assert.deepEqual(reservedAccountProviderIds, [
    "credential",
    "email-otp",
    "magic-link",
    "phone-number",
    "anonymous",
    "siwe",
  ]);
  for (const providerId of reservedAccountProviderIds) {
    assert.match(reservedAccountProviderSql, new RegExp(`'${providerId}'`));
  }

  process.stdout.write(
    "PASS  Managed-cloud Better Auth migration-window self-test: " +
      "pending-only freeze and exact-candidate approval gates hold; " +
      "partial or drifted legacy/1.7 full-schema fingerprints fail closed; reserved " +
      "account-provider IDs fail closed; completed migrations do not require " +
      "temporary attestations.\n"
  );
};

const runRemotePreflight = (target) => {
  const wranglerEnvironment = target === "staging" ? ["--env", "staging"] : ["--env="];

  const executeReadOnlySql = (sql) => {
    const result = spawnSync(
      pnpm,
      [
        "--filter",
        "@litemcp/managed-cloud",
        "exec",
        "wrangler",
        "d1",
        "execute",
        "AUTH_DB",
        ...wranglerEnvironment,
        "--remote",
        "--json",
        "--command",
        sql,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
      }
    );
    if (result.status !== 0) {
      process.stderr.write(result.stderr ?? "");
      throw new Error(`Read-only ${target} D1 preflight failed.`);
    }
    let response;
    try {
      response = JSON.parse(result.stdout);
    } catch (error) {
      process.stderr.write(result.stderr ?? "");
      throw new Error(`Wrangler did not return JSON: ${error.message}`);
    }
    if (!Array.isArray(response) || response.some((entry) => entry.success !== true)) {
      throw new Error(`Wrangler reported an unsuccessful ${target} D1 query.`);
    }
    return response.flatMap((entry) => entry.results ?? []);
  };

  const appliedMigrationRows = executeReadOnlySql(`
    SELECT "name"
    FROM "d1_migrations"
    WHERE "name" = '${migrationName}';
  `);
  const migrationApplied = appliedMigrationRows.some(
    ({ name }) => name === migrationName
  );

  const schemaRows = executeReadOnlySql(schemaFingerprintQuery);
  if (
    !schemaRows.some(({ name, type }) => type === "table" && name === "scimProvider")
  ) {
    throw new Error("The remote D1 database has no scimProvider table.");
  }
  const schemaUpgraded = assertUpgradeSchemaFingerprint({
    migrationApplied,
    rows: schemaRows,
  });
  assertPendingMigrationAttestation({
    environment: process.env,
    migrationApplied,
  });

  const commonIssues = `
    SELECT
      'invalid-provider' AS "issue",
      "provider"."id" AS "provider_record_id",
      "provider"."providerId" AS "provider_id",
      "provider"."organizationId" AS "organization_id"
    FROM "scimProvider" AS "provider"
    WHERE
      "provider"."organizationId" IS NULL
      OR length("provider"."organizationId") = 0
      OR length("provider"."providerId") = 0
      OR instr("provider"."providerId", ':') > 0
      OR length("provider"."scimToken") = 0

    UNION ALL

    SELECT
      'missing-organization' AS "issue",
      "provider"."id" AS "provider_record_id",
      "provider"."providerId" AS "provider_id",
      "provider"."organizationId" AS "organization_id"
    FROM "scimProvider" AS "provider"
    WHERE
      "provider"."organizationId" IS NOT NULL
      AND length("provider"."organizationId") > 0
      AND NOT EXISTS (
        SELECT 1
        FROM "organization"
        WHERE "organization"."id" = "provider"."organizationId"
      )

    UNION ALL

    SELECT
      'reserved-account-provider-id' AS "issue",
      "provider"."id" AS "provider_record_id",
      "provider"."providerId" AS "provider_id",
      "provider"."organizationId" AS "organization_id"
    FROM "scimProvider" AS "provider"
    WHERE "provider"."providerId" IN (${reservedAccountProviderSql})

    UNION ALL

    SELECT
      'sso-account-namespace-collision' AS "issue",
      "provider"."id" AS "provider_record_id",
      "provider"."providerId" AS "provider_id",
      "provider"."organizationId" AS "organization_id"
    FROM "scimProvider" AS "provider"
    WHERE EXISTS (
      SELECT 1
      FROM "ssoProvider"
      WHERE
        "ssoProvider"."providerId" = "provider"."providerId"
        OR "ssoProvider"."providerId" =
          'scim:' || "provider"."organizationId" || ':' || "provider"."providerId"
    )
  `;

  const schemaSpecificIssues = schemaUpgraded
    ? `
        UNION ALL

        SELECT
          'provider-key-drift' AS "issue",
          "provider"."id" AS "provider_record_id",
          "provider"."providerId" AS "provider_id",
          "provider"."organizationId" AS "organization_id"
        FROM "scimProvider" AS "provider"
        WHERE "provider"."providerKey" <>
          "provider"."organizationId" || ':' || "provider"."providerId"

        UNION ALL

        SELECT
          'legacy-account-key-after-upgrade' AS "issue",
          "provider"."id" AS "provider_record_id",
          "provider"."providerId" AS "provider_id",
          "provider"."organizationId" AS "organization_id"
        FROM "scimProvider" AS "provider"
        WHERE EXISTS (
          SELECT 1
          FROM "account"
          WHERE "account"."providerId" = "provider"."providerId"
        )
      `
    : `
        UNION ALL

        SELECT
          'destination-account-namespace-collision' AS "issue",
          "provider"."id" AS "provider_record_id",
          "provider"."providerId" AS "provider_id",
          "provider"."organizationId" AS "organization_id"
        FROM "scimProvider" AS "provider"
        WHERE EXISTS (
          SELECT 1
          FROM "account"
          WHERE "account"."providerId" =
            'scim:' || "provider"."organizationId" || ':' || "provider"."providerId"
        )
      `;

  const issues = executeReadOnlySql(`
    ${commonIssues}
    ${schemaSpecificIssues}
    ORDER BY "issue", "provider_record_id";
  `);

  if (issues.length > 0) {
    for (const issue of issues) {
      process.stderr.write(
        `BLOCK ${issue.issue}: provider record ${issue.provider_record_id}, ` +
          `provider ${JSON.stringify(issue.provider_id)}, ` +
          `organization ${JSON.stringify(issue.organization_id)}\n`
      );
    }
    throw new Error(
      `The ${target} Better Auth migration window is blocked by ${issues.length} provider integrity issue(s).`
    );
  }

  if (migrationApplied) {
    process.stdout.write(
      `PASS  Read-only ${target} Better Auth migration-window preflight: ` +
        "the recorded 1.7 migration and schema are internally consistent; " +
        "temporary migration attestations are not required.\n"
    );
    return;
  }

  process.stdout.write(
    `PASS  Read-only ${target} Better Auth migration-window preflight: ` +
      "legacy rows are safe to rekey and the exact-candidate migration attestation is valid; " +
      "keep SCIM/auth writes frozen through migration and application rollout.\n"
  );
};

const options = parseArguments(process.argv.slice(2));
if (options.selfTest) {
  runSelfTest();
} else {
  runRemotePreflight(options.target);
}
