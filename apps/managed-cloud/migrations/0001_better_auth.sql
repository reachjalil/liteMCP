-- Generated from packages/auth using Better Auth 1.6.23. Do not edit by hand;
-- run `pnpm --filter @litemcp/managed-cloud auth:schema` after plugin changes and
-- add a forward-only migration for the resulting schema difference.
CREATE TABLE "user" ("id" text NOT NULL PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL UNIQUE, "emailVerified" integer NOT NULL, "image" text, "createdAt" date NOT NULL, "updatedAt" date NOT NULL, "role" text, "banned" integer, "banReason" text, "banExpires" date, "twoFactorEnabled" integer);
CREATE TABLE "session" ("id" text NOT NULL PRIMARY KEY, "expiresAt" date NOT NULL, "token" text NOT NULL UNIQUE, "createdAt" date NOT NULL, "updatedAt" date NOT NULL, "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "activeOrganizationId" text, "impersonatedBy" text);
CREATE TABLE "account" ("id" text NOT NULL PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date NOT NULL, "updatedAt" date NOT NULL);
CREATE TABLE "verification" ("id" text NOT NULL PRIMARY KEY, "identifier" text NOT NULL, "value" text NOT NULL, "expiresAt" date NOT NULL, "createdAt" date NOT NULL, "updatedAt" date NOT NULL);
CREATE TABLE "organization" ("id" text NOT NULL PRIMARY KEY, "name" text NOT NULL, "slug" text NOT NULL UNIQUE, "logo" text, "createdAt" date NOT NULL, "metadata" text);
CREATE TABLE "member" ("id" text NOT NULL PRIMARY KEY, "organizationId" text NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "role" text NOT NULL, "createdAt" date NOT NULL);
CREATE TABLE "invitation" ("id" text NOT NULL PRIMARY KEY, "organizationId" text NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE, "email" text NOT NULL, "role" text, "status" text NOT NULL, "expiresAt" date NOT NULL, "createdAt" date NOT NULL, "inviterId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE);
CREATE TABLE "twoFactor" ("id" text NOT NULL PRIMARY KEY, "secret" text NOT NULL, "backupCodes" text NOT NULL, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "verified" integer, "failedVerificationCount" integer, "lockedUntil" date);
CREATE TABLE "jwks" ("id" text NOT NULL PRIMARY KEY, "publicKey" text NOT NULL, "privateKey" text NOT NULL, "createdAt" date NOT NULL, "expiresAt" date);
CREATE TABLE "apikey" ("id" text NOT NULL PRIMARY KEY, "configId" text NOT NULL, "name" text, "start" text, "referenceId" text NOT NULL, "prefix" text, "key" text NOT NULL, "refillInterval" integer, "refillAmount" integer, "lastRefillAt" date, "enabled" integer, "rateLimitEnabled" integer, "rateLimitTimeWindow" integer, "rateLimitMax" integer, "requestCount" integer, "remaining" integer, "lastRequest" date, "expiresAt" date, "createdAt" date NOT NULL, "updatedAt" date NOT NULL, "permissions" text, "metadata" text);
CREATE TABLE "ssoProvider" ("id" text NOT NULL PRIMARY KEY, "issuer" text NOT NULL, "oidcConfig" text, "samlConfig" text, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "providerId" text NOT NULL UNIQUE, "organizationId" text, "domain" text NOT NULL);
CREATE TABLE "scimProvider" ("id" text NOT NULL PRIMARY KEY, "providerId" text NOT NULL UNIQUE, "scimToken" text NOT NULL UNIQUE, "organizationId" text, "userId" text);
CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" ("slug");
CREATE INDEX "member_organizationId_idx" ON "member" ("organizationId");
CREATE INDEX "member_userId_idx" ON "member" ("userId");
CREATE INDEX "invitation_organizationId_idx" ON "invitation" ("organizationId");
CREATE INDEX "invitation_email_idx" ON "invitation" ("email");
CREATE INDEX "twoFactor_secret_idx" ON "twoFactor" ("secret");
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" ("userId");
CREATE INDEX "apikey_configId_idx" ON "apikey" ("configId");
CREATE INDEX "apikey_referenceId_idx" ON "apikey" ("referenceId");
CREATE INDEX "apikey_key_idx" ON "apikey" ("key");
