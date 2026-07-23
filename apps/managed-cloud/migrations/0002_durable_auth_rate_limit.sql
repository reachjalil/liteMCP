-- Better Auth rate limits must survive Worker isolates and deployments.
-- Generated from rateLimit.storage = "database" in packages/auth.
CREATE TABLE "rateLimit" (
  "id" text NOT NULL PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL
);
