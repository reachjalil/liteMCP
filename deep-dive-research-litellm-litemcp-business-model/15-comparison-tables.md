---
title: "Comparison Tables"
file: "15-comparison-tables.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 20
---

# Comparison Tables

## Reader Promise

The reader can position liteMCP against credible alternatives and see where the proposed company is genuinely different.

## Summary (≤120 words)

The closest competitive threat is Obot, not Composio alone: it already combines an open-source MCP platform, gateway, hosting and enterprise identity. ContextForge is a broad protocol and governance platform. MetaMCP, MCPJungle and Docker make aggregation accessible. Composio leads in managed app auth and connector breadth. liteMCP must lead with portable managed credentials and evidence-backed connector assurance, not a generic unified endpoint.

## What We Found

## Business-model comparison

| Axis | LiteLLM | Composio | Obot | liteMCP proposal |
|---|---|---|---|---|
| Primary job | Normalize/manage LLM access | Give agents authenticated app tools | Complete MCP platform/gateway | Portable integration trust/control plane |
| Free distribution | MIT gateway/SDK core | MIT SDKs | Open-source platform | Apache core |
| Paid boundary | Enterprise controls/license/support | Hosted auth, calls, connectors; enterprise | Cloud/enterprise identity/support | Managed auth, assurance, fleet/enterprise |
| Data plane | Customer-hosted | Vendor-hosted service | Self-host or cloud | Self-host or cloud |
| Credential plane | Customer environment/secret managers | Composio stores/refreshes | Self-host/cloud options | Customer vault or portable managed broker |
| Public pricing | No | Yes, usage; changing | Limited | Proposed transparent PLG + annual enterprise |
| Primary moat | Provider coverage/community/enterprise embed | Connector ops, auth, telemetry | Open platform breadth + managed offer | Compatibility corpus + verified connectors + portability |
| Lock-in profile | Enterprise license and gateway config | Auth, policy and connections live with Composio | Lower through self-host | Explicit export/exit test |

Sources: LiteLLM [S-002] [S-003] [S-006] [S-007]; Composio [S-025] [S-026] [S-027] [S-028] [S-029] [S-030] [S-031] [S-032]; Obot [S-042] [S-043] [S-044].

## Product comparison

| Axis | Composio | Obot | ContextForge | MetaMCP | MCPJungle | Docker Gateway | liteMCP proposal |
|---|---|---|---|---|---|---|---|
| Unified endpoint | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Open functional gateway | No evidence; SDK open | Yes | Yes | Yes | Yes | Docker ecosystem | Yes |
| Managed per-user auth | Strong | Cloud/enterprise | Configurable | Limited | Limited | Credential management | Strong + portable |
| Verified connector assurance | Vendor-managed, opaque evidence | Registry/hosting | Supply-chain features | No clear | No clear | Catalog curation | Public test evidence + SLA |
| REST/gRPC virtualization | Connector catalog | Partial | Strong | MCP aggregation | MCP aggregation | Catalog servers | REST first; gRPC later |
| Enterprise IdP | Yes | Yes | Auth features | Limited | Limited | Ecosystem-dependent | Yes |
| Policy/approvals | Strong enterprise | Strong | Plugins/guardrails | Middleware | Access control | Profiles/security | Open policy + paid workflows |
| Metadata audit | Yes | Yes | Yes | Mixed | Observability | Logs | Yes |
| Air-gap | Enterprise option | Self-host | Yes | Yes | Yes | Local | Yes |
| Protocol compatibility evidence | No public contract found | No public contract found | Extensive tests | Unknown | Unknown | Docker-managed | Core differentiator |
| Credential portability contract | No | Self-host path | Self-host | Self-host | Self-host | Local | Explicit, tested |

Competitor evidence: [S-026] [S-040] [S-041] [S-042] [S-043] [S-045] [S-046] [S-047].

## Build-vs-buy guidance

**Choose Composio when** immediate breadth, hosted OAuth and a turnkey per-user integration experience matter more than control-plane portability.

**Choose Obot when** an existing open-source full MCP platform satisfies the use case and enterprise managed identity/support are acceptable.

**Choose ContextForge when** broad federation across MCP, A2A, REST and gRPC plus extensible governance matters more than a managed connector/auth marketplace.

**Choose MetaMCP or MCPJungle when** the problem is primarily self-hosted aggregation and routing.

**Choose Docker Gateway when** the team already standardizes on Docker's local catalog/toolkit and wants integrated server lifecycle and credentials.

**Build liteMCP only when** the company can make managed authentication and verified connector reliability materially more portable and inspectable than incumbents.

## Strategic wedge test

A buyer should be able to answer “yes” to at least three:

- We have ten or more MCP servers or connectors.
- We support three or more agent clients/frameworks.
- Multiple end users need their own app accounts.
- OAuth approvals/token refresh are recurring toil.
- Security requires a central revocation/audit point.
- Connector/auth drift has caused production incidents.
- We need self-host/VPC or an exit path from a hosted integration vendor.
- A repair objective for critical connectors has economic value.

Without that complexity, open aggregation tools are likely sufficient.

## Confidence Notes

Comparison cells reflect documentation, not controlled benchmarks. Products are moving quickly. liteMCP differentiation is a proposal and may already be partially implemented by competitors beyond the reviewed surfaces.

## Open Threads

Conduct a scripted bake-off and speak with at least three Obot users; the current thesis is invalid if Obot already meets the portability-plus-assurance need.

## Sources Used

- [S-002]
- [S-003]
- [S-006]
- [S-007]
- [S-025]
- [S-026]
- [S-027]
- [S-028]
- [S-029]
- [S-030]
- [S-031]
- [S-032]
- [S-040]
- [S-041]
- [S-042]
- [S-043]
- [S-044]
- [S-045]
- [S-046]
- [S-047]
