# LiteLLM → liteMCP Business-Model Deep Dive

> **Archived research context:** this package preserves the former working
> codename `liteMCP` so its evidence and decisions remain traceable. The current
> product-facing name is **LiteMCP Composer**. Treat the reports below as
> historical research and proposals, not current implementation status; use the
> [repository README](../README.md) and
> [implementation status](../IMPLEMENTATION_STATUS.md) for the maintained
> product record.

The checksums and validation report under `raw/` describe the delivered
research package before this repository added the product-name notice above
and normalized text files to LF. They are retained as historical provenance,
not as a checksum of the current working tree.

**Research date:** 2026-07-20 (UTC)
**Audience:** Builder / Architect, with an Evaluator / Skeptic secondary lens
**Former working codename:** `liteMCP` — not cleared for launch; naming collisions are documented.

## Decision in one page

**Proceed, but do not launch as “another MCP gateway.”** Aggregation and protocol bridging are already available from ContextForge, Obot, MCPJungle, MetaMCP, Docker, LiteLLM itself, and smaller projects. The differentiated product should be an **open integration control plane for agents**: one portable MCP endpoint, managed per-user authentication, verified connector builds, policy, compatibility testing, and repair of schema/auth drift.

The LiteLLM pattern worth copying is architectural: make the workload-facing data plane useful under a permissive license, then charge for organization-wide control, operational guarantees, enterprise identity, procurement, and support. The Composio pattern worth copying is commercial: customers pay to avoid owning OAuth apps, token refresh, connector breakage, and reliability work. The part not to copy is a cloud-only control plane hidden behind an “open-source SDK” label.

## Recommended packaging

| Layer | License / offer | Customer value | Revenue |
|---|---|---|---|
| liteMCP Core | Apache-2.0 | One endpoint, routing, transports, health, OTel, local secrets, basic policy | Free distribution |
| liteMCP Cloud | Hosted SaaS | Managed gateway, credential broker, verified registry, reliability telemetry | Usage + active connections |
| Connector Assurance | Hosted or support subscription | Certified builds, OAuth approval, drift repair, CVE response | Subscription / add-on |
| Enterprise | Commercial | SAML/OIDC/SCIM, approvals, BYOK, SIEM, HA, VPC/self-host, SLA | Annual contract |

## Contents

1. [Status and limitations](00-status.md)
2. [Intent brief](01-intent-brief.md)
3. [Source inventory](02-source-inventory.md)
4. [Audience and thesis](03-audience-and-thesis.md)
5. [Domain model](04-domain-model.md)
6. [Current-state baseline](05-current-state-baseline.md)
7. [Business-model anatomy](06-headless-announcement-anatomy.md)
8. [Feature matrix](07-feature-matrix.md)
9. [API surface](08-api-surface-analysis.md)
10. [Data and events](09-data-model-and-events.md)
11. [Identity and trust](10-identity-and-trust.md)
12. [Agent surface](11-ai-and-agent-surface.md)
13. [Developer experience](12-developer-experience.md)
14. [Pricing and licensing](13-pricing-and-licensing.md)
15. [Migration](14-migration-and-coexistence.md)
16. [Comparisons](15-comparison-tables.md)
17. [Community signals](16-community-signals.md)
18. [Press and research](17-analyst-and-press-coverage.md)
19. [Timeline](18-timeline.md)
20. [Evidence ledger](19-evidence-ledger.md)
21. [Research questions](20-research-questions.md)
22. [Open questions](21-open-questions.md)
23. [Contradictions](22-contradictions.md)
24. [Risks](23-risks-and-unknowns.md)
25. [Glossary](24-glossary.md)
26. [Future-site routes](25-route-system-proposal.md)
27. [Site conversion brief](26-site-conversion-brief.md)
28. [Research log](27-research-log.md)
29. [Quality review](28-quality-review.md)
30. [liteMCP business model](29-litemcp-business-model.md)
31. [Go-to-market](30-go-to-market.md)
32. [Financial model](31-financial-model.md)
33. [Product roadmap](32-product-roadmap.md)
34. [Decision memo](33-decision-memo.md)

Structured CSVs are in `data/`; Mermaid sources are in `diagrams/`; source and capture manifests are in `raw/`.

## Recommended next step

Run 15–20 discovery interviews with platform-engineering and security teams that operate at least ten MCP servers or three agent clients. Test willingness to pay for **managed OAuth plus connector reliability**, not for routing. In parallel, build a 90-day open-source proof: import existing client configs, expose one Streamable HTTP endpoint, preserve tool namespaces, emit OpenTelemetry, and publish a compatibility test report.
