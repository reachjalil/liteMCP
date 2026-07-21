---
title: "Open Questions"
file: "21-open-questions.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 5
---

# Open Questions

## Reader Promise

The reader has a prioritized diligence backlog with owners, tests and decision impact.

## Summary (≤120 words)

The largest unknown is not technical feasibility; it is whether enough teams will pay for portable managed auth and connector assurance rather than use an existing open gateway or Composio. The next unknowns concern credential portability, connector-maintenance cost, Obot overlap and the operating burden of a security-critical data plane. Each question below has a concrete resolution path.

## What We Found

| Priority | Question | Why it matters | Resolution test | Suggested owner |
|---|---|---|---|---|
| P0 | Will platform/security teams pay for managed auth + assurance? | Core commercial thesis | 20 qualified interviews; 3 paid/design-partner commitments | Founder/product |
| P0 | Does Obot already satisfy the wedge? | Closest competitive threat | Hands-on bake-off + 3 Obot customer calls | Product/engineering |
| P0 | Can customer-owned OAuth apps cover the initial 25 connectors? | Portability promise | Provider-by-provider approval and export matrix | Auth engineering/legal |
| P0 | What is the real support burden per verified connector? | Gross margin | Operate 25 connectors for 90 days; measure hours/incidents | Connector operations |
| P0 | Is the `liteMCP` name legally and practically usable? | Launch/blocking | Trademark, domains, package namespaces, confusion analysis | Counsel/brand |
| P1 | Which clients and protocol revisions must LTS support? | Engineering scope | Usage interviews + telemetry from opt-in beta | Developer experience |
| P1 | Can a broker issue execution grants without exposing refresh tokens to data-plane workers? | Security posture | Threat model, prototype, penetration review | Security engineering |
| P1 | How much reliability learning can be aggregated without payloads? | Moat vs privacy | Build metadata-only diagnostics on pilot traffic | Data/security |
| P1 | Which risk classes/approval semantics are portable across connectors? | Governance product | Pilot destructive/financial/admin actions | Policy product |
| P1 | What cloud pricing presentation converts best? | PLG funnel | Test call-only vs call+connection vs platform allowance | Growth/finance |
| P1 | Should Connector Assurance be bundled or separate? | Packaging clarity | Interview and willingness-to-pay conjoint | Product marketing |
| P2 | Should the project join/donate to a foundation? | Trust and ecosystem | Maintainer/customer feedback after traction | Governance |
| P2 | Is REST-to-MCP virtualization required at launch? | Scope control | Count design-partner APIs without MCP servers | Product |
| P2 | Does a public reliability score create liability? | Differentiation risk | Legal review + vendor interviews | Counsel/partnerships |
| P2 | Which cloud marketplaces matter first? | Enterprise procurement | Pipeline interviews | Sales |
| P2 | Can LiteLLM become a partner/integration rather than competitor? | Distribution | Shared identity/trace proof and partnership outreach | BD/engineering |

## Exit criteria for the diligence phase

Proceed to a funded build only when:

- three design partners accept the product boundary;
- at least two require managed OAuth or verified repair, not only routing;
- one accepts a paid pilot or letter of intent at a meaningful annualized value;
- the team demonstrates migration from two common clients to one endpoint;
- the auth threat model passes external review;
- the name has a viable replacement or clearance path.

Kill or pivot when routing is the only repeated pain, because open alternatives already solve that layer. [S-040] [S-042] [S-045] [S-046] [S-047]

## Confidence Notes

These questions are strategy and execution hypotheses. Priority reflects expected decision impact, not effort.

## Open Threads

Convert the P0 questions into an interview guide, benchmark script and 90-day operating dashboard.

## Sources Used

- [S-040]
- [S-042]
- [S-045]
- [S-046]
- [S-047]
