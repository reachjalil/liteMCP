# Routing and authorization

Status: design specification; no evaluator, persistence adapter, simulator, or
gateway enforcement test has yet been evidenced.

## Goals

The policy system answers two separate questions:

1. **May this principal discover or perform this action?**
2. **If allowed, which eligible upstream should perform it?**

Authorization always precedes route selection. Health, latency, cost, or
fallback never convert a denied action into an allowed one. Discovery and
execution use the same evaluator and immutable policy version, but execution is
re-evaluated against current identity, revocation, connection, and request
context.

## Portable policy model

Policies use an open, versioned JSON/YAML schema compiled to a typed normalized
representation. The initial evaluator is deterministic TypeScript that runs
unchanged in Cloudflare Workers and Node containers. A future OPA/Cedar or other
engine may be added through an adapter only if it preserves the decision and
explanation contract.

A policy bundle contains:

- schema and bundle version;
- immutable policy ID/version and organization scope;
- default decision;
- ordered rules with stable IDs;
- subject, resource, action, context, and route predicates;
- effects and constraints;
- activation interval and environment bindings;
- author, review, signature/hash, and superseded version;
- dry-run state and validation diagnostics.

Policies bind to stable resource IDs and version ranges, not only display names.
Aliases resolve to a stable capability before evaluation.

## Decision input

```json
{
  "identity": {
    "organizationId": "org_...",
    "principalId": "usr_...",
    "principalType": "user",
    "groups": ["grp_..."],
    "roles": ["employee"],
    "claims": {},
    "issuer": "https://login.microsoftonline.com/.../v2.0"
  },
  "scope": {
    "workspaceId": "wsp_...",
    "projectId": "prj_...",
    "environmentId": "env_...",
    "compositionVersionId": "cmpv_..."
  },
  "resource": {
    "kind": "tool",
    "capabilityId": "tool_...",
    "originId": "mcpv_...",
    "risk": "destructive",
    "dataClassifications": ["confidential"]
  },
  "action": "execute",
  "connection": {
    "ownerPrincipalId": "usr_...",
    "authProfileId": "authp_...",
    "scopes": ["items.write"]
  },
  "request": {
    "clientId": "client_...",
    "ip": "203.0.113.10",
    "region": "eu",
    "time": "2026-07-21T00:00:00Z",
    "argumentClassifications": []
  },
  "upstreams": []
}
```

The implementation must validate and normalize input before evaluation. Unknown
fields do not become implicit permissions. Sensitive raw token claims are not
stored in the decision record; retain only normalized attributes required for
explanation and a hash/reference to the validated identity event.

## Supported predicates

Rules may evaluate:

- organization, workspace, project, and environment;
- user, group, role, custom attributes, service principal, and token scopes;
- Entra tenant ID, group IDs, app roles, and mapped claims;
- MCP server/version, skill/version, composition/member, tool, resource, prompt,
  and action;
- read, write, destructive, financial, identity/admin, sensitive-data, and
  code-execution risk classes;
- connected-account owner, sharing mode, provider, grant health, and scopes;
- approved client, request origin, IP/network, region, time window, and device
  or assurance context when available;
- data classification, destination, residency, and egress allowlist;
- upstream version, provenance, health, latency, capacity, region, cost tag, and
  maintenance state;
- quotas, rate/concurrency limits, feature rollout flags, and emergency
  revocations.

## Effects

The evaluator may return:

- `allow`;
- `deny`;
- `require_approval`;
- `allow_with_transform` for explicit validated input/output restrictions;
- rate, concurrency, and quota requirements;
- eligible route constraints and selection strategy;
- configured log redaction fields;
- a structured reason and remediation safe for the caller.

Parameter transforms use schema-aware operations. Arbitrary executable code in
policy is not allowed. Output transforms occur before a response reaches the
client and are included in the audit explanation without recording the payload.

## Deterministic precedence

Evaluation order is fixed:

1. invalid/expired session, tenant mismatch, or invalid resource reference;
2. platform safety blocks and emergency revocations;
3. explicit matching denies;
4. mandatory residency, egress, connection ownership/scope, and client
   constraints;
5. matching approval requirements;
6. matching allow-with-transform constraints;
7. explicit matching allows;
8. default deny.

Within one class, rules are sorted by declared priority and stable rule ID. A
more specific allow cannot override an explicit deny. Multiple constraints are
intersected; an empty intersection is a deny. Multiple transformations must
commute or compilation fails. The compiler reports same-priority conflicts,
shadowed/unreachable rules, invalid references, unsupported predicates, and
impossible route sets.

## Discovery enforcement

For `tools/list`, `resources/list`, `prompts/list`, and search:

1. resolve the authenticated identity and selected immutable composition;
2. enumerate candidates without exposing descriptors to the caller;
3. evaluate `discover` for each stable capability;
4. exclude denied or approval-only-for-discovery items;
5. apply description/schema redaction if configured;
6. return namespaced aliases and provenance only for visible items;
7. cache the result by organization, principal/attribute fingerprint,
   composition version, policy version, connection-health revision, and
   revocation epoch.

Changing identity groups, roles, policy, composition, aliases, connection
ownership/health, or emergency revocation advances the relevant epoch and
invalidates the cache. KV projections that are too stale to prove the required
epoch fail closed.

## Execution enforcement

Execution never trusts a prior list response:

1. resolve the requested alias to a stable capability in the bound composition;
2. validate the request schema and reject unknown/oversized input as configured;
3. fetch current identity, group, session, connection, policy, and revocation
   revisions;
4. evaluate `execute` with normalized request classification;
5. deny hidden, removed, revoked, stale, or mismatched capabilities;
6. apply input constraints and compute the normalized argument hash;
7. pause for approval or select a route;
8. obtain an upstream-specific execution grant;
9. execute with limits and append the decision/route metadata to audit.

An authorization failure uses an explicit error category but does not reveal a
hidden tool's sensitive schema or existence beyond what remediation requires.

## Approval binding

An approval request binds:

- organization, requester, tool stable ID and origin version;
- composition and policy versions;
- connected-account reference;
- normalized argument digest and optional encrypted argument object reference;
- requested transforms and destination;
- expiry, required approver role/group, and separation-of-duty requirement.

Approval creates a one-time grant for that exact binding. Changed arguments,
tool version, account, policy-invalidating revocation, or expiry require a new
request. Decisions and attempts are immutable and auditable.

## Route selection

Authorization returns an eligible candidate set and mandatory constraints.
Routing then applies one documented strategy:

- explicit target;
- regional/residency match;
- ordered primary/fallback;
- lowest healthy latency within a bounded sample;
- least loaded within declared capacity;
- deterministic weighted distribution using a stable request/session hash.

Candidate comparison uses normalized snapshots with stable tie-breaking by
route rule ID and upstream ID. The audit record captures considered candidates,
exclusions, chosen route, health snapshot revision, and fallback decision.

### Safe fallback

- Read-only or explicitly idempotent actions may use a healthy fallback after a
  pre-execution connection failure or a classified retryable result.
- A write with an upstream-supported idempotency key may retry only within that
  guarantee.
- A destructive or otherwise non-idempotent action is not replayed after an
  ambiguous outcome.
- Credential/auth failure does not fall back to a different user's or broader
  shared connected account.
- Residency, egress, version, provenance, and policy constraints apply equally
  to fallback candidates.

## Rate limits, quotas, and concurrency

The decision may attach limits at organization, environment, principal,
session, connection, capability, and upstream levels. The strictest applicable
limit wins. Cloudflare coordination that requires exact counters uses a Durable
Object rather than eventually consistent KV. Kubernetes uses MongoDB atomic
counters or a configured Valkey adapter with an auditable fallback policy.
Limit errors are transparent and point to fair-use/self-host guidance; there is
no paid cloud upgrade path.

## Versioning and persistence

- Draft policy documents may change; activated versions are immutable.
- Activation is a security-sensitive mutation serialized by an
  organization-scoped Durable Object on Cloudflare and a MongoDB transaction on
  Kubernetes.
- The transition writes the active pointer, revocation/cache epoch, audit event,
  and outbox record as one logical mutation.
- KV holds signed read projections. The gateway verifies version/hash and
  maximum age before use.
- Rollback activates a prior immutable version as a new audited transition; it
  does not erase history.

The Cloudflare KV-only MVP cannot claim concurrency-safe production policy
activation until Durable Object serialization is implemented and tested.

## Simulator and dry run

The API and console expose:

- compile and reference validation;
- one-off simulation against supplied or saved identity/context;
- exact matched rules, precedence steps, constraints, and candidate routes;
- comparison between current and proposed policy;
- bulk replay against redacted historical decision metadata;
- dry-run deployment that records would-allow/would-deny differences but never
  changes the enforced decision;
- conflict and unreachable-rule diagnostics.

Simulation must use the same compiled evaluator package as the gateway. It does
not invoke an upstream or reveal plaintext credentials.

## Decision and audit envelope

Each evaluation produces a stable ID and records:

- organization/environment and principal reference;
- action and stable capability/origin/version;
- policy bundle/version and normalized evaluator version;
- outcome, matched rules, precedence, transforms, and limit references;
- composition/session/identity/revocation revisions;
- selected route or exclusion summary;
- approval reference when applicable;
- timestamp, request/trace IDs, and a tamper-evidence link/hash.

The default record contains no raw arguments or tool result. Support-facing
errors expose a correlation ID and safe remediation, not sensitive policy
internals.

## Required tests

No policy capability is complete until tests cover:

- table-driven precedence, default deny, and deterministic tie breaking;
- property tests showing explicit deny cannot be overridden;
- discovery filtering and direct guessed-call denial;
- stale client, alias, group, policy, and revocation-cache behavior;
- cross-tenant identifiers in every input field;
- Entra group/app-role mapping changes and SCIM deprovisioning;
- connected-account owner/scope isolation;
- approval digest and one-time grant integrity;
- regional, health, weighted, and fallback routes;
- idempotent retry and non-idempotent ambiguous-outcome refusal;
- transform conflict and schema validation;
- simulator/runtime decision equivalence;
- concurrent Durable Object and MongoDB activations;
- audit completeness and payload/secret redaction.
