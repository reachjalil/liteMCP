#!/usr/bin/env bash

set -euo pipefail
umask 077

BASE_URL=${MANAGED_CLOUD_URL:-}
MCP_ENDPOINT=${MANAGED_CLOUD_MCP_ENDPOINT:-}
MCP_TOKEN=${MANAGED_CLOUD_MCP_TOKEN:-}
MCP_TOOL_NAME=${MANAGED_CLOUD_MCP_TOOL_NAME:-}

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

if [[ -n "$MCP_ENDPOINT" || -n "$MCP_TOKEN" || -n "$MCP_TOOL_NAME" ]]; then
  if [[ -z "$MCP_ENDPOINT" || -z "$MCP_TOKEN" || -z "$MCP_TOOL_NAME" ]]; then
    printf '%s\n' \
      'MANAGED_CLOUD_MCP_ENDPOINT, MANAGED_CLOUD_MCP_TOKEN, and MANAGED_CLOUD_MCP_TOOL_NAME must be provided together.' >&2
    exit 2
  fi
  if [[ "$MCP_TOKEN" == *$'\n'* || "$MCP_TOKEN" == *$'\r'* ]]; then
    printf 'MANAGED_CLOUD_MCP_TOKEN cannot contain line breaks.\n' >&2
    exit 2
  fi
  node --input-type=module - "$BASE_URL" "$MCP_ENDPOINT" <<'NODE'
const base = new URL(process.argv[2]);
const endpoint = new URL(process.argv[3]);
if (endpoint.protocol !== "https:") {
  throw new Error("MANAGED_CLOUD_MCP_ENDPOINT must use HTTPS.");
}
if (endpoint.origin !== base.origin) {
  throw new Error(
    "MANAGED_CLOUD_MCP_ENDPOINT must use the MANAGED_CLOUD_URL origin to prevent bearer-token disclosure."
  );
}
if (
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash ||
  !endpoint.pathname.startsWith("/mcp/")
) {
  throw new Error(
    "MANAGED_CLOUD_MCP_ENDPOINT must be a credential-free /mcp/... URL without a query or fragment."
  );
}
NODE
fi

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

if [[ -n "$MCP_ENDPOINT" ]]; then
  export MANAGED_CLOUD_MCP_TOOL_NAME
  if [[ -z "${MANAGED_CLOUD_MCP_TOOL_ARGUMENTS_JSON:-}" ]]; then
    MANAGED_CLOUD_MCP_TOOL_ARGUMENTS_JSON='{}'
  fi
  export MANAGED_CLOUD_MCP_TOOL_ARGUMENTS_JSON
  node --input-type=module - "$SMOKE_DIR" <<'NODE'
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.argv[2];
const toolName = process.env.MANAGED_CLOUD_MCP_TOOL_NAME;
if (!toolName) throw new Error("The MCP smoke tool name is missing.");
let toolArguments;
try {
  toolArguments = JSON.parse(
    process.env.MANAGED_CLOUD_MCP_TOOL_ARGUMENTS_JSON ?? "{}"
  );
} catch {
  throw new Error("MANAGED_CLOUD_MCP_TOOL_ARGUMENTS_JSON must be valid JSON.");
}
if (!toolArguments || typeof toolArguments !== "object" || Array.isArray(toolArguments)) {
  throw new Error("MANAGED_CLOUD_MCP_TOOL_ARGUMENTS_JSON must be a JSON object.");
}

const requests = {
  "mcp-initialize.json": {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "litemcp-release-smoke", version: "0.1.0" },
    },
  },
  "mcp-list.json": {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  },
  "mcp-call.json": {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: toolName, arguments: toolArguments },
  },
};
for (const [name, value] of Object.entries(requests)) {
  writeFileSync(join(directory, name), `${JSON.stringify(value)}\n`);
}
NODE

  MCP_AUTH_HEADER="$SMOKE_DIR/mcp-auth-header"
  printf 'Authorization: Bearer %s\n' "$MCP_TOKEN" >"$MCP_AUTH_HEADER"

  mcp_request() {
    local input=$1
    local output=$2
    curl \
      --fail-with-body \
      --silent \
      --show-error \
      --retry 2 \
      --retry-all-errors \
      --retry-delay 2 \
      --connect-timeout 10 \
      --max-time 30 \
      --request POST \
      --header "@$MCP_AUTH_HEADER" \
      --header 'Accept: application/json, text/event-stream' \
      --header 'Content-Type: application/json' \
      --header 'MCP-Protocol-Version: 2025-11-25' \
      --data-binary "@$input" \
      "$MCP_ENDPOINT" \
      --output "$output"
  }

  mcp_request "$SMOKE_DIR/mcp-initialize.json" "$SMOKE_DIR/mcp-initialize-response.json"
  mcp_request "$SMOKE_DIR/mcp-list.json" "$SMOKE_DIR/mcp-list-response.json"

  node --input-type=module - "$SMOKE_DIR" <<'NODE'
import { readFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.argv[2];
const readResponse = (name) => {
  const value = JSON.parse(readFileSync(join(directory, name), "utf8"));
  if (value.error) {
    throw new Error(
      `${name} returned JSON-RPC error ${String(value.error.code ?? "unknown")}: ${String(
        value.error.message ?? "unknown error"
      ).slice(0, 300)}`
    );
  }
  if (!value.result || typeof value.result !== "object") {
    throw new Error(`${name} did not return a JSON-RPC result.`);
  }
  return value.result;
};

const initialized = readResponse("mcp-initialize-response.json");
if (initialized.protocolVersion !== "2025-11-25") {
  throw new Error(`Unexpected MCP protocol version: ${initialized.protocolVersion}`);
}
const listed = readResponse("mcp-list-response.json");
if (!Array.isArray(listed.tools)) {
  throw new Error("tools/list did not return a tools array.");
}
const selected = listed.tools.find(
  (tool) => tool?.name === process.env.MANAGED_CLOUD_MCP_TOOL_NAME
);
if (!selected) {
  throw new Error("The configured smoke tool was not visible in tools/list.");
}
if (selected.annotations?.readOnlyHint !== true) {
  throw new Error(
    "The configured smoke tool must advertise annotations.readOnlyHint=true."
  );
}
NODE

  mcp_request "$SMOKE_DIR/mcp-call.json" "$SMOKE_DIR/mcp-call-response.json"

  node --input-type=module - "$SMOKE_DIR" <<'NODE'
import { readFileSync } from "node:fs";
import { join } from "node:path";

const response = JSON.parse(
  readFileSync(join(process.argv[2], "mcp-call-response.json"), "utf8")
);
if (response.error) {
  throw new Error(
    `tools/call returned JSON-RPC error ${String(response.error.code ?? "unknown")}: ${String(
      response.error.message ?? "unknown error"
    ).slice(0, 300)}`
  );
}
if (!response.result || !Array.isArray(response.result.content)) {
  throw new Error("tools/call did not return MCP content.");
}
if (response.result.isError === true) {
  throw new Error("The configured read-only smoke tool returned isError=true.");
}
if (response.result.structuredContent?.status === "approval_required") {
  throw new Error("The configured read-only smoke tool did not execute; approval is required.");
}
NODE

  printf 'PASS  authenticated MCP initialize, tools/list, and read-only tools/call\n'
else
  printf '%s\n' \
    'NOTE  Authenticated MCP smoke was not configured; set the endpoint, token, read-only tool name, and optional JSON arguments to enable it.'
fi

printf '%s\n' \
  'NOTE  Identity/session issuance, audit correlation, revocation, and rollback remain separate release-acceptance checks.'
