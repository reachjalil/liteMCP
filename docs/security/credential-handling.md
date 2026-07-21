# Credential handling and execution grants

Status: target design; not implementation evidence
Last reviewed: 2026-07-21
Related model: [Threat model](./threat-model.md)

Implementation status: not evidenced.

## Purpose and status

LiteMCP Composer is intended to broker high-value provider credentials. This document specifies how the future credential plane must acquire, encrypt, select, refresh, use, revoke, export, and audit credentials without exposing them to MCP clients or models.

The terms MUST, MUST NOT, SHOULD, and MAY express product requirements. They do not describe verified current behavior. At the time of writing, no implementation or automated evidence for the envelope, grant redemption, refresh serialization, redaction, or key-rotation flows has been established. Hosted credential custody must not be offered as production-ready until the security gates below pass.

Every capability in this design is intended to remain available in the open-source self-hosted distribution. Future self-hosted credential use must not depend on the LiteMCP Composer managed cloud, a license check, telemetry, or any call-home. Managed cloud and Kubernetes are intended to use the same portable credential-domain code behind storage, key, and secret-provider ports.

## Research evidence note

MCP's authorization draft and security guidance support audience-bound resource authorization, rejection of unsafe token passthrough, and explicit proxy confused-deputy and SSRF controls [S-036] [S-037]. Composio documentation provides evidence for the utility of per-user managed connected accounts and hosted per-session MCP endpoints [S-027] [S-028]. LiteMCP Composer adopts the user/account/session problem statement, while the target design makes the broker, grants, storage, and exit path portable; the vendor evidence is not implementation evidence for this design. The LiteLLM package compromise shows why credential isolation, signed artifacts, rapid revocation, and supply-chain response are required [S-016] [S-017].

Evidence keys resolve through the research package's [evidence ledger](../../deep-dive-research-litellm-litemcp-business-model/19-evidence-ledger.md).

## Separation of responsibilities

| Component | May handle | Must not do |
|---|---|---|
| Browser/MCP client | OAuth start URL, connection status, short-lived LiteMCP Composer session token | Receive provider tokens, client secrets, envelope ciphertext, or secret references |
| Hono control plane | Auth-profile metadata, consent intent, connected-account metadata, redacted health | Decrypt provider credentials or authorize execution based only on UI state |
| Better Auth | User authentication and LiteMCP Composer browser/session lifecycle | Store upstream provider credentials or decide tool authorization |
| Policy engine/gateway | Principal and session context, stable tool ID, route, connection ID, grant | Read reusable provider refresh tokens or return secrets to the caller |
| Credential broker | Decrypt and refresh a selected connection after validating a grant | Choose a tenant, principal, tool, or connection not bound by the grant |
| Executor/upstream adapter | Hold a provider access token in memory for the bounded call | Persist, log, trace, cache globally, or return the token |
| DocumentStore | Auth profiles, account metadata, encrypted envelopes, versions, tombstones | Persist plaintext credential material |
| KeyProvider/secret-manager adapter | Wrap/unwrap data-encryption keys or resolve external secret handles | Authorize a tool call |

Control-plane API tokens, Better Auth cookies, MCP data-plane session tokens, provider credentials, and execution grants are different credential classes. They must have distinct issuers/audiences, parsers, key purpose, lifetimes, and revocation paths.

## Domain records

### AuthProfile

An auth profile describes how a provider authenticates. It includes organization and environment, provider type, authorization/token/revocation endpoints, allowed scopes, redirect URIs, client-auth method, parameter schema, and references to OAuth application secrets. Customer-supplied OAuth applications are supported in both cloud and self-hosted deployments.

Profile documents contain secret references, never an inline client secret. A managed cloud OAuth application is optional; if a provider forbids exporting its tokens, the connection UI must disclose that migration will require re-consent before authorization begins.

### ConnectedAccount

A connected account contains:

- opaque connection ID;
- organization, environment, auth-profile, and owner principal IDs;
- account mode: per-user or explicitly shared;
- encrypted or hashed external account identifier where practical;
- granted and requested scopes;
- provider/issuer and audience;
- status such as pending, active, refresh-required, revoked, or quarantined;
- current credential-envelope version;
- consent, expiry, refresh, and revocation timestamps;
- optimistic-concurrency version and authorization version.

Ownership is part of authorization. A per-user account cannot be selected for another principal. A shared account requires an explicit resource-scoped grant and policy decision; organization membership alone is insufficient.

### CredentialEnvelope

The DocumentStore persists only an authenticated ciphertext and key metadata. A representative logical record is:

    id: env_...
    organizationId: org_...
    environmentId: prod
    connectedAccountId: conn_...
    authProfileId: auth_...
    provider: example
    version: 7
    algorithm: A256GCM
    ciphertext: base64url(...)
    nonce: base64url(...)
    wrappedDek: base64url(...)
    kekProvider: external-kms
    kekKeyId: aliases/litemcp-credentials
    kekVersion: 12
    aadVersion: 1
    createdAt: ...
    supersedesVersion: 6
    state: active

The decrypted payload is a versioned internal structure and may contain provider access token, refresh token, token type, expiry, granted scopes, provider account ID, client-secret reference, and provider-specific fields. Unknown fields are rejected unless the auth-profile strategy explicitly owns them.

The additional authenticated data MUST canonically bind:

- envelope schema and AAD versions;
- organization and environment IDs;
- connected-account and auth-profile IDs;
- provider/issuer and intended audience;
- credential version and state.

Moving ciphertext to another tenant, connection, or provider must therefore fail authentication.

### SecretReference

For customer-managed secret stores, the envelope may contain a reference instead of provider credential material. References are typed and adapter-owned, such as a Kubernetes/Vault path and version. They are never accepted directly from an MCP tool argument. Resolution still requires an execution grant bound to the connection and adapter.

## Envelope-encryption requirements

1. Generate an independent 256-bit data-encryption key for each credential version.
2. Use an approved authenticated-encryption algorithm, initially AES-256-GCM through the runtime cryptography port, with a fresh cryptographically random nonce for every encryption.
3. Wrap each data-encryption key with a versioned key-encryption key supplied by the KeyProvider.
4. Store ciphertext, wrapped key, nonce, algorithm, and versioned AAD metadata together; store neither plaintext nor an unwrapped data key.
5. Decrypt only after validating a live execution or refresh authorization inside the credential boundary.
6. Keep plaintext lifetime to the smallest call/refresh scope, avoid copies, and clear buffers where the runtime permits. JavaScript runtimes cannot guarantee memory zeroization; sandbox and process isolation remain necessary.
7. Never include plaintext, ciphertext, wrapped keys, nonces, secret references, or provider response bodies in general logs.
8. Treat authentication-tag failure, unknown key version, and context mismatch as security events; do not retry them as transient upstream errors.
9. Write a new immutable credential version, switch the account pointer conditionally, then retire the prior version. Do not overwrite the only recoverable copy in place.
10. Backups contain encrypted envelopes only. Key backups and recovery procedures are separate, access-controlled, and tested.

### Key hierarchy and rotation

- Cookie/session, API-token, execution-grant, webhook, artifact-signing, and envelope-encryption keys have separate purposes and key IDs.
- KeyProvider implementations support local development keys, operator-provided keys, Kubernetes/Vault/KMS providers, and a Cloudflare-compatible provider.
- A local static master key is for development or explicitly accepted small self-hosted risk; it is not the recommended hosted configuration.
- Routine KEK rotation rewraps data-encryption keys without exposing or rewriting provider plaintext.
- Algorithm or suspected-DEK compromise triggers decrypt-and-reencrypt into a new envelope version.
- Rotation is resumable and idempotent, records success/failure per envelope, and retains the old KEK only for the documented rollback window.
- Destroying an old key is a separate, approved operation after backup and restore verification.

No operator-facing endpoint returns plaintext credentials. Break-glass recovery should rotate or reconnect an account, not reveal its stored token.

## Execution-grant model

An execution grant is a short-lived capability from an authorization decision to the credential broker. It is not a provider token and is never a substitute for a Better Auth or MCP session.

### Required grant bindings

A grant contains or introspects to:

- unique grant ID and authorization/policy-decision ID;
- issuer and credential-broker audience;
- organization, environment, and region;
- principal or service-principal ID;
- MCP session ID and approved client identity when known;
- composition version, stable tool UID, upstream ID, and connector/build digest;
- connected-account and auth-profile IDs;
- allowed credential purpose and provider scopes;
- canonical request or parameter-constraint digest for sensitive calls;
- route decision ID;
- issued-at, not-before, and short expiry;
- maximum redemption count, normally one for write, destructive, or approval-gated actions;
- authorization, connection, and revocation versions.

The default target expiry is at most 60 seconds. A deployment may make it shorter. Increasing it requires an explicit risk decision and tests.

### Format and keys

The portable interface supports a compact signed grant with an allowlisted asymmetric algorithm and key ID, or an opaque grant with authenticated local introspection. The initial cross-component design should use ES256-signed claims because supported Web Crypto implementations are available across target runtimes; the implementation must verify that assumption before locking the format.

Validation rejects algorithm substitution, unknown key IDs, wrong issuer/audience, clock violations, absent bindings, stale authorization versions, revoked connections, and route/tool/account mismatch. Parsing is purpose-specific: no general JWT middleware may accept a login token where an execution grant is expected.

### Issuance and redemption

1. The gateway authenticates the MCP session and resolves current tenant and principal.
2. It re-evaluates discovery-independent execution policy for the exact stable tool and parameters.
3. Routing chooses an allowed upstream and connected account.
4. For approval-gated work, the approved request digest and approver decision are included.
5. The gateway asks the grant issuer for a narrowly bound, short-lived grant.
6. The credential broker validates signature/introspection, all bindings, current revocation versions, account ownership, and permitted use count.
7. It atomically reserves or consumes the grant when single use is required.
8. It decrypts or resolves the selected credential, refreshes if necessary under a connection lock, and injects it only into the upstream adapter.
9. It records redacted redemption metadata and destroys in-memory secret references after the call boundary.

The caller receives the tool result and a correlation ID, never the provider credential. Redirects are treated as a new egress decision; secret-bearing headers are stripped unless the redirect destination was pre-authorized for that credential.

### Replay and failure semantics

- Write, destructive, and approval-bound grants are single use.
- Read-only grants may permit a small bounded use count only when policy explicitly allows it.
- Reservation and outcome are distinct so the platform can report an indeterminate upstream result without replaying it.
- A timeout after possible upstream commit must not silently mint a replacement grant.
- Idempotency keys are tenant, tool, connection, and canonical-request scoped; upstream support is verified rather than assumed.
- Revocation checks occur at redemption even if the signed grant has not expired.

Workers KV cannot by itself guarantee atomic single-use redemption. Cloudflare production support therefore requires Durable Object serialization or an equivalent evidenced mechanism. MongoDB redemption uses a conditional update or transaction with majority write concern.

## OAuth/OIDC connection flow

The authorization-code flow MUST:

1. require an authenticated LiteMCP Composer principal and authorized auth profile;
2. create a short-lived, single-use consent intent bound to organization, principal, profile, redirect URI, requested scopes, PKCE verifier, state, and nonce where OIDC applies;
3. use exact registered redirect URIs and PKCE S256;
4. validate state before exchanging a code and reject tenant/profile substitution;
5. authenticate the client using the configured provider method without exposing its secret to the browser;
6. validate TLS, issuer, audience, authorized party, nonce, and time claims where tokens are JWT/OIDC;
7. compare returned scopes with requested/allowed scopes and display over-broad grants;
8. obtain stable provider account metadata through an approved endpoint when needed;
9. encrypt a new credential envelope before making the connected account active;
10. erase the authorization code and PKCE verifier and emit only redacted audit metadata.

Authorization codes, state, nonce, verifiers, access/refresh tokens, client secrets, cookies, and secret-bearing headers must not be logged. Callback errors shown to users use a correlation ID and safe category, not provider bodies.

API key, basic, bearer, service-account, and custom strategies use the same envelope and ownership model. Secret input is sent once over TLS to a dedicated endpoint, never echoed, and is replaced in all later APIs with health and last-four/fingerprint metadata only where safe.

## Refresh, rotation, revocation, and reconnect

### Refresh

- Refresh begins inside the credential plane, not in a browser request handler.
- Only one refresh may run per connected account/version.
- The result is a new envelope version installed with compare-and-swap.
- If the provider rotates refresh tokens, the old token is retired only after the new encrypted version is durable.
- Reuse, invalid-grant, consent change, or account disablement transitions the connection to refresh-required or quarantined and revokes outstanding grants.
- Retries use bounded exponential backoff only for classified transient failures and never expose provider bodies.

### Revocation

Revocation:

- changes account state and increments its revocation/authorization version before asynchronous cleanup;
- blocks new grant issuance and redemption immediately within the documented consistency bound;
- invalidates cached connection metadata;
- attempts provider-side revocation when supported;
- cancels queued work and pauses triggers bound to that account;
- revokes the affected user's sessions or access when initiated by deprovisioning;
- preserves nonsecret evidence and a tombstone for audit/idempotency.

Failure of provider-side revocation does not restore LiteMCP Composer access. Shared connections are not destroyed merely because one member is deprovisioned; policy removes that member, while sole-owner transfer or quarantine follows an explicit organization rule.

### Incident rotation

Emergency controls can freeze all redemption, revoke by tenant/profile/provider/key/tool/build, rotate grant-signing keys, rewrap or re-encrypt envelopes, and force reconnect. These controls are local to the deployment and require no cloud call-home.

## Storage and deployment adapters

### Core DocumentStore

Core records use the NoSQL DocumentStore port with tenant-qualified IDs, conditional version writes, tombstones, explicit consistency requirements, and deterministic conflict errors. Credential code must not depend on Workers KV, D1, or MongoDB types.

### Cloudflare

- Workers KV stores the MVP encrypted-envelope and connection read model.
- Better Auth uses D1; Better Auth tables do not contain provider credential envelopes.
- Durable Objects are planned to serialize consent-intent consumption, refresh, envelope-pointer updates, revocation, and single-use grant redemption.
- Until those paths and propagation bounds are tested, Cloudflare credential custody is an MVP design and must not be represented as production-hardened.

### Kubernetes

- MongoDB runs as a replica set and stores core metadata/envelopes using transactions or conditional writes.
- Better Auth uses a logically isolated MongoDB database/collection set.
- Operator-selectable KeyProvider and SecretResolver adapters support local envelope encryption, Kubernetes Secrets, Vault, and compatible KMS systems.
- Network policy limits credential-plane egress to configured providers/key services and limits ingress to authenticated gateway/worker identities.

## Logging and audit

Use an allowlist, not only a denylist. Permitted credential audit fields include:

- organization/environment, principal, connection, auth-profile, and grant opaque IDs;
- provider identifier, requested/granted scope names, envelope/key versions;
- policy decision, stable tool/build, route, outcome category, timestamps, and trace ID;
- refresh/revocation category and whether provider cleanup was attempted.

Never record raw tokens, codes, secrets, cookies, authorization headers, signed grants, encrypted envelope bodies, secret-store paths containing customer data, raw provider responses, or tool payloads by default.

Redaction runs before application logging, tracing, queue publication, error reporting, and client serialization. Tests must use canary secrets that fail the suite if they appear anywhere in captured output.

Audit storage is append-only through the application API and supports export to an operator-controlled sink. Credential access by support or operators, where configured, is time-bound, approved, and audited.

## Portability and deletion

Configuration export includes auth-profile shape, public provider endpoints, allowed scopes, account IDs/status, and secret-reference placeholders. It excludes credential envelopes and secrets by default.

An explicit encrypted backup/export may be supported for customer-owned applications and keys, but must bind recipient identity, format version, encryption key, expiry, and audit approval. Tokens belonging to a cloud-operated OAuth application may be nonportable; import requires re-consent and the product must say so before connection.

Account and tenant deletion revoke use first, then schedule envelope/tombstone removal according to retention and backup policy. A deletion report lists primary stores, caches, queues, indexes, object stores, audit retention, and backup expiry without exposing secret material.

## Verification gates

Before any production or security claim, automated tests must demonstrate:

- envelope round trip, context-substitution rejection, corruption detection, and nonce uniqueness;
- tenant/account/profile mismatch rejection in every storage adapter;
- concurrent refresh with exactly one winning version;
- rotated refresh-token crash recovery;
- KEK rewrap, DEK re-encryption, rollback window, backup, and restore;
- grant signature/introspection, purpose separation, binding, expiry, use count, replay, and revocation;
- guessed account ID and cross-user connected-account denial;
- approval request-digest binding and mutation rejection;
- no provider token reaches browser, MCP client, model context, logs, traces, queues, or error responses;
- OAuth PKCE/state/nonce/redirect/issuer/audience/confused-deputy failures;
- provider-side and local revocation behavior;
- destructive retry and indeterminate-result handling;
- Cloudflare Durable Object concurrency and revocation propagation;
- MongoDB transaction and primary-failover behavior;
- cloud export to a disconnected Kubernetes installation using new references or re-consent.

The acceptance test must connect two users to the same provider, execute the same tool through separate sessions, prove each upstream call uses only its owner's credential, revoke one connection, and prove only that user's execution is denied. Captured logs and traces must contain no test secret.

## Known limitations and unresolved decisions

- The credential subsystem and its tests are not yet evidenced by this document.
- JavaScript runtimes cannot guarantee prompt erasure of secrets from managed memory.
- The production Cloudflare key-provider choice and recovery ceremony require implementation and operational validation.
- Workers KV alone is insufficient for refresh, revocation, or single-use grant correctness.
- The final signed-grant format and algorithm require a runtime compatibility test; the security properties above are format-independent.
- Some OAuth providers do not support refresh-token rotation, programmatic revocation, least-scope discovery, or token export.
- Customer-selected secret managers and upstreams have their own availability, security, and residency properties.
- Provider token portability cannot be promised when credentials are bound to a vendor-controlled OAuth application.
