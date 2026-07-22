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
