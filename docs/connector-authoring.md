# MCP server and connector authoring

LiteMCP Composer consumes standards-compliant MCP servers. It does not require a
proprietary downstream protocol. This guide defines the compatibility and
security expectations for an upstream that will be registered and composed.

The repository does not yet ship the planned connector authoring SDK,
OpenAPI-to-MCP generator, or publication pipeline. Use this document as the
current integration contract and track those missing tools in
[`feature-reference.md`](./feature-reference.md).

## Supported slice

The current gateway can compose:

- deterministic built-in tools used by tests/demo;
- remote HTTP MCP definitions;
- explicitly unsafe, allowlisted host stdio in the portable Node evaluation
  runtime.

Container metadata exists in the registry model, but a production isolated
container runner is not implemented. Resources, prompts, completions,
notifications, and resumable streaming remain gateway roadmap items.

## Minimum MCP behavior

An upstream used by the current vertical slice should:

1. accept JSON-RPC 2.0 requests;
2. support the pinned MCP protocol revision during `initialize`;
3. implement `tools/list` with stable names and JSON Schema input definitions;
4. implement `tools/call` with content and optional structured content;
5. return protocol errors rather than transport-level success with malformed
   payloads;
6. honor cancellation/timeouts where the transport permits it;
7. keep side-effect semantics and idempotency explicit.

## Tool design

Use a stable, specific upstream tool name. LiteMCP Composer namespaces it with
the composition member alias and can assign an explicit public alias.

Each tool should document:

- short description and intended user;
- input JSON Schema;
- output/content model;
- read/write/destructive behavior;
- idempotency and retry safety;
- required provider scopes;
- data categories sent and returned;
- pagination and size limits;
- expected timeout and rate limits;
- user-visible and machine-readable errors.

Avoid ambiguous “run” or “execute” tools with unconstrained object schemas.
Prefer several narrowly scoped capabilities whose policy and approval risk can
be understood independently.

## JSON Schema constraints

The gateway validates tool arguments with JSON Schema 2020-12. For the current
slice:

- keep schemas self-contained;
- do not use remote `$ref` or `$dynamicRef`;
- assign conservative string/array/object limits;
- use standard formats only where clients can satisfy them consistently;
- make required fields explicit;
- set `additionalProperties: false` when unknown fields would be unsafe;
- avoid pathological regular expressions or deeply recursive structures.

The gateway creates an isolated validator for each validation operation to
prevent cross-tenant schema registration and `$id` poisoning.

## Authentication boundary

Do not embed credentials in an MCP endpoint. LiteMCP Composer rejects endpoint
userinfo, query strings, fragments, and credential-shaped path segments.

The target credential plane will select tenant/user-owned connected accounts
and inject credentials only at the trusted upstream boundary. That broker is
not implemented today. Until it exists, authenticated production connectors
require operator-controlled deployment integration and must never return a
provider token to the MCP client or model.

## SSRF and egress

Remote servers should be registered by administrators from an approved origin
set. The portable Node executor:

- resolves and validates every A/AAAA address;
- rejects loopback, private, link-local, multicast, documentation, and other
  special ranges in production;
- pins one approved address while preserving Host/SNI;
- rejects redirects;
- applies timeout and response-size bounds.

Deployment network policy remains a required defense. Do not rely on application
validation as the only egress control.

## Side effects and retries

Label write, financial, destructive, identity-administration, and code-execution
capabilities with the appropriate risk in the registry definition. The current
gateway will not automatically retry an ambiguous or completed side effect.

If an operation is safely retryable, define the provider's idempotency contract:

- key source and scope;
- retention window;
- duplicate result semantics;
- conflict behavior;
- whether a request can be routed to another upstream instance safely.

## Error model

Return enough structured information to distinguish:

- invalid arguments;
- authentication or missing provider consent;
- authorization/policy denial;
- approval required;
- rate/quota exhaustion;
- transient unavailable/timeout;
- permanent provider error;
- ambiguous post-dispatch outcome.

Do not put tokens, cookies, raw credentials, or sensitive payloads in error
messages. LiteMCP Composer redacts secret-shaped audit metadata, but the
connector owns its own response/log hygiene.

## Local integration loop

1. Start the explicit local demo server.
2. Register a credential-free endpoint and exact advertised tool metadata.
3. Create a published composition with a stable member namespace.
4. Simulate discovery and execution policy.
5. Issue a short-lived session.
6. Run MCP initialize, list, and a read-only call.
7. Guess a denied name and verify no upstream dispatch.
8. Exercise invalid schemas, timeout, oversize response, and provider error.
9. Revoke the session and verify later calls fail.
10. Inspect redacted audit/provenance.

The runnable [`../examples/local-composition`](../examples/local-composition/README.md)
demonstrates the client side of this flow.

## Publication checklist (target contract)

Before future registry publication, an artifact should include source, license,
version, checksum, provenance, SBOM, documentation, examples, risk/scopes,
supported transports/protocols, compatibility results, security notices,
revocation state, and migration notes. Publication will not imply security
certification.
