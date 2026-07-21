---
title: "Identity, Credential Portability and Trust"
file: "10-identity-and-trust.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "high"
sources_count: 5
---

# Identity, Credential Portability and Trust

## Reader Promise

The reader understands why authentication is the central product problem, which controls belong in open source, and how to avoid replacing model lock-in with credential lock-in.

## Summary (≤120 words)

MCP gateway identity is not a thin proxy concern. It combines client authentication, authorization-server discovery, upstream OAuth, token refresh, account delegation, egress control and audit. Composio monetizes this complexity by hosting connected accounts and credentials. liteMCP can differentiate by making the broker portable: safe local operation is open, managed custody is optional, and enterprise buyers may use their own vault or keys. Baseline security cannot be an enterprise-only gate.

## What We Found

## Threat model

Primary threats:

1. **Confused deputy:** a malicious client tricks the gateway into using its privileged upstream credential for an unintended resource.
2. **Token passthrough:** a client token is forwarded to an upstream for which it was not issued.
3. **SSRF and unsafe redirects:** a registered or compromised server causes calls into internal networks or metadata endpoints.
4. **Credential exfiltration:** package, connector or logging compromise exposes OAuth refresh tokens/API keys.
5. **Cross-tenant leakage:** cache, search index, audit or credential lookup mixes organizations.
6. **Tool substitution:** an upstream changes a tool schema/name and policy now authorizes a different action.
7. **Over-broad consent:** managed OAuth scopes exceed what the connected tools require.
8. **Stale offboarding:** a departed user retains tool access or refresh tokens.

The MCP security guidance calls out proxy confused-deputy and SSRF controls, while the authorization draft prohibits unsafe token handling and emphasizes resource metadata/audience. [S-036] [S-037]

## Open-source security baseline

The Apache core must include:

- OAuth protected-resource metadata and standards-compliant discovery;
- JWT validation, audience/issuer checking and key rotation;
- egress allowlists, private-address blocking and DNS rebinding defenses;
- redirect URI and origin validation;
- per-upstream credential isolation;
- encrypted local credential store with pluggable KMS/Vault providers;
- least-scope planning from tool manifests;
- explicit consent and revocation;
- basic RBAC/ABAC policy;
- immutable metadata audit events;
- signed connector manifests and build verification;
- secret redaction and payload logging off by default.

This avoids a perverse model where the free tier is structurally unsafe.

## Optional managed credential broker

Paid cloud value:

- operate vendor OAuth apps and complete provider approval processes;
- host connection pages and callback endpoints;
- store/rotate/refresh tokens in a hardened regional vault;
- detect revoked grants and provider auth changes;
- map one user identity to many provider accounts;
- issue short-lived execution grants to gateways;
- provide credential health dashboards and reconnect workflows;
- offer customer-managed keys, VPC endpoints and residency tiers.

Composio's documented model uses stable user IDs, managed connection links and stored/refreshed credentials. [S-027] This confirms the buyer value while also showing where dependency accumulates.

## Portability contract

liteMCP should publish and test four guarantees:

1. **Configuration export:** gateways, upstreams, connector versions and policies export as signed YAML/JSON.
2. **Connection export:** account metadata, scopes, provider IDs and expiry state export.
3. **Credential portability:** customer-owned OAuth apps and vaults migrate directly; managed vendor tokens may require provider re-consent where provider policy prohibits export.
4. **Exit test:** a conformance suite proves that an exported installation runs on self-hosted core without the cloud control plane.

Do not promise impossible token portability. Some provider-issued credentials may be bound contractually or technically to the vendor's OAuth app. State that limitation before connection.

## Multi-tenancy and isolation

- Tenant ID participates in every cache and database key.
- Data-plane workers use tenant-scoped short-lived credentials.
- Credential broker returns an execution grant, not a reusable refresh token.
- No wildcard organization administrator can read plaintext credentials.
- Support access is time-bound, approved and audited.
- Enterprise offers dedicated control-plane tenancy and VPC/self-hosted broker.

## Trust program

- SLSA-aligned build provenance `[inference]`;
- signed releases and reproducible connector builds;
- SBOM and dependency policy;
- external penetration tests and coordinated disclosure;
- public security advisories and revocation feed;
- disaster recovery and key-compromise runbooks;
- no weekly unannounced breaking release cadence for the LTS channel.

LiteLLM's 2026 PyPI incident demonstrates that a gateway dependency can become a credential-theft vector. [S-016] [S-017] liteMCP's business model depends on treating supply-chain assurance as product, not marketing.

## Confidence Notes

Threat classes and standards requirements are high confidence. The exact broker design and portability guarantees are proposed. Legal limits on exporting provider tokens need provider-by-provider validation.

## Open Threads

Decide whether managed credentials may ever transit the hosted control plane or whether all execution should use regional brokers deployed beside customer data planes.

## Sources Used

- [S-016]
- [S-017]
- [S-027]
- [S-036]
- [S-037]
