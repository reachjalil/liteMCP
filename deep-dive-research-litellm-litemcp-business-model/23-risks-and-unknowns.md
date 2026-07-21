---
title: "Risks and Unknowns"
file: "23-risks-and-unknowns.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 21
---

# Risks and Unknowns

## Reader Promise

The reader can evaluate specific failure modes, evidence, severity and mitigation rather than a generic risk list.

## Summary (≤120 words)

The plan's greatest risks are commoditization, security liability, connector-support economics, OAuth dependence and unclear differentiation from Obot. Protocol churn and supply-chain exposure increase engineering cost, while an over-aggressive enterprise gate could destroy community trust. The mitigations are narrow scope, open safety primitives, LTS discipline, signed artifacts, portable credentials, paid design partners and explicit kill criteria.

## What We Found

| Risk | Evidence / rationale | Severity | Mitigation | Leading indicator |
|---|---|---:|---|---|
| Generic gateway commoditization | Many open gateways already aggregate servers [S-040] [S-042] [S-045] [S-046] [S-047] | Critical | Position on auth/assurance/portability; kill routing-only plan | Interviews mention only routing |
| Closest competitor already wins | Obot has OSS + cloud + enterprise identity [S-042] [S-043] [S-044] | Critical | Bake-off; target unmet portability/verification needs | No measurable advantage |
| Credential breach | Gateway handles high-value tokens; LiteLLM incident shows supply-chain path [S-016] [S-017] | Critical | Token isolation, signed builds, BYOK, short grants, external security review | Secret-access anomalies |
| OAuth provider dependence | Apps/scopes/approvals can change or be revoked | High | Customer-owned apps, multiple auth modes, approval inventory | Approval lead time / revoked app |
| Connector repair becomes services | Long-tail APIs consume human time | High | Limit verified set; price assurance; automate tests; community tier no SLA | Hours per connector/month |
| Protocol churn | Draft auth/session changes can break clients/upstreams [S-034] [S-036] | High | Compatibility matrix, adapters, LTS channel | Regression count per spec change |
| Unsafe free tier | Gating auth/security creates vulnerable deployments | High | Keep baseline safety open; security conformance | Community deployments bypass controls |
| Enterprise-gate backlash | LiteLLM issue shows pricing/feature-boundary friction [S-022] [S-023] | High | Open-core constitution, nonprofit program, clear diagnostics | Feature-gate issue volume |
| Pricing mismatch | Calls and connections have different cost drivers | High | Dual meter with allowances; cost telemetry | Negative gross margin cohorts |
| Hosted availability | Connector-specific outages affect actions [S-033] | High | Per-connector SLO, cached config, fallback, transparent status | Error budget burn |
| Release instability | LiteLLM rolling four-minor policy illustrates burden [S-003] | Medium–high | LTS, canary, rollback, compatibility contract | Upgrade incidents |
| Registry trust failure | Official registry intentionally permissive [S-039] | High | Signed verified channel and revocation feed | Vulnerable/broken published build |
| Catalog vanity | Counts are not comparable [S-026] [S-055] [S-056] | Medium | Publish passing targets and success rate | Marketing leads with raw count |
| Naming collision | Existing `litemcp` uses [S-050] [S-051] | High | New name, trademark/package diligence | Confusion/search collisions |
| Cloud concentration | Managed broker becomes lock-in/SPOF | High | self-host broker, export, regional data planes, cached signed config | Exit test fails |
| Buyer too early | Many teams have fewer than ten servers/users | High | Focus complex ICP; free core for small teams | Low qualified pipeline |
| Incumbent bundling | Model/client/cloud vendors bundle gateway/auth | High | Standard portability, cross-vendor connector evidence | Price compression |
| Legal/privacy burden | Credentials and audit metadata are sensitive | High | Minimize data, residency, DPA, BYOK, no payload default | Security review length |
| Community capture concern | Company dominates roadmap/verified badges | Medium | Transparent governance, neutral conformance suite | Maintainer churn/forks |

## Mitigation order

1. Validate the problem and Obot differentiation before broad engineering.
2. Build the threat model and portable auth architecture before hosting credentials.
3. Limit verified connectors to an economically supportable set.
4. Publish open-core and telemetry constitutions before community launch.
5. Offer LTS before selling enterprise production contracts.
6. Instrument connector-level cost and reliability before final pricing.

## Confidence Notes

Evidence establishes the shape of many risks, not their probability for an unbuilt product. Severity is a strategic judgment.

## Open Threads

Quantify risk probabilities after the first 90-day design-partner and connector-operations experiment.

## Sources Used

- [S-003]
- [S-016]
- [S-017]
- [S-022]
- [S-023]
- [S-026]
- [S-033]
- [S-034]
- [S-036]
- [S-039]
- [S-040]
- [S-042]
- [S-043]
- [S-044]
- [S-045]
- [S-046]
- [S-047]
- [S-050]
- [S-051]
- [S-055]
- [S-056]
