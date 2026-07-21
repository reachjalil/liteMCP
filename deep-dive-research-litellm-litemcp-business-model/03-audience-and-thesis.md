---
title: "Audience and Thesis"
file: "03-audience-and-thesis.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "high"
sources_count: 5
---

# Audience and Thesis

## Reader Promise

The reader sees the product thesis through the needs of builders and skeptical evaluators.

## Summary (≤120 words)

The thesis is not “MCP will grow, therefore build a gateway.” Generic aggregation is already crowded. The credible thesis is that organizations will pay for a portable trust and operations layer around MCP: per-user credential lifecycle, verified connector builds, policy, provenance, compatibility evidence and repair of breakage. The open-source core must remain sufficiently complete to run without the vendor. Paid value should increase with organizational complexity and operational burden, not with artificial protocol restrictions.

## What We Found


### Assumed prior knowledge

Readers understand APIs, OAuth/OIDC, reverse proxies, multi-tenancy, open-core software, agent tools and basic MCP terminology. They should not need prior knowledge of LiteLLM's packaging or Composio's internal architecture.

### Builder pain

- Every agent client accumulates its own MCP server list, secrets and transport quirks.
- Remote and local servers differ in authentication, lifecycle and failure modes.
- Tool names collide; schemas drift; clients implement protocol versions unevenly.
- Per-user OAuth turns a “simple gateway” into an identity and token-custody system.
- Security teams need a revocation point, audit trail and policy boundary before broad rollout.
- Connector maintenance is continuous operating work, not a one-time integration.

### Evaluator pain

- “Open source” can mean a complete product, an SDK for a proprietary backend, or source-available enterprise code.
- Tool-count claims are easy to inflate and say little about reliability.
- A gateway on the critical path inherits security, latency and availability obligations.
- Protocol standardization may commoditize routing before a company builds distribution.
- Enterprise gates can create community distrust if the boundary moves without notice.

### Thesis

**Build liteMCP only as an open integration control plane, not as a generic proxy.**

1. **Open the data plane.** A customer must be able to aggregate servers, bridge transports, route namespaced tools, run basic auth/policy, export telemetry and migrate away under Apache-2.0.
2. **Sell avoided toil and risk.** Managed OAuth, token storage, verified connectors, compatibility testing, repair, enterprise identity, compliance and SLA are legitimate paid work.
3. **Make portability a product feature.** Export connections, policies and encrypted credential envelopes; support customer-owned keys and vaults.
4. **Win on correctness, not catalog size.** Begin with 25–50 connectors whose auth, schemas and destructive actions are continuously tested.
5. **Measure reliable action.** The north-star metric is weekly successful authenticated tool executions through verified connectors, with SLO attainment.

### Falsification conditions

Abandon or reposition the plan if, after 20 qualified interviews, fewer than five teams report an urgent managed-auth or connector-reliability problem; if fewer than three will run a design-partner pilot; or if an incumbent provides portable self-hosted auth plus verified connectors at a price customers view as negligible.


## Confidence Notes

This is a strategy inference built from the observed market boundary: routing is broadly available, while authentication, connector operations and enterprise governance remain monetized. [S-026] [S-027] [S-039] [S-040] [S-042]

## Open Threads

Test whether buyers distinguish “verified connector reliability” from ordinary support strongly enough to support a separate paid SKU.

## Sources Used

- [S-026]
- [S-027]
- [S-039]
- [S-040]
- [S-042]
