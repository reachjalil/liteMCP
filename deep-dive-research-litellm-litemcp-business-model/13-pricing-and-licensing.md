---
title: "Pricing and Licensing"
file: "13-pricing-and-licensing.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 6
---

# Pricing and Licensing

## Reader Promise

The reader can distinguish observed market prices from the proposed liteMCP meter, tiers and open-core constitution.

## Summary (≤120 words)

LiteLLM proves that quote-based enterprise licensing can monetize a self-hosted permissive core, while Composio shows public usage pricing for hosted tool execution. liteMCP should combine a generous Apache-2.0 core with SaaS pricing on successful executions and monthly active connected accounts. Enterprise price should attach to organization-wide controls, deployment and SLA. All liteMCP amounts are illustrative and require interviews and cost benchmarks.

## What We Found

## Observed pricing signals

| Product | Public signal as of research date | Interpretation |
|---|---|---|
| LiteLLM OSS | $0; substantial gateway fundamentals | Free product is operationally useful [S-002] |
| LiteLLM Enterprise | Quote; deployment-size dependent; marketplace private offer | High-touch annual contract [S-003] [S-009] |
| Composio Free | 20K tool calls/month | Developer acquisition [S-025] |
| Composio low tier | $29/month, 200K calls, published overage | Usage conversion [S-025] |
| Composio business | $229/month, 2M calls, published overage | PLG expansion [S-025] |
| Composio enterprise | Custom users/volume, SLA, SOC 2, VPC/on-prem | Security/procurement expansion [S-025] |
| Nango | Free; paid tiers from tens to hundreds monthly, active-connection/request meter | Managed auth analogue [S-048] |
| Pipedream | Credits plus external-user dimensions | Integration-compute analogue [S-049] |

Composio says pricing will change on August 15, 2026; treat its current page as a snapshot, not a permanent anchor. [S-025]

## Recommended open-source license

**Apache License 2.0 for liteMCP Core** `[proposal]`.

Why:

- permissive adoption for enterprises and vendors;
- explicit patent grant;
- compatible with embedding and hosted use;
- avoids AGPL procurement resistance while open competitors already use permissive licenses;
- forces the company to win through service, reliability and enterprise value rather than a network-use restriction.

Commercial modules may remain source-available or closed, but their boundary must be narrow and published.

## Open-core constitution

The company commits that these remain open:

- standards-compliant gateway and transports;
- routing, namespaces, health, retries/circuit breakers;
- local auth, encrypted secrets and pluggable vault;
- baseline RBAC/ABAC/policy;
- config-as-code, export/import and event stream;
- OpenTelemetry;
- connector manifest/SDK and compatibility runner;
- single-cluster production deployment;
- security patches and protocol conformance.

Paid areas:

- hosted operations and managed regional credential broker;
- company-operated OAuth apps/approvals;
- verified Connector Assurance service and repair SLA;
- fleet control, advanced approvals and long retention;
- SAML/SCIM/delegated administration;
- BYOK/HSM, private networking, multi-region HA/federation;
- compliance evidence, enterprise support and contractual SLA.

Publish a feature-boundary change process requiring notice and rationale. Do not move an existing core capability behind a paywall.

## Proposed hosted pricing `[inference]`

| Tier | Monthly price | Included successful executions | Active connected accounts | Key value |
|---|---:|---:|---:|---|
| Community self-host | $0 | Unlimited | Unlimited | Functional Apache core |
| Cloud Free | $0 | 20,000 | 10 | 3 gateways, 7-day metadata |
| Starter | $49 | 250,000 | 50 | Managed auth, 30-day metadata |
| Growth | $399 | 2,000,000 | 500 | Team policy, 90-day metadata, support |
| Business | $1,499 | 10,000,000 | 2,000 | SSO/RBAC, one-year audit, private networking option |
| Enterprise | $30K+/year | Contract | Contract | VPC/self-host, SCIM, BYOK, SLA, certified connectors |

Illustrative overages:

- Starter: $0.20 / 1,000 successful executions; $0.50 / extra active connection.
- Growth: $0.15 / 1,000; $0.35 / connection.
- Business: $0.10 / 1,000; $0.25 / connection.
- Sandbox compute billed separately.
- Internal failed retries are not billable.
- Policy-denied calls are not billable executions.
- Customer-caused invalid requests may count only after an abuse threshold, not by default.

## Why two usage dimensions

A pure call meter underprices dormant-but-operationally-expensive OAuth accounts; a pure connection meter underprices high-throughput stateless APIs. Successful executions plus monthly active connections tracks both infrastructure and managed-auth toil. Keep invoices comprehensible by including meaningful allowances.

## Connector Assurance packaging

- **Community connectors:** no promise; public tests.
- **Verified:** signed build, routine compatibility tests, CVE feed.
- **Assured:** published repair objective and named supported provider/API versions.
- **Dedicated:** customer-specific connector and change-management SLA.

Assurance can be included in Business/Enterprise or sold as an add-on. It should not become a paywall for connector source.

## Gross-margin target

Target 75–85% blended software gross margin `[inference]`. Managed sandbox compute and human-intensive connector work should be separately metered or scoped, otherwise high-use customers can turn a software subscription into a services contract.

## Confidence Notes

Observed competitor prices are high confidence on July 20, 2026 but time-sensitive. Proposed tiers, meters and margin targets are strategic assumptions, not market evidence.

## Open Threads

Benchmark token-vault, OAuth refresh, connector CI, support and sandbox costs; then test three pricing presentations with design partners.

## Sources Used

- [S-002]
- [S-003]
- [S-009]
- [S-025]
- [S-048]
- [S-049]
