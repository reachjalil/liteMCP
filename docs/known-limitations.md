# Known limitations

Snapshot: 2026-07-21. LiteMCP Composer is a tested local vertical slice, not a
production-ready enterprise release. This list is intentionally conservative.

## Product availability

- The public site, console, Hono control API, MCP gateway, policy evaluator,
  sessions, approvals, audit, SDKs, and deployment compositions run locally and
  build in CI-shaped checks.
- There is no production first-administrator/bootstrap journey. Production
  signup is disabled, so a fresh deployment is not operational until a safe,
  audited bootstrap mechanism is added.
- Several console areas represent planned product planes whose complete CRUD
  and operating journeys are not implemented.
- None of the mandatory enterprise acceptance scenarios is complete end to end;
  the exact partial evidence is in
  [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md).

## Managed cloud consistency

- The current managed cloud product uses Workers KV for sessions, policies,
  compositions, approvals, and audit projections. KV is eventually consistent
  and its revision check is a read-then-write operation, not atomic CAS.
- Session revocation, policy/composition changes, and emergency access removal
  can therefore remain stale at another edge. Concurrent audit heads can fork.
- Until these authoritative operations move behind a per-tenant Durable Object
  or equivalent strongly consistent boundary with measured invalidation, the
  managed cloud app is single-writer/evaluation-grade for security-sensitive
  state and must not be sold as enterprise production-safe.
- D1 currently stores Better Auth data separately; this does not make the KV
  product/security state strongly consistent.

## Portable storage

- The MongoDB adapter has tenant-qualified keys, indexes, revision-safe writes,
  and advertises transactions, but `PlatformService` does not yet wrap product
  state plus audit/outbox changes in a MongoDB transaction.
- A crash between an audit-event insert and audit-head update can leave an
  orphan. Retry/serialization improves normal-process concurrency but is not a
  transactional or externally anchored ledger.
- Mongo backup/restore, migration, change-stream invalidation, adapter parity,
  and cross-target export/import have not passed a compatibility suite.

## Authentication and enterprise identity

- Better Auth is composed with organization, admin, 2FA, bearer, JWT, API-key,
  OIDC/SAML SSO, and SCIM plugins. D1 migrations and the Mongo composition
  exist, but provider onboarding and production flows have not passed live
  browser/provider tests.
- No live Microsoft Entra tenant or deterministic SCIM conformance suite has
  passed. Production subject mapping currently uses organization membership
  roles but does not map verified SSO groups, Entra app roles, or arbitrary
  claims into the authorization subject.
- Explicit MCP-session revoke works. Better Auth logout, user ban, membership
  removal, SCIM deprovisioning, and IdP group changes do not yet invalidate all
  issued MCP credentials. Sessions snapshot roles/groups until explicit revoke
  or expiry (maximum 24 hours); an authorization epoch and revocation fan-out
  are required.
- The Better Auth API-key plugin is configured, but service-principal creation,
  permission assignment, rotation, and control-plane use are not proven end to
  end.
- Password recovery/email delivery, passkeys, device/session administration,
  break-glass access, and complete MFA policy are not shipped.

## Connected accounts and credentials

- There is no production credential vault, connected-account model, OAuth
  consent lifecycle, envelope encryption, tenant key hierarchy, KMS/Vault
  adapter, refresh coordination, or short-lived execution grant.
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
- It has not passed an external MCP conformance suite or a named compatibility
  matrix for Claude, Codex, Cursor, or VS Code.
- Resources, prompts, completions, notifications, subscriptions, resumability,
  progress, sampling, elicitation, and full streaming behavior are absent.
- `legacy-sse` currently shares the JSON request/response executor; it is not a
  standards-faithful SSE implementation and must not be advertised as one.
- Remote tool definitions are supplied at registration; dynamic upstream MCP
  discovery, schema-drift reconciliation, and secured discovery are not built.
- `approvedClients` is descriptive session metadata, not cryptographic client
  binding. No DPoP, mTLS, or proof-of-possession enforcement exists.

## Policy, routing, and approvals

- Default-deny evaluation, explicit-deny precedence, role/risk/tool rules,
  discovery filtering, direct-call recheck, simulation, and hidden-tool tests
  exist.
- Policy authoring CRUD, immutable activation/promotion, conflict analysis,
  distributed cache invalidation, attribute mapping, quotas, and emergency
  revocation are incomplete.
- Regional, latency, weighted, health, residency, and credential-aware routing
  are not implemented. Ambiguous post-dispatch failures are marked
  non-retryable, but there is no idempotency/result ledger or safe failover
  engine.
- Approval records bind canonical arguments and pause before dispatch, but
  independent decision authorization, encrypted durable arguments, expiry,
  one-time resume, and recovery are absent.

## Registry, connectors, and execution

- The vertical slice registers server metadata and creates published
  compositions with pinned versions and provenance. It is not a complete
  registry.
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
- The Cloudflare KV consistency limitation prevents a tamper-evident production
  claim across Worker isolates.
- OpenTelemetry traces/metrics, route and credential correlation, retention,
  quotas, rate limits, anomaly detection, and operational dashboards are not
  implemented.
- Tool arguments/results are not intentionally retained in ordinary audit
  metadata, but a formal telemetry field inventory and payload-capture control
  have not passed privacy review.

## Network and security assurance

- The Node remote executor resolves every A/AAAA answer, blocks private and
  special-use ranges, pins a validated address for the connection, preserves
  origin Host/SNI, rejects redirects, and bounds request/response bodies. DNS
  resolver cancellation and a full TLS certificate fixture remain untested.
- Equivalent adversarial DNS/pinning behavior has not been proven in the
  managed cloud runtime; provider fetch behavior remains an infrastructure
  dependency.
- Managed cloud demo mode is guarded to loopback `PUBLIC_ORIGIN`; Node demo mode
  defaults off and binds loopback unless an explicit unsafe override is set.
- Tool JSON Schemas use an isolated validator, reject external references, and
  validate standard formats. The supported-schema compatibility surface still
  needs broader fuzzing and resource limits for pathological schemas.
- No penetration test, external security review, supply-chain incident
  exercise, signed release, published SBOM, vulnerability scan, or reproducible
  build proof is recorded.
- LiteMCP Composer claims no SOC 2, ISO 27001, HIPAA, FedRAMP, GDPR
  certification, or other certification.

## Operations and deployment

- The managed cloud Wrangler dry-run and local D1 migration pass. Wrangler was
  not authenticated, no real service was deployed, and no live URL, domain,
  authentication, API, MCP, or rollback smoke test is recorded.
- Docker server/web images build, Compose renders, and the Helm chart strictly
  lints/renders across checked-in profiles. The full Compose journey has not
  run; its MongoDB evaluation service has no database authentication.
- `kubectl` and `kind` were unavailable. No live Kubernetes install/readiness,
  scaling, migration, backup/restore, upgrade/rollback, NetworkPolicy, or
  disconnected test passed.
- HPA, PDB, topology spreading, probes, non-root/read-only containers, Ingress,
  NetworkPolicy, external Mongo/secrets, and air-gap values are rendered
  configuration—not runtime proof.
- No benchmark, SLO, availability result, capacity limit, or support scale may
  be advertised.

## Commercial and legal

- The managed cloud is described as free with future transparent fair-use
  limits; no thresholds, availability commitment, regional offering, or SLA is
  published.
- Enterprise services pricing, support scope, LTS duration, and SLA terms have
  not been legally or commercially finalized.
- Existing uses of similar `liteMCP` names mean the repository name is not
  trademark, package, or domain clearance. The visible product brand is
  **LiteMCP Composer** to improve differentiation, but legal clearance remains
  necessary.
- No customer, adoption, uptime, connector breadth, competitor-superiority, or
  compliance claim has been validated.

## Research limitations

The supplied research separated facts from proposals but did not include live
customer interviews, product onboarding, a controlled competitor bake-off,
provider-specific token portability tests, archive capture, or audited
economics. Dynamic competitor, library, and standards claims must be rechecked
before publication.
