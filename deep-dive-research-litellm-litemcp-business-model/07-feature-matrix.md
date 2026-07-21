---
title: "Feature Matrix"
file: "07-feature-matrix.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 12
---

# Feature Matrix

## Reader Promise

The reader can compare the observed products and the proposed liteMCP boundary without conflating present features with roadmap assumptions.

## Summary (≤120 words)

The matrix shows why liteMCP cannot win through aggregation alone. Open competitors already offer unified endpoints, routing and observability. Composio is strongest in managed connectors and per-user authentication; Obot is the closest open-source platform analogue; ContextForge is broadest at protocol federation. The proposed differentiation is portable managed identity plus continuously verified connectors and compatibility evidence. All liteMCP cells are product proposals, not shipped claims.

## What We Found

### Matrix

Legend: **Yes** = documented; **Partial** = documented but narrower/unclear; **Paid** = enterprise/hosted; **Proposed** = liteMCP roadmap; **Unknown** = not established in this research.

| Capability | LiteLLM | Composio | Obot | ContextForge | MetaMCP / MCPJungle | liteMCP proposal |
|---|---|---|---|---|---|---|
| One MCP endpoint over many servers | Yes | Yes, hosted/team-scoped | Yes | Yes | Yes | Open |
| stdio + Streamable HTTP bridging | Partial/current implementation dependent | Hosted abstraction | Yes | Yes | Yes | Open |
| REST/gRPC → MCP virtualization | LLM/API focus | Connector platform | Partial | Yes | Limited | Connector SDK; REST first |
| Per-user account connections | Partial/MCP features evolving | Yes | Yes | Partial | Partial | Open local + managed cloud |
| Managed OAuth app/token lifecycle | Enterprise/secret managers; not Composio-equivalent | Core hosted value | Cloud/enterprise | Configurable | Limited | Paid managed service |
| Credential export / BYO vault | Customer-hosted for LiteLLM | Unclear for full migration | Self-host path | Self-host | Self-host | Explicitly supported |
| Tool namespaces/collision handling | Evolving | Hidden by toolkit/session layer | Yes | Yes | Yes | Open, deterministic |
| Tool search / context reduction | LLM gateway features; not core thesis | Contextual retrieval | Partial | Optimization features | Tool selection | Open deterministic index |
| Policy-as-code | Enterprise controls | Team policies | Enterprise controls | Plugins/guardrails | Mixed | Open baseline |
| Approvals for destructive actions | Not core documented surface | Yes | Enterprise capability | Plugin-dependent | Limited | Paid workflow; open policy hook |
| Metadata-only audit | Enterprise | Enterprise | Yes | Yes | Mixed | Open event export |
| SAML/OIDC/SCIM | Enterprise | Enterprise | Enterprise | Auth support; SCIM unclear | Limited | Paid |
| Verified connector builds | No comparable catalog | Vendor-managed/self-healing claim | Registry/hosting | Catalog plus supply-chain features | No strong evidence | Core paid differentiator |
| Public compatibility reports | No | No public contract found | No strong evidence | Tests exist | No | Proposed |
| Hosted SaaS | Enterprise/self-host emphasis | Yes | Yes | Deploy yourself | Some cloud histories | Yes |
| Air-gapped/self-hosted enterprise | Yes | Enterprise option | Yes | Yes | Yes | Yes |
| LTS compatibility channel | No separate LTS; four-minor rolling window [S-003] | Service-managed | Unknown | Project release policy | Unknown | Proposed |
| Public usage pricing | No | Yes, changing 2026-08-15 [S-025] | Limited/custom | OSS | OSS | Proposed |
| Permissive functional core | MIT outside enterprise [S-006] | MIT SDK, hosted backend [S-030] [S-032] | Open source | Apache-2.0 [S-040] | Open source | Apache-2.0 |

### What the matrix means

**Commodity or rapidly commoditizing**

- MCP server aggregation and one endpoint;
- basic namespacing, routing, retries and telemetry;
- local configuration management;
- standard protocol transport support.

These capabilities are necessary for adoption but weak as a standalone moat. ContextForge, Obot, MCPJungle, MetaMCP and Docker already demonstrate broad availability. [S-040] [S-042] [S-045] [S-046] [S-047]

**Potentially defensible**

- OAuth app approvals and ongoing token operations;
- continuously tested connector builds with provenance and SBOMs;
- a compatibility corpus across clients, protocol revisions, auth modes and provider changes;
- failure telemetry that predicts schema drift and regressions;
- enterprise distribution, procurement, support and regulated deployment;
- a reputation system whose evidence is reproducible.

**Do not gate**

- correct protocol negotiation and transport bridging;
- basic resource-server authentication and audience validation;
- SSRF defenses, egress allowlists and origin checks;
- local encrypted secret storage;
- config and event export;
- OpenTelemetry;
- a useful policy engine for self-hosters.

Gating those baseline functions would create an unsafe free tier and undermine the “open integration control plane” promise. MCP's own guidance treats proxy security as fundamental. [S-036] [S-037]

## Confidence Notes

Competitor cells were derived from public docs and repositories and may lag releases. The liteMCP column is entirely proposed. A hands-on benchmark is needed before using the matrix for procurement.

## Open Threads

Add exact license versions and live tests for Obot, MCPJungle and MetaMCP; verify whether any already offer portable managed credentials and public compatibility reports.

## Sources Used

- [S-003]
- [S-006]
- [S-025]
- [S-030]
- [S-032]
- [S-036]
- [S-037]
- [S-040]
- [S-042]
- [S-045]
- [S-046]
- [S-047]
