---
title: "Domain Model"
file: "04-domain-model.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "high"
sources_count: 2
---

# Domain Model

## Reader Promise

The reader can reason about the proposed system, its trust boundaries and its billable units without product-marketing ambiguity.

## Summary (≤120 words)

liteMCP should model more than servers and tools. The economically important objects are principals, connected accounts, authorization grants, policies, verified connector versions, invocations and compatibility reports. Separating the open data plane from optional managed services makes portability testable. It also clarifies which events can be logged without retaining payloads and which units can be billed fairly.

## What We Found


### Core entities

| Entity | Plain meaning | Ownership / portability |
|---|---|---|
| `Organization` | Administrative and billing boundary | Exportable configuration |
| `Environment` | Dev, staging or production isolation | Exportable |
| `Gateway` | Stable MCP endpoint presented to clients | Open core |
| `UpstreamServer` | Remote or local MCP server definition | Open manifest |
| `ConnectorDefinition` | Versioned app/tool/auth schema | Apache-licensed |
| `ConnectorBuild` | Tested artifact plus provenance/SBOM | Public metadata; managed signing optional |
| `ToolDescriptor` | Namespaced tool schema and risk metadata | Cached/exportable |
| `Principal` | Human, workload or agent identity | Customer IdP mapping |
| `ConnectedAccount` | Principal-to-provider account binding | Exportable metadata; secret handling configurable |
| `CredentialEnvelope` | Encrypted token/key material and metadata | Customer vault, local vault or managed vault |
| `Policy` | Allow/deny/approval/rate/egress rules | Policy-as-code export |
| `Invocation` | Attempted tool action and outcome | Metadata by default |
| `CompatibilityReport` | Client/server/protocol/auth test result | Public or private evidence |
| `ReliabilityScore` | Derived success, latency and drift indicators | Derived from consented telemetry |
| `ApprovalRequest` | Human authorization for a sensitive action | Enterprise workflow |

### Trust boundaries

1. **Client → gateway:** authenticate principal and bind intended gateway audience.
2. **Gateway → policy engine:** decide whether the principal may discover or invoke a tool.
3. **Gateway → credential broker:** request the narrow credential needed for one upstream.
4. **Gateway → upstream server:** enforce destination allowlists, audience binding and timeout/retry rules.
5. **Control plane → data plane:** deliver signed configuration without gaining payload access by default.
6. **Connector build pipeline → registry:** sign artifacts, SBOMs and test reports.

MCP's authorization direction requires resource-server metadata, OAuth 2.1 behavior and audience-bound tokens; its security guidance explicitly warns proxy operators about confused-deputy and SSRF risks. [S-036] [S-037] Therefore credential handling cannot be a late enterprise add-on: the safe baseline belongs in the open core.

### Data-plane / control-plane split

```text
Agent clients
│ one MCP endpoint
▼
Open data plane: protocol bridge → identity → policy → namespace/router
│                               │
│                               └─ customer vault or optional managed broker
▼
MCP servers / connector runtimes / existing APIs

Optional managed control plane:
registry, OAuth app management, connector CI, fleet config, dashboards,
reliability corpus, billing, enterprise directory sync, support/SLA
```

### Billable units

- **Successful tool execution:** aligns with platform use; exclude failed internal retries.
- **Monthly active connected account:** aligns with token lifecycle and provider-auth burden.
- **Managed sandbox compute:** pass-through plus margin, metered separately.
- **Enterprise platform subscription:** pays for identity, compliance, deployment and support.
- **Connector Assurance:** pays for operational maintenance independent of raw traffic.


## Confidence Notes

The entities and boundaries are proposed architecture, but security requirements are grounded in the MCP specification. Billing-unit suitability remains a market hypothesis.

## Open Threads

Define a portable credential-envelope standard that permits migration without exposing plaintext tokens to the control plane.

## Sources Used

- [S-036]
- [S-037]
