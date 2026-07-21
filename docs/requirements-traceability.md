# Requirements traceability

This matrix connects the stable requirement IDs in
[`product-requirements.md`](./product-requirements.md) to implementation,
verification, and remaining work. It is organized by requirement family so it
stays readable; individual requirements remain authoritative in the product
requirements document.

Availability uses the same labels as
[`feature-reference.md`](./feature-reference.md). A passing unit test proves only
the scoped behavior named by that test, not the entire enterprise requirement.

| Requirement family | Current availability | Primary implementation evidence | Verification evidence | Required completion evidence |
| --- | --- | --- | --- | --- |
| TEN-001–005 tenancy and administration | Preview | `packages/contracts`, `packages/storage`, `packages/core`, organization-aware API middleware | Storage tenant-boundary tests; platform API membership/RBAC tests; secret-free export test | Workspace/project model, complete admin lifecycle, import, authorization matrix, cross-adapter isolation suite |
| REG-001–007 MCP creation and registry | Preview | Server contracts, registration API/console, endpoint validation, pinned versions | Core endpoint and version tests; API create/list tests | Live probes, OpenAPI generation path, immutable publication, signing/SBOM, search/share/fork/install/moderation |
| SKL-001–002 skills | Designed | Product and security contracts only | Documentation review | Bundle schemas, authoring SDK, registry, runner, policy, tests, examples |
| CMP-001–007 composition | Preview | Composition contracts, core create/resolve, aliases, published-state guard, console form | Core and gateway composition/alias/draft tests | Immutable history, graph/schema conflict UI, identity preview, diff/promote/rollback and import/export journey |
| MCP-001–009 gateway | Preview | `packages/mcp-gateway`, shared Hono MCP route, builtin/HTTP executors, Node secure fetch | Gateway integration tests; server DNS/egress tests; example build | Official conformance, real client matrix, resources/prompts, notifications/resume/SSE, upstream auth, live discovery, reload/rollback |
| EXE-001–005 discovery and execution | Preview | Policy-filtered list, call resolver, JSON Schema validation, approval pause, bounded executors | Gateway list/call/schema/approval tests | Search meta-tool, transforms/files/pagination, one-time approval resume, disposable sandbox and isolation tests |
| POL-001–005 policy and routing | Preview | Core policy evaluator, simulator, deny precedence, deterministic member resolution | Policy unit tests; API simulator/RBAC tests; gateway recheck tests | Full attribute model, policy CRUD/version/activation, distributed invalidation, health/region/weight/quota/failover ledger |
| IAM-001–009 identity and connected accounts | Preview for application auth; Designed for credential plane | Better Auth composition with D1/Mongo adapters; membership role middleware; Entra/SCIM/credential designs | Auth configuration test; API production identity tests; D1 local migration | First-admin bootstrap, live OIDC/SAML/SCIM, claim/group mapping, revocation epoch, OAuth broker, encrypted vault, secret-provider adapters, service principals |
| SES-001–003 gateway sessions | Preview | Core session issue/auth/revoke, hashed tokens, API and SDK | Core revoke test; API subject-binding test; SDK test | Audience/client enforcement, session inventory/introspection UI, logout/deprovision/group-change fan-out and distributed consistency |
| APR-001 approvals | Preview | Canonical argument hash and pending record before dispatch | Gateway approval-pause test | Independent approver authorization, decision history, encrypted argument custody, exact one-time resume, expiry/recovery |
| EVT-001–003 triggers/events | Designed | Product/security requirements | Documentation review | Signed receivers, schedules, outbox, dedupe, retries, DLQ, replay, delivery audit |
| OBS-001–005 observability/audit/operations | Preview | Request IDs, redacted audit hash chain, health/readiness, export, runbooks | Core concurrent audit/redaction tests; API readiness/audit tests; server readiness tests | OTel, SIEM, transactional outbox, strong cloud ordering, anchors/retention, quotas/rate limits, live backup/restore/upgrade proof |
| DX-001–004 developer platform | Preview | CLI, TypeScript/Python SDKs, OpenAPI, examples, documentation suite | CLI/SDK tests; Python compile; example/root builds | Package publication smoke, broader commands/resources/auth, authoring SDK, compatibility harness, measured ten-minute onboarding |
| Managed cloud deployment | Public preview | `apps/managed-cloud`, Worker assets/API, dedicated D1/KV bindings, Cloudflare adapter, apex and `www` custom domains | Type/test/build; local and remote D1 migration; Wrangler dry-run and authenticated deploy; public site/health/readiness/session smoke; canonical redirect | First-admin and privileged API/MCP/audit journey, stronger mutation authority, SSO/SCIM, rollback, load/security acceptance, and SLO evidence |
| Docker Compose deployment | Preview | Compose stack, Mongo replica set, web/server images, health checks | Compose render; Dockerfile checks and image builds | Authenticated Mongo, full stack journey, persistence and restore proof |
| Kubernetes deployment | Preview | Helm chart with probes, security, HA, Ingress, policies, internal/external Mongo options | Strict lint and default/minimal/HA/external-Mongo/air-gap renders | Real cluster install, readiness, MCP call, scale, backup/restore, upgrade/rollback, uninstall and air-gap proof |
| Public site and console | Public preview | Astro site, React API-backed console, product/status/security content at [`litemcpcomposer.com`](https://litemcpcomposer.com) | Astro check/build, local desktop/mobile browser QA, and public route/asset smoke | Formal accessibility/performance audit, full CRUD journeys, privileged live auth and operational surfaces |

## Mandatory scenarios

| Scenario | Current state | Existing proof | Missing proof |
| --- | --- | --- | --- |
| A. Two transports behind one endpoint | Partial | Builtin plus remote HTTP tools list/call through one composition with provenance | Packaged external run and correlated logs |
| B. Entra role-based visibility | Partial | Deterministic employee/finance policy list/call denial | Live Entra sign-in, group mapping, deprovision propagation |
| C. Connected-account isolation | Not started | Scoped session substrate only | Two real provider connections, isolation, refresh/revoke, secret-free logs |
| D. Regional routing and safe failover | Partial | No retry after ambiguous/side-effect completion | Regional rule evaluation, idempotent fallback and result ledger |
| E. Approval-gated action | Partial | Exact argument hash pauses dispatch | Distinct approver decision and tamper-proof one-time resume |
| F. Publish/share/fork/install | Partial | Version/pin/provenance substrate | Registry lifecycle and independent artifacts |
| G. Managed cloud to on-premises | Partial | Shared packages and secret-free export | Live export/import into Helm with no cloud callback |
| H. On-premises operations | Partial | Scripts, chart, and runbooks | Real cluster scale, backup, upgrade, rollback, clean restore and state verification |

## Evidence locations

- Unit and integration tests are colocated with source as `*.test.ts` in
  `apps/*/src` and `packages/*/src`.
- Deployment assets and examples live under [`../deploy`](../deploy/README.md).
- The current command/evidence snapshot lives in
  [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md).
- Security-specific proof requirements live in
  [`security/threat-model.md`](./security/threat-model.md).
- Known release blockers live in
  [`known-limitations.md`](./known-limitations.md).

Update this matrix whenever a requirement changes availability. Do not move a
row to “available” solely because a UI control, schema, or plugin registration
exists; link the end-to-end behavior and its failure-path proof.
