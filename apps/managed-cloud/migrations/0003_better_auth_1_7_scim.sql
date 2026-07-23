-- Forward-only Better Auth 1.6.23 -> 1.7.0-rc.1 schema migration.
--
-- Runtime-managed SCIM providers are organization-scoped in 1.7. A legacy
-- provider without a live owning organization, one that uses a built-in Better
-- Auth account provider ID, or one whose old account namespace already collides
-- with SSO/1.7 state has no behavior-preserving automatic mapping. The guard
-- intentionally fails before changing application tables; inventory and
-- remediate those rows according to the operations runbook. Provider IDs
-- containing representable whitespace are preserved.
DROP TABLE IF EXISTS "_migration_0003_scim_integrity_guard";
CREATE TABLE "_migration_0003_scim_integrity_guard" (
  "legacy_scim_rows_requiring_remediation_must_be_zero" integer NOT NULL
    CHECK ("legacy_scim_rows_requiring_remediation_must_be_zero" = 0)
);
INSERT INTO "_migration_0003_scim_integrity_guard" (
  "legacy_scim_rows_requiring_remediation_must_be_zero"
)
SELECT
  (
    SELECT COUNT(*)
    FROM "scimProvider" AS "provider"
    WHERE
      "provider"."organizationId" IS NULL
      OR length("provider"."organizationId") = 0
      OR length("provider"."providerId") = 0
      OR instr("provider"."providerId", ':') > 0
      OR "provider"."providerId" IN (
        'credential',
        'email-otp',
        'magic-link',
        'phone-number',
        'anonymous',
        'siwe'
      )
      OR length("provider"."scimToken") = 0
      OR NOT EXISTS (
        SELECT 1
        FROM "organization"
        WHERE "organization"."id" = "provider"."organizationId"
      )
  )
  + (
    SELECT COUNT(*)
    FROM "scimProvider" AS "provider"
    WHERE EXISTS (
      SELECT 1
      FROM "ssoProvider"
      WHERE
        "ssoProvider"."providerId" = "provider"."providerId"
        OR "ssoProvider"."providerId" =
          'scim:' || "provider"."organizationId" || ':' || "provider"."providerId"
    )
  )
  + (
    SELECT COUNT(*)
    FROM "scimProvider" AS "provider"
    WHERE EXISTS (
      SELECT 1
      FROM "account"
      WHERE "account"."providerId" =
        'scim:' || "provider"."organizationId" || ':' || "provider"."providerId"
    )
  );
DROP TABLE "_migration_0003_scim_integrity_guard";

ALTER TABLE "jwks" ADD COLUMN "alg" text;
ALTER TABLE "jwks" ADD COLUMN "crv" text;

ALTER TABLE "scimProvider" RENAME TO "scimProvider_legacy_1_6_23";
CREATE TABLE "scimProvider" (
  "id" text NOT NULL PRIMARY KEY,
  "providerId" text NOT NULL,
  "providerKey" text NOT NULL UNIQUE,
  "scimToken" text NOT NULL UNIQUE,
  "organizationId" text NOT NULL
);
INSERT INTO "scimProvider" (
  "id",
  "providerId",
  "providerKey",
  "scimToken",
  "organizationId"
)
SELECT
  "id",
  "providerId",
  "organizationId" || ':' || "providerId",
  "scimToken",
  "organizationId"
FROM "scimProvider_legacy_1_6_23";

-- Better Auth 1.6 stored SCIM-managed accounts under the plain provider ID.
-- Version 1.7 isolates those accounts by organization and provider. The old
-- provider ID collision checks make this join unambiguous for valid 1.6 data.
UPDATE "account"
SET "providerId" = 'scim:' || (
  SELECT
    "organizationId" || ':' || "providerId"
  FROM "scimProvider_legacy_1_6_23"
  WHERE "scimProvider_legacy_1_6_23"."providerId" = "account"."providerId"
)
WHERE EXISTS (
  SELECT 1
  FROM "scimProvider_legacy_1_6_23"
  WHERE "scimProvider_legacy_1_6_23"."providerId" = "account"."providerId"
);
DROP TABLE "scimProvider_legacy_1_6_23";

CREATE TABLE "scimGroup" (
  "id" text NOT NULL PRIMARY KEY,
  "providerId" text NOT NULL,
  "organizationId" text NOT NULL,
  "scimGroupId" text NOT NULL UNIQUE,
  "externalId" text,
  "externalIdKey" text UNIQUE,
  "displayName" text NOT NULL,
  "createdAt" date NOT NULL,
  "updatedAt" date
);
CREATE TABLE "scimGroupMember" (
  "id" text NOT NULL PRIMARY KEY,
  "groupId" text NOT NULL REFERENCES "scimGroup" ("id") ON DELETE CASCADE,
  "providerId" text NOT NULL,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "membershipKey" text NOT NULL UNIQUE,
  "createdAt" date NOT NULL
);
CREATE TABLE "scimGroupRole" (
  "id" text NOT NULL PRIMARY KEY,
  "groupId" text NOT NULL REFERENCES "scimGroup" ("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "roleKey" text NOT NULL UNIQUE,
  "createdAt" date NOT NULL
);
CREATE TABLE "scimGroupRoleGrant" (
  "id" text NOT NULL PRIMARY KEY,
  "groupId" text NOT NULL REFERENCES "scimGroup" ("id") ON DELETE CASCADE,
  "providerId" text NOT NULL,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "roleGrantKey" text NOT NULL UNIQUE,
  "isRoleProjected" integer NOT NULL,
  "createdAt" date NOT NULL
);
