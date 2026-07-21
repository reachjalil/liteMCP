---
title: "Current-State Baseline: LiteLLM, Composio and MCP"
file: "05-current-state-baseline.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "high"
sources_count: 26
---

# Current-State Baseline: LiteLLM, Composio and MCP

## Reader Promise

The reader understands the businesses and product surfaces that liteMCP would map, compete with and differentiate from.

## Summary (≤120 words)

LiteLLM is an open-core AI gateway: a permissively licensed workload-facing proxy creates adoption, while enterprise security, hierarchy, deployment controls and support are commercially licensed. Composio is a hosted integration and authentication platform with MIT SDKs; its monetized backend manages sessions, credentials, tools and execution. MCP standardizes the client–tool protocol, but not connector quality, OAuth operations, policy, verification or reliable maintenance. Those unstandardized duties are the commercial opening—and the operational burden.

## What We Found


## LiteLLM baseline

LiteLLM's public product is an OpenAI-compatible gateway over 100+ model providers with fallbacks, cost tracking, virtual keys, budgets, teams, rate limits, guardrails and observability integrations. Its site lists the open-source tier at $0 and enterprise as quote-based, self-hosted or air-gapped, with support, SLA, JWT, SSO and audit logs. [S-002]

The repository license is explicit: code outside the enterprise directory is MIT, while enterprise code is carved out. [S-006] The enterprise license permits development/testing but requires a valid paid license for production and restricts redistribution. [S-007] This is **open core**, not a fully open enterprise product.

The enterprise package sells organizational control:

- SSO, SCIM, JWT/OIDC, RBAC and route controls;
- organization/team/project hierarchy and delegated administration;
- secret-manager integration, key rotation and audit retention;
- per-team logging/governance and multi-region/admin-worker deployment;
- support channels and optional 24/7 response SLAs. [S-003]

Deployment remains in the customer's environment, with a license key unlocking paid features; pricing depends on deployment size and can be procured through AWS/Azure marketplaces. [S-003] [S-009] This preserves data-plane trust while creating contract revenue.

LiteLLM's hiring indicates a shift from founder-led adoption to enterprise operations: first reliability/SRE and account-executive roles, plus an MCP engineer and product roles. Company-controlled listings self-report meaningful ARR and large traffic, but those numbers are not independently audited. [S-011] [S-012] [S-013] [S-014] [S-015]

### LiteLLM business-model loop

1. Ship provider support quickly under MIT.
2. Gain developer adoption through a drop-in OpenAI-compatible interface.
3. Become the shared production gateway.
4. Trigger governance, identity, support and procurement requirements.
5. Sell a commercial enterprise license and SLA.
6. Feed customer/provider edge cases back into the core.

The constraint is that a critical-path gateway must carry supply-chain and release-management risk. LiteLLM documents a rolling four-minor support window, roughly weekly minor releases and no LTS track. [S-003] Its March 2026 PyPI compromise illustrates the stakes: two malicious versions were published and removed, with credential rotation and CI/CD remediation following. [S-016] [S-017]

## Composio baseline

Composio sells hosted tool execution, per-user connected accounts, authentication, triggers and sandboxing across a large connector catalog. Its SDK repository is MIT, but the SDK quickstart requires a Composio API key and its default base URL is the proprietary hosted backend. [S-029] [S-030] [S-031] [S-032] Thus the open source is a client/distribution layer, not a self-hostable equivalent of the managed service.

Composio creates a stable user/session abstraction. It stores and refreshes credentials, creates connection links, exposes hosted MCP endpoints and can scope tools per user or team. [S-027] [S-028] The enterprise gateway adds one endpoint per team, tool whitelists/blacklists, destructive-action blocking, metadata-only audit, SAML/OIDC/SCIM and retention. [S-026]

Its public pricing is usage-based: free, low-cost and business tiers are denominated in monthly tool calls, with enterprise adding custom users/volume, SLA, SOC 2 and VPC/on-prem options. The page warns prices will change on August 15, 2026, so this is a time-stamped signal rather than a stable benchmark. [S-025]

Composio's claim of “no vendor lock-in” is narrower than it sounds: it avoids model-provider lock-in, while auth, scopes and policy live with Composio. [S-026] That creates an opening for a portable, self-hostable alternative.

## MCP baseline

The stable November 25, 2025 specification defines a JSON-RPC protocol with version negotiation. Standard transports are stdio and Streamable HTTP. [S-034] [S-035] Authorization is evolving around OAuth 2.1 and protected-resource metadata, while security guidance emphasizes audience binding, SSRF controls, consent and proxy confused-deputy risks. [S-036] [S-037]

The official registry is intentionally permissive and delegates deeper moderation to subregistries; it does not promise to remove merely buggy or vulnerable servers. [S-038] [S-039] Therefore the protocol and registry do not solve:

- connector verification and provenance;
- OAuth app registration and token operations;
- schema drift and compatibility regression;
- tool risk classification and approval;
- enterprise identity, audit and deployment;
- reliable execution and incident response.

Those are the layers a business can sell without privatizing MCP itself.


## Confidence Notes

Current feature and licensing claims are grounded in official sources. Company operating metrics and the durability of current prices are less certain. Composio's internal backend implementation was not available for inspection.

## Open Threads

Run the same onboarding use case through LiteLLM MCP, Composio, Obot and a self-hosted gateway to quantify time-to-first-authenticated-tool and failure recovery.

## Sources Used

- [S-002]
- [S-003]
- [S-006]
- [S-007]
- [S-009]
- [S-011]
- [S-012]
- [S-013]
- [S-014]
- [S-015]
- [S-016]
- [S-017]
- [S-025]
- [S-026]
- [S-027]
- [S-028]
- [S-029]
- [S-030]
- [S-031]
- [S-032]
- [S-034]
- [S-035]
- [S-036]
- [S-037]
- [S-038]
- [S-039]
