#!/usr/bin/env node

import { isDeepStrictEqual } from "node:util";
import { MongoClient } from "mongodb";

const migrationId = "better-auth-1.7.0-rc.1-scim-account-keys";
const dataRekeyedPhase = "data-rekeyed";
const completePhase = "complete";
const majorityWriteConcern = { w: "majority" };
const transactionOptions = {
  readConcern: { level: "snapshot" },
  writeConcern: majorityWriteConcern,
  readPreference: "primary",
  maxCommitTimeMS: 60_000,
};
const reservedAccountProviderIds = new Set([
  "credential",
  "email-otp",
  "magic-link",
  "phone-number",
  "anonymous",
  "siwe",
]);

const requiredIndexSpecs = [
  {
    collection: "scimProvider",
    key: { providerKey: 1 },
    name: "providerKey_1",
  },
  {
    collection: "scimProvider",
    key: { scimToken: 1 },
    name: "scimToken_1",
  },
  {
    collection: "scimGroup",
    key: { scimGroupId: 1 },
    name: "scimGroupId_1",
  },
  {
    collection: "scimGroup",
    key: { externalIdKey: 1 },
    name: "externalIdKey_1",
    partialFilterExpression: { externalIdKey: { $type: "string" } },
  },
  {
    collection: "scimGroupMember",
    key: { membershipKey: 1 },
    name: "membershipKey_1",
  },
  {
    collection: "scimGroupRole",
    key: { roleKey: 1 },
    name: "roleKey_1",
  },
  {
    collection: "scimGroupRoleGrant",
    key: { roleGrantKey: 1 },
    name: "roleGrantKey_1",
  },
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const unique = (values) => [...new Set(values)];

export const planScimMigration = (
  providers,
  { requireUniqueProviderIds = true } = {}
) => {
  const providerKeys = new Set();
  const providerIds = new Set();
  const tokens = new Set();
  return providers.map((provider) => {
    const providerId = provider.providerId;
    const organizationId = provider.organizationId;
    assert(
      typeof providerId === "string" &&
        providerId.length > 0 &&
        !providerId.includes(":"),
      `SCIM provider ${String(provider._id)} has an invalid providerId.`
    );
    assert(
      !reservedAccountProviderIds.has(providerId),
      `SCIM provider ${String(provider._id)} uses reserved Better Auth account providerId ${providerId}; separate the account namespaces before upgrading.`
    );
    assert(
      typeof organizationId === "string" && organizationId.length > 0,
      `SCIM provider ${String(provider._id)} has no valid organizationId; assign its owning organization before upgrading.`
    );
    assert(
      typeof provider.scimToken === "string" && provider.scimToken.length > 0,
      `SCIM provider ${String(provider._id)} has no token.`
    );
    const providerKey = `${organizationId}:${providerId}`;
    assert(
      !providerKeys.has(providerKey),
      `Duplicate Better Auth 1.7 SCIM provider key ${providerKey}.`
    );
    if (requireUniqueProviderIds) {
      assert(
        !providerIds.has(providerId),
        `Duplicate legacy SCIM providerId ${providerId}; the 1.6 account mapping is ambiguous.`
      );
    }
    assert(
      !tokens.has(provider.scimToken),
      "Duplicate legacy SCIM tokens must be rotated before upgrading."
    );
    providerKeys.add(providerKey);
    providerIds.add(providerId);
    tokens.add(provider.scimToken);
    return {
      id: provider._id,
      organizationId,
      oldAccountProviderId: providerId,
      newAccountProviderId: `scim:${providerKey}`,
      providerKey,
    };
  });
};

const listIndexes = async (collection) => {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.codeName === "NamespaceNotFound" || error?.code === 26) return [];
    throw error;
  }
};

const exactIndexes = (indexes, key) =>
  indexes.filter((index) => isDeepStrictEqual(index.key, key));

const validateUniqueIndex = (index, spec) => {
  assert(index.unique === true, `Existing index ${index.name} must be unique.`);
  assert(index.sparse !== true, `Existing index ${index.name} must not be sparse.`);
  assert(index.hidden !== true, `Existing index ${index.name} must not be hidden.`);
  if (spec.partialFilterExpression) {
    assert(
      isDeepStrictEqual(index.partialFilterExpression, spec.partialFilterExpression),
      `Existing index ${index.name} must use the reviewed partial filter.`
    );
  } else {
    assert(
      index.partialFilterExpression === undefined,
      `Existing index ${index.name} must not be partial.`
    );
  }
  if (index.collation) {
    assert(
      index.collation.locale === "simple",
      `Existing index ${index.name} must use binary/simple collation.`
    );
  }
};

const inspectRequiredIndex = async (database, spec) => {
  const collection = database.collection(spec.collection);
  const indexes = await listIndexes(collection);
  const matches = exactIndexes(indexes, spec.key);
  assert(
    matches.length <= 1,
    `Collection ${spec.collection} has multiple indexes for ${JSON.stringify(spec.key)}.`
  );
  if (matches.length === 1) {
    validateUniqueIndex(matches[0], spec);
    return true;
  }
  const nameCollision = indexes.find((index) => index.name === spec.name);
  assert(
    !nameCollision,
    `Index name ${spec.name} already refers to ${JSON.stringify(nameCollision?.key)}.`
  );
  return false;
};

const inspectRequiredIndexes = async (database) => {
  const missing = [];
  for (const spec of requiredIndexSpecs) {
    if (!(await inspectRequiredIndex(database, spec))) missing.push(spec.name);
  }
  return missing;
};

const ensureRequiredIndexes = async (database) => {
  for (const spec of requiredIndexSpecs) {
    if (await inspectRequiredIndex(database, spec)) continue;
    await database.collection(spec.collection).createIndex(spec.key, {
      name: spec.name,
      unique: true,
      collation: { locale: "simple" },
      writeConcern: majorityWriteConcern,
      ...(spec.partialFilterExpression
        ? { partialFilterExpression: spec.partialFilterExpression }
        : {}),
    });
    assert(
      await inspectRequiredIndex(database, spec),
      `Index ${spec.name} was not created.`
    );
  }
};

const legacyProviderIdUniqueIndexes = async (database) => {
  const indexes = await listIndexes(database.collection("scimProvider"));
  return exactIndexes(indexes, { providerId: 1 }).filter(
    (index) => index.unique === true
  );
};

const dropLegacyProviderIdUniqueIndexes = async (database) => {
  const collection = database.collection("scimProvider");
  for (const index of await legacyProviderIdUniqueIndexes(database)) {
    await collection.dropIndex(index.name, {
      writeConcern: majorityWriteConcern,
    });
  }
};

const readProviders = (database, session) =>
  database
    .collection("scimProvider")
    .find(
      {},
      {
        projection: {
          providerId: 1,
          organizationId: 1,
          scimToken: 1,
          providerKey: 1,
        },
        ...(session ? { session } : {}),
      }
    )
    .toArray();

const assertOrganizationsExist = async (database, providers, session) => {
  const organizationIds = unique(providers.map((provider) => provider.organizationId));
  if (organizationIds.length === 0) return;
  const organizations = await database
    .collection("organization")
    .find(
      { _id: { $in: organizationIds } },
      {
        projection: { _id: 1 },
        ...(session ? { session } : {}),
      }
    )
    .toArray();
  const existingIds = new Set(organizations.map(({ _id }) => String(_id)));
  const missingIds = organizationIds.filter(
    (organizationId) => !existingIds.has(String(organizationId))
  );
  assert(
    missingIds.length === 0,
    `SCIM providers reference missing organizations: ${missingIds.join(", ")}.`
  );
};

const assertProviderNamespacesSafe = async (
  database,
  plan,
  { allowDestinationAccounts, session }
) => {
  const oldProviderIds = unique(plan.map((item) => item.oldAccountProviderId));
  const newProviderIds = unique(plan.map((item) => item.newAccountProviderId));
  const collidingSsoProviders = await database
    .collection("ssoProvider")
    .find(
      { providerId: { $in: unique([...oldProviderIds, ...newProviderIds]) } },
      {
        projection: { providerId: 1 },
        ...(session ? { session } : {}),
      }
    )
    .toArray();
  assert(
    collidingSsoProviders.length === 0,
    `SSO provider namespace collides with SCIM migration: ${unique(
      collidingSsoProviders.map(({ providerId }) => providerId)
    ).join(", ")}.`
  );
  if (!allowDestinationAccounts && newProviderIds.length > 0) {
    const destinationAccounts = await database
      .collection("account")
      .countDocuments(
        { providerId: { $in: newProviderIds } },
        session ? { session } : undefined
      );
    assert(
      destinationAccounts === 0,
      "Accounts already exist in the Better Auth 1.7 SCIM namespace; reconcile the partial or colliding state before upgrading."
    );
  }
};

const countLegacyAccounts = async (database, plan, session) => {
  const providerIds = unique(plan.map((item) => item.oldAccountProviderId));
  if (providerIds.length === 0) return 0;
  return database
    .collection("account")
    .countDocuments(
      { providerId: { $in: providerIds } },
      session ? { session } : undefined
    );
};

const countPendingProviders = (providers, plan) => {
  const providerKeysById = new Map(
    providers.map((provider) => [String(provider._id), provider.providerKey])
  );
  return plan.filter(
    ({ id, providerKey }) => providerKeysById.get(String(id)) !== providerKey
  ).length;
};

const readMarker = (database, session) =>
  database
    .collection("litemcpMigration")
    .findOne({ _id: migrationId }, session ? { session } : undefined);

const markerPhase = (marker) => {
  if (!marker) return null;
  assert(
    [dataRekeyedPhase, completePhase].includes(marker.phase),
    `Migration marker ${migrationId} has unknown phase ${String(marker.phase)}.`
  );
  return marker.phase;
};

const inspectMigrationState = async (database) => {
  const marker = await readMarker(database);
  const phase = markerPhase(marker);
  const providers = await readProviders(database);
  const plan = planScimMigration(providers, {
    requireUniqueProviderIds: phase === null,
  });
  await assertOrganizationsExist(database, providers);
  await assertProviderNamespacesSafe(database, plan, {
    allowDestinationAccounts: phase !== null,
  });
  const pendingAccounts = await countLegacyAccounts(database, plan);
  const pendingProviders = countPendingProviders(providers, plan);
  const missingIndexes = await inspectRequiredIndexes(database);
  const legacyUniqueIndexes = await legacyProviderIdUniqueIndexes(database);
  return {
    phase,
    providers,
    plan,
    pendingAccounts,
    pendingProviders,
    missingIndexes,
    legacyUniqueIndexes,
  };
};

const assertCompleteState = (state) => {
  assert(state.phase === completePhase, "The MongoDB migration is not complete.");
  assert(
    state.pendingProviders === 0,
    "The completed Better Auth migration marker conflicts with provider data."
  );
  assert(
    state.pendingAccounts === 0,
    "The completed Better Auth migration marker conflicts with legacy account keys."
  );
  assert(
    state.missingIndexes.length === 0,
    `The completed Better Auth migration is missing indexes: ${state.missingIndexes.join(", ")}.`
  );
  assert(
    state.legacyUniqueIndexes.length === 0,
    "The obsolete unique scimProvider.providerId index still blocks multi-organization providers."
  );
};

const selfTest = () => {
  const plan = planScimMigration([
    {
      _id: "provider-a",
      providerId: " entra ",
      organizationId: "organization-a",
      scimToken: "token-a",
    },
  ]);
  assert(
    plan[0]?.providerKey === "organization-a: entra ",
    "Representable provider whitespace drifted."
  );
  assert(
    plan[0]?.newAccountProviderId === "scim:organization-a: entra ",
    "Account provider key drifted."
  );

  const duplicateProviders = [
    {
      _id: "one",
      providerId: "duplicate",
      organizationId: "organization-a",
      scimToken: "one",
    },
    {
      _id: "two",
      providerId: "duplicate",
      organizationId: "organization-b",
      scimToken: "two",
    },
  ];
  let duplicateRejected = false;
  try {
    planScimMigration(duplicateProviders);
  } catch {
    duplicateRejected = true;
  }
  assert(duplicateRejected, "Legacy duplicate provider IDs were accepted.");
  assert(
    planScimMigration(duplicateProviders, { requireUniqueProviderIds: false })
      .length === 2,
    "Valid post-migration multi-organization provider IDs were rejected."
  );

  for (const provider of [
    {
      _id: "unscoped",
      providerId: "legacy",
      organizationId: null,
      scimToken: "token",
    },
    {
      _id: "empty-organization",
      providerId: "legacy",
      organizationId: "",
      scimToken: "token",
    },
    {
      _id: "colon-provider",
      providerId: "invalid:provider",
      organizationId: "organization-a",
      scimToken: "token",
    },
    ...[...reservedAccountProviderIds].map((providerId) => ({
      _id: `reserved-${providerId}`,
      providerId,
      organizationId: "organization-a",
      scimToken: `token-${providerId}`,
    })),
  ]) {
    let rejected = false;
    try {
      planScimMigration([provider]);
    } catch {
      rejected = true;
    }
    assert(rejected, "MongoDB migration self-test accepted unsafe legacy data.");
  }

  assert(
    exactIndexes([{ name: "compound", key: { providerKey: 1, extra: 1 } }], {
      providerKey: 1,
    }).length === 0,
    "A compound index was mistaken for single-field uniqueness."
  );
  let partialMismatchRejected = false;
  try {
    validateUniqueIndex(
      {
        name: "externalIdKey_1",
        key: { externalIdKey: 1 },
        unique: true,
      },
      requiredIndexSpecs.find((spec) => spec.name === "externalIdKey_1")
    );
  } catch {
    partialMismatchRejected = true;
  }
  assert(partialMismatchRejected, "An unsafe optional-field unique index passed.");
  process.stdout.write("PASS  Better Auth MongoDB SCIM migration self-test\n");
};

const runDataRekey = async (client, database) => {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const existingMarker = await readMarker(database, session);
      const phase = markerPhase(existingMarker);
      if (phase === completePhase) return;

      const providers = await readProviders(database, session);
      let plan = planScimMigration(providers, {
        requireUniqueProviderIds: phase === null,
      });
      await assertOrganizationsExist(database, providers, session);
      await assertProviderNamespacesSafe(database, plan, {
        allowDestinationAccounts: phase !== null,
        session,
      });
      const legacyAccounts = await countLegacyAccounts(database, plan, session);
      if (legacyAccounts > 0 && phase !== null) {
        plan = planScimMigration(providers, { requireUniqueProviderIds: true });
      }

      for (const item of plan) {
        await database
          .collection("account")
          .updateMany(
            { providerId: item.oldAccountProviderId },
            { $set: { providerId: item.newAccountProviderId } },
            { session }
          );
        await database
          .collection("scimProvider")
          .updateOne(
            { _id: item.id },
            { $set: { providerKey: item.providerKey } },
            { session }
          );
      }
      await database.collection("litemcpMigration").updateOne(
        { _id: migrationId },
        {
          $set: {
            phase: dataRekeyedPhase,
            dataRekeyedAt: new Date(),
            providerCount: plan.length,
          },
          $setOnInsert: { startedAt: new Date() },
        },
        { upsert: true, session }
      );
    }, transactionOptions);
  } finally {
    await session.endSession();
  }
};

const markComplete = async (client, database) => {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const marker = await readMarker(database, session);
      assert(
        markerPhase(marker) === dataRekeyedPhase,
        "The data-rekey marker is missing before completion."
      );
      const providers = await readProviders(database, session);
      const plan = planScimMigration(providers, {
        requireUniqueProviderIds: false,
      });
      await assertOrganizationsExist(database, providers, session);
      await assertProviderNamespacesSafe(database, plan, {
        allowDestinationAccounts: true,
        session,
      });
      assert(
        countPendingProviders(providers, plan) === 0,
        "Provider keys changed before migration completion."
      );
      assert(
        (await countLegacyAccounts(database, plan, session)) === 0,
        "Legacy SCIM account keys appeared before migration completion."
      );
      await database.collection("litemcpMigration").updateOne(
        { _id: migrationId, phase: dataRekeyedPhase },
        {
          $set: {
            phase: completePhase,
            completedAt: new Date(),
            providerCount: plan.length,
          },
        },
        { session }
      );
    }, transactionOptions);
  } finally {
    await session.endSession();
  }
};

const run = async (mode) => {
  if (mode === "--self-test") {
    selfTest();
    return;
  }
  assert(
    ["check", "apply"].includes(mode),
    "Mode must be check, apply, or --self-test."
  );
  const uri = process.env.MONGODB_URI?.trim();
  assert(uri, "MONGODB_URI is required.");
  const databaseName = process.env.MONGODB_DATABASE?.trim() || "litemcp";
  if (mode === "apply") {
    assert(
      process.env.BETTER_AUTH_MIGRATION_BACKUP_CONFIRMED === "true",
      "Set BETTER_AUTH_MIGRATION_BACKUP_CONFIRMED=true only after recording a tested backup."
    );
    assert(
      process.env.BETTER_AUTH_MIGRATION_SCIM_WRITES_FROZEN === "true",
      "Set BETTER_AUTH_MIGRATION_SCIM_WRITES_FROZEN=true only while all SCIM writes are blocked."
    );
  }

  const client = new MongoClient(uri, {
    appName: `litemcp-${migrationId}`,
    serverSelectionTimeoutMS: 10_000,
    writeConcern: majorityWriteConcern,
  });
  try {
    await client.connect();
    const database = client.db(databaseName);
    const initial = await inspectMigrationState(database);

    if (mode === "check") {
      if (initial.phase === completePhase) {
        assertCompleteState(initial);
        process.stdout.write(
          `PASS  MongoDB Better Auth migration is complete: ${initial.plan.length} providers, exact indexes, and no legacy account keys.\n`
        );
        return;
      }
      assert(
        initial.phase === null,
        "MongoDB Better Auth migration stopped after data rekeying; keep writes frozen and rerun apply to finish indexes and the completion marker."
      );
      process.stdout.write(
        `PASS  MongoDB Better Auth upgrade preflight: ${initial.plan.length} providers, ` +
          `${initial.pendingProviders} provider keys, ${initial.pendingAccounts} account keys, ` +
          `${initial.missingIndexes.length} indexes, and ${initial.legacyUniqueIndexes.length} obsolete unique providerId indexes pending.\n`
      );
      return;
    }

    if (initial.phase !== completePhase) {
      await runDataRekey(client, database);
      await ensureRequiredIndexes(database);
      await dropLegacyProviderIdUniqueIndexes(database);
      const beforeComplete = await inspectMigrationState(database);
      if (beforeComplete.phase === completePhase) {
        assertCompleteState(beforeComplete);
      } else {
        assert(
          beforeComplete.phase === dataRekeyedPhase &&
            beforeComplete.pendingProviders === 0 &&
            beforeComplete.pendingAccounts === 0 &&
            beforeComplete.missingIndexes.length === 0 &&
            beforeComplete.legacyUniqueIndexes.length === 0,
          "MongoDB Better Auth migration postflight is incomplete."
        );
        await markComplete(client, database);
      }
    }

    const completed = await inspectMigrationState(database);
    assertCompleteState(completed);
    process.stdout.write(
      `PASS  Applied ${migrationId}: ${completed.plan.length} providers, ` +
        "zero legacy account keys, exact Better Auth 1.7 indexes, and the obsolete providerId uniqueness removed.\n"
    );
  } finally {
    await client.close();
  }
};

await run(process.argv[2] ?? "check");
