# LiteMCP Composer product requirements

Status: approved product contract; implementation status is tracked separately
in [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md).

## Product definition

LiteMCP Composer is a fully open-source management platform for creating,
importing, publishing, composing, and governing MCP servers and reusable skills.
It gives each organization one stable MCP endpoint while showing each human or
service identity only the capabilities it may discover and execute.

MCP composition is the product category, not an adapter feature. The product
must model MCP protocol and enterprise composition concerns directly:
capability schemas and namespaces, versioned composition graphs, identity-bound
discovery, execution-time policy, approval, routing, health, provenance,
sessions, audit, compatibility, and deployment portability. General LLM proxy,
model-hosting, and agent-runtime features are deliberately out of scope.

> One governed MCP entry point for every user and agent, assembled from any set
> of MCP servers, with exact control over what each identity may discover and
> execute.

The public managed cloud is a free adoption/community service. The complete
self-hosted product is also free. Commercial contracts purchase on-premises
installation, migration, integration, supported LTS, operational management,
training, security response, and response-time commitments—not secret product
features.

## Outcomes

1. A team can consolidate scattered MCP configurations into one endpoint
   without creating a cloud account.
2. An enterprise can map its identity provider to exact discovery and execution
   rights, including approvals and emergency revocation.
3. Each user's connected SaaS account remains isolated and is never exposed to
   the model, client, or unrelated worker.
4. A creator can publish, version, share, fork, test, and install MCP servers and
   skills with provenance and compatibility metadata.
5. Managed cloud configuration can be exported and run on Kubernetes without a
   managed cloud callback.
6. Operators can explain, observe, back up, upgrade, roll back, and recover the
   platform without collecting tool payloads by default.

## Non-goals

- model routing or model hosting;
- an agent planning, memory, or conversational runtime;
- a general visual workflow builder;
- a vector database or RAG platform;
- a proprietary MCP dialect;
- catalog-count competition without compatibility evidence;
- payment collection or paid managed cloud tiers;
- unverified claims about compliance, uptime, scale, or connector quality.

## Personas and required journeys

### Open-source creator

Creates or imports an MCP server, tests it, describes permissions and versions,
publishes it publicly or privately, releases a compatible update, and sees
reproducible security/compatibility results.

### Individual or small team

Imports local and remote client configuration, resolves names, builds a
composition, receives one endpoint/token, connects a standard MCP client,
inspects health and logs, and exports the configuration for self-hosting.

### Enterprise administrator

Creates organization/environment boundaries, configures Entra ID and optional
SCIM, maps groups/claims, approves upstream origins, defines tool-level policy,
approvals, quotas, egress, and residency, distributes the company endpoint,
exports audit to a SIEM, and revokes access during an incident.

### Enterprise end user

Signs in through the configured IdP, receives a scoped session, discovers only
current authorized capabilities, connects an approved personal account where
required, requests approval for sensitive work, and cannot bypass visibility by
guessing a tool name.

### On-premises operator

Runs preflight checks; installs evaluation Compose or production Helm; connects
MongoDB, object storage, secrets, and observability; operates replicas; backs up,
restores, upgrades, rolls back, rotates keys, tests disaster recovery, and
collects diagnostics without disclosing payloads or secrets.

## Functional requirements

Requirement IDs are stable references for tests and implementation status.

### Tenancy and administration

- **TEN-001:** Model organizations, workspaces, projects, and environments with
  opaque IDs and explicit ownership.
- **TEN-002:** Include the organization boundary in every scoped storage key,
  query, cache key, search document, event, and authorization decision.
- **TEN-003:** Support users, groups, roles, custom roles, service principals,
  resource grants, invitations, and delegated administration.
- **TEN-004:** Enforce authorization in the API and gateway, independently of UI
  state.
- **TEN-005:** Export and import all non-secret configuration using documented,
  versioned JSON/YAML schemas.

### MCP creation and registry

- **REG-001:** Register remote Streamable HTTP, compatibility HTTP/SSE, approved
  stdio command/package, and container-image MCP servers.
- **REG-002:** Create an MCP from an OpenAPI specification or an open starter
  SDK/template.
- **REG-003:** Import common Claude, Cursor, VS Code, Codex, and compatible MCP
  client configurations without uploading secrets.
- **REG-004:** Probe capabilities, transport/protocol compatibility, auth,
  health, and schema changes without destructive calls.
- **REG-005:** Publish immutable semantic versions with public,
  organization-private, or unlisted visibility.
- **REG-006:** Store publisher, source, license, checksum, provenance, SBOM,
  permissions/scopes, compatibility results, security notices, revocation,
  documentation, examples, and changelog.
- **REG-007:** Support search, install, share, fork, dependency metadata, and
  moderation/reporting without treating publication as certification.

### Skills

- **SKL-001:** Represent a skill as an open, versioned bundle of instructions,
  prompts, resources, curated tools, transformations, examples, tests, policy
  requirements, dependencies, and documentation.
- **SKL-002:** Publish, share, fork, install, compose, and policy-control skills
  using the same provenance and version principles as MCP servers.

### Composition

- **CMP-001:** Create an immutable composition version from pinned MCP server and
  skill versions, retaining member origin and provenance.
- **CMP-002:** Provide graphical and form-based editors backed by the same
  exportable config-as-code representation.
- **CMP-003:** Detect tool/resource/prompt name and schema conflicts, namespace
  by stable server alias, and allow explicit stable aliases.
- **CMP-004:** Validate dependencies, per-member health, environment overrides,
  and upgrade compatibility before publication.
- **CMP-005:** Preview the exact capability set visible to a selected identity.
- **CMP-006:** Diff, promote, and roll back versions across environments.
- **CMP-007:** Keep one stable endpoint per composition/environment while
  versions and routes change safely behind it.

### MCP gateway

- **MCP-001:** Implement standards-compliant MCP JSON-RPC over Streamable HTTP
  and explicitly negotiate supported protocol revisions.
- **MCP-002:** Adapt remote Streamable HTTP, required legacy HTTP/SSE, and
  supervised stdio upstreams without exposing a proprietary downstream
  protocol.
- **MCP-003:** Support tools, resources, prompts, completions, notifications, and
  capability negotiation to the extent supported by the pinned protocol.
- **MCP-004:** Filter discovery by identity and policy, then repeat
  authorization at execution.
- **MCP-005:** Reject direct invocation of hidden/denied capabilities, including
  stale aliases and cached names.
- **MCP-006:** Validate schemas, preserve provenance, propagate cancellation and
  trace context, and return explicit machine-readable error classes.
- **MCP-007:** Apply timeout, circuit breaker, bulkhead, concurrency, queue,
  response-size, and backpressure controls per upstream.
- **MCP-008:** Retry/fail over only when semantic safety or an upstream
  idempotency guarantee is established.
- **MCP-009:** Refresh signed configuration without process restart and support
  bounded-stale operation and rollback.

### Discovery and execution

- **EXE-001:** Offer canonical MCP list methods plus a policy-filtered,
  deterministic search meta-tool for large catalogs.
- **EXE-002:** Include stable capability ID, origin, version/build, risk,
  required scope, compatibility state, and health in normalized metadata.
- **EXE-003:** Support safe input mapping/output transformation, pagination,
  file references, output limits, and explicit execution status.
- **EXE-004:** Pause approval-gated work and resume only the exact tool,
  normalized-arguments hash, account, policy/version, and expiry approved.
- **EXE-005:** Isolate untrusted connector/stdio/container execution with image
  digest pinning, non-root identity, read-only root, resource/process/time
  limits, explicit mounts, egress policy, TTL, and cleanup.

### Policy and routing

- **POL-001:** Evaluate organization, environment, identity, group/role/claims,
  resource/action, risk, account ownership/scope, origin/client/network,
  geography/time, data classification/destination, health/capacity/version,
  quotas, and emergency revocations.
- **POL-002:** Return deterministic allow, deny, require-approval,
  allow-with-transform, rate/concurrency/quota, and route results with matched
  rules and explanation.
- **POL-003:** Give immutable safety revocation and explicit deny documented
  precedence; detect conflicts and unreachable rules.
- **POL-004:** Support compile/validate, simulator, dry run, activation,
  immutable versioning, rollback, and cache invalidation.
- **POL-005:** Route to explicit, regional, private, primary/fallback, or
  weighted candidates only after authorization and mandatory constraints.

See [`policy/routing-and-authorization.md`](policy/routing-and-authorization.md).

### Authentication and connected accounts

- **IAM-001:** Use Better Auth for application sessions with local development,
  secure cookies, CSRF protection, exact trusted origins, and deployment-specific
  D1/MongoDB persistence.
- **IAM-002:** Support tested Microsoft Entra ID and generic OIDC, JIT
  provisioning, tenant/issuer validation, group/app-role/claim mapping, and
  SAML 2.0 where the selected implementation is production-capable and open.
- **IAM-003:** Support SCIM 2.0 user/group provisioning and deprovisioning that
  revokes sessions, tokens, grants, and affected access.
- **IAM-004:** Support service principals, short-lived machine credentials,
  scoped/expiring/rotatable/revocable API tokens, and optional mTLS.
- **IAM-005:** Define auth profiles for OAuth/OIDC, API key, basic, bearer,
  service account, and approved custom credential strategies.
- **IAM-006:** Implement OAuth authorization code with PKCE, state, nonce where
  applicable, exact redirect validation, issuer/audience checks, least scopes,
  callback, refresh, rotation, revocation, expiration, and re-consent.
- **IAM-007:** Isolate per-user and shared connected accounts by ownership and
  policy. No caller receives another principal's credential.
- **IAM-008:** Support local envelope encryption, Kubernetes Secrets,
  HashiCorp Vault, and cloud KMS/secret-manager adapters through portable
  references.
- **IAM-009:** Export auth configuration and connection metadata without secret
  material by default, explaining when provider-bound tokens require re-consent.

### Sessions

- **SES-001:** Bind each gateway session to organization, environment,
  composition version, user/service principal, connections, policy context,
  approved clients, expiry/revocation, and trace correlation.
- **SES-002:** Use short-lived tokens with exact MCP endpoint audience; never put
  bearer tokens in URLs.
- **SES-003:** Separate control-plane credentials from data-plane session
  credentials and support session introspection and revocation.

### Approvals, triggers, and events

- **APR-001:** Support designated approver roles/groups, expiration, approve,
  deny, request-change, immutable decision history, and separation of requester
  and approver where policy requires it.
- **EVT-001:** Receive signed webhooks and scheduled polling subscriptions
  scoped by tenant/environment/composition/user/connection.
- **EVT-002:** Deduplicate, retry, dead-letter, pause/resume, and replay events
  through versioned, at-least-once delivery semantics.
- **EVT-003:** Deliver to configured webhooks, queues, or internal handlers and
  audit every transition.

### Observability, audit, and operations

- **OBS-001:** Emit OpenTelemetry-compatible traces, metrics, and structured
  logs across gateway, policy, route, auth refresh, approval, trigger, and
  upstream boundaries.
- **OBS-002:** Expose health, error classes, latency, concurrency, queue depth,
  fallback, connector version, policy denial, approval, and refresh failure
  views/APIs.
- **OBS-003:** Append audit events for identity, authorization, publication,
  composition, connection, discovery/execution, approvals, tokens,
  import/export, and incidents.
- **OBS-004:** Keep payload capture off; when explicitly enabled, make it
  access-controlled, redacted, time-limited, customer-directed, and visible.
- **OBS-005:** Support organization/identity quotas, rate and concurrency limits,
  fair-use errors, audit retention controls, and SIEM export without billing.

### Developer platform

- **DX-001:** Provide noninteractive/machine-readable CLI commands for context,
  init, import, dev, doctor, create/inspect/publish, compose/validate/diff/promote,
  policy test, endpoint/connection, deploy values, export/import, logs/status,
  and diagnostics.
- **DX-002:** Provide TypeScript and Python SDKs plus an open connector/MCP
  authoring SDK and compatibility test utilities.
- **DX-003:** A clean local checkout reaches a useful demo in approximately ten
  minutes, excluding image downloads.
- **DX-004:** Document task journeys, API schemas, security model, on-premises
  operation, upgrade/rollback, backup/restore, air gap, connector authoring, and
  troubleshooting.

## Deployment requirements

### Managed cloud offering (currently Cloudflare)

- Astro static site and console, Hono Workers, KV product `DocumentStore`, D1
  Better Auth store, planned Durable Object mutation serialization, R2, and
  Queues.
- Transparent fair-use and anti-abuse limits with no paid upgrade path.
- Account export and deletion, configuration export, and documented migration
  to self-hosting.
- The same public source and schemas as the on-premises distribution.

### Docker Compose evaluation

- One documented command path with MongoDB, object storage substitute where
  needed, control plane, gateway, worker, console/site, seed data, and standards-
  faithful local auth/OAuth fixtures.
- Evaluation configuration is clearly distinguished from production security
  and availability.

### Kubernetes production

- Helm chart with minimal, HA, external MongoDB, external secrets, and air-gap
  values.
- NetworkPolicies, PodDisruptionBudgets, probes, resource requests/limits,
  autoscaling guidance, non-root/read-only security contexts, ingress/TLS,
  private registry/image pulls, migration/index jobs, SBOMs/digests, backup and
  restore, upgrade and rollback, OpenShift-compatible guidance, and offline
  manifests.
- A kind-equivalent CI test installs, becomes ready, discovers and executes a
  real tool, verifies state, and uninstalls cleanly.

## Product surfaces

### Public site

Provide focused pages for Composer, Registry, Identity, Policy, Routing,
Observability, On-Premises, open source/governance, managed cloud, enterprise
services, docs, getting started, Kubernetes, trust/security, releases,
pricing/business model, updates, and legal placeholders. Copy is specific and
truthful: no fake customers, testimonials, certifications, connector counts,
availability, or generic AI-gradient claims.

### Console

Provide real, API-backed areas for onboarding; tenancy/environments; IdPs,
users, groups, roles, service principals; registry/creation/import; skills;
composition editing; endpoints/sessions; connections/credentials; policies and
simulator; routing; approvals; triggers; health/logs/traces/metrics/audit; tokens
and developer settings; promotion/export; and on-prem diagnostics. Optimistic
updates require correct rollback and errors.

### API

Provide versioned typed management operations with generated OpenAPI, Zod
validation, cursor pagination, consistent problem details, request IDs,
idempotency keys for suitable mutations, and structured/redacted logs.

## Delivery sequence

### MVP vertical slice

The minimum credible implementation is:

1. persistent organization and environment;
2. two functional upstream MCPs using different transports;
3. schema/health probes;
4. immutable composition with a real conflict resolved by namespace/alias;
5. stable Streamable HTTP endpoint and scoped session;
6. standard client discovery and one real call to each upstream;
7. policy-filtered discovery plus direct-call denial;
8. correlated audit/trace provenance;
9. config export/import;
10. Docker Compose and initial Helm smoke paths.

The UI, API, gateway, stores, policy, and audit must be connected. A static
screen, in-memory stub, schema, or mocked success does not satisfy the slice.

### Production expansion

After the vertical slice: registry/version lifecycle; connected accounts;
Entra/SCIM; routing and safe failover; approvals; triggers; sandbox; complete
console; CLI/SDKs; managed cloud export path (currently Cloudflare);
HA/backup/upgrade/air gap; full
security, load, and deployment evidence.

## Mandatory acceptance scenarios

| ID | Scenario | Required proof |
| --- | --- | --- |
| A | Two MCPs, two transports, one endpoint | Collision resolved; list and call each upstream; logs preserve origin |
| B | Entra role-based visibility | Employee sees ordinary tools; finance admin sees both; guessed sensitive call is denied and audited |
| C | Connected-account isolation | Two sessions use only their own credentials; revoking one does not break the other; logs contain no secrets |
| D | Rules and failover | EU/default routing is visible; idempotent failure falls back; non-idempotent action is not replayed |
| E | Approval-gated action | Exact request pauses, a distinct approver decides, and modified input cannot resume |
| F | Publish/share/fork/install | Independent versions retain source, license, provenance, and compatibility metadata |
| G | Managed cloud to on-premises | Export/import to Helm works and the MCP client runs without contacting the managed cloud |
| H | On-premises operations | Preflight, install, scale, backup, upgrade, rollback, clean restore, and state verification pass |

## Quality and release gates

Formatting, lint, type check, unit/integration tests, all builds, data/index
migration validation, generated schema drift, dependency/license checks,
container build/scan, Helm lint/template, and end-to-end smoke are required.
Security-specific gates include tenant isolation, MCP conformance, OAuth/Entra,
SCIM, list-versus-call policy, route safety, approval integrity, event dedupe,
sandbox isolation, secret redaction, export/import, and upgrade/rollback tests.

No feature is called complete in marketing or the parity matrix until its
required proof passes.
