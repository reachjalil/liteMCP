# Upgrades and rollbacks

Treat a LiteMCP Composer upgrade as a coordinated change to the server, static web
console, configuration schema, identity behavior, and storage compatibility.
Use immutable release versions for both images and keep the chart, images,
SBOMs, release notes, and source revision together.

## Before upgrading

1. Read release notes for breaking API, MCP protocol, authentication, policy,
   and data-model changes.
2. Confirm the target release supports the installed MongoDB and Kubernetes
   versions.
3. Run the full upgrade in a staging environment using a sanitized production
   configuration export.
4. Take and verify a fresh backup as described in
   [backup and restore](backup-restore.md).
5. Record current image digests, Helm revision, values, replica counts, and
   Secret key versions.
6. Define success metrics, observation duration, rollback owner, and the last
   safe rollback point.

Database changes need explicit forward- and backward-compatibility notes. Do
not assume that rolling back an application image reverses a database change.
If release notes do not state that the previous server can read the upgraded
schema, treat application rollback as unsafe until tested.

## Helm upgrade

Render and review the exact release first:

```bash
helm lint deploy/helm/litemcp
helm template litemcp deploy/helm/litemcp \
  --namespace litemcp \
  --values /secure/path/litemcp-values.yaml > /tmp/litemcp-rendered.yaml
```

Apply with an atomic timeout:

```bash
helm upgrade litemcp deploy/helm/litemcp \
  --namespace litemcp \
  --values /secure/path/litemcp-values.yaml \
  --atomic \
  --wait \
  --timeout 10m
```

Observe rollout status, restarts, readiness, error rate, authentication
failures, policy denials, MongoDB latency, and invocation outcomes. Test server
`/health`, web sign-in, MCP discovery, a policy denial, and one approved
read-only invocation before closing the change.

## Helm rollback

List revisions and inspect the candidate before rolling back:

```bash
helm -n litemcp history litemcp
helm -n litemcp get values litemcp --revision REVISION
helm -n litemcp rollback litemcp REVISION --wait --timeout 10m
```

Rollback changes Kubernetes resources, not external MongoDB data, identity
provider configuration, vault keys, or manually changed Secrets. If the new
release wrote an incompatible schema, follow the release-specific data rollback
plan or restore into a separately validated database. Do not automatically
restore an older backup over healthy new data.

## Docker Compose upgrade

Pin `LITEMCP_VERSION` in `deploy/docker-compose/.env`, take a backup, and then:

```bash
docker compose \
  --env-file deploy/docker-compose/.env \
  -f deploy/docker-compose/compose.yaml \
  pull server web

docker compose \
  --env-file deploy/docker-compose/.env \
  -f deploy/docker-compose/compose.yaml \
  up --detach --no-deps server web
```

For a source build, use `up --build --detach` only from a clean, reviewed source
revision with a matching lockfile. Do not use a moving `latest` tag in a
controlled environment.

To roll back, restore the prior immutable image version in `.env` and recreate
the two application services. Roll back MongoDB data only when a documented,
tested incompatibility requires it.

## Secret and identity changes

Do not rotate `BETTER_AUTH_SECRET`, MongoDB credentials, OAuth client secrets,
and application images in one undifferentiated change. Each rotation needs its
own verification and rollback procedure. Better Auth secret rotation may
invalidate sessions; communicate that effect and test recovery and break-glass
access.

For SAML/OIDC or SCIM changes, preserve the old signing key or client secret
during the overlap window when the provider supports it. Verify issuer,
audience, redirect URI, domain discovery, group mapping, deprovisioning, and
clock skew before removing the previous configuration.

## Emergency rollback criteria

Initiate rollback or traffic isolation when any of these occur:

- cross-tenant authorization or data isolation failure;
- credential disclosure or signature-validation regression;
- sustained authentication failure with no break-glass access;
- corrupt configuration writes or connector-build substitution;
- unacceptable MCP error rate or inability to enforce policy;
- MongoDB migration failure or replication instability.

Preserve logs, traces, rendered manifests, image digests, and the affected
release for incident review. Never include plaintext tokens or tool payloads in
the incident bundle by default.
