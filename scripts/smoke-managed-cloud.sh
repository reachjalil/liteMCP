#!/usr/bin/env bash

set -euo pipefail

BASE_URL=${MANAGED_CLOUD_URL:-}

if [[ -z "$BASE_URL" ]]; then
  printf 'MANAGED_CLOUD_URL is required.\n' >&2
  exit 2
fi

case "$BASE_URL" in
  https://*) ;;
  *)
    printf 'MANAGED_CLOUD_URL must be an HTTPS origin.\n' >&2
    exit 2
    ;;
esac

BASE_URL=${BASE_URL%/}
SMOKE_DIR=$(mktemp -d)

cleanup() {
  rm -rf -- "$SMOKE_DIR"
}
trap cleanup EXIT INT TERM

request() {
  local path=$1
  local output=$2
  curl \
    --fail-with-body \
    --silent \
    --show-error \
    --retry 4 \
    --retry-all-errors \
    --retry-delay 2 \
    --connect-timeout 10 \
    --max-time 30 \
    "${BASE_URL}${path}" \
    --output "$output"
}

request / "$SMOKE_DIR/site.html"
request /health "$SMOKE_DIR/health.json"
request /ready "$SMOKE_DIR/ready.json"

node --input-type=module - "$SMOKE_DIR" <<'NODE'
import { readFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.argv[2];
const site = readFileSync(join(directory, "site.html"), "utf8");
if (!site.includes("LiteMCP Composer")) {
  throw new Error("The deployed root did not identify LiteMCP Composer.");
}

const health = JSON.parse(readFileSync(join(directory, "health.json"), "utf8"));
if (health.status !== "ok") {
  throw new Error(`Unexpected health status: ${JSON.stringify(health)}`);
}

const ready = JSON.parse(readFileSync(join(directory, "ready.json"), "utf8"));
if (ready.status !== "ready") {
  throw new Error(`Unexpected readiness status: ${JSON.stringify(ready)}`);
}
NODE

printf 'PASS  static site, health, and readiness at %s\n' "$BASE_URL"
printf '%s\n' \
  'NOTE  Authenticated identity, session issue, MCP initialize/list/call, audit correlation, and rollback still require the release acceptance runbook.'
