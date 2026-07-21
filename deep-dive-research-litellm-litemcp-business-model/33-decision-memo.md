---
title: "Decision Memo"
file: "33-decision-memo.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 22
---

# Decision Memo

## Reader Promise

The reader can make a clear go/no-go decision, state the rationale and authorize the next 90 days.

## Summary (≤120 words)

Recommendation: **conditional go**. Build a 90-day open-source proof and design-partner program, but do not fund a broad “MCP gateway” or launch under the liteMCP name. The winning thesis is a portable integration trust plane: open routing and safety baseline; paid managed OAuth, verified connector repair, enterprise identity and operations. The plan should be killed if buyers only want aggregation, if Obot already solves the target problem, or if connector assurance has services-like economics.

## What We Found

## Decision

**Authorize Phase 0 and Phase 1 only.** Do not authorize connector breadth, enterprise sales hiring or hosted credential custody until the validation and security gates are met.

## Why

### 1. LiteLLM demonstrates a viable open-core conversion pattern

LiteLLM makes a useful gateway free under MIT and charges for organization-wide identity, governance, deployment and support. [S-002] [S-003] [S-006] [S-007] That pattern maps naturally from model access to tool access.

### 2. Composio demonstrates budget for managed auth and execution

Composio exposes per-user connected accounts, hosted MCP sessions, enterprise governance and public tool-call pricing. [S-025] [S-026] [S-027] [S-028] Buyers are paying to outsource integration and credential operations.

### 3. Generic gateway functionality is already crowded

Obot, ContextForge, MCPJungle, MetaMCP and Docker cover substantial aggregation, routing and governance. [S-040] [S-042] [S-045] [S-046] [S-047] “One endpoint” is an onboarding feature, not a company thesis.

### 4. Trust and compatibility are unresolved

Official MCP guidance treats proxy auth and SSRF as serious concerns, and the official registry does not certify merely vulnerable or buggy servers away. [S-036] [S-037] [S-039] Public issues and the LiteLLM supply-chain incident show concrete auth, translation and credential risk. [S-016] [S-019] [S-020] [S-024]

## Product authorization

Build:

- Apache-2.0 gateway;
- config import and reversible client rewrite;
- one Streamable HTTP endpoint;
- transport/protocol adapters;
- namespaces, health, policy and OpenTelemetry;
- safe local credentials and BYO vault;
- connector manifest/test harness;
- portability export and exit test.

Prototype but do not production-host yet:

- managed credential broker;
- managed OAuth apps;
- connector build service;
- cloud control plane.

Do not build:

- agent framework;
- LLM gateway;
- workflow builder;
- large catalog;
- proprietary protocol;
- closed core security features.

## Business authorization

Test this offer:

> A portable, open-source MCP control plane with managed OAuth and verified connector repair.

Pricing test:

- $49 Starter;
- $399 Growth;
- $1,499 Business;
- $30K+ annual Enterprise;
- paid pilots at $5K–$15K credited toward annual contract.

All are hypotheses, not commitments.

## 90-day success criteria

1. Twenty qualified interviews completed.
2. Three design partners running the gateway.
3. Two rank managed auth or connector reliability as top-two pain.
4. One paid pilot/LOI.
5. Ten connectors pass an explicit compatibility matrix.
6. Median setup under 30 minutes.
7. Secure broker architecture reviewed externally.
8. Exported cloud-style config runs self-hosted.
9. Obot bake-off identifies a measurable gap.
10. New launch name clears package/domain/trademark screening.

## Kill criteria

- no paid willingness beyond routing;
- connector support >10 hours/month each at small scale with no automation path;
- provider OAuth restrictions defeat the portability promise;
- high-severity security findings remain unresolved;
- closest competitor offers equivalent portability and assurance with superior distribution;
- the team cannot sustain an LTS and incident-response commitment.

## Top three findings

1. **LiteLLM monetizes control, not basic access.** The open gateway drives adoption; enterprise identity, hierarchy, deployment and support drive contracts.
2. **Composio monetizes ongoing integration operations.** Its open SDK is distribution for a hosted credential, session and tool-execution service.
3. **The defensible liteMCP layer is trust and repair.** Routing is crowded; verified connectors, managed auth and portable enterprise operations remain valuable.

## Top three disclosures

1. Willingness to pay has not been tested with customers.
2. `liteMCP` has naming collisions and is not launch-ready. [S-050] [S-051]
3. Financial scenarios are illustrative and connector/support costs are the critical unknown.

## Final recommendation

Proceed narrowly and evidence-first. The opportunity is credible enough for a 90-day experiment, not yet proven enough for a broad platform build.

## Confidence Notes

The recommendation is an inference based on public evidence. It is intentionally conditional because primary customer and cost data are absent.

## Open Threads

The next artifact should be a design-partner interview pack and competitor benchmark, not a larger feature roadmap.

## Sources Used

- [S-002]
- [S-003]
- [S-006]
- [S-007]
- [S-016]
- [S-019]
- [S-020]
- [S-024]
- [S-025]
- [S-026]
- [S-027]
- [S-028]
- [S-036]
- [S-037]
- [S-039]
- [S-040]
- [S-042]
- [S-045]
- [S-046]
- [S-047]
- [S-050]
- [S-051]
