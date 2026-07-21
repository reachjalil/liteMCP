# Implementation status

Snapshot: 2026-07-21. LiteMCP Composer is a functional local vertical slice,
not an enterprise-readiness claim. This file records only behavior backed by
code and reproducible evidence.

## Status vocabulary

- **Complete:** the scoped requirement is implemented and its stated evidence
  passes.
- **Partial:** useful implementation exists, but the end-to-end requirement or
  proof remains incomplete.
- **Blocked:** completion requires an external credential, authority, or
  environment that cannot be safely substituted.
- **Not started:** no implementation evidence exists.

## Current summary

| Area | Status | Implemented evidence | What remains |
| --- | --- | --- | --- |
| Research and product architecture | Complete | Supplied research inspected; pattern audit, architecture, product, security, identity, policy, parity, and limitation documents are checked in | Revalidate time-sensitive market and standards claims before publication |
| Workspace and CI foundation | Complete | pnpm/Turbo/strict TypeScript/Biome workspace, frozen lockfile, Apache-2.0 project files, and GitHub Actions format/lint/type/test/build/Compose/Helm/container jobs | Add release, signing, dependency-review, and security-scan workflows |
| Portable contracts | Partial | Zod domain/API contracts, versioned MCP protocol constant, OpenAPI 3.1 document, and typed SDK surfaces build | Compatibility/version-migration tests and generated-schema drift gate |
| Product `DocumentStore` | Partial | Portable contract plus memory, Workers KV, and MongoDB adapters; tenant filters, pagination, and revision writes | Durable Object authority, adapter parity tests, transactional outbox, migrations, and failure recovery |
| Public Astro site | Partial | Thirty-route Astro site, responsive console, generated explainer visuals, metadata, accessibility-conscious markup, and local browser/build QA | Public deployment, formal accessibility/performance audit, content review, and analytics/privacy decision |
| Authenticated console | Partial | React island uses live overview, create-server/composition, policy simulation, session, audit, IdP, approval, and export APIs | Production first-admin onboarding, complete CRUD journeys, loading/error coverage, and live SSO journey |
| Control-plane API | Partial | Hono API, Better Auth middleware, organization-role checks, request IDs, size/CORS controls, OpenAPI, problem responses, and integration tests | Idempotency, complete authorization matrix, policy/registry lifecycle, import, and broad negative tests |
| MCP gateway | Partial | MCP initialize, `tools/list`, and `tools/call`; builtin and remote HTTP composition; aliases, provenance, policy recheck, bounded schema validation, approvals, audit, and session revoke | Protocol conformance, resources/prompts/notifications/resume, genuine SSE, upstream discovery/auth, and client matrix |
| Identity and Better Auth | Partial | Better Auth with organization, admin, 2FA, bearer, JWT, API-key, OIDC/SAML SSO, and SCIM plugins; D1 migration and Mongo composition | First-admin bootstrap, live Entra/SCIM tests, claim/group mapping, revocation epochs, recovery/passkeys, and service-credential journey |
| Policy and routing | Partial | Deterministic default-deny evaluator, explicit-deny precedence, discovery/call enforcement, simulator, approval effect, and tests | Policy CRUD/activation, distributed invalidation, regional/health routing, quotas, and failover ledger |
| Credential plane | Not started | Endpoint URL credential rejection and redaction utilities only | Connected accounts, encrypted vault, OAuth lifecycle, key hierarchy, grants, refresh/revoke, and isolation tests |
| Registry and skills | Partial | Server registration, version pins, composition publication, aliases, and provenance in the vertical slice | Immutable artifact lifecycle, skills, signing/SBOM, publish/share/fork/install, compatibility, moderation, and revocation |
| Approvals | Partial | Pending record uses a canonical argument hash and upstream dispatch is paused | Independent decision authorization, encrypted durable arguments, one-time resume, expiry, and recovery |
| Triggers and event delivery | Not started | Requirements and threat model only | Signed delivery, outbox, dedupe, retry, DLQ, replay, schedules, and worker implementation |
| Sandbox execution | Not started | Evaluation-only supervised host stdio requires an explicit unsafe flag and exact executable allowlist | Disposable isolated runner with immutable templates, filesystem/network/resource controls, and Kubernetes tests |
| Audit and observability | Partial | Tenant-scoped redacted hash chain, sequence/CAS retry, execution outcomes, API/UI view, and export | Strong cloud serialization, transactional outbox, signed/external anchor, retention/SIEM, OpenTelemetry, quotas, and dashboards |
| CLI and SDKs | Partial | Operational CLI, TypeScript SDK, dependency-free Python SDK, and runnable local-composition example | Published-package smoke, full resource coverage, auth flows, stable compatibility policy, and authoring SDK |
| Docker Compose | Partial | Frozen-lock images build; secret-bearing local files are excluded from build contexts; Compose renders with a runtime-templated same-origin proxy, Mongo replica set, readiness checks, and hardened runtime configuration | Run the complete stack journey, enable Mongo authentication, prove persistence/restore, and add production bootstrap |
| Kubernetes and Helm | Partial | Strict Helm lint and default/minimal/HA/external-Mongo/air-gap renders pass; the web proxy targets the release-qualified server Service; probes, HPA, PDB, topology, bounded writable paths, security contexts, Ingress, and NetworkPolicy render | Real cluster install/readiness/MCP, migration, scaling, backup/restore, upgrade/rollback, and disconnected tests |
| Managed cloud deployment | Partial; live release blocked | `apps/managed-cloud`, `@litemcp/managed-cloud`, KV/D1 bindings, local D1 migration, generated Worker types, static assets, Wrangler dry-run bundle, and inactive-version bootstrap instructions exist | Wrangler authentication, account resource provisioning, Durable Object authority, real domain binding/deploy, auth/session/API/MCP smoke, rollback, and recorded URL |
| Public GitHub repository | Pending publication | Repository contents and public open-source files are prepared locally | Push to the authorized public repository and record remote/visibility evidence |

## Deployment boundary

- `apps/managed-cloud`: managed cloud product deployment, currently hosted on
  Cloudflare.
- `apps/server`: portable Node.js deployment for Docker and Kubernetes.
- `packages/adapter-cloudflare`: infrastructure adapter, not product identity.

Cloudflare provider names remain in Wrangler configuration, bindings, and the
adapter. Technical package and command identifiers keep `managed-cloud`.

## Mandatory acceptance scenarios

| Scenario | Status | Evidence and missing proof |
| --- | --- | --- |
| A. Two transports behind one endpoint | Partial | Gateway integration tests and the local example compose builtin and remote HTTP tools, list both, call both, and retain provenance; a packaged end-to-end run with correlated external logs remains |
| B. Entra role-based capability exposure | Partial | Demo employee/finance policy filtering, guessed-call denial, and audit are tested; no live Entra login, group/app-role mapping, or deprovision propagation |
| C. Per-user connected-account isolation | Not started | Scoped hashed MCP sessions and explicit revoke are substrate only; no OAuth connected accounts or credential vault |
| D. Regional routing and safe failover | Partial | Ambiguous post-dispatch failures are non-retryable; no regional/health route evaluator, idempotent fallback, or result ledger |
| E. Approval-gated action | Partial | Exact normalized arguments are hashed and dispatch pauses; no independent decision or exact one-time resume |
| F. Publish, share, fork, and install | Partial | Basic server/composition creation, version pins, status, and provenance exist; registry lifecycle remains absent |
| G. Managed cloud to on-premises portability | Partial | Both apps use the same portable packages, export excludes secrets, and Helm renders; no export/import execution across live targets with managed cloud egress blocked |
| H. On-premises operations | Partial | Doctor, kind-smoke, backup/restore scripts, hardened chart, and runbooks exist; kind was unavailable and no live restore/upgrade journey passed |

## Recorded quality evidence

Passed in this snapshot:

- `pnpm install --frozen-lockfile`;
- `pnpm format:check`, `pnpm lint`, and repository-wide strict type checks;
- package unit/integration tests, including policy conflicts, tenant/RBAC
  boundaries, MCP arguments, revocation, and Node DNS-pinned egress;
- every workspace build, the thirty-page Astro build, and the managed cloud
  Wrangler `deploy --dry-run` bundle;
- local D1 Better Auth migration;
- Dockerfile checks and full server/web image builds;
- Docker Compose configuration rendering;
- strict Helm lint and all checked-in example renders;
- shell syntax, Python bytecode compilation, and local browser QA.

Not passed or not available:

- authenticated live managed cloud deployment and post-deploy smoke tests;
- kind/Kubernetes runtime smoke (`kubectl` and `kind` were unavailable);
- live Docker Compose product journey and Mongo backup/restore exercise;
- live Entra/SCIM/OAuth provider tests, MCP conformance suite, load test, external
  security assessment, container vulnerability scan, SBOM/signing, and
  release-reproducibility proof.

See [`docs/known-limitations.md`](./docs/known-limitations.md) for the security
and commercial boundaries behind these statuses.
