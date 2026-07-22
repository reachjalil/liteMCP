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
| Register an MCP server | Preview | Create/list/update/delete tenant-scoped remote HTTP, stdio metadata, container metadata, and built-in definitions; manually probe remote MCP and import bounded tools through API/console/SDK/CLI | Authenticated upstream discovery, scheduled probes, broader transport coverage, and external onboarding E2E |
| Endpoint safety | Available now | Rejects URL credentials, query strings, fragments, malformed path encoding, and credential-shaped path segments before persistence | Credential-profile references and provider-specific auth |
| Versioned server definitions | Preview | Definitions carry versions and composition members pin a version | Immutable artifact publication, upgrade diff, signing, and revocation |
| Composition creation | Preview | Creates and updates tenant-scoped multi-member compositions with pinned versions, namespaces, aliases, and environment binding; the console can publish/delete and portable import/export exists | Immutable artifact history, conflict/diff UI, rollback, and cross-target execution proof |
| Stable namespaces and aliases | Preview | Server aliases namespace tool names and explicit aliases produce a stable public name | Schema-conflict analysis and compatibility-preserving rename workflow |
| Publication guard | Available now | Draft compositions cannot issue sessions or execute; publication requires at least one healthy probed pinned member and bumps the composition version | Rollback history, approval policy for promotion, and signed configuration snapshots |
| Provenance | Preview | Listed and executed tools retain upstream server/version/name provenance | Full artifact lineage, SBOM, publisher verification, and UI evidence |
| Public/private registry | Designed | Requirements cover visibility, search, share, fork, install, moderation, and compatibility evidence | Registry services, persistence, APIs, and UI |
| Skills | Designed | Open bundle model is specified in product requirements | Schemas, runner, registry lifecycle, tests, and authoring SDK |

## MCP gateway

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Downstream transport | Preview | JSON-RPC requests are accepted over one HTTP endpoint per tenant/composition | MCP conformance suite and genuine resumable Streamable HTTP/SSE sessions |
| Protocol negotiation | Available now | `initialize` negotiates the pinned protocol revision and returns server capabilities | Multi-version compatibility matrix |
| Tool discovery | Available now | `tools/list` returns the composed, namespaced, policy-filtered tool set; a manual upstream probe imports bounded definitions and detects schema drift | Pagination/search meta-tool, authenticated/scheduled discovery, and named-client proof |
| Tool execution | Available now | `tools/call` resolves aliases, rechecks policy, validates arguments, routes, and records audit evidence | Cancellation matrix, files, streaming results, and broader clients |
| JSON Schema enforcement | Available now | A fresh JSON Schema 2020-12 validator checks arguments and rejects external references | Corpus/fuzz testing and compatibility policy for schema extensions |
| Resources, prompts, completions | Designed | Required by the product contract | Gateway protocol handlers, composition rules, tests, and SDK methods |
| Notifications and resume | Preview | Authenticated `notifications/*` messages are accepted without feature-specific behavior; resume is absent | Durable session state, notification semantics, cursor/replay rules, and conformance tests |
| Upstream remote HTTP | Preview | Bounded, redirect-free execution; Node resolves every DNS answer and pins a public address | Cloud runtime equivalent proof, upstream authentication, and live compatibility matrix |
| Upstream stdio | Evaluation only | Disabled by default; requires an unsafe flag and exact executable allowlist | Disposable sandbox with immutable images, egress, filesystem, and resource controls |

## Identity, sessions, and connected accounts

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Better Auth application sessions | Preview | Shared configuration supports password policy, secure cookies, organizations, admin primitives, 2FA, bearer/JWT, API keys, SSO, and SCIM plugins; email callbacks and first-organization/bootstrap code exist | Live email/recovery/invitation/signup journey, provider E2E, and deployed first-admin proof |
| Organization and platform RBAC | Preview | Production API derives organization roles from authenticated membership; persisted platform roles/assignments and bounded mapped claims/groups feed authorization | Complete route/action matrix, Better Auth lifecycle bridge, live provider mapping, and delegated administration |
| OIDC/SAML SSO | Preview | Better Auth plugins plus encrypted LiteMCP IdP control records and group/claim mapping evaluation exist | Bridge control records into provider registration; live Entra and another OIDC/SAML provider; failure tests |
| SCIM | Preview | Provider plugin and provider contract design exist | Live create/update/deactivate/group tests and bounded revocation propagation |
| Scoped MCP sessions | Available now | Short-lived bearer tokens bind tenant, environment, composition, subject, authorization epoch, approved-client metadata, expiry, and hashed token storage; API/console inventory and revoke exist | Cryptographic audience/client enforcement, live distributed invalidation, and provider lifecycle fan-out |
| Explicit session revoke and freeze | Preview | Owner/issuing subject revoke, epoch changes, OAuth grant invalidation, and tenant freeze deny later authentication; manual subject deprovisioning revokes paginated sessions | Better Auth logout/ban/member-removal and SCIM automatic fan-out; deployed sub-two-second proof |
| Connected accounts | Designed | Credential lifecycle and isolation are specified | OAuth broker, grants, encrypted vault, refresh/revoke, UI, and isolation tests |
| Secret providers | Designed | Kubernetes, Vault, KMS, and local-envelope boundaries are specified | Portable secret-provider interfaces and at least two tested adapters |
| Service principals | Preview | Management creates a one-time-secret principal, stores only its hash, issues Basic-authenticated scoped sessions, filters stale roles, and disables/revokes through manual subject deprovisioning | Inventory, direct disable/delete/rotation, finer permissions, mTLS, and deployed automation proof |

## Policy, approvals, and routing

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Default deny | Available now | Unknown identities and unmatched capabilities are denied | Policy migration and tenant-configurable activation |
| List/call parity | Available now | The same policy model filters discovery, is re-evaluated at execution, and is revalidated with current authority immediately before executor invocation | Deployed invalidation proof and a strictly linearizable authority-to-dispatch barrier |
| Explicit-deny precedence and lint | Available now | Explicit deny wins even over a higher-priority allow; deterministic lint reports conflicting and unreachable rules | Broader policy corpus, migration/version comparison, and authoring UX tests |
| Policy lifecycle and simulation | Preview | API/console/SDK/CLI create/update/lint/activate/archive drafts, explain decisions, and advance the authorization epoch through a serialized active pointer | Multi-document transaction/outbox, rollback history, real-IdP proof, and external E2E |
| Approval gating | Preview | A generation/fingerprint-protected slot binds full execution context plus argument hash; independent decisions, expiry, exact one-shot retry, and no pre-approval dispatch are locally tested | Stored-argument resume/recovery, native notifications, and deployed two-user proof |
| Route selection | Preview | A healthy pinned member and executor are resolved deterministically; bounded concurrency and circuit state are tenant/server scoped | Health-aware candidates, regions, weighted routing, credential-aware routing, and ledgered failover |
| Safe retry semantics | Available now | Completed side effects are not retried; ambiguous post-dispatch failures remain non-retryable | Idempotency-key contracts and result ledger for safe fallback |

## Audit and operations

| Capability | Availability | Current behavior | Next proof |
| --- | --- | --- | --- |
| Request correlation | Available now | Control-plane/gateway paths attach a request ID; usage facts can carry the corresponding audit ID, sequence, and hash receipt | Cross-service OpenTelemetry trace propagation |
| Redacted audit | Preview | Tenant-scoped records redact secret-shaped fields and form a sequence/hash chain; managed-cloud audit state routes through the tenant Durable Object in the working tree | Deploy the authority path; transactional outbox, signed anchors, retention, and SIEM export |
| Payload-free usage analytics | Preview | A strict fail-open `UsageEvent` captures bounded client/session/tool/policy/approval/status/latency/byte dimensions and rejects arguments/results; initialize attribution is first-write-wins separate authority state, and client labels are self-reported | Staging/named-client/load/privacy acceptance; complete historical managed queries; broader OBS-001 boundary coverage |
| Analytics API and console | Preview | Owner/admin tenant-injected JSON/CSV routes back six console views with date ranges, polling Live tail, drill-downs, policy patterns, and audit receipts | Playwright and deployed traffic proof; WebSocket/SSE/change-stream live path; accessibility/performance acceptance |
| Exact usage standing | Available now | `/api/v1/usage` reports server, composition, active-session, and daily-call limits/used/remaining from inventory/authority counters, independent of analytics sampling or enablement | Deployed concurrency/load evidence, identity quotas, paid overrides, and general request-rate limits |
| Health endpoint | Available now | `/health` reports process and store capabilities | Component-level dependency detail and published SLOs |
| Readiness endpoint | Available now | `/ready` fails closed without production auth/durable store and probes the store | Full dependency readiness and deployment smoke across real targets |
| Portable export/import | Preview | Management API, console, SDKs, and CLI export non-secret configuration; import fully validates a pristine target, disables imported IdPs, and commits authority last | Atomic recovery, version migration, secret re-consent/reconfiguration, and live cloud-to-Kubernetes test |
| OpenTelemetry, alerts, and SIEM | Designed | Request/audit correlation, structured usage facts, CSV pull, and Sentry are substrate only; no OTel exporter, configured analytics alert, digest, or SIEM push exists | OTel instrumentation/exporters, O-F alert/digest delivery, SIEM integration, retention controls, and deployment proof |
| Backup/restore | Preview | Mongo-focused scripts and runbook exist | Encrypted live backup, restore, recovery-time evidence, and scheduled rehearsal |
| Upgrade/rollback | Preview | Runbook, chart, and release policy exist | Real cluster upgrade/rollback and compatibility evidence |

## Deployment models

| Target | Availability | Boundary |
| --- | --- | --- |
| Local demo | Available now | Explicit loopback-only memory-backed evaluation mode with deterministic fixtures |
| Docker Compose | Preview | Web, Node server, reverse proxy, and authenticated single-member Mongo replica-set/keyfile configuration render and images build; full product journey remains to be recorded |
| Kubernetes/Helm | Preview | Portable Node server and web images; chart supports internal/external Mongo, HA, Ingress, security contexts, probes, PDB/HPA, topology, and NetworkPolicy; no real cluster acceptance run yet |
| Managed cloud | Public preview; current revision unproved | An earlier Worker version serves the public site/health/session smoke; the working tree adds KV + authority/feed Durable Objects + D1, Analytics Engine emission, staging, and email/Sentry gates | Deploy/migrate this revision; run privileged/OAuth/MCP/analytics/rollback/load/security acceptance; add Analytics Engine historical querying if required and configure alerts/WAF |

## Client surfaces

- **Astro site and React console:** a multi-page public site plus an API-backed
  management console for the implemented vertical slice.
- **Control-plane API:** Hono routes under `/api/v1`, with OpenAPI at
  `/api/v1/openapi.json`.
- **MCP endpoint:** `/mcp/{tenantId}/{compositionSlug}` using an
  `Authorization: Bearer` session token.
- **TypeScript SDK:** `@litemcp/sdk` for the implemented management lifecycle and
  MCP initialize/list/call.
- **Python SDK:** `litemcp-sdk`, with broad management methods and only the
  Python standard library at runtime.
- **CLI:** `litemcp` for implemented registry, composition, policy, session,
  identity, approval, authority, activation, and import/export operations.

See [`api-and-sdk-reference.md`](./api-and-sdk-reference.md) for concrete calls
and [`mcp-composition-lifecycle.md`](./mcp-composition-lifecycle.md) for the
end-to-end request model.
