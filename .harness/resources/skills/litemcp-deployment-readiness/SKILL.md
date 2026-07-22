---
name: litemcp-deployment-readiness
description: Qualify or implement LiteMCP deployment changes involving Docker, Docker Compose, Helm, Kubernetes, Cloudflare Wrangler, D1 migrations, environment variables, secrets, health checks, smoke tests, rollout, rollback, or GitHub deployment workflows. Use for files under deploy, managed-cloud deployment configuration and scripts, deploy-related workflows, or server/managed-cloud changes that alter runtime configuration, migrations, secrets, health, smoke, rollout, or rollback behavior.
---

# LiteMCP Deployment Readiness

Turn deployment configuration into reviewable evidence before any external
mutation. Preserve the distinction between the portable self-hosted product,
the public customer-owned Cloudflare reference, and a private operated service.

## Workflow

1. Identify the target, immutable candidate SHA/image digest, runtime, data
   stores, migration set, secrets, public origins, health endpoints, and rollback
   boundary.
2. Read the target README, `docs/operations/runbook.md`,
   `docs/on-prem/installation.md`, `OPEN_CORE.md`, and the relevant workflow.
3. Validate configuration locally before credentials are in scope. Render
   Compose and Helm, run Wrangler isolation and dry runs, and syntax-check edited
   shell scripts.
4. Separate preflight/build from mutation. Disable superseding cancellation,
   serialize mutations per environment, and make every mutation idempotent or
   safely resumable because manual cancellation and runner timeouts remain
   possible.
5. Scope credentials to only the identity, migration, deployment, and
   authenticated-smoke steps that need them. Dependency installation and builds
   do not receive production secrets.
6. Apply migrations in an explicit forward-compatible order. Document whether
   application rollback is safe after each schema step; never imply that an app
   rollback reverses a database migration. For an incompatible transition,
   complete read-only preflight and upload/capture the inactive application
   version before the database mutation, keep a real externally enforced write
   freeze through traffic switch, then require a full-schema postflight.
   Treat a first Cloudflare Worker or pending Durable Object lifecycle change as
   a separate exception: `versions upload` cannot apply it. Require the exact CI
   run/attempt artifact downloaded by its deterministic CI artifact name (an
   arbitrary local archive/metadata pair is not provenance), its verified
   archive digest, canonical checked-in KV/D1 IDs, a credentialed
   account/resource-ownership check, and a generated route/cron-safe config with
   preview URLs and automatic provisioning disabled. Bind `wrangler deploy
   --no-bundle` to the exact candidate/CI attempt with a validated version tag
   and digest message, parse its version UUID, require a 100% deployment check,
   exact internal-binding/migration-tag verification, smoke, and non-secret
   evidence. Use secure first-deploy secrets, externally enforced ingress
   maintenance plus write-freeze controls, and forward recovery across the
   non-rollbackable lifecycle boundary. For a brand-new empty D1, apply all D1
   migrations and verify the upgraded fingerprint before the first Worker;
   only an existing legacy database uses the legacy preflight then post-deploy
   migration sequence.
7. Require public health plus configured authenticated MCP smoke for production.
   The endpoint, token, read-only tool name, and optional arguments form one
   required tuple; an omitted tuple is not production acceptance.
   Record the exact candidate, CI archive SHA-256, uploaded Worker version ID,
   migration IDs, tool versions, target, timestamps, and smoke result as
   non-secret release evidence.
8. Keep production behind a repository-admin-configured environment approval
   and promote the same candidate that passed CI and staging. Verify the remote
   protection exists; a workflow environment name does not create it. Manual
   dispatch does not waive qualification. Treat routes, custom domains, DNS,
   and other triggers as separately scoped mutations when version promotion
   does not manage them; verify their exact target before accepting a
   resource-ready marker.

## Local evidence

Run the applicable commands without remote flags:

```bash
pnpm managed-cloud:wrangler:check
pnpm managed-cloud:auth-schema:check
pnpm managed-cloud:auth-migration-window -- --self-test
pnpm managed-cloud:do-lifecycle -- --self-test
pnpm auth:migrate:mongodb:self-test
node scripts/check-managed-cloud-wrangler.mjs --require-staging-resource-ids
pnpm --filter @litemcp/managed-cloud wrangler:dry-run
pnpm --filter @litemcp/managed-cloud wrangler:dry-run:staging
pnpm --filter @litemcp/managed-cloud db:migrate:local
docker compose --env-file deploy/docker-compose/.env.example -f deploy/docker-compose/compose.yaml config --quiet
helm lint --strict deploy/helm/litemcp
helm template litemcp deploy/helm/litemcp >/dev/null
bash -n scripts/*.sh
pnpm check
```

Run the strict staging-ID check when automated staging or release configuration
is in scope. When Better Auth or D1 schemas change, require generated-schema
parity plus the local D1 migration; when portable auth data changes, exercise
the guarded MongoDB planner. None of these commands authorizes a remote
migration.

When a tool is unavailable locally, report the missing evidence rather than
claiming readiness. Do not substitute placeholder IDs, optional authenticated
smoke, or a green build for target acceptance.

## Mutation boundary

Remote database migration, deployment, rollback, DNS changes, secret writes,
image publication, and GitHub environment changes require explicit user
authorization. Before performing one, restate the exact environment and
immutable revision. Prefer the source-locked workflow over ad hoc local commands,
and verify its remote environment/branch protections before calling it protected.
The conventional managed-cloud deploy scripts intentionally fail closed; the
only manual Worker lifecycle path is the dedicated runbook with a short-lived
credential and an approved change record.
