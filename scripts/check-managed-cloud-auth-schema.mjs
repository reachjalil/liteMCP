#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const migrationDirectory = resolve(root, "apps/managed-cloud/migrations");
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();
const migrations = new Map(
  migrationFiles.map((name) => [
    name,
    readFileSync(resolve(migrationDirectory, name), "utf8"),
  ])
);
const auth17MigrationIndex = migrationFiles.findIndex((name) =>
  name.startsWith("0003_better_auth_1_7_scim")
);
if (auth17MigrationIndex === -1) {
  throw new Error("The Better Auth 1.7 forward migration is missing.");
}
const beforeAuth17 = migrationFiles.slice(0, auth17MigrationIndex);
const fromAuth17 = migrationFiles.slice(auth17MigrationIndex);
const reservedAccountProviderIds = [
  "credential",
  "email-otp",
  "magic-link",
  "phone-number",
  "anonymous",
  "siwe",
];

const generatedOutput = execFileSync(
  "pnpm",
  [
    "--filter",
    "@litemcp/managed-cloud",
    "exec",
    "tsx",
    "scripts/print-auth-migration.ts",
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      BETTER_AUTH_SECRET: "schema-check-secret-at-least-32-bytes",
      CREDENTIAL_MASTER_KEY: "schema-check-master-key-at-least-32-bytes",
      SENTRY_DSN: "",
    },
    stdio: ["ignore", "pipe", "inherit"],
  }
);
const generatedStart = generatedOutput.search(/create table/i);
if (generatedStart === -1) {
  throw new Error("Better Auth schema generator did not emit SQL.");
}
const generatedSql = generatedOutput.slice(generatedStart);

function openDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

function apply(database, names = migrationFiles) {
  for (const name of names) database.exec(migrations.get(name));
}

function pragma(database, name, value) {
  const escaped = value.replaceAll("'", "''");
  return database.prepare(`PRAGMA ${name}('${escaped}')`).all();
}

function canonicalSchema(database) {
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map(({ name }) => name);

  return Object.fromEntries(
    tables.map((table) => {
      const columns = pragma(database, "table_info", table).map((column) => ({
        name: column.name,
        type: String(column.type).toLowerCase(),
        notnull: Number(column.notnull),
        default: column.dflt_value,
        primaryKeyPosition: Number(column.pk),
      }));
      const foreignKeys = pragma(database, "foreign_key_list", table)
        .map((foreignKey) => ({
          from: foreignKey.from,
          to: foreignKey.to,
          table: foreignKey.table,
          onUpdate: foreignKey.on_update,
          onDelete: foreignKey.on_delete,
          match: foreignKey.match,
        }))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right))
        );
      const indexes = pragma(database, "index_list", table)
        .map((index) => ({
          name: index.name,
          unique: Number(index.unique),
          origin: index.origin,
          partial: Number(index.partial),
          columns: pragma(database, "index_info", index.name).map(
            (column) => column.name
          ),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
      return [table, { columns, foreignKeys, indexes }];
    })
  );
}

function assertSchemasEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);
  if (actualJson !== expectedJson) {
    process.stderr.write(`Expected schema:\n${expectedJson}\n`);
    process.stderr.write(`Actual ${label} schema:\n${actualJson}\n`);
    throw new Error(`${label} schema differs from Better Auth's generated schema.`);
  }
}

const generated = openDatabase();
generated.exec(generatedSql);
const expectedSchema = canonicalSchema(generated);

const fresh = openDatabase();
apply(fresh);
assertSchemasEqual(canonicalSchema(fresh), expectedSchema, "fresh migration");

const upgrade = openDatabase();
apply(upgrade, beforeAuth17);
upgrade.exec(`
  INSERT INTO "organization" (
    "id", "name", "slug", "createdAt"
  ) VALUES (
    'organization-a', 'Organization A', 'organization-a',
    '2026-01-01T00:00:00.000Z'
  );
  INSERT INTO "user" (
    "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
  ) VALUES (
    'scim-user', 'SCIM User', 'scim@example.test', 1,
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
  );
  INSERT INTO "account" (
    "id", "accountId", "providerId", "userId", "createdAt", "updatedAt"
  ) VALUES (
    'scim-account', 'external-user', 'entra', 'scim-user',
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
  );
  INSERT INTO "scimProvider" (
    "id", "providerId", "scimToken", "organizationId", "userId"
  ) VALUES (
    'legacy-provider', 'entra', 'legacy-token', 'organization-a', 'operator-a'
  );
`);
apply(upgrade, fromAuth17);
const migratedProvider = upgrade
  .prepare('SELECT "providerKey", "organizationId" FROM "scimProvider" WHERE "id" = ?')
  .get("legacy-provider");
if (
  migratedProvider?.providerKey !== "organization-a:entra" ||
  migratedProvider?.organizationId !== "organization-a"
) {
  throw new Error("The 1.6 SCIM provider row was not migrated losslessly.");
}
const migratedAccount = upgrade
  .prepare('SELECT "providerId" FROM "account" WHERE "id" = ?')
  .get("scim-account");
if (migratedAccount?.providerId !== "scim:organization-a:entra") {
  throw new Error("The 1.6 SCIM-managed account was not migrated to its 1.7 key.");
}
assertSchemasEqual(canonicalSchema(upgrade), expectedSchema, "1.6 upgrade");

function assertBlockedUpgrade(label, seedSql, expectedAccount) {
  const blocked = openDatabase();
  apply(blocked, beforeAuth17);
  blocked.exec(seedSql);
  let blockedAsExpected = false;
  try {
    apply(blocked, fromAuth17);
  } catch (error) {
    blockedAsExpected = String(error).includes(
      "legacy_scim_rows_requiring_remediation_must_be_zero"
    );
  }
  if (!blockedAsExpected) {
    throw new Error(`The SCIM migration accepted ${label}.`);
  }
  const blockedColumns = pragma(blocked, "table_info", "scimProvider").map(
    ({ name }) => name
  );
  if (!blockedColumns.includes("userId") || blockedColumns.includes("providerKey")) {
    throw new Error(`The ${label} guard changed the legacy provider table.`);
  }
  if (
    pragma(blocked, "table_info", "jwks").some(({ name }) =>
      ["alg", "crv"].includes(name)
    )
  ) {
    throw new Error(`The ${label} guard partially changed the JWK table.`);
  }
  if (expectedAccount) {
    const actualProviderId = blocked
      .prepare('SELECT "providerId" FROM "account" WHERE "id" = ?')
      .get(expectedAccount.id)?.providerId;
    if (actualProviderId !== expectedAccount.providerId) {
      throw new Error(`The ${label} guard changed a legacy account key.`);
    }
  }
}

assertBlockedUpgrade(
  "an unscoped provider",
  `
    INSERT INTO "user" (
      "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
    ) VALUES (
      'blocked-user', 'Blocked User', 'blocked@example.test', 1,
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO "account" (
      "id", "accountId", "providerId", "userId", "createdAt", "updatedAt"
    ) VALUES (
      'blocked-account', 'blocked-external', 'legacy', 'blocked-user',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO "scimProvider" (
      "id", "providerId", "scimToken", "organizationId", "userId"
    ) VALUES (
      'unscoped-provider', 'legacy', 'unscoped-token', NULL, 'operator-b'
    );
  `,
  { id: "blocked-account", providerId: "legacy" }
);

assertBlockedUpgrade(
  "an empty organization ID accepted as unscoped by 1.6",
  `
    INSERT INTO "scimProvider" (
      "id", "providerId", "scimToken", "organizationId", "userId"
    ) VALUES (
      'empty-organization-provider', 'entra', 'empty-token', '', 'operator-c'
    );
  `
);

assertBlockedUpgrade(
  "a provider whose organization no longer exists",
  `
    INSERT INTO "scimProvider" (
      "id", "providerId", "scimToken", "organizationId", "userId"
    ) VALUES (
      'orphan-provider', 'entra', 'orphan-token', 'missing-organization',
      'operator-d'
    );
  `
);

for (const providerId of reservedAccountProviderIds) {
  assertBlockedUpgrade(
    `a SCIM provider using the reserved Better Auth account provider ID ${providerId}`,
    `
      INSERT INTO "organization" (
        "id", "name", "slug", "createdAt"
      ) VALUES (
        'reserved-${providerId}-organization', 'Reserved Provider Organization',
        'reserved-${providerId}-organization', '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO "user" (
        "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
      ) VALUES (
        'reserved-${providerId}-user', 'Reserved Provider User',
        'reserved-${providerId}@example.test', 1,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO "account" (
        "id", "accountId", "providerId", "userId", "createdAt", "updatedAt"
      ) VALUES (
        'reserved-${providerId}-account', 'reserved-external', '${providerId}',
        'reserved-${providerId}-user', '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO "scimProvider" (
        "id", "providerId", "scimToken", "organizationId", "userId"
      ) VALUES (
        'reserved-${providerId}-provider', '${providerId}',
        'reserved-${providerId}-token', 'reserved-${providerId}-organization',
        'reserved-${providerId}-user'
      );
    `,
    { id: `reserved-${providerId}-account`, providerId }
  );
}

assertBlockedUpgrade(
  "an SSO provider that collides with the 1.7 SCIM account namespace",
  `
    INSERT INTO "organization" (
      "id", "name", "slug", "createdAt"
    ) VALUES (
      'organization-c', 'Organization C', 'organization-c',
      '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO "user" (
      "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
    ) VALUES (
      'sso-owner', 'SSO Owner', 'sso-owner@example.test', 1,
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO "ssoProvider" (
      "id", "issuer", "userId", "providerId", "organizationId", "domain"
    ) VALUES (
      'sso-collision', 'https://idp.example.test', 'sso-owner',
      'scim:organization-c:entra', 'organization-c', 'example.test'
    );
    INSERT INTO "scimProvider" (
      "id", "providerId", "scimToken", "organizationId", "userId"
    ) VALUES (
      'scim-collision', 'entra', 'collision-token', 'organization-c', 'sso-owner'
    );
  `
);

assertBlockedUpgrade(
  "an existing account in the destination SCIM namespace",
  `
    INSERT INTO "organization" (
      "id", "name", "slug", "createdAt"
    ) VALUES (
      'organization-d', 'Organization D', 'organization-d',
      '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO "user" (
      "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
    ) VALUES (
      'destination-user', 'Destination User', 'destination@example.test', 1,
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO "account" (
      "id", "accountId", "providerId", "userId", "createdAt", "updatedAt"
    ) VALUES (
      'destination-account', 'external-user', 'scim:organization-d:entra',
      'destination-user', '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO "scimProvider" (
      "id", "providerId", "scimToken", "organizationId", "userId"
    ) VALUES (
      'destination-provider', 'entra', 'destination-token', 'organization-d',
      'destination-user'
    );
  `,
  { id: "destination-account", providerId: "scim:organization-d:entra" }
);

const whitespaceProvider = openDatabase();
apply(whitespaceProvider, beforeAuth17);
whitespaceProvider.exec(`
  INSERT INTO "organization" (
    "id", "name", "slug", "createdAt"
  ) VALUES (
    'organization-space', 'Organization Space', 'organization-space',
    '2026-01-01T00:00:00.000Z'
  );
  INSERT INTO "user" (
    "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
  ) VALUES (
    'space-user', 'Space User', 'space@example.test', 1,
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
  );
  INSERT INTO "account" (
    "id", "accountId", "providerId", "userId", "createdAt", "updatedAt"
  ) VALUES (
    'space-account', 'space-external', ' entra ', 'space-user',
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
  );
  INSERT INTO "scimProvider" (
    "id", "providerId", "scimToken", "organizationId", "userId"
  ) VALUES (
    'space-provider', ' entra ', 'space-token', 'organization-space', 'space-user'
  );
`);
apply(whitespaceProvider, fromAuth17);
if (
  whitespaceProvider
    .prepare('SELECT "providerKey" FROM "scimProvider" WHERE "id" = ?')
    .get("space-provider")?.providerKey !== "organization-space: entra " ||
  whitespaceProvider
    .prepare('SELECT "providerId" FROM "account" WHERE "id" = ?')
    .get("space-account")?.providerId !== "scim:organization-space: entra "
) {
  throw new Error("The SCIM migration did not preserve a representable provider ID.");
}

process.stdout.write(
  `PASS  Better Auth schema matches ${migrationFiles.length} migrations; ` +
    "supported organization-scoped SCIM providers/accounts preserve behavior, " +
    "and unmappable or colliding rows fail before mutation.\n"
);
