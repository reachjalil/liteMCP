# Operations runbook

This runbook is the common operational entry point for the portable Node and
Kubernetes distribution. It supplements, rather than replaces, the dedicated
installation, air-gap, backup/restore, and upgrade/rollback guides.

The current project is pre-1.0. Run a controlled pilot and close every relevant
gap in [`../known-limitations.md`](../known-limitations.md) before production.

## Preflight

1. Choose one immutable application version and image digest.
2. Provision MongoDB as a replica set with authentication, encryption, backup,
   and tested restore.
3. Generate a strong Better Auth secret and store it in the target secret
   manager.
4. Configure exact public, web, callback, and trusted origins.
5. Keep demo mode and unsafe host stdio disabled.
6. Restrict egress to approved upstream MCP/provider endpoints.
7. Render and review all deployment manifests.
8. Define rollback, recovery time, recovery point, and incident ownership.

Run the repository preflight helper where appropriate:

```bash
./scripts/doctor.sh --target kubernetes
```

## Deploy

### Docker Compose evaluation

```bash
docker compose -f deploy/docker-compose/compose.yaml config
pnpm docker:up
```

Use this for a disposable or controlled evaluation. The checked-in stack enables
Mongo client authentication and replica-set keyfile authentication, but uses a
single member and the bootstrap/root account. It has no recorded complete-stack
or restore exercise and is not a production database topology.

### Kubernetes

```bash
helm lint --strict deploy/helm/litemcp
helm template litemcp deploy/helm/litemcp --namespace litemcp > rendered.yaml
helm upgrade --install litemcp deploy/helm/litemcp \
  --namespace litemcp \
  --create-namespace \
  --values values.production.yaml \
  --atomic \
  --wait
```

Use an existing Secret and external production MongoDB unless the target has an
explicitly reviewed alternative. Record the rendered manifest and image digests
with the change ticket.

## Acceptance smoke

Deployment is accepted only after all applicable checks pass:

1. public static page returns the expected release;
2. `/health` returns 200;
3. `/ready` returns 200 only after auth and durable storage are available;
4. Better Auth sign-in completes for the target identity provider;
5. organization and active membership resolve correctly;
6. register or read a known MCP server definition;
7. read a published composition;
8. simulate one allowed and one denied policy decision;
9. issue a short-lived session for the authenticated identity;
10. MCP `initialize`, `tools/list`, and a read-only `tools/call` succeed;
11. a guessed denied tool fails without upstream dispatch;
12. session revocation invalidates the bearer token;
13. audit events correlate by request ID and contain no credential material;
14. a backup and rollback target exist before traffic is expanded.

## Health and readiness

`/health` answers whether the process is responsive and reports storage
capabilities. It is appropriate for liveness.

`/ready` checks whether the deployment can safely accept traffic. Outside demo
mode, it fails when authentication or a durable store is missing and performs a
bounded store read. Route load-balancer traffic using readiness, not health.

Do not weaken readiness to make a rollout turn green. Diagnose the missing
dependency instead.

## Routine checks

At a frequency appropriate to the environment:

- review error rate, latency, timeout, and bounded-response failures;
- review denied, approval-required, and revocation events;
- when Insight is enabled, compare the tenant dashboard with exact `/usage`,
  inspect analytics drop/failure counters, and verify that recent events never
  contain arguments or results;
- confirm Mongo replication, capacity, backup freshness, and restore sampling;
- review IdP/SCIM sync failures and authorization-version lag once implemented;
- validate certificate and provider-secret expiry;
- review upstream DNS/egress changes and allowlists;
- confirm audit retention/export jobs separately from Mongo analytics TTL or
  the managed count-capped feed;
- scan images/dependencies and rebuild from the supported branch;
- exercise one allowed and denied MCP capability from an approved client.

The working tree includes payload-free tenant analytics APIs and six console
views, but they have no deployment, browser, named-client, or load acceptance.
Managed queries read a capped exact feed and do not query Analytics Engine SQL;
the Live view polls and has no WebSocket/SSE transport. OpenTelemetry, configured
alerts, weekly digests, and SIEM export remain absent (O-F is outstanding).
Fixed organization quotas and request-correlated Sentry also have no deployed
alert or capacity evidence. Operators must supply compensating platform
monitoring until those surfaces pass acceptance.

## Backup and restore

Use [`../on-prem/backup-restore.md`](../on-prem/backup-restore.md) and the
checked-in scripts. A useful backup program includes:

- encrypted MongoDB data and required metadata;
- versioned non-secret configuration export;
- secret-manager backup according to the provider's secure procedure;
- image/configuration/migration version evidence;
- restore into an isolated target;
- MCP and authorization smoke after restore;
- measured recovery time and recovery point.

Never place plaintext bearer tokens, provider refresh tokens, or Better Auth
secrets in the portable export.

## Upgrade and rollback

Read [`../on-prem/upgrades-rollbacks.md`](../on-prem/upgrades-rollbacks.md).
Before upgrade:

1. read release and migration notes;
2. take and verify a backup;
3. render the new configuration and diff it;
4. test the exact source and target versions in staging;
5. verify API/MCP compatibility for approved clients;
6. define a rollback point and database compatibility window.

After upgrade, repeat the complete acceptance smoke. Roll back when readiness,
authentication, tenant isolation, policy, session revocation, or audit integrity
is uncertain.

## Incident response

### Suspected session or identity compromise

- revoke the affected session immediately;
- disable or remove the affected membership at the IdP and application layer;
- rotate the relevant application/API credentials;
- preserve correlated audit and infrastructure logs;
- verify that revocation reached every runtime instance;
- note that automatic logout/SCIM/group-change fan-out is not complete today.

### Suspected upstream credential compromise

Connected-account/vault functionality is not implemented in this slice. For
operator-supplied upstream credentials, revoke at the provider, rotate the
secret reference, restart/reload affected workloads, and review egress/audit
evidence. Do not return a provider token to an MCP client.

### Audit integrity uncertainty

- stop sensitive dispatch if pre-dispatch evidence cannot be written;
- preserve database snapshots and application logs;
- compare sequence/hash continuity per tenant;
- verify that the current per-tenant Durable Object audit authority is deployed
  and migrated; its per-document serialization still does not provide a
  transactional outbox or an externally anchored ledger.

### SSRF or unexpected egress

- block the destination at the network boundary;
- disable the affected server definition/composition;
- preserve DNS resolution, Host/SNI, request ID, and route evidence;
- verify every resolved A/AAAA address and redirect behavior;
- rotate any credential exposed to the destination.

## Diagnostics bundle

Collect only what the incident needs:

- release/version and image digest;
- rendered configuration with secrets redacted;
- health/readiness output;
- request IDs and redacted structured logs;
- tenant-scoped audit metadata;
- Mongo/cluster state and events;
- relevant policy/composition versions;
- upstream error class and timing.

Exclude session tokens, cookies, authorization headers, provider credentials,
raw secret values, and sensitive tool payloads.

## Managed cloud operations

The same smoke expectations apply to `apps/managed-cloud`, plus D1 migration,
KV/D1 binding, asset, custom-domain, and rollback checks. A Wrangler dry-run is
build evidence only. Do not record a live release until an authenticated deploy
and smoke suite pass against the deployed URL.

Use the exact-CI-artifact workflows as a promotion chain:

1. CI validates one full main-branch SHA, including Harness convergence,
   production dependency audit, Python SDK tests, workflow policy, local D1
   migration/schema parity, renders, scans, builds, and tests. It builds the
   environment-specific production and staging Worker/static-asset archives
   once without Cloudflare credentials and records each SHA-256 digest.
2. The staging workflow verifies the exact CI run, attempt, and SHA; rejects a
   stale successful run; deploys it; requires public plus authenticated
   read-only MCP smoke; and publishes non-secret evidence tied to the staging
   run attempt.
3. Production is manually dispatched with the same SHA and staging run ID. It
   rejects missing, expired, cross-repository, failed, or mismatched evidence
   before entering the workflow-declared production environment.
4. Mutation runs are serialized and a newer run cannot automatically cancel an
   active run. Manual cancellation and job timeouts remain possible; a schema
   migration is not reversed merely because the application rolls back.

This chain is available only after a separately reviewed Durable Object
lifecycle bootstrap/upgrade. Cloudflare requires `wrangler deploy` for the first
Worker and for a pending legacy `migrations` change; `versions upload` cannot do
either. Apply the exact verified CI archive with secure first-deploy secrets and
full maintenance/write-freeze controls by following
[`cloudflare-durable-object-lifecycle.md`](./cloudflare-durable-object-lifecycle.md).
Both promotion workflows query the active Worker settings and require the final
checked-in migration tag and both bindings before uploading a version.

Staging verifies the archive hash, uploads with `--no-bundle`, parses the Worker
version UUID, deploys that UUID, and confirms it receives 100% of traffic before
writing evidence. Production consumes the separately built production archive
from the same CI run and retains both the staging and production artifact/version
identities. The target archives intentionally differ because public origins and
bindings differ; source SHA plus CI run/attempt binds the pair.

Wrangler `versions upload`/`versions deploy` does not apply routes, custom
domains, or other triggers. Bootstrap and future trigger changes are separate
reviewed mutations: run `wrangler triggers deploy` for the explicit target, then verify account
ownership, DNS/TLS, and the exact configured origin before asserting the
environment's resource-ready marker. The automated workflows intentionally do
not widen their token scope to manage triggers or Durable Object lifecycle.

For an incompatible schema transition, the enforced order is read-only
preflight, verified remote Durable Object lifecycle, inactive Worker upload and
UUID capture, D1 apply, full-schema
postflight, traffic switch to that UUID, route verification, and smoke. This
ensures the deployable application version exists before the database changes;
it does not remove the need for a real maintenance/write freeze.

A lifecycle-changing release is a different boundary because `wrangler deploy`
changes the active Worker immediately and rollback cannot cross the lifecycle
change. Prefer a backward-compatible preparatory release. If an approved
maintenance operation must combine the current lifecycle and D1 transitions,
keep the external write block active and recover forward through D1 postflight
and smoke as described in the lifecycle runbook.

If a run is canceled or times out, treat it as a partial mutation rather than a
rollback. Inspect the D1 migration ledger, rerun the migration-window postflight,
list Worker versions and deployments, and compare the version tag/UUID with the
CI artifact digest. Rerun the workflow with the same candidate; D1 skips recorded
migrations and the workflow creates a new run-attempt-bound Worker version. Do
not upload evidence or expand traffic until the exact version, 100% routing
check, and public/authenticated smoke all pass. If database state and the
migration ledger disagree, stop and restore the reviewed recovery point.

The workflow declaration does not configure GitHub repository controls. Before
enabling mutation, repository administrators must require the `Required checks`
job on `main`, restrict deployment branches, and configure required reviewers
for both managed-cloud environments. The current upstream repository has no
branch rule/ruleset and no environment protection rules, so do not describe its
deployment path as protected yet.

### Better Auth 1.7 SCIM upgrade

Migration `0003_better_auth_1_7_scim.sql` adds the Better Auth 1.7 JWK and SCIM
schema, rekeys providers, and rewrites provisioned account provider IDs. First
prove that the checked-in migrations match the generated schema:

```bash
pnpm managed-cloud:auth-schema:check
```

Exercise the credential-free gate logic in CI, then run the read-only remote
preflight for the exact target before either migration:

```bash
pnpm managed-cloud:auth-migration-window -- --self-test

auth_candidate_sha="$(git rev-parse HEAD)"
SCIM_WRITES_FROZEN=true \
CANDIDATE_SHA="$auth_candidate_sha" \
BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA="$auth_candidate_sha" \
  pnpm managed-cloud:auth-migration-window -- --env staging
```

Use `--env production` for the separately approved production candidate. While
the migration is pending, the preflight accepts only the literal write-freeze
attestation and requires both SHA variables to be the same full lowercase
commit SHA. Once the migration ledger and upgraded schema agree, the temporary
attestations are no longer required. The preflight reports only non-secret
provider and organization identifiers. The D1 migration stops before changing
application tables when a provider is unscoped, has no live owning
organization, has an invalid legacy key/token, uses a reserved Better Auth
account provider ID (`credential`, `email-otp`, `magic-link`, `phone-number`,
`anonymous`, or `siwe`), collides with an SSO provider, or already has accounts
in the destination 1.7 namespace. A reserved ID is ambiguous because 1.6 used
the same plain account namespace for SCIM-managed and built-in authentication
accounts; do not bulk-rekey it. Remediate from trusted ownership evidence, take
a tested backup, and rerun the preflight; never invent a tenant or print
`scimToken`.

`SCIM_WRITES_FROZEN=true` is an operator attestation, not a runtime switch. Block
SCIM/auth writes using the reviewed account/WAF/token/maintenance control and
verify that boundary independently before approving the environment job. Keep
it enforced until the new Worker UUID owns traffic and post-deploy smoke passes.

For the portable MongoDB deployment, run the read-only planner against a restored
staging copy before applying the same data transition:

```bash
MONGODB_URI="$MONGODB_URI" MONGODB_DATABASE=litemcp \
  pnpm --filter @litemcp/server auth:migrate:1.7:check

BETTER_AUTH_MIGRATION_BACKUP_CONFIRMED=true \
BETTER_AUTH_MIGRATION_SCIM_WRITES_FROZEN=true \
MONGODB_URI="$MONGODB_URI" MONGODB_DATABASE=litemcp \
  pnpm --filter @litemcp/server auth:migrate:1.7:apply

MONGODB_URI="$MONGODB_URI" MONGODB_DATABASE=litemcp \
  pnpm --filter @litemcp/server auth:migrate:1.7:check
```

The apply mode requires a replica-set transaction with majority write concern,
an explicit backup confirmation, and an explicit assertion that SCIM writes are
frozen. It records data-rekeyed and complete phases separately, verifies the
exact 1.7 unique indexes, and removes the obsolete globally unique MongoDB
`providerId` index only after the replacement `providerKey` index exists. The
old application cannot read the new organization-scoped SCIM account keys,
while the new application cannot use the old schema. Keep traffic/writes in the
reviewed maintenance state, deploy every application replica immediately, and
treat application-only rollback as unsafe unless the database is restored
through the reviewed recovery plan.

Accounts left behind after a 1.6 SCIM provider connection was deleted cannot be
mapped automatically because the provider-to-organization evidence is gone.
Inventory and remediate that class from trusted historical identity evidence;
do not guess from email, account ID, or a similarly named provider.

Manual dispatch grants mutation authority only; it never waives a failed CI,
staging, security, or acceptance gate.

## Escalation and evidence

Every operational claim should identify:

- target environment and URL/cluster;
- application version and image digest;
- configuration/migration version;
- exact validation commands;
- timestamps and operator;
- redacted smoke results;
- known deviations and rollback status.

Update [`../../IMPLEMENTATION_STATUS.md`](../../IMPLEMENTATION_STATUS.md) only
after reproducible evidence exists.
