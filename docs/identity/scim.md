# SCIM 2.0 provisioning

Status: target design; not implementation evidence
Last reviewed: 2026-07-21
Related: [Microsoft Entra ID](./entra-id.md), [Threat model](../security/threat-model.md)

Implementation status: not evidenced.

## Purpose and status

LiteMCP Composer is intended to expose a tenant-scoped SCIM 2.0 service for enterprise user and group lifecycle management. The target follows RFC 7643 resource schemas and RFC 7644 protocol behavior for the supported surface.

This document is a contract and implementation plan. It is not evidence that the endpoints, consistency controls, deprovisioning cascade, or conformance tests exist. The implementation-status document must distinguish code-complete, tested, interoperable, and production-ready states.

SCIM, directory sync, group mapping, deprovisioning, audit, and diagnostics are open-source roadmap capabilities intended to be self-hostable. The target SCIM server will run in the local Hono API and must not contact the LiteMCP Composer managed cloud, a license service, telemetry endpoint, or any call-home dependency. Managed cloud and Kubernetes are intended to use the same handlers and directory-domain logic behind portable stores.

## Goals

- Provision and update organization users before or independently of login.
- Synchronize groups by immutable external identifiers.
- Disable access promptly and comprehensively when a user is deprovisioned.
- Make provider retries safe and observable.
- Preserve tenant isolation and current authorization at API and MCP gateway boundaries.
- Support Microsoft Entra provisioning behavior with a deterministic test fixture and a documented real-provider interoperability run.
- Expose honest discovery metadata for only the features actually implemented.

## Non-goals for the first supported profile

- Password provisioning or password validation;
- using SCIM as a login protocol;
- cross-organization groups or users;
- SCIM Bulk unless it is implemented, bounded, and tested;
- arbitrary schema extensions without registration and validation;
- making a group display name an authorization identifier;
- deleting audit history or silently transferring connected-account secrets.

An unsupported optional feature is omitted from ServiceProviderConfig or returns a standards-shaped not-supported error. It is never advertised optimistically.

## Endpoint and tenant model

The Hono API serves an organization-specific SCIM base URL:

    https://deployment.example/scim/v2

The SCIM bearer credential determines the organization. A query, request body, resource ID, Host header, or externalId cannot select or override the tenant. Deployments may use organization-specific hostnames or provider records, but the authenticated server-side binding remains authoritative.

Required endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | /ServiceProviderConfig | Advertise implemented patch, filter, sort, ETag, and bulk capabilities |
| GET | /ResourceTypes | Describe User and Group resources |
| GET | /Schemas | Return supported core and registered extension schemas |
| GET | /Schemas/{id} | Return one supported schema |
| POST | /Users | Create a user |
| GET | /Users/{id} | Read a user |
| GET | /Users | Filter and page users |
| PUT | /Users/{id} | Replace supported mutable attributes |
| PATCH | /Users/{id} | Apply PatchOp operations |
| DELETE | /Users/{id} | Deactivate and tombstone the user |
| POST | /Groups | Create a group |
| GET | /Groups/{id} | Read a group |
| GET | /Groups | Filter and page groups |
| PUT | /Groups/{id} | Replace group attributes/membership |
| PATCH | /Groups/{id} | Apply group and member changes |
| DELETE | /Groups/{id} | Delete/tombstone a group and remove mapped membership |

Responses use application/scim+json, canonical absolute resource locations, server-generated opaque IDs, and meta.created, meta.lastModified, meta.resourceType, meta.location, and meta.version.

## Authentication and administration

### SCIM credentials

- Generate a random opaque token with a public token ID and at least 256 bits of secret entropy.
- Store only the token ID, a keyed verifier/hash, organization, scopes, creation/expiry, last-use metadata, creator, and revoked-at value.
- Compare verifiers in constant time.
- Scope the token to SCIM provisioning; it cannot call normal control-plane or MCP endpoints.
- Allow overlapping old/new credentials for a short, explicit rotation window.
- Show a token once, never return or log it again.
- Support immediate local revocation without an external call.

Optional deployment controls include mTLS, ingress/IP allowlists, private networking, and a dedicated SCIM hostname. Those controls augment rather than replace token validation.

Only an identity administrator with fresh authentication may create, rotate, inspect metadata for, or revoke a SCIM credential. Every action is audited. Browser cookies are not accepted on SCIM routes, CORS is disabled, and CSRF does not apply to the bearer-only endpoint.

### Request controls

- Require TLS outside explicitly marked local development.
- Rate-limit per token, organization, source, and operation class.
- Enforce header, body, string, array, group-member, filter-complexity, and page-size limits before expensive work.
- Reject duplicate JSON keys where the parser can expose them and reject ambiguous attribute paths.
- Validate content type, schemas array, attribute type, mutability, uniqueness, and case behavior.
- Return a correlation ID and SCIM error response without stack traces, secrets, internal collection names, or cross-tenant existence clues.

SCIM tokens, Authorization headers, full request bodies, and personal profile values are excluded from general logs and traces.

## User resource

The first supported User profile includes:

- schemas;
- server-generated id;
- externalId;
- userName;
- active;
- name.givenName, name.familyName, and name.formatted;
- displayName;
- emails with value, type, and primary;
- locale and preferredLanguage when supported;
- groups as read-only derived references;
- meta.

The enterprise user extension may add department, organization, division, employeeNumber, manager, and costCenter only after the extension schema and privacy purpose are configured. Unknown extensions are rejected or ignored only according to documented SCIM rules; they are never persisted as unvalidated policy attributes.

Passwords are never stored, validated, returned, or forwarded. If password is supplied, it is treated as writeOnly and discarded or rejected according to advertised schema behavior; it must not enter logs or audit.

### Identity keys and uniqueness

- The internal id is opaque, immutable, never reused, and tenant scoped.
- externalId is the IdP's stable object identifier and is unique within the organization/provider when present.
- userName is required, normalized for comparison, and unique within the organization according to its advertised caseExact behavior.
- Authentication identity is not keyed by userName or email. OIDC identities remain keyed by provider, issuer, tenant, and subject.
- Changing userName or email does not create a new user.
- A tombstoned externalId cannot be recreated through JIT without an authorized reactivation decision.

Cross-tenant IDs return the same not-found response as unknown IDs.

### Create

POST /Users validates the schema, uniqueness, active state, and allowed attributes, then atomically creates the directory user and organization membership. It returns 201 with Location and ETag/version.

The configured default role is least privilege. SCIM profile data alone never grants an administrator role. Authorization derives from explicitly mapped SCIM groups and local policy.

A uniqueness conflict returns 409 with scimType uniqueness. The response does not disclose another tenant's resource.

### Read and list

GET by ID returns 200 or tenant-safe 404. List responses use the ListResponse schema and one-based startIndex, bounded count, totalResults, and Resources.

The minimum filter profile supports:

- Users: id eq, externalId eq, userName eq;
- Groups: id eq, externalId eq, displayName eq;
- logical and for the exact combinations required by tested providers.

Unsupported or overly complex filters return 400 with scimType invalidFilter. Filters are parsed into a typed AST and parameterized DocumentStore queries; string concatenation into a database query is prohibited.

Pagination has a stable documented ordering and a maximum page size. Tenant scope applies before filtering, not after.

### Replace and patch

PUT replaces supported mutable attributes but preserves id, immutable source bindings, tombstone history, and meta.created. Missing required fields cause invalidValue rather than accidental deletion.

PATCH accepts the PatchOp schema and supports add, replace, and remove for the advertised paths. Attribute path parsing is case-correct, bounded, and schema aware. User active=false invokes the deprovisioning workflow; active=true invokes explicit reactivation checks.

No-op changes return a successful current representation or 204 according to the endpoint contract without incrementing authorization version. Effective authorization changes do increment it.

### Delete

DELETE /Users/{id} is idempotent from an access-control perspective:

- mark the directory user and organization membership inactive;
- retain an internal tombstone for replay, audit, and JIT suppression;
- execute the deprovisioning cascade before reporting completion under the chosen consistency contract;
- return 204 without a body;
- make subsequent resource reads return 404 unless an administrative audit API is used.

Repeated deletion never restores access. Whether a repeated DELETE returns 204 or 404 is documented and covered by the provider contract test; LiteMCP Composer should prefer retry-friendly 204 when the tombstone belongs to the same tenant.

## Group resource

The first supported Group profile includes schemas, id, externalId, displayName, members, and meta.

- Group id and externalId are stable identifiers; displayName is mutable presentation data.
- Member value references an internal user ID within the same organization.
- Member display is derived and never used for identity.
- Nested groups are not supported until cycle, expansion, and policy semantics are implemented and advertised.
- A group maps to internal roles or attributes only through a versioned administrator-authored mapping.
- Creating a group with a privileged-looking name grants nothing.

### Membership updates

POST/PUT/PATCH resolve all member IDs under the authenticated tenant. A reference to another tenant or an unknown user is rejected without disclosing which condition occurred.

Adding an existing member and removing an absent member are idempotent no-ops. Duplicate members are canonicalized. An effective change:

1. updates the group document and membership edges atomically;
2. increments affected users' authorization versions;
3. invalidates identity and policy caches;
4. revokes or rejects stale MCP sessions according to the measured bound;
5. records the SCIM request, group, impacted user IDs, mapping version, and outcome in redacted audit.

Deleting a mapped group removes its derived grants, retains a tombstone, and invalidates affected sessions. It does not delete users or locally managed roles.

Large group changes are bounded and may execute as a durable job only if the provider-visible completion and partial-failure semantics are documented. LiteMCP Composer must not return success before access removal is guaranteed within its published bound.

## Deprovisioning and reactivation

### Required deprovisioning cascade

The security-critical order is:

1. serialize the user mutation and mark the membership disabled;
2. increment user and tenant revocation/authorization versions;
3. make API and MCP authorization fail closed for the user;
4. revoke Better Auth sessions, API tokens, MCP sessions, and pending execution grants;
5. cancel queued executions, requested approvals, and approval authority;
6. disable per-user connected-account use and pause its triggers;
7. enqueue provider-side token revocation and secret retention/deletion according to policy;
8. remove derived group roles and resource grants;
9. write append-only audit and a tenant-scoped tombstone.

Provider-side revocation may be asynchronous and may fail; local access remains denied. Shared connected accounts are not revoked solely because a member leaves, unless that principal was the sole owner and the configured ownership policy requires quarantine. A deprovisioned user cannot be silently recreated by Entra JIT.

### Reactivation

active=true is not an implicit new identity. It reuses the same tenant-scoped record only when:

- the SCIM credential is authorized;
- externalId and source binding match;
- no security quarantine blocks the user;
- any manual-review policy is satisfied;
- roles are recomputed from current groups/mappings rather than restored from a stale snapshot.

Reactivation emits a high-signal audit event and does not restore expired/revoked connected credentials without reconnect or explicit policy.

## Idempotency and concurrency

Provisioning systems retry, reorder, and duplicate requests. LiteMCP Composer must provide deterministic behavior.

### Request idempotency

- Accept an optional Idempotency-Key header on mutating requests.
- Scope the key to organization, SCIM token identity, method, and canonical route.
- Store a hash of the canonical request, terminal status, resource/version, and safe response for a bounded retention period.
- Replaying the same key and request returns the original semantic result.
- Reusing a key with a different request returns 409.
- Never store the bearer token or full personal-data body in the idempotency record.

Natural idempotency also applies: setting active to its current value, adding an existing member, removing an absent member, and deleting an existing tombstone do not create duplicate side effects.

### Optimistic concurrency

meta.version maps to a weak ETag derived from an opaque document version. If-Match, when supplied, is enforced and a mismatch returns 412. The service remains compatible with providers that do not send If-Match by serializing mutations and applying them to the latest version; every conflict/retry is audited.

The core DocumentStore interface exposes conditional writes and deterministic conflict results. Authorization-sensitive compound operations must be serialized:

- Cloudflare: Workers KV is the MVP read/configuration store; per-organization/user/group Durable Objects are required for SCIM writes, idempotency records, membership changes, deprovisioning, and invalidation. KV alone is not a production-safe SCIM write authority.
- Kubernetes: MongoDB must run as a replica set; unique compound indexes, transactions, majority write concern, and retry-safe transaction IDs implement the same semantics.

Out-of-order updates use request time only as audit context, never as the sole authority. Version/precondition and current source state decide the result.

## Authorization and cache invalidation

SCIM authenticates the provisioning client; it does not authorize the provisioned user. The Hono API and MCP gateway use current internal roles, mapped groups, attributes, resource grants, and policy.

Every effective membership or mapping change produces a new authorization version. Cached tool lists include that version and become invalid when it changes. The gateway re-evaluates execution even if a client presents a stale tool descriptor. A removed user or group must not invoke a hidden capability by name.

Emergency local denies take precedence over SCIM state. SCIM cannot grant platform-wide break-glass or mutate another organization's policy.

## Error contract

Errors use the SCIM error schema with schemas, status as a string, optional scimType, and a safe detail/correlation value.

Use precise types where applicable:

- invalidFilter for unsupported/malformed filters;
- invalidPath for unsupported attribute paths;
- invalidValue for schema/type/value errors;
- mutability for immutable/read-only writes;
- uniqueness for duplicate externalId or userName;
- tooMany for limits;
- 401 for absent/invalid credentials;
- 403 for insufficient SCIM token scope;
- 404 for tenant-safe unknown resources;
- 409 for uniqueness or idempotency conflicts;
- 412 for failed If-Match;
- 429 with Retry-After for rate limits.

Do not return internal exceptions, secret values, cross-tenant hints, database queries, or raw provider requests.

## Audit and privacy

Record:

- organization, SCIM token ID, source/provider ID, operation, resource type and opaque resource ID;
- request/idempotency correlation IDs;
- old/new active state and changed attribute names, not their sensitive values;
- group membership edge IDs and impacted-user count;
- document/mapping/authorization versions;
- result category, duration, source network metadata according to policy;
- session/grant revocation and connected-account cleanup status.

Profile values are minimized to configured purposes and retention. Request/response bodies are not logged by default. Operators can export metadata audit to their own sink. Self-hosted telemetry is opt-in and has no hidden call-home.

## Discovery and schema behavior

ServiceProviderConfig must truthfully report:

- patch supported only after PatchOp tests pass;
- filter supported with the implemented maximumResults and documented operators;
- sort supported only if stable cross-adapter behavior is tested;
- etag supported only if If-Match/version behavior is implemented;
- bulk unsupported until a bounded transactional/job design and tests exist;
- changePassword unsupported;
- authentication schemes matching actual bearer/mTLS behavior.

ResourceTypes and Schemas are version-controlled fixtures validated against handlers and response serializers in CI. A schema change cannot silently broaden policy attributes.

## Verification plan

### Contract tests

- discovery endpoints, content type, schemas, locations, metadata, and error shapes;
- create/get/list/filter/page/replace/patch/delete for Users and Groups;
- uniqueness, case behavior, readOnly/immutable/writeOnly attributes;
- add/remove/replace PatchOp path behavior;
- ETag/If-Match and no-If-Match serialized behavior;
- optional Idempotency-Key replay and payload mismatch;
- duplicate/out-of-order retries and no-op version behavior;
- unsupported filter/path/schema/extension behavior;
- body, filter, member, rate, and page limits.

### Security tests

- missing, malformed, expired, rotated, revoked, and wrong-tenant SCIM tokens;
- cross-tenant resource IDs, filters, member references, caches, and idempotency keys;
- secret/PII absence from logs, traces, errors, and metrics;
- parser abuse, oversized/nested documents, duplicate attributes, filter injection, and timing-safe token checks;
- group-name privilege spoofing;
- deprovisioned OIDC/JIT login denial;
- session, API token, MCP token, execution grant, approval, trigger, and connection-use revocation;
- stale tool list followed by direct hidden-tool execution;
- audit completeness and tamper/gap detection.

### Adapter and interoperability tests

- a shared contract suite against an in-memory test adapter, Workers KV plus Durable Object implementation, and MongoDB replica set;
- concurrent first-create, group patch, deprovision, retry, Durable Object restart, and Mongo primary failover;
- measured cache/revocation propagation across gateway replicas/regions;
- backup/restore preserving external IDs, tombstones, mappings, versions, and audit correlation;
- deterministic Entra-like provisioning fixture in CI;
- documented live Microsoft Entra create/update/disable/reactivate/group/delete run before claiming Entra SCIM compatibility.

The end-to-end offboarding test provisions a user and mapped group, grants a sensitive tool through that group, creates browser and MCP sessions plus a per-user connection, then sends active=false. It must prove that discovery, direct execution, queued work, approvals, and connected-account use are denied within the documented bound while another user's access remains intact.

## Implementation status and unresolved decisions

| Capability | Status in this document |
|---|---|
| Hono SCIM routes | Required; implementation not evidenced |
| Users/Groups schemas and CRUD | Specified; implementation not evidenced |
| SCIM bearer token lifecycle | Designed; implementation not evidenced |
| Deprovisioning cascade | Designed; atomicity and propagation not evidenced |
| Idempotency and ETag | Designed; adapter tests not evidenced |
| Workers KV read model | Chosen for MVP; not sufficient alone for SCIM writes |
| Durable Object write serialization | Planned production requirement |
| MongoDB replica-set implementation | Chosen; transaction/failover tests not evidenced |
| Microsoft Entra interoperability | Required; no compatibility claim yet |
| Bulk, nested groups, password change | Not in initial supported profile |

Open implementation decisions include the final supported filter grammar, maximum page/group sizes, idempotency retention, target revocation bound, soft-delete retention, enterprise-user extension fields, and live-provider certification process. Defaults must be documented and conservative before enabling production provisioning.
