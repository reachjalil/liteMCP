# Implementation status

Snapshot: 2026-07-22. LiteMCP Composer is a functional vertical slice with a
public managed-cloud preview, not an enterprise-readiness claim. This file
records only behavior backed by code and reproducible evidence.

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
| Workspace and CI foundation | Complete | pnpm/Turbo/strict TypeScript/Biome workspace, frozen lockfile, Apache-2.0 project files, full-SHA-pinned actions, Harness apply/convergence, Python SDK, generated-schema/upgrade parity, production audit, structural workflow policy, local D1, dependency review, secret scan, render/build, exact-digest container scan/evidence, digest-only publication, and an aggregate required-check gate. Public PR run [`29892277142`](https://github.com/reachjalil/liteMCP/actions/runs/29892277142) passed every required job, including both container scans | Merge-time/default-branch evidence, an enforced branch required-check rule, tagged release, signing, and external release acceptance remain |
| Portable contracts | Partial | Zod contracts include roles/assignments, authority/epoch/freeze, lifecycle and approval records, service principals, OAuth records, plus strict payload-free `UsageEvent`, analytics query/results, session client attribution, and exact usage-standing schemas; focused contract tests and OpenAPI 3.1 cover the current surface | Compatibility/version migrations, generated-schema drift gate, published-package smoke, and complete cross-client resource parity |
| Product `DocumentStore` | Partial | Memory, Workers KV, and MongoDB adapters remain; the managed-cloud hybrid adapter routes security-sensitive records through one tenant-bound SQLite Durable Object with atomic per-document revision checks. Client attribution uses a distinct create-only `session-attributions` record so analytics metadata cannot advance the authorization-session revision | Deploy/migrate the current authority path, shared adapter parity tests, multi-document transactions/outbox, backup/restore, and failure/rollback proof |
| Public Astro site | Partial | The responsive site and console include signup-aware login/recovery/invitation flows, privacy and terms pages, and a concise governed-MCP landing page with one local proof action, one pilot action, an executable proof command, and explicit open-core/pre-1.0 status. The 34-page static build, internal-route check, desktop browser review, and focused contrast/CTA review pass | The redesigned page is not deployed evidence; formal accessibility, mobile-browser, performance, and privacy review remain |
| Authenticated console | Partial | React code calls the management lifecycle plus tenant analytics APIs; Observability has Dashboard, Live, Tools, Identities, Sessions, and Policy insights, date ranges, CSV export, explicit states, quota standing, audit receipts, and five-second visible-view polling | No Playwright/browser E2E, deployed analytics traffic, WebSocket/SSE live transport, or production first-user/SSO journey; member administration and complete service-principal lifecycle remain |
| Control-plane API | Partial | Management-gated Hono routes include strict tenant-injected analytics summary/time-series/top/recent/session/flows/policy queries and exact `/usage`, with JSON/CSV responses and 30-day HTTP windows, alongside the prior lifecycle surface; focused tests cover tenant injection, role gates, strict queries, export, and backend isolation | Full route-by-role authorization matrix, idempotency, Better Auth member/IdP lifecycle bridges, broad external E2E, and deployed query acceptance |
| MCP gateway | Partial | Authenticated initialize/notifications, `tools/list`, and `tools/call`; builtin and remote HTTP composition; aliases, policy/schema/approval/quota checks, bounded execution, and audit fail-closed behavior remain. `pnpm demo:smoke` now proves the governed journey against a real loopback Node server. The gateway records `first_tool_call` only after a successful result and treats activation telemetry as fail-open | External conformance, resources/prompts/resume, genuine SSE/streaming, authenticated upstream discovery, scheduled probes, managed-cloud DNS pinning, and named-client proof |
| MCP OAuth authorization | Partial | RFC 9728-style protected-resource metadata and bearer challenge, authorization-server metadata, bounded public-client registration, login-preserving same-origin consent with approve/deny, PKCE S256 exchange, 15-minute scoped bearer sessions, explicit `offline_access`, rotating refresh-token families, reuse invalidation, and token revocation have API/service tests | CIMD, richer consent/client administration, broader OAuth security/conformance coverage, abuse controls beyond the registration cap, and any claude.ai/ChatGPT or other named-client run |
| Identity and Better Auth | Partial | Signup kill switch, Resend delivery seam for verification/reset/invitations, signup-aware first-organization UI, idempotent tenant bootstrap, role entities/assignments, bounded group/claim ingestion, mapping evaluation, and epoch invalidation are implemented in code; IdP control records encrypt client secrets with a tenant-derived AES-GCM key. Better Auth 1.7 D1 schema parity and guarded D1/Mongo SCIM provider/account upgrades have local tests | Checked-in cloud signup stays disabled; no restored-data migration or live email, Entra/Okta/SAML/SCIM proof; IdP records are not bridged to Better Auth provider registration; Better Auth membership/ban/SCIM events do not automatically call deprovision/epoch logic |
| Workload identity | Partial | Management-gated service-principal creation returns a secret once, stores only its hash, authenticates by Basic credentials, intersects assigned roles with current roles, and issues a scoped MCP session; manual subject deprovisioning disables a matching principal and revokes its sessions, with local lifecycle/API tests | Inventory and direct disable/delete APIs, secret rotation, finer permissions, console E2E, automatic directory lifecycle wiring, and deployed headless-agent proof |
| Policy and routing | Partial | Draft create/update, lint, serialized active-policy pointer, activation/archival, immutable active edits, role/group evaluation, epoch bump, emergency freeze, simulator, discovery filtering, execution recheck, and a final pre-executor context revalidation are implemented and locally tested | Transactional promotion/outbox and rollback history, a strictly linearizable authority-to-external-dispatch barrier, real-IdP mapping proof, full authorization matrix, regional/health/residency routing, and idempotent failover ledger |
| Credential plane | Partial foundation | Tenant-derived AES-GCM envelopes are used for LiteMCP IdP client-secret records; endpoint credential rejection and recursive redaction remain | Better Auth's own secret-bearing records are not covered by that envelope; connected accounts, upstream credential injection, KMS/Vault hierarchy, grants, refresh/revoke, and per-user isolation tests remain |
| Registry and skills | Partial | Audited server/composition CRUD, pinned versions, manual MCP probe/import, schema hashing, quarantine/accept-drift, republish, aliases, provenance, and secret-free import/export are present | Scheduled probes, client-config import, immutable artifacts, skills, signing/SBOM attachment, publish/share/fork/install, compatibility, moderation, and revocation |
| Approvals | Partial | Pending slots bind the session, composition, server revision/schema/execution config, active policy, authorization epoch, tool, and argument hash; concurrent requests deduplicate, decisions echo generation/fingerprint, separation of duties is enforced, and exact-context one-shot retry consumption, expiry, audit, and an argument-free webhook seam are locally tested. The root demo smoke exercises pause, separate decision, and successful retry over real HTTP | No server-side stored-argument resume/recovery or native email/Slack integration; no deployed multi-user notification-and-execution proof |
| Abuse controls | Partial | Fixed free-tier limits enforce server, composition, active-session, and daily tool-call counts; `/usage` reports the same exact counters/inventory independently of sampled or capped analytics; executors have bounded tenant/server concurrency; Better Auth database rate limits and the signup kill switch remain | The migration and limits have no deployed load/abuse proof; no WAF evidence, general MCP request-rate or organization-wide concurrency limiter, capacity model, anomaly alerts, identity quota, or paid override path |
| Triggers and event delivery | Not started | Requirements and threat model only | Signed delivery, outbox, dedupe, retry, DLQ, replay, schedules, and worker implementation |
| Sandbox execution | Not started | Evaluation-only supervised host stdio requires an explicit unsafe flag and exact executable allowlist | Disposable isolated runner with immutable templates, filesystem/network/resource controls, and Kubernetes tests |
| Audit and observability | Partial | Audit remains a redacted, tenant-scoped sequence/hash chain and fail-closed execution checkpoint. A separate strict, payload-free, fail-open Insight Plane now has deterministic aggregates, memory/Mongo time-series/Cloudflare emission adapters, a capped exact managed feed, session/approval lifecycle and gateway instrumentation, management-gated JSON/CSV APIs, six console views, and exact quota standing. Focused contract/aggregate/adapter/core/gateway/API tests cover isolation, cardinality, receipt linkage, one-terminal-event behavior, concurrency, and sink failure | No working-tree deployment/staging or named-client evidence; managed historical queries are feed-capped and Analytics Engine has no SQL query path; no Playwright/load proof, WebSocket/change-stream transport, OpenTelemetry traces/metrics, alerting, audit retention/SIEM, transactional outbox, signed/external anchor, or O-F delivery |
| CLI and SDKs | Partial | Operational CLI, TypeScript SDK, and dependency-free Python SDK cover the implemented management lifecycle with focused request-shape tests; the assertive local-composition example is run by the root smoke and CI | Published-package smoke, complete compatibility/resource coverage, production auth/context flows, stable compatibility policy, and authoring SDK |
| Portable Node and Docker Compose | Partial | Node requires MongoDB and a strong Better Auth secret outside explicit local modes, keeps DNS-pinned remote fetch, and can opt into a Mongo `usage_events` time-series query/sink with configurable 90-day default TTL and bounded fail-open buffering; shutdown drains accepted analytics. Compose explicitly enables the analytics path alongside its prior Mongo/auth/proxy hardening | Run the authenticated complete-stack and analytics journey, replace the bundled root database credential with a least-privilege production topology, prove bootstrap/email/persistence/retention/backup/restore, and exercise upgrade/rollback |
| Kubernetes and Helm | Partial | Strict Helm lint and default/minimal/HA/external-Mongo/air-gap renders pass; public GHCR `edge` manifests resolve anonymously; the web proxy targets the release-qualified server Service; probes, HPA, PDB, topology, bounded writable paths, security contexts, Ingress, and NetworkPolicy render | Run real cluster install/readiness/MCP, migration, scaling, backup/restore, upgrade/rollback, and disconnected tests; production releases must pin immutable digests |
| Managed cloud deployment | Partial; earlier public preview live | Worker version `519323e3-dbfb-418a-92a4-9aeb16afe973` remains only the earlier site/health/session smoke. The paired private candidate adds isolated staging KV/D1 resources, exact-CI-built archives with SHA-256 manifests, Worker UUID/tag and migration evidence, Durable Object lifecycle gating, explicit production promotion, mandatory authenticated read-only MCP smoke, tenant authority, D1 rate limiting, email/Sentry gates, tenant-indexed Analytics Engine emission, and a sibling capped exact analytics-feed/query path | None of the candidate changes is claimed deployed. Staging has no accepted Worker, required scoped credentials/secrets, trusted smoke principal, or lifecycle evidence; production has not applied the checked-in Durable Object migrations. The promotion path remains fail-closed. The private GitHub repository has no enforceable branch or environment protection on its current plan; no privileged/analytics/OAuth/client, rollback, load/security, or SLO acceptance exists, and the current analytics API does not query Analytics Engine history |
| Public GitHub repository | Complete | [`reachjalil/liteMCP`](https://github.com/reachjalil/liteMCP) is public, uses `main`, exposes Apache-2.0 metadata, and contains checkpoint `3b3e85c`; private vulnerability reporting is enabled | Continue normal review/release maintenance and add branch rules when the contributor workflow is established |

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
| A. Two transports behind one endpoint | Partial | `pnpm demo:smoke` starts a real loopback server and asserts initialize, filtered discovery, builtin and remote calls, hidden denial, correlated redacted audit, and revocation; named-client/conformance and packaged-release acceptance remain |
| B. Entra role-based capability exposure | Partial | Role entities/assignments, bounded group/claim ingestion, mapping evaluation, epoch checks, hidden-call denial, and audit have local coverage; there is no Better Auth-to-IdP registration/claim bridge proof, live Entra login, or automatic deprovision propagation |
| C. Per-user connected-account isolation | Not started | Scoped hashed MCP sessions and explicit revoke are substrate only; no OAuth connected accounts or credential vault |
| D. Regional routing and safe failover | Partial | Ambiguous post-dispatch failures are non-retryable; no regional/health route evaluator, idempotent fallback, or result ledger |
| E. Approval-gated action | Partial | Local tests cover concurrent slot dedupe, independent approver enforcement, approve/deny, expiry, generation/fingerprint checks, full execution-context binding, one-shot consumption, and no upstream dispatch before approval; the root real-loopback smoke proves pause/decision/retry/audit locally, but no deployed two-user notification journey exists |
| F. Publish, share, fork, and install | Partial | Server/composition lifecycle, probing, drift quarantine, republish, version pins, and provenance exist; immutable registry artifacts and publish/share/fork/install remain absent |
| G. Managed cloud to on-premises portability | Partial | Both apps use the same portable packages and the API now exports and imports secret-free configuration into an otherwise pristine target, with a local API test; no cross-target execution, credential reconfiguration, or managed-cloud-egress-blocked proof exists |
| H. On-premises operations | Partial | Doctor, kind-smoke, backup/restore scripts, hardened chart, and runbooks exist; kind was unavailable and no live restore/upgrade journey passed |

## Recorded quality evidence

Current working-tree evidence for this slice:

- public PR CI run [`29892277142`](https://github.com/reachjalil/liteMCP/actions/runs/29892277142)
  passed build, lint/format, types, TypeScript and Python tests, Harness
  convergence, dependency review and production audit, secret scan, Helm,
  Docker Compose, managed-cloud dry runs, workflow policy, both HIGH/CRITICAL
  container scans, and the aggregate required-check gate;
- the redesigned 34-page site build and internal-route check passed, and the
  homepage was reviewed in a local desktop browser at 1280 px;
- `pnpm demo:smoke` passed the real-loopback governed-endpoint journey and
  cleaned up its server process;
- `pnpm --filter @litemcp/mcp-gateway test` passed 17 focused gateway tests,
  including post-success activation, tool-error, upstream-failure, telemetry
  failure, and final-boundary freeze regressions;
- `pnpm --filter @litemcp/core test` passed 42 tests, including activation-store
  failure during tenant and session lifecycle operations; and
- `pnpm --filter @litemcp/server test` passed 52 tests, including the default
  loopback endpoint-origin regression.

Historical evidence that predates the current working tree:

- `pnpm install --frozen-lockfile`;
- `pnpm format:check`, `pnpm lint`, and repository-wide strict type checks;
- 69 package unit/integration tests across 11 test files, including policy
  conflicts, tenant/RBAC boundaries, MCP arguments, revocation, canonical
  domain handling, and Node DNS-pinned egress;
- every workspace build, the thirty-page Astro build, and the managed cloud
  Wrangler `deploy --dry-run` bundle;
- local D1 Better Auth migration;
- authenticated Wrangler deployment of Worker version
  `519323e3-dbfb-418a-92a4-9aeb16afe973`, dedicated KV/D1 provisioning, remote
  D1 migration, secret binding, apex and `www` custom domains, and public 200
  smoke checks for the site, docs, login, explainer asset, `/health`, `/ready`,
  and Better Auth session endpoint; the `www` edge returned a canonical 308 and
  followed to a 200; live responsive documentation QA passed at 1773px and
  390px with no sidebar overlap, page overflow, or browser console errors;
- Dockerfile checks and full server/web image builds;
- Docker Compose configuration rendering;
- strict Helm lint and all checked-in example renders;
- shell syntax, Python bytecode compilation, and local browser QA;
- public GitHub Actions run [`29805311450`](https://github.com/reachjalil/liteMCP/actions/runs/29805311450),
  including both container builds; and
- container publication run [`29805372196`](https://github.com/reachjalil/liteMCP/actions/runs/29805372196),
  which published server and web `edge` images with BuildKit SBOM and provenance
  attestations; both OCI indexes resolve anonymously from a clean Docker
  credential directory.

These historical runs establish the earlier vertical-slice baseline only. Local
checks for the current working tree are recorded during this implementation
pass; they are not a substitute for merge-time CI, deployment, or external
acceptance evidence.

Not passed or not available:

- deployment of the current working tree or its D1/Durable Object migrations to
  staging or production;
- privileged live signup/email/bootstrap, control-plane, MCP
  initialize/list/call, approval, OAuth, audit-correlation, or rollback against
  the managed-cloud preview;
- kind/Kubernetes runtime smoke (`kubectl` and `kind` were unavailable);
- live Docker Compose product journey and Mongo backup/restore exercise;
- live Entra/Okta/SCIM or named MCP-client tests, MCP/OAuth conformance suites,
  analytics staging traffic, Playwright analytics journeys, WAF validation,
  load tests, WebSocket/SSE or Mongo change-stream live analytics, Workers
  Analytics Engine SQL querying, OpenTelemetry export, configured alerts, SIEM
  delivery, external security assessment or penetration test, SOC 2 audit,
  container vulnerability scan, artifact signing, tagged immutable container
  release, and release-reproducibility proof;
- design-partner/customer evidence, activation or retention measurements, and
  every PMF target in the supplied plan.

See [`docs/known-limitations.md`](./docs/known-limitations.md) for the security
and commercial boundaries behind these statuses.
