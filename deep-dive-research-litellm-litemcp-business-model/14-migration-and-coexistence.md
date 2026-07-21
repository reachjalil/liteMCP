---
title: "Migration and Coexistence"
file: "14-migration-and-coexistence.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 7
---

# Migration and Coexistence

## Reader Promise

The reader can move from scattered MCP configurations, Composio or another gateway without a flag day and can identify where migration is inherently lossy.

## Summary (≤120 words)

Migration must be a product, not documentation. liteMCP should discover existing client configs, preserve server namespaces, run shadow compatibility tests and cut over one client or team at a time. Composio migration can export tool and account metadata but may require user re-consent when credentials are bound to Composio-operated OAuth apps. LiteLLM and liteMCP should coexist as separate model and tool gateways sharing identity and telemetry.

## What We Found

## Pattern A: scattered local MCP configurations

1. Run `litemcp import --from all --read-only`.
2. Produce inventory of clients, servers, commands, environment variables and transport modes.
3. Redact secrets into local vault references.
4. Detect duplicate aliases/tool names.
5. Start gateway in **mirror discovery** mode; do not execute.
6. Compare `tools/list` results against each client.
7. Configure one test client to the gateway.
8. Enable execution for read-only tools.
9. Expand to write tools with policy.
10. Rewrite remaining clients; retain rollback backups.

No centralized credential custody is required for the first cutover.

## Pattern B: Composio

Composio creates per-user connected accounts and hosted MCP session URLs, with auth and policy living in its service. [S-026] [S-027] [S-028]

Migration stages:

- inventory toolkits, auth configs, scopes, user/account mappings and policies;
- create equivalent open connector definitions;
- import non-secret metadata;
- register customer-owned OAuth apps where available;
- ask users to reconnect where tokens are bound to Composio's OAuth client or non-exportable;
- dual-run read-only calls and compare normalized outputs;
- switch session endpoints team by team;
- keep Composio as fallback for unsupported connectors during a fixed sunset;
- export audit records required for retention before termination.

**Inherent loss:** vendor-managed OAuth credentials may not be legally or technically transferable. Do not treat this as an implementation bug; surface a reconnect plan.

## Pattern C: LiteLLM MCP features

LiteLLM increasingly includes MCP functionality, while its core business remains an AI gateway. Public issues show evolving edge cases around Authorization headers, server-specific header parsing and Responses API tool compatibility. [S-019] [S-020] [S-021] [S-024]

Coexistence architecture:

```text
Agent/application
 ├─ model calls → LiteLLM AI Gateway
 └─ tool calls  → liteMCP
       └─ shared IdP, trace context, budgets/tags
```

Avoid embedding liteMCP inside LiteLLM's process. Independent scaling and failure domains reduce coupled upgrades. Exchange only workload identity, trace IDs and optional cost attribution.

## Pattern D: Obot / ContextForge / MetaMCP / MCPJungle

Treat these as standards peers, not proprietary traps:

- import server manifests and environment references;
- support the official registry/subregistry format;
- expose an export with no liteMCP cloud dependency;
- run both gateways behind different URLs;
- use client-level or DNS cutover;
- compare compatibility reports and audit events;
- avoid bespoke connector formats where an open manifest suffices.

## Strangler rollout

| Phase | Traffic | Risk |
|---|---|---|
| Inventory | None | Secret discovery/redaction |
| Discovery shadow | `list` only | Namespace differences |
| Read-only canary | 1–5% users | Auth and schema mismatch |
| Write canary | Selected tools | Duplicate side effects |
| Team cutover | One team | Policy gaps |
| Organization rollout | Majority | Capacity and support |
| Decommission | Legacy fallback only | Missing long-tail connector |

## Rollback

- retain prior client config and endpoint;
- pin connector builds during cutover;
- never auto-upgrade write connectors in migration week;
- preserve provider idempotency keys;
- record exact normalized arguments and outcome metadata;
- maintain a route-level kill switch;
- rehearse credential revocation and re-consent.

## Confidence Notes

The migration mechanics are proposed. The impossibility of seamless credential export depends on provider/OAuth-app terms and must be verified connector by connector.

## Open Threads

Obtain Composio's current export/API capabilities through a hands-on trial and document which connection metadata and secrets are actually retrievable.

## Sources Used

- [S-019]
- [S-020]
- [S-021]
- [S-024]
- [S-026]
- [S-027]
- [S-028]
