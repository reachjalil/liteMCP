#!/usr/bin/env bash

set -euo pipefail
umask 077

target=${1:-}
destination=${2:-}

if [[ "$target" != "production" && "$target" != "staging" ]]; then
  printf 'Usage: build-managed-cloud-artifact.sh production|staging DESTINATION\n' >&2
  exit 2
fi
if [[ -z "$destination" || -e "$destination" ]]; then
  printf 'Artifact destination must be a new, explicit directory.\n' >&2
  exit 2
fi
for required in GITHUB_REPOSITORY GITHUB_SHA GITHUB_RUN_ID GITHUB_RUN_ATTEMPT; do
  if [[ -z "${!required:-}" ]]; then
    printf '%s is required.\n' "$required" >&2
    exit 2
  fi
done
if [[ ! "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'GITHUB_SHA must be a lowercase full commit SHA.\n' >&2
  exit 2
fi

mkdir -p "$destination/payload/assets" "$destination/payload/worker"

if [[ "$target" == "production" ]]; then
  pnpm --filter @litemcp/managed-cloud build:web
  wrangler_environment=(--env=)
else
  pnpm --filter @litemcp/managed-cloud build:web:staging
  wrangler_environment=(--env staging)
fi

pnpm --filter @litemcp/managed-cloud exec wrangler deploy \
  --dry-run \
  "${wrangler_environment[@]}" \
  --outdir "$destination/payload/worker"

test -s "$destination/payload/worker/index.js"
test -f apps/web/dist/index.html
cp -R apps/web/dist/. "$destination/payload/assets/"

if find "$destination/payload" -type l -print -quit | grep -q .; then
  printf 'Managed-cloud artifact payload must not contain symbolic links.\n' >&2
  exit 1
fi
if find "$destination/payload" ! -type f ! -type d -print -quit | grep -q .; then
  printf 'Managed-cloud artifact payload must contain only regular files and directories.\n' >&2
  exit 1
fi

archive="$destination/managed-cloud-$target.tar.gz"
metadata="$destination/managed-cloud-$target.json"

gnu_tar=()
for candidate in tar gtar; do
  if command -v "$candidate" >/dev/null 2>&1 &&
    "$candidate" --version 2>&1 | grep -q 'GNU tar'; then
    gnu_tar=("$candidate")
    break
  fi
done
if (( ${#gnu_tar[@]} == 0 )); then
  printf 'GNU tar is required to build deterministic managed-cloud archives. Install gtar or run this builder on the pinned CI runner.\n' >&2
  exit 1
fi

"${gnu_tar[@]}" \
  --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -C "$destination/payload" \
  -cf - assets worker | gzip -n >"$archive"

node scripts/verify-managed-cloud-artifact.mjs write \
  "$metadata" \
  "$archive" \
  "$GITHUB_REPOSITORY" \
  "$GITHUB_SHA" \
  "$GITHUB_RUN_ID" \
  "$GITHUB_RUN_ATTEMPT" \
  "$target"

node scripts/verify-managed-cloud-artifact.mjs verify \
  "$metadata" \
  "$archive" \
  "$GITHUB_REPOSITORY" \
  "$GITHUB_SHA" \
  "$GITHUB_RUN_ID" \
  "$GITHUB_RUN_ATTEMPT" \
  "$target" >/dev/null

printf 'PASS  built managed-cloud %s archive from CI run %s attempt %s\n' \
  "$target" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT"
