# Known limitations

Snapshot: 2026-07-21. LiteMCP Composer is a tested local vertical slice, not a
production-ready enterprise release. This list is intentionally conservative.

## Product availability

- The public site, console, Hono control API, MCP gateway, policy evaluator,
  sessions, approvals, audit, SDKs, and deployment compositions run locally and
  build in CI-shaped checks.
- Signup-aware UI, email callbacks, first-organization creation, and an
  idempotent tenant bootstrap now exist in code. The checked-in managed-cloud
  targets still set `SIGNUPS_ENABLED=false`, and no staging or production run
  has proved signup, verification, organization creation, bootstrap, and first
  governed tool execution as one journey.
- Several console areas represent planned product planes whose complete CRUD
  and operating journeys are not implemented.
- None of the mandatory enterprise acceptance scenarios is complete end to end;
  the exact partial evidence is in
  [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md).

## Managed cloud consistency

- The working-tree managed-cloud hybrid store keeps organizations, environments,
  activation events, and other non-authoritative records in Workers KV. It routes
  sessions, tenant authority, roles/assignments, IdP control records,
  servers/compositions/policies, approvals, service principals, audit
  events/heads, quota counters, and MCP OAuth records through one SQLite Durable
  Object per tenant. Better Auth records remain separately in D1.
- Durable Object writes provide revision-aware serialization for the routed
  authority collections. That is atomic per document, not for a policy
  activation or other multi-document product transition. There is no atomic
  transaction spanning separate documents, KV, D1, and the Durable Object.
- The new authority path has local adapter tests but no recorded multi-region
  invalidation, deployment, failover, migration/rollback, restore, load, or
  chaos result. The recorded public Worker version predates this path; it must
  not be presented as enterprise production proof merely because the stronger
  boundary now exists in code.

## Portable storage

- The MongoDB adapter has tenant-qualified keys, indexes, revision-safe writes,
  and advertises transactions, but `PlatformService` does not yet wrap product
  state plus audit/outbox changes in a MongoDB transaction.
- A crash between an audit-event insert and audit-head update can leave an
  orphan. Retry/serialization improves normal-process concurrency but is not a
  transactional or externally anchored ledger.
- Import validates the complete portable graph before it mutates a pristine
  target and commits the authority pointer last. It is still a sequence of
  document writes rather than an atomic restore; failure recovery and live
  managed-cloud-to-Mongo portability have not been proved.
- Mongo backup/restore, migration, change-stream invalidation, adapter parity,
  and cross-target export/import have not passed a compatibility suite.

## Authentication and enterprise identity

- Better Auth is composed with organization, admin, 2FA, bearer, JWT, API-key,
  OIDC/SAML SSO, and SCIM plugins. D1 migrations and the Mongo composition
  exist, but provider onboarding and production flows have not passed live
  browser/provider tests.
- A Resend-compatible delivery seam is wired to verification, password-reset,
  and invitation callbacks, and production signup refuses to open without an
  email sender. No real message delivery, bounce/abuse handling, sender-domain
  validation, or full signup/invitation/recovery browser journey has passed.
- LiteMCP IdP control records now have management CRUD, tenant-derived AES-GCM
  protection for client secrets, and group/claim-to-role evaluation. They are
  not bridged into Better Auth's SSO provider registry, have no test-connection
  path, and have not carried claims from a real Entra, Okta, OIDC, SAML, or SCIM
  provider into an authorization subject.
- Explicit revoke and authorization-epoch checks work for scoped MCP sessions.
  Role assignment/removal, policy activation, IdP record changes, manual
  subject deprovisioning, and freeze advance the epoch. Better Auth logout, user
  ban, organization membership removal, and SCIM deprovisioning are not wired
  automatically to those calls, so the global-revocation acceptance target is
  unproven.
- Service-principal creation and Basic-authenticated scoped-session issuance
  exist and store only the generated secret hash. Authentication filters roles
  against the current role catalog, and manual subject deprovisioning disables a
  matching principal and revokes its sessions. Inventory, direct disable/delete,
  secret rotation, permission changes, automatic directory fan-out, and a
  deployed headless-agent journey are absent.
- Password-recovery UI and delivery hooks exist, but passkeys, device/session
  administration, break-glass access, and complete MFA policy are not shipped.

## Connected accounts and credentials

- The new credential envelope protects only LiteMCP IdP control-record client
  secrets. Better Auth's own secret-bearing SSO, JWKS, TOTP, and account records
  are not routed through it. There is no production credential vault,
  connected-account model, upstream OAuth consent lifecycle, KMS/Vault adapter,
  key-rotation workflow, refresh coordination, or short-lived execution grant.
- Upstream URL userinfo, fragments, query parameters, and obvious
  credential-like path segments are rejected. Authentication embedded as an
  unlabeled opaque path cannot be reliably detected; path tokens are unsupported
  and must not be used.
- Remote upstreams requiring authentication are not supported until credential
  profiles exist. Provider tokens are never claimed to be portable when the
  provider binds them to a specific OAuth client; migration may require consent.

## MCP compatibility and composition depth

- The gateway pins MCP `2025-11-25` and implements request/response handling for
  initialize, `tools/list`, and `tools/call` with builtin and remote HTTP tools,
  namespaced aliases, provenance, JSON Schema 2020-12 argument checks, policy,
  approval pause, cancellation/timeout, and bounded responses.
- The HTTP surface now advertises protected-resource and authorization-server
  metadata, returns a bearer resource-metadata challenge, and has locally tested
  public-client registration, PKCE S256 code exchange, 15-minute access tokens,
  and rotating refresh tokens. This is wire-level OAuth substrate, not named
  MCP-client compatibility or an externally reviewed authorization server.
- It has not passed an external MCP conformance suite or any named-client run.
  The published
  [`mcp-client-compatibility.md`](./mcp-client-compatibility.md) matrix records
  every named target as unverified or blocked rather than treating a wire-level
  smoke as client certification.
- The authorization endpoint requires an authenticated member and an explicit
  same-origin approve/deny form. Refresh credentials are issued only for an
  explicitly granted `offline_access` scope; refresh rotation, family reuse
  invalidation, and token revocation have local tests. Client ID Metadata
  Documents, richer consent/client administration, broader dynamic-registration
  controls, and OAuth attack/conformance suites are absent.
- Resources, prompts, completions, subscriptions, resumability, progress,
  sampling, elicitation, and full streaming behavior are absent. Authenticated
  `notifications/*` messages are accepted, but no feature-specific notification
  behavior is implemented.
- `legacy-sse` currently shares the JSON request/response executor; it is not a
  standards-faithful SSE implementation and must not be advertised as one.
- A manual probe performs upstream `initialize` plus `tools/list`, imports bounded
  definitions, hashes the schema, and quarantines an unexpected change until an
  administrator accepts it. Scheduled probes, authenticated upstream discovery,
  compatibility negotiation, and automatic safe reconciliation are not built.
- `approvedClients` is descriptive session metadata, not cryptographic client
  binding. No DPoP, mTLS, or proof-of-possession enforcement exists.

## Policy, routing, and approvals

- Default-deny evaluation, explicit-deny precedence, role/risk/tool rules,
  discovery filtering, direct-call recheck, simulation, and hidden-tool tests
  exist.
- Draft create/update, conflict/unreachable-rule lint, an authoritative active
  pointer, activation/archival, role assignments, authorization epochs, and an
  emergency freeze overlay now exist. Promotion still spans separate authority
  and policy documents, has no transaction/outbox or immutable version history,
  and has no distributed deployment proof. Provider-backed attribute mapping is
  also unproven.
- Regional, latency, weighted, health, residency, and credential-aware routing
  are not implemented. Ambiguous post-dispatch failures are marked
  non-retryable, but there is no idempotency/result ledger or safe failover
  engine.
- Approval records never store the argument payload. They bind its canonical
  hash plus the session, composition, server revision/schema/execution config,
  active policy, authorization epoch, tool, requester, generation, and
  fingerprint. Pending slots deduplicate; an owner/admin/approver other than the
  requester can approve or deny with a reason; expiry is checked; and the client
  can retry the exact context once. There is no server-side resume or
  crash-recovery queue, and the optional generic webhook is neither native
  email/Slack delivery nor deployed notification proof.
- The gateway reauthenticates the bearer and revalidates session, authority,
  composition, server, and policy state immediately before invoking an
  executor. Storage reads and an external network side effect cannot share one
  transaction, so a freeze or revoke racing after that final check can still
  occur after outbound dispatch begins. A strictly linearizable dispatch lease
  or equivalent barrier is not implemented.

## Registry, connectors, and execution

- The control plane can update/delete servers, manually probe/import remote tool
  definitions, quarantine or accept schema drift, edit multi-member
  compositions, and republish a bumped version with pins and provenance. These
  local lifecycle paths are not a complete registry and have no external-server
  onboarding E2E.
- Skills, immutable package artifacts, signing, SBOM attachment, moderation,
  publisher verification, publish/share/fork/install, compatibility evidence,
  revocation feeds, and schema rollout are not implemented.
- There is no supported connector count. Builtin calculator and local finance
  fixtures are test/demo implementations, not certified integrations.
- Host stdio is disabled unless both `LITEMCP_ENABLE_UNSAFE_HOST_STDIO=true`
  and an exact executable allowlist are set. Once enabled, tenant-controlled
  arguments execute without a container sandbox; this is evaluation-only.
- A disposable Kubernetes/container runner with immutable commands, resource,
  filesystem, process-tree, and egress isolation is not implemented.

## Audit, privacy, and observability

- Audit events are tenant-scoped, recursively redacted, sequence/hash linked,
  and exposed through API/UI/export. Hashes are not signed, externally anchored,
  immutable against a storage administrator, or retained/exported to a SIEM.
- Managed-cloud audit heads/events now route through the per-tenant SQLite
  Durable Object in the working tree, but that path is not deployed. Hashes
  remain unsigned, externally unanchored, and mutable by a storage/account
  administrator; no production tamper-evidence claim has passed acceptance.
- The working tree now has a separate Insight Plane: a strict payload-free
  `UsageEvent`, fail-open recorder, gateway/session/approval instrumentation,
  deterministic aggregations, tenant-gated JSON/CSV APIs, exact quota standing,
  and six console views. Focused local tests cover sink failure, tenant
  isolation, cardinality, one-event discovery/call accounting, receipt linkage,
  and aggregation; this is not staging, deployment, named-client, browser, or
  load evidence.
- Client name/version is self-reported in MCP `initialize`, not verified client
  identity. First-write-wins attribution is stored separately from the session
  authorization revision. Subject views expose opaque IDs and do not join
  display names or email addresses.
- The analytics contract rejects tool arguments, results, emails, display
  names, and unmodelled fields. Byte counts are stored, not bodies. This is a
  code-level field inventory, but a formal privacy review has not passed and
  no payload-capture mode or its future consent/redaction controls exists.
- Portable Mongo analytics uses a configurable time-series TTL (90 days by
  default), bounded in-process queue, and bounded reads. Queued events can be
  dropped during validation, overflow, setup, or write failure by design;
  analytics loss never blocks a product request. Audit is the separate
  fail-closed evidence path.
- Managed cloud emits tenant-indexed Analytics Engine rows but the current API
  queries only a sibling exact feed capped at 500 newest events by default.
  There is no Analytics Engine SQL proxy, so summaries and 30-day ranges can be
  incomplete after feed eviction. The feed is not an audit ledger.
- Approval analytics correlate lifecycle facts by approval ID. Reuse after a
  recorded decision is handled, but an expired or otherwise undecided generation
  followed by reuse can collapse with retries until the event contract carries
  an explicit approval generation.
- `/usage` reads exact resource inventory and daily quota counters rather than
  sampled or feed-capped analytics. General MCP request-rate and
  organization-wide concurrency limits, identity-specific quotas, anomaly
  detection, audit retention, WebSocket/SSE, Mongo change streams,
  OpenTelemetry traces/metrics, configured alerts, weekly digests, and SIEM
  delivery remain absent. O-F is outstanding. Request-correlated Sentry,
  activation events, fixed organization quotas, and Better Auth database rate
  limits still have no deployed event, alert, load, or capacity evidence.

## Network and security assurance

- The Node remote executor resolves every A/AAAA answer, blocks private and
  special-use ranges, pins a validated address for the connection, preserves
  origin Host/SNI, rejects redirects, and bounds request/response bodies. DNS
  resolver cancellation and a full TLS certificate fixture remain untested.
- Equivalent adversarial DNS/pinning behavior has not been proven in the
  managed cloud runtime; provider fetch behavior remains an infrastructure
  dependency.
- No Cloudflare WAF rules or equivalent edge-control acceptance evidence is
  checked in. Application quotas and Better Auth database rate limits do not
  substitute for an edge abuse-control layer.
- Managed cloud demo mode is guarded to loopback `PUBLIC_ORIGIN`; Node demo mode
  defaults off and binds loopback unless an explicit unsafe override is set.
- Tool JSON Schemas use an isolated validator, reject external references, and
  validate standard formats. The supported-schema compatibility surface still
  needs broader fuzzing and resource limits for pathological schemas.
- GHCR publication produces BuildKit SBOM and provenance attestations for both
  images, and the `edge` OCI indexes resolve anonymously. No penetration test,
  external security review, supply-chain incident exercise, signed or tagged
  immutable release, vulnerability scan, or reproducible build proof is
  recorded.
- `pnpm audit` reports the high-severity `@better-auth/scim` owner-binding
  advisory (`GHSA-j8v8-g9cx-5qf4`). LiteMCP enables provider ownership and
  restricts provider creation to owner/admin roles, but the first patched
  upstream release is still a `1.7` prerelease. Moving the Better Auth stack to
  that release requires an explicit compatibility and migration pass; this
  remains a production-release blocker.
- LiteMCP Composer claims no SOC 2, ISO 27001, HIPAA, FedRAMP, GDPR
  certification, or other certification.

## Operations and deployment

- The managed-cloud public preview is deployed at
  [`litemcpcomposer.com`](https://litemcpcomposer.com). Wrangler deployment,
  dedicated KV/D1 provisioning, remote migration, secret binding, TLS, static
  routes/assets, health/readiness, the unauthenticated Better Auth session
  endpoint, and the apex/`www` canonical-domain behavior passed on 2026-07-21.
  That recorded Worker version predates the current signup, OAuth, authority,
  lifecycle, quota, and console changes. The current working tree and its new D1
  and Durable Object migrations have not been deployed there.
- An isolated staging Worker configuration and gated deployment workflow are
  checked in, but staging KV/D1 resource IDs are intentionally absent and no
  staging deployment has run. Production and staging both keep signup disabled
  by default.
- First-user signup/email/bootstrap, privileged control-plane operations, MCP
  initialize/list/call, approval/OAuth, audit correlation, SSO/SCIM, rollback,
  load, and external security acceptance have not passed on staging or the
  public preview.
- Docker server/web images build, Compose renders, and the Helm chart strictly
  lints/renders across checked-in profiles. Compose now configures MongoDB
  client authentication and a replica-set keyfile, but the full stack has not
  run. Its bundled single-member database uses the bootstrap/root account and
  has no recorded TLS, least-privilege-user, backup/restore, or failover proof.
- `kubectl` and `kind` were unavailable. No live Kubernetes install/readiness,
  scaling, migration, backup/restore, upgrade/rollback, NetworkPolicy, or
  disconnected test passed.
- HPA, PDB, topology spreading, probes, non-root/read-only containers, Ingress,
  NetworkPolicy, external Mongo/secrets, and air-gap values are rendered
  configuration—not runtime proof.
- No benchmark, SLO, availability result, capacity limit, or support scale may
  be advertised.

## Commercial and legal

- The free managed-cloud defaults are published in
  [`managed-cloud-fair-use.md`](./managed-cloud-fair-use.md). There is still no
  availability commitment, supported regional offering, production capacity
  result, published paid-plan catalog, or SLA.
- Enterprise services pricing, support scope, LTS duration, and SLA terms have
  not been legally or commercially finalized.
- Existing uses of similar `liteMCP` names mean the repository name is not
  trademark, package, or domain clearance. The visible product brand is
  **LiteMCP Composer** to improve differentiation, but legal clearance remains
  necessary.
- No customer, adoption, uptime, connector breadth, competitor-superiority, or
  compliance claim has been validated. There is no recorded design-partner
  commitment, weekly-active governed-user cohort, activation conversion,
  retention signal, paid commitment, or other PMF metric from the supplied
  plan.

## Research limitations

The supplied research separated facts from proposals but did not include live
customer interviews, product onboarding, a controlled competitor bake-off,
provider-specific token portability tests, archive capture, or audited
economics. Dynamic competitor, library, and standards claims must be rechecked
before publication.
