# Feature reference

This reference maps LiteMCP Composer's product surface to current implementation
evidence. It is a guide to the repository as it exists today, not a promise that
every designed capability is production-ready.

For the authoritative status and release gates, read
[`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) and
[`known-limitations.md`](./known-limitations.md).

## Availability labels

- **Available now:** implemented in the local vertical slice and covered by an
  automated test, build, or reproducible local check.
- **Preview:** a useful implementation exists, but an important enterprise or
  distributed-systems proof is missing.
- **Designed:** the contract or design is documented; the end-to-end feature is
  not implemented.
- **Blocked:** code may exist, but external credentials or a real target
  environment are required to complete the stated proof.

## Composer and registry

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Register an MCP server | Available now | Create and list tenant-scoped remote HTTP, stdio metadata, container metadata, and built-in server definitions through the API and console | Full update/delete lifecycle and broader transport probes |
| Endpoint safety | Available now | Rejects URL credentials, query strings, fragments, malformed path encoding, and credential-shaped path segments before persistence | Credential-profile references and provider-specific auth |
| Versioned server definitions | Preview | Definitions carry versions and composition members pin a version | Immutable artifact publication, upgrade diff, signing, and revocation |
| Composition creation | Available now | Creates tenant-scoped compositions from pinned members, aliases, environments, and status | Multi-step editor, conflict UI, update lifecycle, and import |
| Stable namespaces and aliases | Preview | Server aliases namespace tool names and explicit aliases produce a stable public name | Schema-conflict analysis and compatibility-preserving rename workflow |
| Publication guard | Available now | Draft compositions cannot issue sessions or execute | Promotion, rollback, approvals, and signed configuration snapshots |
| Provenance | Preview | Listed and executed tools retain upstream server/version/name provenance | Full artifact lineage, SBOM, publisher verification, and UI evidence |
| Public/private registry | Designed | Requirements cover visibility, search, share, fork, install, moderation, and compatibility evidence | Registry services, persistence, APIs, and UI |
| Skills | Designed | Open bundle model is specified in product requirements | Schemas, runner, registry lifecycle, tests, and authoring SDK |

## MCP gateway

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Downstream transport | Preview | JSON-RPC requests are accepted over one HTTP endpoint per tenant/composition | MCP conformance suite and genuine resumable Streamable HTTP/SSE sessions |
| Protocol negotiation | Available now | `initialize` negotiates the pinned protocol revision and returns server capabilities | Multi-version compatibility matrix |
| Tool discovery | Available now | `tools/list` returns the composed, namespaced, policy-filtered tool set | Pagination/search meta-tool and upstream live discovery |
| Tool execution | Available now | `tools/call` resolves aliases, rechecks policy, validates arguments, routes, and records audit evidence | Cancellation matrix, files, streaming results, and broader clients |
| JSON Schema enforcement | Available now | A fresh JSON Schema 2020-12 validator checks arguments and rejects external references | Corpus/fuzz testing and compatibility policy for schema extensions |
| Resources, prompts, completions | Designed | Required by the product contract | Gateway protocol handlers, composition rules, tests, and SDK methods |
| Notifications and resume | Designed | Required by the product contract | Durable session state, cursor/replay rules, and conformance tests |
| Upstream remote HTTP | Preview | Bounded, redirect-free execution; Node resolves every DNS answer and pins a public address | Cloud runtime equivalent proof, upstream authentication, and live compatibility matrix |
| Upstream stdio | Evaluation only | Disabled by default; requires an unsafe flag and exact executable allowlist | Disposable sandbox with immutable images, egress, filesystem, and resource controls |

## Identity, sessions, and connected accounts

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Better Auth application sessions | Preview | Shared configuration supports password policy, secure cookies, organizations, admin primitives, 2FA, bearer/JWT, API keys, SSO, and SCIM plugins | First-admin bootstrap, recovery journey, and live deployment tests |
| Organization membership RBAC | Available now | Production API derives organization roles from authenticated membership; management mutation requires owner/admin | Complete route/action authorization matrix and delegated roles |
| OIDC/SAML SSO | Preview | Better Auth plugins and detailed Entra/generic design exist | Live Entra and another OIDC provider; claim/group mapping and failure tests |
| SCIM | Preview | Provider plugin and provider contract design exist | Live create/update/deactivate/group tests and bounded revocation propagation |
| Scoped MCP sessions | Available now | Short-lived bearer tokens bind tenant, environment, composition, subject, approved clients, expiry, and hashed token storage | Audience enforcement across clients, introspection UI, and revocation fan-out |
| Explicit session revoke | Available now | Owner or the issuing subject can revoke; later authentication fails | Logout, user ban, role/group change, and SCIM authorization-version invalidation |
| Connected accounts | Designed | Credential lifecycle and isolation are specified | OAuth broker, grants, encrypted vault, refresh/revoke, UI, and isolation tests |
| Secret providers | Designed | Kubernetes, Vault, KMS, and local-envelope boundaries are specified | Portable secret-provider interfaces and at least two tested adapters |
| Service principals and mTLS | Designed | Required by the product contract | Machine identity lifecycle, rotation, revocation, and policy integration |

## Policy, approvals, and routing

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Default deny | Available now | Unknown identities and unmatched capabilities are denied | Policy migration and tenant-configurable activation |
| List/call parity | Available now | The same policy model filters discovery and is re-evaluated at execution | Distributed invalidation and stale-session authorization versions |
| Explicit-deny precedence | Available now | Explicit deny wins even over a higher-priority allow | Conflict analysis and unreachable-rule diagnostics |
| Policy simulation | Available now | API, console, SDK, and CLI explain a decision for subject/action/tool/risk | Saved scenarios, version comparison, dry-run telemetry, and activation |
| Approval gating | Preview | A pending record binds the canonical argument hash and prevents upstream dispatch | Independent approver authorization, encrypted arguments, exact one-time resume, and expiry recovery |
| Route selection | Preview | A composition member and executor are resolved deterministically | Health-aware candidates, regions, weighted routing, circuit breakers, quotas, and ledgered failover |
| Safe retry semantics | Available now | Completed side effects are not retried; ambiguous post-dispatch failures remain non-retryable | Idempotency-key contracts and result ledger for safe fallback |

## Audit and operations

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Request correlation | Available now | Control-plane and gateway paths attach a request ID | Cross-service OpenTelemetry trace propagation |
| Redacted audit | Preview | Tenant-scoped append-only records redact secret-shaped fields and form a sequence/hash chain | Transactional outbox, strong cloud serialization, signed anchors, retention, and SIEM export |
| Health endpoint | Available now | `/health` reports process and store capabilities | Component-level dependency detail and published SLOs |
| Readiness endpoint | Available now | `/ready` fails closed without production auth/durable store and probes the store | Full dependency readiness and deployment smoke across real targets |
| Portable export | Preview | Management API and CLI export non-secret configuration | Versioned import, migration, secret re-consent plan, and live cloud-to-Kubernetes test |
| OpenTelemetry/SIEM | Designed | Requirements and threat model define boundaries | Instrumentation, exporters, dashboards, and privacy tests |
| Backup/restore | Preview | Mongo-focused scripts and runbook exist | Encrypted live backup, restore, recovery-time evidence, and scheduled rehearsal |
| Upgrade/rollback | Preview | Runbook, chart, and release policy exist | Real cluster upgrade/rollback and compatibility evidence |

## Deployment models

| Target | Availability | Boundary |
| --- | --- | --- |
| Local demo | Available now | Explicit loopback-only memory-backed evaluation mode with deterministic fixtures |
| Docker Compose | Preview | Web, Node server, reverse proxy, and Mongo replica-set configuration render and images build; full product journey remains to be recorded |
| Kubernetes/Helm | Preview | Portable Node server and web images; chart supports internal/external Mongo, HA, Ingress, security contexts, probes, PDB/HPA, topology, and NetworkPolicy; no real cluster acceptance run yet |
| Managed cloud | Blocked for live release | `apps/managed-cloud` bundles the product for Cloudflare Workers with KV, D1, and static assets; live deployment requires Wrangler authentication, smoke tests, and a stronger consistency authority |

## Client surfaces

- **Astro site and React console:** a thirty-route public site plus an API-backed
  management console for the implemented vertical slice.
- **Control-plane API:** Hono routes under `/api/v1`, with OpenAPI at
  `/api/v1/openapi.json`.
- **MCP endpoint:** `/mcp/{tenantId}/{compositionSlug}` using an
  `Authorization: Bearer` session token.
- **TypeScript SDK:** `@litemcp/sdk` for overview, policy, sessions, export, and
  MCP initialize/list/call.
- **Python SDK:** `litemcp-sdk`, using only the Python standard library at
  runtime.
- **CLI:** `litemcp` for health, status, policy simulation, session issue, and
  secret-free export.

See [`api-and-sdk-reference.md`](./api-and-sdk-reference.md) for concrete calls
and [`mcp-composition-lifecycle.md`](./mcp-composition-lifecycle.md) for the
end-to-end request model.
