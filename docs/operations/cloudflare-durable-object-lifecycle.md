# Cloudflare Durable Object lifecycle gate

`wrangler versions upload` cannot create the first Worker deployment and cannot
apply a Durable Object lifecycle change from the legacy `migrations` array.
`wrangler deploy` is therefore a separate, privileged bootstrap/upgrade
operation. It immediately changes the active script and is never a routine
release shortcut. The normal staging and production workflows remain
versions-only and fail before upload unless the active Worker already reports
the final checked-in migration tag and exact internal bindings.

## Required authority and evidence

Run this only from a protected runner or operator workstation with an approved
change record. Require all of the following:

- an exact full commit SHA on `main`, plus the successful CI run ID and attempt
  that built it;
- the matching target-specific `managed-cloud-*.tar.gz` and JSON evidence from
  that CI run;
- reviewed, account-owned KV/D1 IDs, origin, route, and Durable Object bindings;
- a secrets JSON file outside the repository with mode `0600`;
- staging acceptance before the equivalent production lifecycle operation;
- externally enforced ingress maintenance for an existing Worker, plus a real
  SCIM/auth write block for an incompatible D1 transition;
- an explicit rollback/forward-recovery owner. Durable Object lifecycle changes
  cannot be rolled back to a version from before the change.

Inject `CLOUDFLARE_ACCOUNT_ID` and a short-lived lifecycle-only
`CLOUDFLARE_API_TOKEN` from the protected runner's secret store. Never paste or
export the token in shell history. The lifecycle credential necessarily has the
reviewed Worker Scripts lifecycle authority plus read access to the selected KV
and D1 resources; routine workflow deploy tokens must not have that authority.
Use a distinct D1 migration credential when applying D1 migrations.

Before any mutation, complete the qualification and identity commands below.
For production, run the base Wrangler check without
`--require-staging-resource-ids` and use `--identity production`; it validates
the production IDs and rejects resource reuse whenever both targets have IDs. The identity
gate queries the selected account for Worker access and the exact checked-in KV
namespace and D1 database. Stop if the reported account, permission scopes, or
resource names do not match the approved change.

## Qualify and extract the exact CI payload

Set only non-secret values directly. Use absolute paths outside the repository:

```bash
set -euo pipefail
export LITEMCP_REPOSITORY=owner/litemcp
export LITEMCP_CANDIDATE_SHA=0123456789abcdef0123456789abcdef01234567
export LITEMCP_CI_RUN_ID=123456789
export LITEMCP_CI_RUN_ATTEMPT=1
export LITEMCP_LIFECYCLE_TARGET=staging
export LITEMCP_LIFECYCLE_ARTIFACT_DIR=/absolute/new/path/qualified-artifact
export LITEMCP_LIFECYCLE_PAYLOAD=/absolute/new/path/verified-payload
export LITEMCP_LIFECYCLE_SECRETS=/absolute/path/runtime-secrets.json
export LITEMCP_LIFECYCLE_CONFIG=/absolute/new/path/wrangler-lifecycle-staging.json
export LITEMCP_LIFECYCLE_LOG=/absolute/new/path/wrangler-lifecycle-staging.log
export LITEMCP_DEPLOYMENTS_JSON=/absolute/new/path/staging-deployments.json
export LITEMCP_CI_RUN_JSON=/absolute/new/path/qualified-ci-run.json
export LITEMCP_LATEST_CI_JSON=/absolute/new/path/latest-successful-ci.json

# The protected runner injects a read-only GH_TOKEN; never paste it into history.
test -n "${GH_TOKEN:-}"
gh api "repos/$LITEMCP_REPOSITORY/actions/runs/$LITEMCP_CI_RUN_ID" \
  >"$LITEMCP_CI_RUN_JSON"
node scripts/verify-workflow-evidence.mjs ci \
  "$LITEMCP_CI_RUN_JSON" "$LITEMCP_CANDIDATE_SHA" \
  "$LITEMCP_CI_RUN_ID" "$LITEMCP_REPOSITORY" "$LITEMCP_CI_RUN_ATTEMPT"
gh api -X GET \
  "repos/$LITEMCP_REPOSITORY/actions/workflows/ci.yml/runs" \
  -f branch=main -f event=push -f status=success -f per_page=1 \
  >"$LITEMCP_LATEST_CI_JSON"
node scripts/verify-workflow-evidence.mjs latest \
  "$LITEMCP_LATEST_CI_JSON" "$LITEMCP_CANDIDATE_SHA" \
  "$LITEMCP_CI_RUN_ID" "$LITEMCP_CI_RUN_ATTEMPT"
test "$(git rev-parse HEAD)" = "$LITEMCP_CANDIDATE_SHA"
test -z "$(git status --porcelain=v1 --untracked-files=normal)"

LITEMCP_ARTIFACT_NAME="managed-cloud-artifact-${LITEMCP_LIFECYCLE_TARGET}-${LITEMCP_CANDIDATE_SHA}-run-${LITEMCP_CI_RUN_ID}-attempt-${LITEMCP_CI_RUN_ATTEMPT}"
export LITEMCP_ARTIFACT_NAME
mkdir -m 0700 "$LITEMCP_LIFECYCLE_ARTIFACT_DIR"
gh run download "$LITEMCP_CI_RUN_ID" \
  --repo "$LITEMCP_REPOSITORY" \
  --name "$LITEMCP_ARTIFACT_NAME" \
  --dir "$LITEMCP_LIFECYCLE_ARTIFACT_DIR"
LITEMCP_LIFECYCLE_ARCHIVE="$LITEMCP_LIFECYCLE_ARTIFACT_DIR/managed-cloud-${LITEMCP_LIFECYCLE_TARGET}.tar.gz"
LITEMCP_LIFECYCLE_METADATA="$LITEMCP_LIFECYCLE_ARTIFACT_DIR/managed-cloud-${LITEMCP_LIFECYCLE_TARGET}.json"
export LITEMCP_LIFECYCLE_ARCHIVE LITEMCP_LIFECYCLE_METADATA
test -f "$LITEMCP_LIFECYCLE_ARCHIVE"
test -f "$LITEMCP_LIFECYCLE_METADATA"

# The protected runner also injects the short-lived lifecycle credential.
test -n "${CLOUDFLARE_ACCOUNT_ID:-}"
test -n "${CLOUDFLARE_API_TOKEN:-}"
node scripts/check-managed-cloud-wrangler.mjs --require-staging-resource-ids
pnpm managed-cloud:do-lifecycle -- --identity staging
pnpm --filter @litemcp/managed-cloud exec wrangler whoami

LITEMCP_ARCHIVE_SHA256="$(node scripts/verify-managed-cloud-artifact.mjs verify \
  "$LITEMCP_LIFECYCLE_METADATA" "$LITEMCP_LIFECYCLE_ARCHIVE" \
  "$LITEMCP_REPOSITORY" "$LITEMCP_CANDIDATE_SHA" \
  "$LITEMCP_CI_RUN_ID" "$LITEMCP_CI_RUN_ATTEMPT" \
  "$LITEMCP_LIFECYCLE_TARGET")"
export LITEMCP_ARCHIVE_SHA256

mkdir -m 0700 "$LITEMCP_LIFECYCLE_PAYLOAD"
while IFS= read -r entry; do
  case "$entry" in assets/*|worker/*) ;; *) exit 1 ;; esac
  case "/$entry/" in */../*|*/./*) exit 1 ;; esac
done < <(tar -tzf "$LITEMCP_LIFECYCLE_ARCHIVE")
tar --extract --gzip --file "$LITEMCP_LIFECYCLE_ARCHIVE" \
  --directory "$LITEMCP_LIFECYCLE_PAYLOAD" \
  --no-same-owner --no-same-permissions
test -s "$LITEMCP_LIFECYCLE_PAYLOAD/worker/index.js"
test -f "$LITEMCP_LIFECYCLE_PAYLOAD/assets/index.html"

LITEMCP_LIFECYCLE_TAG="lmc-lifecycle-stg-${LITEMCP_CANDIDATE_SHA}-${LITEMCP_CI_RUN_ID}-${LITEMCP_CI_RUN_ATTEMPT}"
export LITEMCP_LIFECYCLE_TAG
node scripts/verify-managed-cloud-artifact.mjs verify-lifecycle-tag \
  "$LITEMCP_LIFECYCLE_TAG" >/dev/null
pnpm managed-cloud:do-lifecycle -- \
  write-config staging "$LITEMCP_LIFECYCLE_CONFIG" "$LITEMCP_CANDIDATE_SHA"
```

For production, use the separately built production archive/evidence, set the
target to `production`, use the `lmc-lifecycle-prod-...` tag prefix, and write a
production lifecycle config. `write-config` fails before creating the file
unless `HEAD` equals the supplied candidate, the working tree/index are clean,
and the selected KV and D1 IDs are canonical, explicit, and isolated.

The generated config is a structurally derived copy of `wrangler.jsonc` with
the selected target's routes empty, preview URLs disabled, and `triggers.crons`
absent. `workers_dev=false` and all lifecycle/binding data remain. Empty routes
make Wrangler skip route/custom-domain reconciliation; an empty `triggers`
object prevents schedule reconciliation. Existing routes and schedules remain
attached to the newly active script, so pause them externally when necessary.
The writer refuses an existing path, relative path, or any path inside the
repository and writes mode `0600`.

## Choose exactly one D1 sequence

### Brand-new target with an empty D1 database

An empty database does not match the migration-window tool's accepted legacy or
upgraded fingerprint. Before the first Worker deploy, use the separate D1
migration credential to apply every checked-in D1 migration to the explicitly
created empty database. Then run the migration-window check and require the
exact upgraded ledger and schema fingerprint. Do not set a write-freeze marker
for a target that has no data or traffic.

```bash
set -euo pipefail
# Protected step injects the D1 migration token as CLOUDFLARE_API_TOKEN.
pnpm --filter @litemcp/managed-cloud db:migrate:staging
pnpm managed-cloud:auth-migration-window -- --env staging
# Protected step restores the short-lived lifecycle token before deploy.
```

Use `db:migrate:remote` and `--env production` for a new production target.

### Existing Worker with a legacy D1 database

Keep external ingress maintenance and the SCIM/auth write block active. Bind the
approval to the exact candidate and run the read-only legacy/upgraded preflight
before changing the Worker:

```bash
set -euo pipefail
export CANDIDATE_SHA="$LITEMCP_CANDIDATE_SHA"
# Protected environment supplies SCIM_WRITES_FROZEN=true and
# BETTER_AUTH_1_7_MIGRATION_APPROVED_SHA equal to CANDIDATE_SHA when 0003 is pending.
pnpm managed-cloud:auth-migration-window -- --env staging
```

Do not continue if the schema is empty, partial, drifted, or disagrees with the
D1 migration ledger.

## Perform and verify the lifecycle deploy

For staging, run the exact prebuilt payload with automatic resource
provisioning disabled. The archive digest is embedded in the Worker version
message and the candidate/run-bound tag is validated above:

```bash
set -euo pipefail
pnpm --filter @litemcp/managed-cloud exec wrangler deploy \
  "$LITEMCP_LIFECYCLE_PAYLOAD/worker/index.js" \
  --config "$LITEMCP_LIFECYCLE_CONFIG" \
  --no-bundle \
  --assets "$LITEMCP_LIFECYCLE_PAYLOAD/assets" \
  --secrets-file "$LITEMCP_LIFECYCLE_SECRETS" \
  --env staging \
  --tag "$LITEMCP_LIFECYCLE_TAG" \
  --message "Lifecycle CI archive sha256:$LITEMCP_ARCHIVE_SHA256" \
  --no-experimental-provision \
  --no-experimental-auto-create \
  --strict 2>&1 | tee "$LITEMCP_LIFECYCLE_LOG"

LITEMCP_WORKER_VERSION_ID="$(node scripts/verify-managed-cloud-artifact.mjs \
  parse-version "$LITEMCP_LIFECYCLE_LOG")"
export LITEMCP_WORKER_VERSION_ID
pnpm --filter @litemcp/managed-cloud exec wrangler deployments list \
  --config "$LITEMCP_LIFECYCLE_CONFIG" --env staging --json \
  >"$LITEMCP_DEPLOYMENTS_JSON"
node scripts/verify-managed-cloud-artifact.mjs verify-deployment \
  "$LITEMCP_DEPLOYMENTS_JSON" "$LITEMCP_WORKER_VERSION_ID" >/dev/null
pnpm managed-cloud:do-lifecycle -- --env staging
```

For production, use `--env=` consistently in the deploy and deployment-list
commands, then run `--env production` only for the repository lifecycle checker.

If this was an existing legacy database and a checked-in D1 migration is still
pending, switch to the distinct migration credential, apply it, and require the
full-schema postflight while maintenance and the write block remain active:

```bash
pnpm --filter @litemcp/managed-cloud db:migrate:staging
pnpm managed-cloud:auth-migration-window -- --env staging
```

Use the production forms for production. A brand-new target already completed
this D1 step before its first Worker deploy and must still rerun the postflight.

## Restore triggers, smoke, and record evidence

Apply the reviewed route/custom-domain and schedule state separately from the
full checked-in config. This is the first ingress attachment for a new target;
for an existing target it is a deliberate reconciliation after lifecycle
verification:

```bash
set -euo pipefail
pnpm --filter @litemcp/managed-cloud exec wrangler triggers deploy --env staging
pnpm managed-cloud:auth-migration-window -- --env staging
./scripts/smoke-managed-cloud.sh
```

Keep maintenance active until the public health/readiness checks and an
authenticated read-only MCP smoke pass through the approved maintenance bypass.
Verify DNS/TLS and the exact origin. Attach non-secret evidence to the approved
change record: repository, candidate SHA, CI run/attempt, target, archive SHA-256,
lifecycle tag, parsed Worker version UUID, 100% deployment verification, remote
migration tag/bindings, D1 ledger/fingerprint, trigger review, smoke results,
operator, timestamps, and the redacted Wrangler permission review. Only then set
the target's resource-ready marker and reopen traffic.

Securely discard the temporary config, payload, logs, and secrets file according
to the operator retention policy. Subsequent releases use only the versions
workflows; each run rechecks the remote migration tag and exact internal
bindings before upload.

## Failure and recovery boundary

Do not assume a failed command rolled the target back. Existing routes and
schedules may already be executing the new script. Keep maintenance in place,
capture the actual Worker version/migration/D1 state, and recover forward with
the same qualified payload. Escalate before any destructive class deletion,
rename, transfer, data restore, or attempt to deploy a pre-migration version.
