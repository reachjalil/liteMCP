# Microsoft Entra ID integration

Status: target design; not implementation evidence
Last reviewed: 2026-07-21
Related: [SCIM provisioning](./scim.md), [Threat model](../security/threat-model.md)

Implementation status: not evidenced.

## Purpose and truthfulness

Microsoft Entra ID is the first target enterprise OIDC provider for LiteMCP Composer. This document defines the intended SSO, just-in-time provisioning, claim mapping, group and app-role mapping, session invalidation, diagnostics, and acceptance criteria.

No successful Entra deployment, conformance suite, or production-readiness evidence is asserted here. Requirements marked MUST are targets. The capability may be marked implemented only when the corresponding code and automated evidence are linked from the implementation-status document.

Entra integration, generic OIDC, mapping, SCIM, RBAC, and policy enforcement are intended to remain available in the open-source self-hosted product as they mature. No target feature in this document may require a LiteMCP Composer managed cloud account, license server, proprietary mapping service, or call-home. A future air-gapped deployment may use a reachable private OIDC provider or local authentication without contacting the managed cloud.

## Target architecture

- Better Auth is wired for OIDC/SAML provider configuration and browser session lifecycle, but no live Entra flow has passed.
- The deployment compositions configure Better Auth persistence in D1 for the managed cloud target and MongoDB for the portable Node target.
- The target portable identity domain will store organizations, external identities, memberships, groups, mapping versions, and authorization versions through the NoSQL DocumentStore port.
- The target Hono API will own provider administration, mapping simulation, JIT reconciliation, session revocation, and diagnostic endpoints.
- The Hono API and MCP gateway independently enforce current roles and policy. A Better Auth session proves authentication; it is not an authorization decision.
- MCP data-plane session tokens are short lived, have a distinct audience/key purpose, and carry or reference the current authorization version.

The working-tree Cloudflare DocumentStore keeps non-authoritative records in
Workers KV and routes current roles, IdP controls, sessions/epochs, policy, and
related authority state through a tenant Durable Object. That is per-document
serialization, not a complete JIT/SCIM transaction or deployed invalidation
proof. The Kubernetes adapter uses a MongoDB replica set with conditional
writes and transactions, although current identity workflows do not yet wrap
compound state/audit changes in a transaction. Storage choice must not alter
claim-mapping or policy semantics.

## Target supported flow

The required browser flow is OIDC Authorization Code with PKCE S256:

1. An organization administrator creates a disabled Entra provider configuration.
2. LiteMCP Composer generates an exact callback URI and short-lived test state.
3. The administrator configures an Entra application using that callback and supplies a client-secret or certificate reference.
4. LiteMCP Composer validates discovery metadata and performs a test login.
5. The administrator previews normalized claims and tests mapping rules against sample users.
6. The administrator activates the provider and selects explicit JIT behavior.
7. A user starts sign-in from an organization-bound route or verified organization discovery.
8. Better Auth completes the callback only after state, PKCE, nonce, issuer, tenant, audience, signature, and time checks.
9. The identity domain reconciles the external subject and authorized group/app-role inputs.
10. LiteMCP Composer creates or updates the user and membership atomically, increments authorization version if access changes, then establishes a local session.

There is no password collection or passthrough. Resource-owner password grant and implicit flow are not supported.

## Provider configuration

Each provider configuration is scoped to one LiteMCP Composer organization and includes:

- opaque provider ID and human display name;
- expected issuer and discovery URL;
- one or more explicit allowed Entra tenant IDs;
- client ID and a SecretReference for client secret or certificate material;
- exact redirect URIs;
- requested scopes, initially openid, profile, and email plus explicitly approved additions;
- JIT mode and default least-privilege organization role;
- group and app-role claim names;
- versioned mapping rules;
- group-overage strategy;
- session maximum age and reauthentication policy;
- enabled/disabled state and emergency revocation version.

A representative target configuration is:

    type: entra-oidc
    issuer: https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0
    allowedTenantIds:
      - 11111111-1111-1111-1111-111111111111
    clientId: 22222222-2222-2222-2222-222222222222
    clientSecretRef:
      provider: secret-store
      key: entra/client-secret
    jit:
      enabled: true
      defaultOrganizationRole: member
    mappingsVersion: 3

This is a schema example, not evidence that configuration parsing exists. Secret values are never accepted through export, log, diagnostic output, or client-readable APIs.

### Single-tenant and multi-tenant rules

- Tenant-specific issuers are the default.
- A multi-tenant application requires an explicit allowlist of tenant IDs and validation of both the token issuer and tid claim.
- A generic or common authorization endpoint must never mean any issuing tenant is trusted.
- Personal Microsoft accounts are denied unless an operator explicitly enables and maps that account class.
- Provider selection comes from an organization-bound, server-side login intent; callback parameters cannot switch organizations.

## Token and protocol validation

The callback MUST:

- use state bound to provider, organization, redirect URI, initiating session, and expiry;
- use PKCE S256 and a single-use verifier;
- use nonce for the ID token;
- fetch discovery/JWKS only from the configured issuer through hardened outbound networking;
- allowlist signing algorithms and reject none or algorithm/key confusion;
- validate signature, exact issuer, audience, authorized party when required, nonce, subject, issued/expiry/not-before times, and allowed tenant ID;
- tolerate only a small configured clock skew;
- reject an ID token or access token minted for another application/resource;
- key the external identity by provider ID, issuer, tenant ID, and subject;
- never use email, display name, UPN, preferred username, or domain as the immutable identity key.

Email and display attributes are profile data and may change. A verified email must not automatically grant organization membership or an administrative role.

Keys are cached for a bounded time and refreshed once on an unknown key ID. Failure to obtain valid keys fails sign-in; it does not bypass verification. Tokens and raw claim sets are not logged.

## JIT user provisioning

JIT is explicitly enabled per provider. On a valid first sign-in:

1. Look up the external identity by provider, issuer, tenant, and subject.
2. If none exists, create an internal user plus organization membership with the configured least-privilege base role.
3. Normalize only allowlisted profile attributes.
4. Resolve groups, app roles, and custom claims through the active mapping version.
5. Store source, provider object identifiers, mapping version, and reconciliation time.
6. Increment the user's authorization version and create the session only after the write succeeds.

Concurrent first logins must converge on one external identity and membership. On Kubernetes this requires a unique compound key and MongoDB transaction/conditional insert. On Cloudflare it requires per-organization/subject Durable Object serialization; KV-only best effort is not sufficient for a production JIT claim.

JIT does not delete users or infer offboarding. SCIM is preferred for authoritative lifecycle management. Without SCIM, administrators must configure a bounded claim-refresh/session lifetime and use explicit local deactivation.

## Group, app-role, and claim mapping

### Stable source identifiers

- Entra groups are matched by immutable object ID, not display name.
- App roles are matched by their stable configured value from the roles claim and tied to the provider/client configuration.
- Tenant ID is always part of a mapping condition.
- Custom claims must be allowlisted with expected type, maximum size, and normalization rules.
- Unknown groups, roles, claims, and malformed values grant nothing.

### Mapping targets

Rules can add:

- organization roles such as member, identity-admin, policy-admin, publisher, approver, or audit-viewer;
- project/environment resource grants;
- internal group membership;
- policy attributes such as department, region, cost center, or data clearance.

Rules cannot mint a platform-wide role from an untrusted tenant claim. Platform administration and break-glass access require deployment-local configuration and stronger approval.

A representative mapping is:

    rules:
      - id: employee-group
        when:
          tenantId: 11111111-1111-1111-1111-111111111111
          groupId: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
        addOrganizationRoles: [employee]
      - id: finance-app-role
        when:
          tenantId: 11111111-1111-1111-1111-111111111111
          appRole: Finance.Admin
        addOrganizationRoles: [finance-admin]
        addAttributes:
          dataDomain: finance

This example defines desired rule shape only. Role names are organization policy inputs, not globally privileged magic strings.

### Evaluation and precedence

1. Verify provider, issuer, tenant, subject, and account-active state.
2. Apply emergency organization/provider/principal denies.
3. Normalize trusted group IDs, app roles, and allowlisted claims.
4. Evaluate the immutable active mapping version deterministically.
5. Add explicitly mapped internal roles, groups, resource grants, and attributes.
6. Apply local explicit denies and policy deny precedence.
7. calculate a permission explanation with source IDs and mapping version.

Mappings are additive unless a documented rule explicitly revokes a locally managed grant. A provider claim never removes deployment break-glass access. Changes are previewed with impacted-user counts where available, tested in dry-run, versioned, audited, and atomically activated.

### Group overage and stale membership

Tokens may indicate that the complete group list was not emitted. LiteMCP Composer must detect that condition and never interpret an incomplete list as authoritative.

An organization chooses one explicit strategy:

- use SCIM-synchronized groups as the authoritative directory;
- resolve membership through a separately configured Microsoft Graph integration with least privilege, egress policy, caching, and failure behavior;
- deny mapped group-derived access until a complete source is available.

There is no silent cloud fallback. A self-hosted Graph resolver is optional and talks directly to the configured Microsoft endpoint; it does not call LiteMCP Composer. If Graph or SCIM is unavailable, cached membership has a configured maximum age. Sensitive authorization fails closed when that age is exceeded.

App-role mapping is preferable when the organization can model a small number of application roles. SCIM is preferable for complete lifecycle and large group sets.

## Session and authorization freshness

The identity domain maintains an authorization version for each membership and organization mapping set. It changes on:

- user disable/delete;
- group membership change;
- mapped claim/app-role change;
- mapping activation;
- role/resource-grant change;
- provider disable;
- emergency revocation.

Better Auth session validation loads or caches the version for browser/API access. MCP session creation embeds or references the current version. The Hono API and MCP gateway reject stale versions according to a tested propagation bound and always re-check destructive or sensitive operations.

Sign-out revokes the local LiteMCP Composer session. Provider logout is optional and must use validated endpoints; local revocation never depends on it succeeding. Administrators can revoke all sessions for a provider, tenant, organization, user, or authorization version.

## Deprovisioning

SCIM active=false or DELETE is the authoritative fast path when SCIM is enabled. Deprovisioning must:

- disable the organization membership;
- increment authorization/revocation version;
- revoke Better Auth sessions, API tokens, MCP sessions, pending grants, and queued execution for that membership;
- cancel pending approvals requested by the principal and remove approval authority;
- deny use of per-user connected accounts and pause their triggers;
- attempt provider-token revocation asynchronously according to organization retention policy;
- leave unrelated shared connections intact;
- retain a tenant-scoped tombstone and redacted audit evidence.

An OIDC login for a SCIM-disabled identity remains denied until an authorized SCIM reactivation or local administrator action. JIT must not silently recreate or reactivate a deprovisioned user.

## Administration and diagnostics

Only an identity administrator with fresh authentication can create, test, activate, rotate, or disable a provider. Client-secret changes use write-only SecretReferences.

Diagnostics expose:

- discovery/JWKS reachability and safe metadata;
- exact issuer, client ID fingerprint, allowed tenant IDs, and callback URI;
- last successful login and categorized validation failures;
- group-overage state and last complete synchronization time;
- active mapping version and a redacted mapping explanation;
- users with stale/unknown group state;
- session/revocation propagation measurements.

Diagnostics never expose tokens, secrets, authorization codes, cookie values, full raw claim sets, or unnecessary personal data. Each test and configuration change is audited.

## Cloudflare and Kubernetes operation

### Cloudflare

- Better Auth stores user/session records in D1.
- Identity-domain read models use Workers KV through DocumentStore.
- Durable Objects are required for conflict-sensitive JIT, group, mapping activation, deprovisioning, and revocation writes.
- policy/group cache invalidation and revocation propagation must be measured across regions.
- until those controls and tests exist, Entra support is a target/MVP, not a production enterprise claim.

### Kubernetes

- Better Auth and identity data use logically separate collections/databases in a MongoDB replica set.
- transactions and unique compound indexes enforce JIT identity uniqueness and atomic membership changes.
- NetworkPolicy permits only configured Entra/Graph endpoints, DNS, database, and key services.
- private issuer certificates and proxy configuration are operator-controlled.
- backup/restore includes identity, mapping versions, revocations, and Better Auth sessions according to documented policy.

Both deployment shapes use the same normalized claims, mapping evaluator, permission explanation, and Hono contracts.

## Security and privacy requirements

- Use secure, HttpOnly, SameSite cookies, CSRF protection, CSP, exact CORS origins, and TLS.
- Redact query strings and headers before logs/traces.
- Rate-limit start, callback, discovery, provider-test, and mapping-simulator endpoints.
- Set size/count limits on tokens, claims, groups, and mapping rules.
- Treat names and profile attributes as untrusted display data and render them safely.
- Collect only claims used for identity or policy and document purpose/retention.
- Audit sign-in outcome, provider/mapping change, JIT create/update, group resolution, role change, session revocation, and deprovisioning without raw tokens.
- Separate delegated organization identity administration from platform administration.
- Support local emergency access for self-hosted deployments with offline recovery, strong authentication, and prominent audit events.

## Test and acceptance matrix

| Area | Required evidence |
|---|---|
| Protocol | Authorization Code plus PKCE; state/nonce replay; exact redirect; malformed token; algorithm confusion; JWKS rotation |
| Trust | Wrong issuer, audience, authorized party, tenant, client, subject type, and expired/not-yet-valid token are denied |
| JIT | First login, repeat login, concurrent first login, renamed email/UPN, cross-tenant same subject, disabled-user login |
| Groups | Known/unknown IDs, duplicate claims, malformed values, overage detection, stale cache, SCIM and optional Graph source |
| App roles | allowlisted value, unknown value, mapping removal, tenant/client binding |
| Mapping | deterministic result, dry-run, conflict detection, version activation/rollback, permission explanation, deny precedence |
| Authorization | employee lists/calls ordinary tool; finance admin lists/calls sensitive tool; employee direct-call guess is denied |
| Freshness | group removal, provider disable, mapping change, emergency deny, session and MCP-token invalidation bound |
| Isolation | organization/provider/tenant substitution, cache-key isolation, diagnostics access, JIT collision |
| Deployment | D1/Mongo Better Auth parity, Durable Object serialization, Mongo failover, no managed cloud network dependency |
| Privacy | tokens and raw claims absent from logs, traces, errors, analytics, and exports |

The mandatory end-to-end scenario maps one Entra-style group to employee and another to finance-admin, shows different discovery results, directly calls the hidden sensitive tool as the employee, observes a gateway denial, and records the mapping/policy explanation. A deterministic local OIDC provider may exercise CI, followed by a documented real-Entra interoperability run before a compatibility claim.

## Implementation status and open decisions

| Capability | Status in this document |
|---|---|
| Better Auth OIDC session architecture | Designed; implementation not evidenced |
| D1 cloud session store | Chosen; migrations and tests not evidenced |
| MongoDB Kubernetes session store | Chosen; replica-set tests not evidenced |
| Tenant/issuer/audience validation | Required; implementation not evidenced |
| JIT and stable external identity | Designed; concurrency tests not evidenced |
| Group/app-role/custom-claim mapping | Designed; evaluator and tests not evidenced |
| Group overage via SCIM/Graph/fail-closed | Designed; Graph integration remains optional and unresolved |
| Authorization-version invalidation | Designed; propagation target not yet measured |
| SCIM deprovisioning | Specified separately; implementation not evidenced |
| SAML | Outside this Entra OIDC document; no support claim |

Before implementation, verify Better Auth's current adapter and OIDC extension compatibility with the selected versions and licenses. No proprietary add-on may become a requirement for self-hosted SSO. If the library cannot meet these invariants, keep the application-facing identity port and replace the adapter without changing policy semantics.
