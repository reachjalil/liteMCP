---
title: "Glossary"
file: "24-glossary.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "high"
sources_count: 8
---

# Glossary

## Reader Promise

The reader can translate vendor and protocol terms into plain language and standard equivalents.

## Summary (≤120 words)

The glossary separates protocol concepts from product packaging. Several terms—gateway, connector, toolkit, session and open source—are used differently across vendors. liteMCP should define them precisely to avoid misleading buyers and contributors.

## What We Found

Protocol terms follow the current MCP specification and authorization guidance; vendor terms follow LiteLLM and Composio documentation. [S-002] [S-003] [S-026] [S-027] [S-034] [S-035] [S-036] [S-038]

| Term | Vendor/spec usage | Plain-English translation | Closest standard equivalent |
|---|---|---|---|
| AI Gateway | LiteLLM entry point for many model APIs | Shared proxy/control point for model calls | API gateway specialized for LLM APIs |
| OpenAI-compatible | LiteLLM request/response shape | Clients call one familiar API while providers vary | Compatibility facade |
| Virtual key | LiteLLM scoped proxy credential | Organization-issued access key with budgets/policy | API key / delegated credential |
| Enterprise directory | LiteLLM commercially licensed code | Paid modules in the same repository | Open-core commercial extension |
| Toolkit | Composio app integration and its actions | Connector plus tool catalog | Integration adapter |
| Connected account | Composio user-to-app credential binding | One user's authorized account at a provider | OAuth grant / credential binding |
| Session | Composio user-scoped tool context | Stable handle for a user's tools/connections | Application session |
| Hosted MCP endpoint | Composio session URL | Vendor-operated MCP server URL for selected tools | Remote MCP server |
| MCP gateway | Many vendors | Proxy/aggregator in front of one or more MCP servers | API gateway / service mesh edge |
| MCP server | Protocol term | Program exposing tools, resources and prompts to an MCP client | Tool/resource service |
| MCP client | Protocol term | Host-side component that connects to servers | Protocol client |
| Streamable HTTP | MCP transport | HTTP transport for JSON-RPC messages and streams | Stateful/stateless HTTP messaging transport |
| stdio | MCP transport | Client launches local server and communicates over process pipes | Local IPC |
| Protected resource metadata | OAuth/MCP auth | Machine-readable information about how to authorize to a server | RFC 9728-style metadata |
| Tool | MCP primitive | Callable action with a JSON schema | Function/API operation |
| Resource | MCP primitive | Readable context/data address | URI-addressed data source |
| Prompt | MCP primitive | Server-provided prompt template | Template/resource |
| Subregistry | MCP registry model | Curated index built from or beside the official registry | Package mirror/curated catalog |
| Verified connector | liteMCP proposal | Signed connector build with reproducible passing tests | Certified integration artifact |
| Connector Assurance | liteMCP proposal | Ongoing monitoring, repair objective and supported versions | Maintenance/SLA subscription |
| Compatibility report | liteMCP proposal | Evidence that a build works with named clients/auth/spec versions | Conformance test report |
| Credential envelope | liteMCP proposal | Encrypted token/key plus metadata and key reference | Envelope encryption record |
| Execution grant | liteMCP proposal | Short-lived right for a worker to use one upstream account | Capability token |
| Data plane | Architecture | Runtime path handling tool calls | Request-processing plane |
| Control plane | Architecture | Configuration, registry, fleet and governance services | Management plane |
| Open core | Business model | Functional open product plus paid proprietary modules/services | Commercial open-source model |
| Portable | liteMCP promise | Exportable config/policy and a tested self-host exit path | Interoperable/migratable |
| Successful execution | Proposed meter | Tool call that reaches an accepted successful outcome | Billable transaction |
| Monthly active connected account | Proposed meter | User-provider account used during the month | Active integration connection |
| LTS | Release model | Supported line with longer compatibility/security window | Long-term support |
| SBOM | Security | Inventory of software components in a build | Software bill of materials |
| SLSA | Security | Supply-chain integrity framework | Build provenance standard |

## Confidence Notes

Protocol definitions follow current MCP documentation; vendor terms reflect current public usage. Proposed liteMCP terms must be finalized in product specifications.

## Open Threads

Align the connector manifest and compatibility-report vocabulary with any emerging MCP registry extension standards.

## Sources Used

- [S-002]
- [S-003]
- [S-026]
- [S-027]
- [S-034]
- [S-035]
- [S-036]
- [S-038]
