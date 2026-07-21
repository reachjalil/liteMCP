---
title: "Proposed API and MCP Surface"
file: "08-api-surface-analysis.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 3
---

# Proposed API and MCP Surface

## Reader Promise

The reader can implement or review a coherent liteMCP interface that remains MCP-native while exposing operational control separately.

## Summary (≤120 words)

liteMCP should present one standards-compliant Streamable HTTP MCP endpoint per gateway and keep administrative operations in a versioned REST control API. It should accept stdio and legacy upstreams through adapters, but never invent a private client protocol. Authorization, version negotiation, idempotency, error classification and event export require explicit contracts. The API below is a proposed design grounded in the current MCP specification and common gateway requirements.

## What We Found

## Protocol-facing surface

### `POST /mcp/{gateway_slug}`

The stable client entry point. It implements MCP JSON-RPC over Streamable HTTP, supports protocol-version negotiation, and returns only tools/resources/prompts visible to the authenticated principal. stdio remains an upstream/runtime transport, not a remotely exposed HTTP endpoint. [S-034] [S-035]

Required behavior:

- validate `MCP-Protocol-Version`;
- reject unsupported versions with a machine-readable compatibility response;
- bind access tokens to the gateway resource/audience;
- support resumability only where the negotiated specification permits;
- separate client session identity from upstream session identity;
- namespace tool IDs as `{server_alias}.{tool_name}` by default;
- expose stable aliases so upstream renames do not silently retarget policy;
- emit invocation IDs and trace context;
- refuse arbitrary upstream URLs supplied by untrusted clients.

### Discovery behavior

`tools/list`, `resources/list` and `prompts/list` are filtered after policy evaluation. The gateway may provide a search meta-tool, but it must not hide the canonical MCP methods. Tool descriptors include provenance, connector version, risk class, required scopes and last compatibility-test timestamp.

## Control-plane REST API

| Endpoint | Purpose | Open / paid |
|---|---|---|
| `POST /v1/gateways` | Create a logical endpoint | Open |
| `GET/PATCH /v1/gateways/{id}` | Read/update gateway config | Open |
| `POST /v1/upstreams` | Register remote/stdio/API upstream | Open |
| `POST /v1/upstreams/{id}:probe` | Negotiate and run health/schema probe | Open |
| `GET /v1/tools` | Search normalized tools | Open |
| `POST /v1/connections` | Bind principal to provider account | Open local; cloud managed |
| `POST /v1/auth/configs` | Define OAuth/API-key auth app | Open BYO; managed app paid |
| `POST /v1/policies:compile` | Validate policy-as-code | Open |
| `POST /v1/policies:simulate` | Explain decision without execution | Open |
| `GET /v1/invocations` | Query metadata audit | Open local |
| `POST /v1/approvals` | Request/decide sensitive action | Enterprise workflow |
| `GET /v1/registry/connectors` | Browse connector definitions/builds | Open metadata |
| `GET /v1/compatibility/reports` | Read test evidence | Public summaries; private fleet paid |
| `POST /v1/exports` | Export config, policy and connection metadata | Open |
| `POST /v1/fleet/deployments` | Managed rollout/rollback | Cloud/enterprise |

## Authentication model

The gateway is an OAuth protected resource. It publishes protected-resource metadata, discovers authorization servers, validates audience and scopes, and does not pass client access tokens through to unrelated upstream resources. [S-036] The credential broker exchanges the authenticated principal and policy decision for an upstream-specific credential.

Supported principal modes:

- interactive user via OIDC/OAuth;
- service workload via JWT/mTLS;
- local developer via short-lived CLI token;
- static API key for bootstrap only, with rotation and scope restrictions.

## Versioning

- MCP behavior follows negotiated protocol revisions.
- REST API uses `/v1` for breaking control-plane changes.
- Connector definitions use semantic versions plus immutable build digests.
- Policies and manifests have schema versions.
- Enterprise releases offer a 12-month LTS compatibility channel `[inference]`.
- Deprecations require at least 90 days for cloud APIs and two LTS releases for self-hosted APIs `[inference]`.

## Idempotency and consistency

Mutating REST endpoints accept `Idempotency-Key`. Tool execution may be retried only when the connector marks the action idempotent or supplies an idempotency key. Policy and credential decisions are strongly consistent within a gateway region; analytics may be eventually consistent. Never retry a destructive action merely because the upstream response was lost.

## Error model

Use RFC 9457-style problem details for REST and standard JSON-RPC errors for MCP, with a structured `data.litemcp` extension:

```json
{
  "category": "upstream_auth_expired",
  "retryable": false,
  "upstream": "github",
  "connector_build": "sha256:…",
  "invocation_id": "inv_…",
  "remediation": "reconnect_account"
}
```

Error categories must distinguish policy denial, approval required, authentication expiry, rate limit, upstream protocol incompatibility, schema mismatch, timeout, unsafe redirect and internal failure. This error taxonomy becomes input to reliability scoring and customer support.

## Confidence Notes

The MCP-facing requirements are grounded in the standard. The REST paths, LTS windows and exact consistency model are proposed and require implementation review.

## Open Threads

Resolve how protocol drafts that remove or alter session semantics will map to upstream servers pinned to earlier revisions.

## Sources Used

- [S-034]
- [S-035]
- [S-036]
