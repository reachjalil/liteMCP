---
title: "Research Log"
file: "27-research-log.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 28
---

# Research Log

## Reader Promise

Another researcher can retrace the query strategy, source choices, dead ends and inference path.

## Summary (≤120 words)

Research began by locking the builder/architect audience, then triangulated LiteLLM's official packaging against repository licenses, recruiting signals, issues and incident reports. Composio was decomposed into its MIT SDK and hosted backend. Official MCP standards established the security and registry baseline. Direct OSS competitors and pricing analogues were then checked before constructing the proposed business model. Archive capture and live product signup were the main blocked methods.

## What We Found

## Log

### 2026-07-20 — scope and audience

- Read the supplied `DEEP_DIVE_RESEARCH.md`.
- Locked primary audience to Builder / Architect and secondary to Evaluator / Skeptic.
- Resolved “similar to composio” as a managed integration/authentication layer, not only a reverse proxy.
- Defined decision: copy LiteLLM's business-model architecture where appropriate, then build a distinct liteMCP model.

### LiteLLM queries and drills

Queries included:

- `LiteLLM pricing enterprise open source business model`
- `site:docs.litellm.ai enterprise SSO audit support pricing`
- `site:github.com/BerriAI/litellm enterprise LICENSE`
- `LiteLLM AWS Marketplace private offer`
- `LiteLLM ARR job founding reliability engineer`
- `site:github.com/BerriAI/litellm/issues MCP Authorization header`
- `LiteLLM PyPI compromise March 2026`
- `LiteLLM Responses API MCP tools bug`

Three-click drill:

1. marketing/pricing page;
2. enterprise documentation;
3. repository license and enterprise directory.

Finding: MIT core plus commercially licensed enterprise code; quote-based self-host enterprise and support. [S-002] [S-003] [S-006] [S-007]

### Composio queries and drills

Queries included:

- `Composio pricing tool calls 2026`
- `Composio MCP Gateway enterprise one URL team`
- `Composio managed authentication connected accounts`
- `Composio GitHub open source backend`
- `site:github.com/ComposioHQ/composio backend.composio.dev`
- `Composio status GitHub connection incident`

Three-click drill:

1. pricing/gateway marketing;
2. auth/session docs;
3. SDK source constants.

Finding: public usage-priced hosted service; MIT SDK defaults to proprietary hosted backend. [S-025] [S-026] [S-027] [S-028] [S-030] [S-032]

### MCP queries

- `MCP specification current 2025-11-25 transports`
- `MCP draft authorization OAuth 2.1 protected resource metadata`
- `MCP security best practices proxy confused deputy SSRF`
- `MCP registry moderation vulnerable servers`
- `MCP ecosystem census 2026`
- `MCP OAuth security study 2026`

Finding: the protocol standardizes transport and authorization direction, while registry moderation intentionally does not certify quality/security. [S-034] [S-035] [S-036] [S-037] [S-038] [S-039]

### Competitor queries

- `open source MCP gateway aggregate multiple servers one endpoint`
- `Obot MCP gateway open source enterprise`
- `IBM ContextForge MCP gateway`
- `MetaMCP aggregator`
- `MCPJungle`
- `Docker MCP Gateway`
- `managed MCP authentication open source`
- `MCP connector verification registry`

Finding: generic aggregation is crowded; Obot is the closest full-platform analogue. [S-040] [S-041] [S-042] [S-043] [S-044] [S-045] [S-046] [S-047]

### Pricing analogues

- `Nango pricing active connections`
- `Pipedream Connect pricing external users credits`
- `Composio pricing overage tool calls`

Finding: execution, connection and user dimensions are all legible market meters. [S-025] [S-048] [S-049]

### Name diligence

- `liteMCP PyPI`
- `litemcp npm GitHub`
- `"LiteMCP" MCP`

Finding: existing package/project uses create collision risk. [S-050] [S-051]

## Dead ends and excluded material

- Third-party pages asserting precise LiteLLM prices without primary corroboration were not treated as canonical.
- Social posts without stable attribution/archives were excluded.
- Vendor directory counts were retained only as low-confidence directional context.
- No leaked, NDA or private-community material was used.
- No company valuation/revenue estimate was inferred beyond clearly labeled company self-reporting.
- No live signup, OAuth grant or benchmark was performed.
- Automated Wayback/archive.today submission was unavailable; archive fields carry an explicit failure note.

## Inference path

1. LiteLLM shows permissive core → enterprise control monetization.
2. Composio shows SDK distribution → hosted auth/connector usage monetization.
3. Competitors show routing/aggregation is not scarce.
4. MCP/security evidence shows auth, verification and compatibility remain hard.
5. Therefore liteMCP's paid value should be operations/trust around an open data plane.
6. Pricing should align with successful usage and active credential operations.
7. A 90-day design-partner program should falsify the thesis before broad build.

## Confidence Notes

The log records the main search lattice and decisions but is not a verbatim browser history. Exact query timestamps and result rankings were not exported.

## Open Threads

In the next round, log every query, result disposition, archive attempt and product-trial step in machine-readable form.

## Sources Used

- [S-002]
- [S-003]
- [S-006]
- [S-007]
- [S-025]
- [S-026]
- [S-027]
- [S-028]
- [S-030]
- [S-032]
- [S-034]
- [S-035]
- [S-036]
- [S-037]
- [S-038]
- [S-039]
- [S-040]
- [S-041]
- [S-042]
- [S-043]
- [S-044]
- [S-045]
- [S-046]
- [S-047]
- [S-048]
- [S-049]
- [S-050]
- [S-051]
