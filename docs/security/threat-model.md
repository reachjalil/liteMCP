# LiteMCP Composer threat model

Status: target design; not implementation evidence
Last reviewed: 2026-07-21
Owners: security and platform maintainers

Implementation status: not evidenced.

## Read this first

This document defines the security properties LiteMCP Composer is required to provide. It does not assert that the current repository implements or has tested them. A control is shipped only when it is linked from the implementation-status document to code, automated tests, and operational evidence.

LiteMCP Composer must not be described as production-ready until the release gates in this document pass. This document makes no certification claim, including SOC 2, ISO 27001, HIPAA, FedRAMP, or GDPR certification.

All controls described here are part of the open-source, self-hostable product. Self-hosted installations must work without a LiteMCP Composer managed cloud account, license service, telemetry service, revocation feed, or any other call-home dependency. Operators may opt into external services, but loss of those services must not disable local authentication, authorization, audit, registry, or MCP execution.

## Scope and architecture assumptions

This model covers:

- the Astro/React browser console;
- the Hono control-plane API;
- the MCP discovery and execution gateway;
- background workers, trigger receivers, and approval flows;
- the identity subsystem, Better Auth sessions, Entra OIDC, SCIM, API tokens, and service principals;
- connected accounts, OAuth callbacks, credential refresh, and execution grants;
- registry imports and publication;
- remote MCP, webhook, and OpenAPI network access;
- local or containerized MCP execution;
- Cloudflare and Kubernetes deployment shapes;
- configuration, policy, audit, cache, object, and secret stores.

The portable core depends on a NoSQL DocumentStore port. The working-tree
Cloudflare adapter keeps non-authoritative records in Workers KV and routes the
authorization/execution-sensitive slice through one SQLite Durable Object per
tenant. That provides per-document serialization, not a transaction across
documents, D1, KV, or an external dispatch. The Kubernetes adapter uses a
MongoDB replica set so conditional updates and multi-document transactions are
available, although current product workflows do not yet wrap state plus audit
in those transactions. Better Auth uses D1 on Cloudflare and MongoDB on
Kubernetes. Better Auth authenticates principals and manages sessions; it is
not the authorization boundary. The Hono API and MCP gateway must authorize
every protected operation independently.

These documents define intended behavior. At the time of writing, implementation, penetration-test, scale, recovery, and conformance evidence has not been established.

## Research evidence note

The official MCP authorization direction and security guidance motivate resource/audience binding, proxy confused-deputy defenses, safe token handling, and SSRF controls [S-036] [S-037]. The LiteLLM PyPI compromise is concrete evidence that a gateway supply-chain failure can become a credential-theft path [S-016] [S-017]. Managed per-user connected accounts and hosted per-session MCP endpoints are observed vendor patterns [S-027] [S-028]; they demonstrate product demand, not that LiteMCP Composer implements them or inherits their security properties.

Evidence keys resolve through the research package's [evidence ledger](../../deep-dive-research-litellm-litemcp-business-model/19-evidence-ledger.md). Draft standards and vendor documentation must be rechecked when the implementation pins protocol and library versions.

## Security objectives and invariants

The following are non-negotiable invariants:

1. Every persisted or cached tenant-owned record is keyed and queried with an organization identifier.
2. Authentication alone never grants access. The API and gateway evaluate current authorization for both discovery and execution.
3. A capability hidden from discovery cannot be executed by guessing its name or replaying a stale descriptor.
4. Policy is bound to stable capability identity, upstream provenance, and version—not display names alone.
5. The client and model never receive provider refresh tokens, client secrets, API keys, or secret-bearing headers.
6. The credential plane releases credentials only to an authorized execution path through a short-lived, audience-bound execution grant.
7. Control-plane credentials and MCP data-plane session credentials are distinct and cannot be substituted for one another.
8. Bearer tokens, authorization codes, and session tokens never appear in URLs.
9. Payload retention is off by default. Audit records contain security and provenance metadata, not secret-bearing request or response bodies.
10. A deny or emergency revocation takes precedence over an allow, and its propagation has a measurable, tested bound.
11. Non-idempotent operations are not automatically retried or failed over without an explicit idempotency contract.
12. Managed cloud and self-hosted releases use the same portable core and security capabilities.

## Assets

### Highest sensitivity

- OAuth refresh and access tokens, API keys, service-account material, client secrets, signing keys, encryption keys, webhook secrets, and recovery material;
- Better Auth session state, browser cookies, API tokens, service-principal credentials, and MCP session tokens;
- credential-encryption key versions and vault references;
- raw tool inputs and outputs when an operator explicitly enables payload capture.

### High sensitivity

- tenant, membership, group, role, app-role, claim-mapping, and policy data;
- composition versions, hidden tool inventories, routing rules, and approval records;
- connected-account ownership, provider account identifiers, scopes, expiry, and health;
- SCIM tokens and provisioning state;
- audit records, policy explanations, trace correlation, IP/network context, and security alerts;
- private registry artifacts, connector packages, schemas, provenance, signatures, and SBOMs.

### Availability and integrity assets

- discovery and execution availability;
- policy, group, revocation, health, and routing cache freshness;
- immutable version and artifact identity;
- audit ordering and integrity;
- export, backup, restore, and air-gapped operation;
- DNS, egress policy, secret managers, databases, queues, and object storage.

## Trust boundaries and data flows

### Boundaries

1. **Browser to edge/API.** Untrusted browser input crosses cookie, CSRF, XSS, CORS, and session boundaries.
2. **Identity provider to callback.** Claims and authorization responses originate outside LiteMCP Composer and must be cryptographically and semantically validated.
3. **SCIM client to provisioning API.** A highly privileged bearer crosses from an enterprise directory into a tenant-scoped write surface.
4. **Control plane to DocumentStore.** Tenant, policy, and configuration writes cross a storage-consistency boundary. KV eventual consistency cannot be treated as serialization.
5. **Control plane to data plane.** Signed, versioned configuration and revocation information cross from administration into runtime enforcement.
6. **Gateway to credential plane.** An execution decision is exchanged for narrowly scoped credential use. Plaintext credentials must not cross back into the client-facing gateway response.
7. **Gateway to upstream MCP/provider.** Tenant data and provider credentials leave LiteMCP Composer for an independently operated system.
8. **Worker to untrusted connector/code.** Packages, commands, schemas, and outputs execute across a sandbox boundary.
9. **Registry/importer to control plane.** Untrusted manifests, OpenAPI documents, packages, images, and metadata enter trusted storage.
10. **Telemetry/audit exporter.** Metadata may leave the deployment for an operator-configured destination.
11. **Cloudflare platform boundary.** Workers, KV, D1, Durable Objects, queues, and configured key services are separate managed trust domains.
12. **Kubernetes cluster boundary.** ingress, pods, MongoDB, secret providers, object storage, and cluster administrators are separate trust domains.

### Required execution sequence

For each call, the gateway must:

1. authenticate a short-lived data-plane session;
2. resolve its organization, environment, principal, client, and composition version;
3. load current group, role, policy, and revocation versions;
4. authorize the stable tool identity and exact action;
5. validate and constrain parameters before route selection;
6. select an allowed, healthy upstream deterministically;
7. mint or request a bound execution grant;
8. redeem the grant inside the credential/execution boundary;
9. execute once unless the action has a tested idempotency strategy;
10. emit redacted audit and trace metadata with policy and provenance identifiers.

## Threat actors

- unauthenticated internet attackers scanning public sites, callbacks, SCIM, webhooks, and MCP endpoints;
- malicious or compromised ordinary tenant users;
- malicious tenant administrators attempting to exceed their organization boundary;
- compromised browser sessions, MCP clients, API tokens, service principals, or IdP accounts;
- malicious upstream MCP operators, connector publishers, registry publishers, and OAuth providers;
- compromised connector dependencies, packages, build systems, images, or CI credentials;
- compromised or mistaken deployment operators and support personnel;
- cloud-platform or infrastructure insiders with access to managed services;
- network attackers able to influence DNS, redirects, proxies, or egress;
- resource-exhaustion attackers using large schemas, streams, recursive documents, connection floods, or expensive tools.

Tenant administrators are trusted to configure their own organization but are not trusted with another tenant or with raw credentials. Infrastructure administrators may technically control a self-hosted deployment; LiteMCP Composer must reduce and audit their routine access but cannot protect data from a fully compromised host or cluster owner.

## Abuse cases, controls, and residual risk

| Threat or abuse case | Required preventive and detective controls | Residual risk |
|---|---|---|
| OAuth confused deputy | Exact redirect allowlists; state and PKCE; bind authorization request to organization, principal, auth profile, provider, redirect, and expiry; require fresh authenticated intent; do not let callback parameters choose a different tenant or account | A compromised OAuth app or provider can still issue or misuse tokens |
| Authorization-code interception or redirect abuse | Authorization Code flow with PKCE; single-use state; exact scheme/host/path match; no wildcard production callbacks; short callback lifetime; code never logged; secure cookies and CSRF controls | Browser or endpoint compromise remains possible |
| Issuer, tenant, or audience confusion | Pin issuer and allowed tenant IDs; validate signature, issuer, audience, authorized party, nonce, time claims, and accepted algorithms; reject unsigned or ambiguous tokens | IdP key or tenant compromise remains authoritative |
| Token passthrough | Never forward a client bearer token as an upstream credential; exchange an authorization decision for an audience-bound execution grant; store provider tokens only in the credential plane | An execution worker with plaintext token access remains high impact |
| SSRF through MCP URLs, redirects, webhooks, imports, or parameters | Canonical URL parser; permitted schemes and ports; resolve and validate every hop; block loopback, link-local, private, multicast, metadata, and cluster ranges by default; outbound proxy/network policy; redirect cap; destination audit | Approved private destinations intentionally widen the boundary and require explicit policy |
| DNS rebinding | Resolve through a controlled resolver; validate all returned addresses; pin the validated address for the connection where safe; revalidate after TTL and every redirect; set Host/SNI from the approved hostname | DNS and proxy differences can create bypasses and require platform-specific tests |
| Malicious MCP schemas or oversized descriptions | Strict schema parsing, byte/depth/count limits, timeouts, canonicalization, quarantine, compatibility testing, and content digesting before activation | Semantically deceptive but valid metadata cannot be fully detected automatically |
| Tool-name spoofing and provenance confusion | Stable tool UID plus upstream/version/build digest; namespacing; immutable published versions; schema diff on change; show provenance in UI, logs, and policy explanation | Users can still approve misleading tools if provenance UX is ignored |
| Prompt or tool metadata injection | Treat descriptions and upstream output as untrusted data; never interpolate them into system instructions or policy; render safely; redact active content; isolate model context from secrets | Models may still follow persuasive untrusted content; authorization remains the backstop |
| Hidden-tool execution bypass | Apply the same policy engine to list and call; re-evaluate at call time; deny unknown, stale, or revoked capability IDs; invalidate discovery caches on identity/policy change | Propagation delay must be bounded and tested |
| Cross-tenant access | Organization ID in every key, index, cache, event, object prefix, and grant; repository APIs require tenant context; negative isolation tests; avoid global fallback queries | Application, storage-adapter, or operator mistakes remain critical risks |
| Stale group, role, or policy cache | Version every authorization snapshot; push invalidation; short TTL; gateway rejects stale versions after emergency revocation; fail closed for sensitive actions | Short availability/latency tradeoffs exist during control-plane partitions |
| Secret leakage through logs, traces, errors, URLs, or UI | Structured allowlist logging; recursive redaction middleware; no payloads by default; sanitize exceptions; prohibit query-string secrets; test known and randomized secret shapes; restrict telemetry destinations | Arbitrary secret values can evade pattern-only redaction, so allowlisting is preferred |
| Credential-store compromise | Envelope encryption; separate KEK/DEK; authenticated encryption and context binding; key rotation; least-privilege key access; no plaintext admin APIs; short-lived execution grants; anomalous-access alerts | Host, runtime, or KMS compromise can expose credentials during legitimate use |
| Concurrent refresh or stale credential overwrite | Compare-and-swap/version checks; one refresh leader per connection; Durable Object serialization on Cloudflare; MongoDB replica-set transactions on Kubernetes; revoke on refresh-token reuse where supported | Workers KV alone cannot provide the required consistency guarantee |
| Arbitrary command or container execution | Never execute user-supplied stdio on the host; non-root, read-only, capability-dropped sandbox; resource and network limits; explicit mounts; ephemeral filesystem; image allowlist/digest | Container/kernel escape and malicious allowed egress remain residual risks |
| Webhook replay or forgery | Provider-specific signature verification; timestamp window; constant-time comparison; event ID deduplication; tenant-bound secret; body-size limit before parsing | Providers without signatures require compensating network and shared-secret controls |
| Supply-chain compromise | Lockfiles, dependency review, minimal images, CI isolation, secretless untrusted builds, SBOMs, vulnerability scanning, signed releases/images, provenance, digest pinning, connector quarantine and revocation | A signed malicious build or compromised maintainer is still possible |
| Malicious registry publication | Authenticated publisher identity; immutable digest; ownership checks; malware/static analysis; permission manifest; report/quarantine/revoke; do not equate publication with verification | Review cannot prove a connector is harmless |
| Browser/admin/session token theft | HttpOnly Secure SameSite cookies; short sessions; rotation; CSRF defense; CSP; WebAuthn/MFA when provider supports it; reauthentication for destructive admin actions; device/session inventory | Endpoint compromise can operate within an active session |
| SCIM credential theft or malicious provisioning | Tenant-scoped hashed bearer tokens, optional mTLS/network policy, rotation, rate limits, strict schemas, idempotency, audit, and immediate session/access revocation on deactivation | A valid SCIM client is intentionally powerful inside its tenant |
| Audit deletion or tampering | Append-only API; separate write/read roles; sequence/hash chaining or immutable sink; export to operator-controlled storage; clock discipline; alerts for gaps; never offer silent mutation | A fully compromised deployment administrator can tamper unless logs are exported off-host |
| Unsafe retry or failover | Classify action semantics; idempotency keys and result ledger where supported; no automatic replay of destructive/unknown actions; surface indeterminate outcomes | Network loss after upstream commit can remain ambiguous |
| Data residency or unauthorized egress | Region and destination policy evaluated before connection; deny-by-default egress; regional stores; operator-controlled telemetry; payload logging off; explicit transfer inventory | Upstream providers process data under their own terms and locations |
| Denial of service and cost abuse | Authentication where possible; per-IP/principal/tenant quotas; schema/body/stream limits; concurrency caps; timeouts; circuit breakers; queue bounds; fair-use controls; cost and anomaly alerts | Distributed attacks and inherently expensive upstream tools can exhaust quotas |
| Policy engine unavailable | Cache only signed, versioned policy; define bounded offline validity; fail closed for new/sensitive actions; emergency local deny list; audit degraded mode | Strict failure can reduce availability; permissive failure is prohibited |
| Identity provider unavailable | Existing short-lived sessions may continue only within configured lifetime and unchanged authorization version; new sign-in and JIT provisioning fail; local break-glass is self-hosted and audited | Recovery access is itself sensitive and must be protected offline |

## Storage-specific controls

### Portable DocumentStore contract

Every adapter must support tenant-scoped reads, conditional write by version, tombstones, pagination with stable cursors, explicit consistency metadata, and deterministic conflict errors. Higher layers must not infer strong consistency from the interface. Security-critical callers must request serialized execution or fail closed.

### Cloudflare

- Workers KV is suitable for non-authoritative configuration/read models, not as proof of linearizable identity or policy writes.
- The working tree routes current roles/IdPs, server/composition/policy state, sessions/epochs/freeze, approvals, OAuth grants, quotas, service principals, and audit state through a tenant Durable Object. Writes are serialized per document; compound product transitions, SCIM, connected-account refresh, outbox coupling, and external dispatch still need explicit atomicity protocols and proof.
- D1 is the Better Auth store and must have tenant-safe session queries, migrations, backups, and restore tests.
- Secrets require an envelope-encryption KeyProvider or external secret manager; KV values must never contain plaintext credential material.
- Until serialization, invalidation, and multi-region revocation tests pass, the managed cloud deployment on Cloudflare must be labeled development/MVP rather than production-safe for enterprise identity or credential custody.

### Kubernetes

- MongoDB must run as a replica set for transactions, majority write concern, change streams/invalidation, and supported backup semantics.
- Better Auth uses MongoDB through its supported adapter, isolated logically from core domain collections.
- NetworkPolicies must constrain gateway, worker, database, DNS, IdP, secret-manager, and upstream paths.
- pods run non-root with least privileges, read-only filesystems where practical, explicit service accounts, and no default host mounts.
- external Vault/KMS/secret-manager adapters are optional, open-source integration points; local envelope encryption remains available.

Storage substitution must not change policy semantics, grant validation, tenant scoping, audit fields, or the public APIs.

## Incident controls

### Required emergency actions

An authorized incident responder must be able to:

- revoke a browser session, API token, service principal, MCP session, execution grant, connection, auth profile, provider application, tool, MCP server/version, connector build, composition, or signing key;
- disable all execution for an organization or environment while retaining administrative recovery access;
- publish a local deny rule that the data plane can consume without a managed cloud dependency;
- freeze credential refresh and webhook/trigger processing;
- quarantine a registry artifact by digest and prevent cached execution;
- rotate cookie, token-signing, execution-grant, webhook, and envelope-encryption keys;
- export a redacted incident timeline and audit evidence to operator-controlled storage.

### Detection

Generate tenant-scoped alerts for repeated authorization denial, issuer/audience mismatch, state/nonce failure, refresh-token reuse, unusual credential redemption, new egress destinations, suspected SSRF, group/admin escalation, SCIM bursts, audit gaps, revoked artifact use, and anomalous execution volume. Alert content must not contain credentials or payloads.

### Response playbooks

The open repository must include tested playbooks for:

1. signing-key compromise;
2. credential-encryption key compromise;
3. provider OAuth application compromise;
4. cross-tenant exposure;
5. malicious or compromised connector/image;
6. IdP or SCIM credential compromise;
7. audit pipeline failure;
8. Cloudflare or MongoDB data corruption;
9. sandbox escape suspicion;
10. data-residency violation.

Each playbook must define containment, revocation scope, evidence preservation, customer/operator communication, recovery, key/token reissue, and a verification test. Responsible disclosure and public advisory processes remain open and do not require a commercial contract.

## Data minimization and privacy

- Tool payload collection is off by default in every edition.
- Invocation analytics uses a strict dimensions-and-measures schema that
  rejects arguments, results, display names, emails, and unknown fields; byte
  counts never include the bodies themselves.
- Invocation records use stable opaque IDs and record only the metadata needed for authorization, provenance, reliability, quota, and incident response. Analytics does not join subject IDs to profile display names.
- MCP client name/version attribution is self-reported. The first valid value is
  stored separately from the authorization-session revision and must never be
  treated as cryptographic client identity or policy authority.
- External provider identifiers are encrypted or irreversibly hashed where practical.
- Mongo analytics retention is operator-configurable; the managed exact feed is
  count-capped. Complete audit retention/deletion controls must still cover
  primary data, caches, indexes, queued work, exports, and documented backup
  expiry before production readiness.
- Telemetry is opt-in for self-hosted installations and has no hidden endpoint.
- Support access, if configured, is time-bound, approved, least-privileged, and audited.
- Configuration export excludes secrets by default and supports local import without contacting the LiteMCP Composer managed cloud.

## Release security gates

Production readiness requires evidence for all of the following:

- tenant-isolation tests across DocumentStore, Better Auth, cache, audit, object keys, search, and queues;
- policy list-versus-call tests, including stale descriptors and emergency revocation;
- OAuth callback, issuer, audience, PKCE, state, nonce, redirect, and confused-deputy tests;
- Entra mapping and SCIM deprovisioning contract tests;
- secret-redaction tests for logs, traces, errors, and client responses;
- execution-grant binding, expiry, replay, and revocation tests;
- SSRF and DNS-rebinding tests on every supported deployment;
- webhook signature and replay tests;
- sandbox isolation and egress tests;
- destructive-call retry/failover tests;
- dependency, image, license, SBOM, signature, and provenance checks;
- backup, restore, key rotation, compromise, and audit-integrity exercises;
- Cloudflare Durable Object serialization/invalidation tests;
- MongoDB transaction/failover tests;
- Kubernetes NetworkPolicy and air-gapped smoke tests;
- an external security review before hosted third-party credential custody.

Failures must block production designation. A UI, schema, or untested configuration option is not evidence that a control exists.

## Explicit residual risks and open decisions

- LiteMCP Composer must briefly handle plaintext provider credentials inside a trusted execution boundary; memory disclosure there remains high impact.
- A self-hosted operator with root, cluster-admin, database-admin, and key access can defeat application controls.
- Upstream providers and MCP servers can retain submitted data, change behavior, or become compromised.
- Model prompt injection cannot be eliminated; tool authorization, parameter constraints, approvals, and sandboxing limit impact.
- Strong, globally bounded revocation on Cloudflare depends on deployment of the current Durable Object path plus measured propagation/failure behavior; local adapter tests are not that proof.
- The gateway performs a final authority/context check immediately before the executor call, but no transaction spans that check and an external network side effect. Freeze or revoke racing after the check can occur after dispatch begins until a linearizable lease/barrier design exists.
- Whether one-time execution grants are required for all actions or only sensitive actions remains an implementation decision; no single-use claim may be made while backed only by KV.
- Private-network MCP access weakens default SSRF protections and requires explicit destinations plus deployment-level egress enforcement.
- Credential export may be impossible when provider tokens are tied to a cloud-operated OAuth application; re-consent must be documented before connection.
- Availability and recovery objectives have not yet been measured.

## Review triggers

Review this model before changing an authentication provider, storage adapter, session/grant format, policy engine, sandbox, network path, telemetry destination, registry trust level, deployment platform, or secret manager, and after every material security incident.
