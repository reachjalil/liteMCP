# MCP composition lifecycle

LiteMCP Composer models an enterprise MCP endpoint as a versioned composition,
not as an unstructured list of proxy routes. This document explains the current
domain model, the implemented request path, and the lifecycle still required
for a production release.

## Core objects

| Object | Purpose | Important scope |
| --- | --- | --- |
| Organization | Top-level isolation and ownership boundary | Every record, token, cache key, policy decision, and audit event |
| Environment | Promotion and runtime boundary such as development or production | Organization plus environment ID |
| MCP server definition | Pinned upstream identity, transport, endpoint, version, tags, and advertised tools | Organization |
| Composition | Stable slug plus pinned members, aliases, environments, revision, and publication status | Organization |
| Composition member | One server/version mounted under a stable namespace | Composition version |
| Tool definition | Name, description, JSON Schema input, risk, and provenance | Server version |
| Policy | Default effect plus ordered rules over subject, action, tool, and risk | Organization/environment |
| Subject | Human or workload identity with roles, groups, and claims | Authenticated organization membership |
| Gateway session | Short-lived binding from subject to environment, composition, client, expiry, and revocation state | Organization |
| Approval | Pending/decided request bound to session, composition, server, policy, epoch, tool, and normalized arguments | Organization and session |
| Audit event | Correlated, redacted evidence for governance and execution transitions | Organization |

Schemas live in [`packages/contracts`](../packages/contracts/README.md). Portable
behavior lives in [`packages/core`](../packages/core/README.md); deployment apps
only assemble adapters and runtimes.

## Register an upstream

The implemented API accepts an MCP server definition through
`POST /api/v1/servers`. Before persistence, LiteMCP Composer:

1. validates the request with the shared Zod contract;
2. requires organization owner or administrator authority in production;
3. requires an absolute HTTP(S) endpoint for remote transports;
4. rejects userinfo, fragments, all query strings, malformed percent encoding,
   and credential-shaped path segments;
5. stores the tenant-qualified definition and appends an audit event.

Authentication material does not belong in the endpoint URL. The current slice
does not yet provide a credential-profile or connected-account implementation,
so authenticated upstream registration is a designed capability rather than a
shipped workflow.

## Compose and publish

A composition selects pinned server versions and gives each member a stable
alias. Tool names are exposed as `{memberAlias}.{upstreamTool}` unless an
explicit stable alias is configured.

Example conceptual configuration:

```yaml
slug: company-tools
name: Company tools
environmentIds:
  - env_production
status: published
members:
  - serverId: server_crm
    version: 2.3.1
    alias: crm
  - serverId: server_finance
    version: 1.8.0
    alias: finance
aliases:
  - publicName: customer.search
    target: crm.search_accounts
```

The current implementation validates member existence, version pins,
environment references, aliases, and publication state. Draft compositions
cannot issue a session and cannot execute. Immutable version history,
composition diff, multi-stage promotion, and rollback are product requirements
but not complete today.

## Issue a scoped session

The control plane issues a short-lived token through `POST /api/v1/sessions`.
In production, the caller-supplied subject is discarded and the authenticated
organization identity is used instead. The stored record contains a one-way
token hash rather than plaintext.

The session binds:

- organization and environment;
- composition identity; the current published version is resolved and checked
  again for each call;
- authenticated human or workload subject;
- approved client identifiers;
- authorization epoch and optional OAuth grant-family identity;
- issue and expiry timestamps;
- revocation state.

The returned endpoint is stable for the selected composition:

```text
https://composer.example.com/mcp/{organizationId}/{compositionSlug}
```

The bearer token is sent in the `Authorization` header and must never be placed
in a URL, log line, shell history example, or client configuration that is
committed to source control.

## Initialize

The client sends JSON-RPC `initialize` with the supported MCP protocol revision.
The current gateway pins `2025-11-25` and returns a protocol error when it cannot
negotiate the request. The first valid initialize also records bounded
`clientInfo` as separate first-write-wins session attribution for later usage
facts. Client name/version is self-reported and is not an authentication or
named-client compatibility result. Updating attribution does not mutate the
authorization-session revision. A production release still needs official
conformance and multi-client compatibility evidence.

## Discover capabilities

For `tools/list`, the gateway performs the following sequence:

1. extract and validate the bearer token;
2. verify organization, composition, expiry, and revocation;
3. resolve the published composition and every pinned member;
4. construct namespaced and explicitly aliased tool identities;
5. evaluate `discover` policy for the session subject and each tool;
6. omit denied tools rather than relying on the client to hide them;
7. return allowed schemas with origin/version provenance;
8. append correlated audit evidence.

Directly guessing a hidden name does not bypass policy because execution repeats
authorization.

The fail-open Insight Plane records one aggregate discovery fact with canonical
visible/hidden counts and a capped visible-tool sample. It does not fan out one
analytics record per tool. Audit remains a separate fail-closed path.

## Execute a tool

For `tools/call`, the gateway:

1. authenticates and scopes the session again;
2. resolves the public name to one pinned upstream capability;
3. evaluates `execute` policy independently of prior discovery;
4. validates arguments with a fresh JSON Schema 2020-12 validator;
5. creates or consumes an exact-context, one-shot approval and stops when a
   decision is still required;
6. records a pre-dispatch audit transition;
7. reauthenticates and revalidates the current session/authority/composition/
   server/policy context, then selects the bounded executor and dispatches once;
8. preserves content, structured content, error state, and provenance;
9. records the outcome without turning a completed side effect into a retryable
   failure.

The current approval slice supports an independent decision, expiry, and an
exact one-time client retry; it does not store arguments or resume calls on the
server. The current route is deterministic, enforces fixed organization quotas,
and bounds tenant/server executor concurrency with circuit state. Regional
candidate health, weights, residency, credential-aware routing, and ledgered
failover are not complete. The final context check is not a transaction with
the external side effect, so a strict freeze/revoke-versus-dispatch barrier
remains a release gap.

Each valid call attempt produces exactly one terminal usage fact across
success, denial, pending/denied approval, quota, validation, upstream, and
tool-reported failure paths. It contains dimensions and measures only, never
arguments or results. Remote HTTP timing surrounds each `fetch`, so upstream
latency/bytes accumulate across safe retries while total latency covers the
complete gateway path. `requestId` and an optional audit receipt correlate the
two evidence planes. See
[`usage-observability.md`](./usage-observability.md).

## Executor boundaries

### Built-in

Deterministic fixtures prove composition and policy without external services.
They are useful for tests and explicit local demo mode.

### Remote HTTP

The portable executor applies time and response-size bounds and rejects
redirects. The Node deployment adds DNS resolution across all A and AAAA
answers, special-address rejection, and connection pinning with the original
Host/SNI. This protects against common SSRF and DNS-rebinding paths. Equivalent
proof for the Worker runtime and real upstream authentication remain release
gates.

### Host stdio

Host process execution is off by default and requires both
`LITEMCP_ENABLE_UNSAFE_HOST_STDIO=true` and an exact executable allowlist. It is
an evaluation escape hatch, not a sandbox or production connector runtime.

## Policy model

The current evaluator understands:

- action: `discover` or `execute`;
- subject roles and groups;
- public tool name;
- risk class;
- rule priority and explicit-deny precedence;
- effects: allow, deny, or require approval.

Unknown roles and unmatched requests default to deny. The simulator exposes the
decision and explanation through the console, API, SDK, and CLI. See
[`policy/routing-and-authorization.md`](./policy/routing-and-authorization.md)
for the complete target model.

## Failure behavior

| Failure | Expected result |
| --- | --- |
| Missing/expired/revoked token | Authentication error; no upstream dispatch |
| Tenant in token differs from URL | Forbidden; no cross-tenant lookup |
| Draft or missing composition | Not found/validation error; no dispatch |
| Hidden or denied tool | Authorization error even when the name is guessed |
| Invalid arguments | Invalid-params error before approval or dispatch |
| Approval required | Pending result; no dispatch |
| Pre-dispatch audit failure | Fail closed; no dispatch |
| Upstream timeout or bounded-response violation | Explicit gateway error |
| Ambiguous failure after a side effect | No automatic retry |

## Portability contract

`apps/managed-cloud` and `apps/server` use the same contracts, domain service,
gateway, auth composition, and control-plane API. Only adapters and runtime
assembly differ:

- the managed-cloud working tree uses Cloudflare Workers, KV, one tenant Durable
  Object for the security-sensitive slice, and D1 for Better Auth;
- portable server uses Node.js and MongoDB for Docker/Kubernetes;
- Cloudflare code remains inside `apps/managed-cloud` and
  `packages/adapter-cloudflare`.

Portable export and fully validated pristine-target import are implemented for
non-secret configuration. Import is multi-document rather than atomic, and a
live managed-cloud-to-Kubernetes exit test with credential reconfiguration
remains incomplete.
