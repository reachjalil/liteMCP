---
title: "Research Questions"
file: "20-research-questions.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 38
---

# Research Questions

## Reader Promise

The reader can see which questions were answered, partially answered or remain unanswered, grouped by the section that owns them.

## Summary (≤120 words)

The central business-model and product-boundary questions are answered well enough for a conditional go decision. The weakest areas are customer willingness to pay, audited economics, live product comparisons and provider-specific credential portability. Those gaps should govern the next diligence phase rather than being hidden inside a generic “more research” note.

## What We Found

## Baseline and business model

| Question | Status | Answer |
|---|---|---|
| What does LiteLLM give away? | Answered | A useful MIT gateway/SDK surface outside the enterprise directory, including provider abstraction and core controls. [S-002] [S-006] |
| What does LiteLLM sell? | Answered | Commercial enterprise code/license, identity/governance, deployment features, support and SLA. [S-003] [S-007] |
| How is LiteLLM sold? | Partially answered | Quote/private offer and expanding enterprise sales roles; contract values/funnel unknown. [S-009] [S-012] |
| What does Composio give away? | Answered | MIT SDKs/adapters. [S-029] [S-030] |
| What does Composio monetize? | Answered | Hosted auth, sessions, connector execution, usage and enterprise governance. [S-025] [S-026] [S-027] [S-028] |
| Is Composio fully open source? | Answered | No evidence of an open self-hostable backend equivalent; SDK defaults to hosted backend. [S-031] [S-032] |

## Product and architecture

| Question | Status | Answer |
|---|---|---|
| Is “one MCP endpoint” differentiated? | Answered | No; multiple OSS/vendor gateways already offer it. [S-040] [S-042] [S-045] [S-046] [S-047] |
| What remains hard? | Answered | Managed auth, credential lifecycle, policy, connector verification, schema drift, support and compliance. [S-026] [S-027] [S-036] [S-037] [S-039] |
| Which security features must remain open? | Answered as design principle | Protocol-correct auth, SSRF defenses, local secret storage, basic policy, export and telemetry. |
| Can credentials be portable? | Partially answered | Customer-owned apps/vaults can be; vendor-owned OAuth grants may require re-consent. Provider-specific proof is missing. |
| Does liteMCP need its own agent runtime? | Answered | No; remain a tool control plane and interoperate with agent/model layers. |
| Is the `liteMCP` name available? | Answered negatively for diligence | Existing package/project uses create a collision; legal/trademark clearance not done. [S-050] [S-051] |

## Pricing and economics

| Question | Status | Answer |
|---|---|---|
| Which public pricing analogues exist? | Answered | Composio tool calls, Nango active connections/requests, Pipedream credits/users. [S-025] [S-048] [S-049] |
| What should liteMCP meter? | Proposed | Successful executions plus monthly active connected accounts; sandbox compute separate. |
| What enterprise floor is plausible? | Proposed | $30K+ ARR, subject to validation. |
| What gross margin is achievable? | Unanswered empirically | Target 75–85%; cloud/connector/support costs not benchmarked. |
| What conversion rate is realistic? | Unanswered | Requires cohort and design-partner data. |
| What is LiteLLM's actual ARR? | Partially answered | Company-controlled listings self-report figures; no audit. [S-011] [S-013] |

## Market and competition

| Question | Status | Answer |
|---|---|---|
| Who is the closest competitor? | Answered provisionally | Obot; it combines open source, gateway/cloud and enterprise identity. [S-042] [S-043] [S-044] |
| Is ContextForge a threat? | Answered | Yes for broad gateway/federation/governance; less clearly for managed connector auth/assurance. [S-040] [S-041] |
| Is connector count a moat? | Answered | Not by itself; registry quality is intentionally permissive and counts are inconsistent. [S-039] [S-055] [S-056] |
| Is there demand for assurance? | Partially answered | Security/auth/compatibility evidence supports the pain; willingness to pay is untested. [S-016] [S-019] [S-020] [S-024] [S-053] |

## Go/no-go

| Question | Status | Answer |
|---|---|---|
| Should the product be built? | Conditionally answered | Yes, only around portability + managed auth + verified reliability, with 90-day falsification gates. |
| Should it copy LiteLLM exactly? | Answered | Copy the open-data-plane/paid-control pattern, not every enterprise feature gate or release practice. |
| Should it call itself liteMCP? | No for launch | Keep only as codename pending naming work. |

## Confidence Notes

Question status reflects this research snapshot. “Answered” does not imply future stability or market validation.

## Open Threads

Prioritize the unanswered economics, live competitive bake-off and credential-portability questions before scaling engineering.

## Sources Used

- [S-002]
- [S-003]
- [S-006]
- [S-007]
- [S-009]
- [S-011]
- [S-012]
- [S-013]
- [S-016]
- [S-019]
- [S-020]
- [S-024]
- [S-025]
- [S-026]
- [S-027]
- [S-028]
- [S-029]
- [S-030]
- [S-031]
- [S-032]
- [S-036]
- [S-037]
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
- [S-053]
- [S-055]
- [S-056]
