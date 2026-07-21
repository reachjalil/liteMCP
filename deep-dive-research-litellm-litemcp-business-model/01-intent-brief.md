---
title: "Intent Brief"
file: "01-intent-brief.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "high"
sources_count: 1
---

# Intent Brief

## Reader Promise

The reader understands the decision this research supports, the audience, the scope and the standard of proof.

## Summary (≤120 words)

This is a business-model and product-strategy investigation, not a feature summary. It asks what LiteLLM actually gives away, what it sells, why buyers pay, how Composio packages a related integration layer, and whether an open-source MCP control plane can support a durable company. The answer is aimed primarily at builders and architects, with procurement and technical diligence treated as first-class constraints. The output separates observed facts from proposed design and economics.

## What We Found


### Decision to support

> Should a team build and commercialize an open-source MCP gateway/control plane, provisionally called liteMCP, and which business model gives it a credible wedge against Composio and existing gateways?

### Primary audience

**Builder / Architect.** A staff engineer or platform architect deciding what should be open, where identity and credentials live, how many moving parts the platform owns, and whether the design survives protocol and connector churn.

### Secondary audience

**Evaluator / Skeptic.** A CTO, security leader or investor asking whether the wedge is real, whether the pricing is defensible, what is already commoditized, and which evidence would falsify the plan.

### Success moment

The reader can make a go/no-go decision, define the first 90 days of product work, explain the open-core boundary without hand-waving, and run customer interviews against explicit hypotheses.

### Questions answered

1. What is LiteLLM's observable business model?
2. What does Composio sell beyond its MIT SDK?
3. Which parts of an MCP gateway are already commodity?
4. What should liteMCP keep open and what may it charge for?
5. Which metric, pricing axis and customer segment align value with cost?
6. What architecture preserves portability and avoids credential lock-in?
7. What risks and kill criteria should govern the first year?

### Scope choices

Heavy extraction focused on licensing, packaging, enterprise controls, support, procurement, identity, credential custody, protocol compatibility, operational incidents, competitor overlap and pricing. Generic “agent” marketing, broad TAM claims and unsupported company valuation speculation were deliberately omitted.

### Method

Evidence follows the supplied research contract: first-party, partner, analyst and practitioner sources are distinguished; inference is labeled; availability and pricing opacity are findings; contradictions remain visible. [S-001]


## Confidence Notes

The scope and audience are explicit. The user clarified the desired analogue as Composio, so the analysis treats liteMCP as an integration/authentication platform rather than only a reverse proxy.

## Open Threads

A later research round should add interviews with users migrating from Composio, Obot, MetaMCP and hand-managed MCP configurations.

## Sources Used

- [S-001]
