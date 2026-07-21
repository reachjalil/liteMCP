---
title: "Timeline"
file: "18-timeline.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 27
---

# Timeline

## Reader Promise

The reader can place LiteLLM, Composio and the MCP gateway opportunity in chronological context.

## Summary (≤120 words)

LiteLLM grew from a 2023 open-source model abstraction into an enterprise gateway, while MCP evolved rapidly through transport, authorization and registry changes in 2025–2026. By 2026, both LiteLLM and Composio were investing directly in MCP and enterprise governance, open-source gateways had multiplied, and a LiteLLM supply-chain incident raised the trust bar. The opportunity exists, but the generic gateway window has largely closed; differentiation must move to identity, verification and operations.

## What We Found

| Date | Event | Why it matters |
|---|---|---|
| 2023 | LiteLLM repository/license era begins [S-005] [S-006] | Permissive gateway distribution wedge |
| Winter 2023 | LiteLLM participates in YC W23 [S-010] | Company formation and venture path |
| 2024 | LiteLLM enterprise code is placed under commercial terms [S-007] [S-008] | Explicit open-core monetization |
| 2025-03-21 | Existing `litemcp` PyPI package release [S-050] | Working name collision |
| 2025 | Multiple LiteLLM MCP auth/translation issues are filed [S-019] [S-020] [S-021] | Protocol/auth edge cases surface |
| 2025-09-08 | Official MCP Registry preview announced [S-038] | Discovery becomes standard infrastructure |
| 2025-11-25 | Current stable MCP specification revision [S-034] | Baseline for conformance |
| 2026-03-24 | Malicious LiteLLM PyPI 1.82.7/1.82.8 releases discovered and contained [S-016] [S-017] | Supply-chain trust becomes board-level |
| 2026-05 | Composio reports GitHub connection degradation [S-033] | Connector-specific availability matters |
| 2026-05 | LiteLLM Responses bridge issue shows tool compatibility edge case [S-024] | Translation remains incomplete |
| 2026-05 to 2026-07 | MCP auth/ecosystem preprints and censuses appear [S-052] [S-053] [S-055] | Evidence of scale and security gaps grows |
| 2026-06-29 | LiteLLM four-minor support policy takes effect; no LTS [S-003] | Fast release cadence creates enterprise upgrade burden |
| 2026-07-20 | Research snapshot; Composio pricing page announces August change [S-025] | Pricing evidence is time-sensitive |
| 2026-08-15 | Announced Composio pricing change date [S-025] | Recheck before launch/pricing decision |

## Strategic phases

### Phase 1 — protocol novelty

Early MCP adoption rewarded simple wrappers and local servers. A lightweight aggregator could differentiate.

### Phase 2 — gateway proliferation

Obot, ContextForge, MCPJungle, MetaMCP, Docker and LiteLLM added overlapping gateway and governance capabilities. [S-040] [S-042] [S-045] [S-046] [S-047] Aggregation became table stakes.

### Phase 3 — trust and operations

Remote servers, per-user OAuth, enterprise identity, policy, compatibility and connector reliability become the hard problems. Composio's enterprise gateway and managed auth sit here. [S-026] [S-027]

### Phase 4 — proposed liteMCP entry

Enter with an explicit portable trust plane and verified connector service. The timing thesis depends on buyers feeling the cost of Phase 3 before a dominant vendor standardizes the control plane.

## Confidence Notes

Dates tied to specifications, incidents and posted policies are strong. Repository-start and market-phase framing are simplified; exact commercial launch dates were not exhaustively reconstructed.

## Open Threads

Add product-release tags and archived pricing/docs snapshots to build a more granular feature chronology.

## Sources Used

- [S-003]
- [S-005]
- [S-006]
- [S-007]
- [S-008]
- [S-010]
- [S-016]
- [S-017]
- [S-019]
- [S-020]
- [S-021]
- [S-024]
- [S-025]
- [S-026]
- [S-027]
- [S-033]
- [S-034]
- [S-038]
- [S-040]
- [S-042]
- [S-045]
- [S-046]
- [S-047]
- [S-050]
- [S-052]
- [S-053]
- [S-055]
