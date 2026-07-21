---
title: "Business-Model Anatomy: What to Copy and What Not to Copy"
file: "06-headless-announcement-anatomy.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "high"
sources_count: 24
---

# Business-Model Anatomy: What to Copy and What Not to Copy

## Reader Promise

The reader can decompose LiteLLM and Composio into distribution, paid value, lock-in and defensibility, then map the right elements to liteMCP.

## Summary (≤120 words)

LiteLLM and Composio monetize different layers. LiteLLM opens the production data plane and sells enterprise control around a self-hosted deployment. Composio opens SDKs but sells the hosted integration and credential plane itself. liteMCP should combine the trust advantages of the former with the recurring operational value of the latter: an Apache-licensed functional gateway plus optional managed auth, verified connectors, reliability operations and enterprise governance.

## What We Found


### Capability-by-capability anatomy

| Capability | LiteLLM | Composio | liteMCP decision |
|---|---|---|---|
| Core protocol/API translation | MIT and self-hosted | SDK adapters are MIT; service hosted | Open |
| Routing/load balancing | OSS fundamentals | Hosted execution | Open |
| Basic keys/budgets/teams | OSS | Hosted account/session primitives | Open baseline |
| Per-user OAuth lifecycle | Provider-key handling plus enterprise secret managers | Core hosted value | Safe local implementation open; managed broker paid |
| Catalog/connectors | Community provider integrations | 1,000+ managed toolkits claim | Connector definitions open; assurance paid |
| Enterprise SSO/SCIM/RBAC | Paid enterprise | Enterprise | Paid organization layer |
| Audit and retention | Enterprise | Enterprise | Basic event export open; long retention/compliance paid |
| Deployment | Customer-hosted; license unlock | Hosted plus enterprise options | OSS self-host; cloud; enterprise VPC/self-host |
| Support/SLA | Paid, extra fee for 24/7 | Enterprise | Paid |
| Data/credential portability | Customer controls deployment | Auth and policies live in Composio | Make exportability explicit |
| Reliability corpus | Provider/community edge cases | Proprietary execution telemetry | Managed moat, with public compatibility summaries |

### What LiteLLM proves

- A permissive, useful gateway can become a distribution engine. [S-002] [S-006]
- Buyers pay when gateway adoption creates identity, governance, compliance and support requirements. [S-003]
- Self-hosting is compatible with enterprise revenue when paid software is unlocked by license and support. [S-003] [S-007]
- Marketplace procurement matters for enterprise conversion. [S-009]
- Fast provider coverage creates a community flywheel, but weekly release velocity and no LTS create operational pressure. [S-003]

### What Composio proves

- Tool calls are a comprehensible usage meter. [S-025]
- Per-user sessions and hosted MCP endpoints simplify agent integration. [S-027] [S-028]
- Credential refresh, connection UX and managed connector maintenance are product value, not implementation trivia.
- Team-scoped endpoints, destructive-action controls, audit and IdP integration form an enterprise expansion path. [S-026]
- An MIT SDK can drive adoption while the monetized backend remains proprietary. [S-029] [S-030] [S-031] [S-032]

### What not to copy

1. **Do not market an SDK as a fully open platform.** Publish a diagram and feature-boundary constitution.
2. **Do not gate baseline protocol security.** OAuth resource-server correctness, SSRF defenses and exportable audit events are safety properties, not luxury features. [S-036] [S-037]
3. **Do not compete on a raw connector count.** The official registry's permissiveness means quantity is not proof of reliability. [S-039]
4. **Do not make every upgrade a weekly production project.** Offer an LTS channel and compatibility contract from the first enterprise release.
5. **Do not claim “no lock-in” while retaining non-exportable credentials and policy.** Make migration a tested feature.
6. **Do not sell routing alone.** ContextForge, Obot, MCPJungle, MetaMCP and Docker already cover substantial aggregation. [S-040] [S-041] [S-042] [S-043] [S-044] [S-045] [S-046] [S-047]

### Proposed model

```text
Apache core → widespread self-hosted adoption → fleet complexity and trust needs
       → managed auth + verified connectors → reliability telemetry
       → better compatibility and faster repair → enterprise standardization
       → annual platform, assurance and support revenue
```

This is a **dual flywheel**: community definitions expand coverage; managed test/incident data improve correctness. The paid service must return public value—compatibility badges, CVE notices and fixes—without exfiltrating customer payloads.


## Confidence Notes

The decomposition of current packaging is high confidence. The proposed combination and flywheel are inference; they need customer and operational validation.

## Open Threads

Determine whether connector vendors will participate in a verification program and whether a public reliability score creates legal or partnership friction.

## Sources Used

- [S-002]
- [S-003]
- [S-006]
- [S-007]
- [S-009]
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
