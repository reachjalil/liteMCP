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
| TEN-001–005 tenancy and administration | Preview | Contracts/storage/core, organization-aware API middleware, bootstrap, roles/assignments, authority/freeze, quotas, and validated secret-free import/export | Storage tenant-boundary tests; core lifecycle/import tests; platform API tenant/RBAC/import tests | Workspace/project model, member administration, complete authorization matrix, cross-adapter isolation and live portability suites |
| REG-001–007 MCP creation and registry | Preview | Server lifecycle API/console/SDK/CLI, endpoint validation, manual initialize/tools-list probe, schema hash/drift quarantine, pinned versions | Core probe/drift tests; gateway bounded import tests; API lifecycle tests | Authenticated/scheduled real-upstream probes, immutable publication, signing/SBOM attachment, search/share/fork/install/moderation |
| SKL-001–002 skills | Designed | Product and security contracts only | Documentation review | Bundle schemas, authoring SDK, registry, runner, policy, tests, examples |
| CMP-001–007 composition | Preview | Multi-member composition create/update/publish/delete, aliases, version pins, healthy-probe publication guard, console/SDK/CLI lifecycle | Core and gateway composition/alias/draft tests; API lifecycle tests | Immutable history, graph/schema conflict UI, identity preview, diff/rollback, and cross-target import/export journey |
| MCP-001–009 gateway | Preview | `packages/mcp-gateway`, shared Hono MCP route, builtin/HTTP executors, Node secure fetch | Gateway integration tests; server DNS/egress tests; `pnpm demo:smoke` real-loopback initialize/list/call/denial/revocation proof | Official conformance, real client matrix, resources/prompts, notifications/resume/SSE, upstream auth, live discovery, reload/rollback |
| EXE-001–005 discovery and execution | Preview | Policy-filtered list, call resolver, JSON Schema validation, full-context approval pause/consume, quotas, bounded executors, and final context revalidation | Gateway list/call/schema/freeze/approval tests; core stale-context tests; real-loopback builtin/remote/approval/audit proof | Search meta-tool, transforms/files/pagination, strictly linearizable dispatch barrier, disposable sandbox and isolation tests |
| POL-001–005 policy and routing | Preview | Core policy evaluator, simulator, deny precedence, draft CRUD/lint, serialized active pointer, epochs/freeze, deterministic member resolution | Policy/core lifecycle tests; API simulator/RBAC tests; gateway recheck tests | Real-provider attribute proof, transactional promotion/outbox/rollback, full matrix, health/region/weight/credential routing and failover ledger |
| IAM-001–009 identity and connected accounts | Preview for identity/control records; Designed for connected accounts | Better Auth D1/Mongo composition; email/signup/bootstrap; roles/assignments; encrypted IdP records and mapping evaluation; service principals; MCP OAuth authorization server | Auth, credential-envelope, identity-lifecycle, OAuth, and API subject-binding tests; D1 local migration | Live email/OIDC/SAML/SCIM and claim ingestion; Better Auth lifecycle/provider bridges; upstream connected-account vault; secret-provider adapters; deployed machine identity |
| SES-001–003 gateway sessions | Preview | Core session issue/list/auth/revoke, paginated quota counting, authorization epochs/freeze, OAuth grant binding, API/console/SDK/CLI | Core quota/revoke/OAuth tests; API subject-binding/service-principal tests; SDK tests | Cryptographic client enforcement, automatic logout/ban/member/SCIM fan-out, and deployed distributed consistency/latency proof |
| APR-001 approvals | Preview | Deterministic slot binds session/composition/server schema+config/policy/epoch/tool/argument hash; generation/fingerprint decisions and one-shot consumption | Concurrent core approval tests; gateway pause/retry/no-dispatch tests; API/SDK/CLI request-shape tests | Stored-argument resume/recovery, native notification delivery, deployed two-user proof, and failure recovery |
| EVT-001–003 triggers/events | Designed | Product/security requirements | Documentation review | Signed receivers, schedules, outbox, dedupe, retries, DLQ, replay, delivery audit |
| OBS-001 telemetry boundaries | Preview | Strict usage facts cover gateway initialize/discovery/call, policy/rules, approvals, sessions, and remote upstream timing/bytes; request IDs and optional audit receipts correlate the paths | Contract/aggregate tests; core lifecycle/concurrency tests; gateway one-terminal-event, retry measurement, and failing-sink tests | OpenTelemetry-compatible traces/metrics; auth-refresh, trigger, worker, route/fallback breadth; staging/named-client/load proof |
| OBS-002 views and APIs | Preview | Owner/admin tenant-injected JSON/CSV summary, time-series, top, recent, session, flows, policy-insights and exact-usage routes; Dashboard/Live/Tools/Identities/Sessions/Policy console views with five-second polling | API role/tenant/strict-query/export tests; web type/build checks; deterministic aggregation tests | Queue/concurrency/fallback/refresh views, Playwright and deployed acceptance; WebSocket/SSE and Mongo change-stream transport are absent |
| OBS-003 audit coverage | Preview | Redacted tenant audit sequence/hash chain, execution/lifecycle outcomes, API/UI/export, and working-tree tenant-DO routing | Core audit tests; gateway execution tests; API audit tests | Transactional outbox, signed/external anchor, formal retention, SIEM export, and deployed tamper-evidence proof |
| OBS-004 payload controls | Preview | Strict analytics contract rejects arguments, results, display names, emails, and unknown fields; byte sizes but not bodies are retained; payload capture is off | Contract negative tests, adapter validation tests, gateway argument/result-absence assertions | Formal privacy review and explicit access/redaction/time-limit/visibility controls before any future capture mode |
| OBS-005 quotas and retention/export | Preview | Exact organization server/composition/session/daily-call standing and fair-use errors; configurable Mongo analytics TTL; bounded managed feed; CSV pull exports | Core quota/standing tests; API `/usage` and CSV tests; Mongo retention/setup tests | Identity quotas, general rate controls, audit retention, configured alerts, O-F digests/delivery, and SIEM push; analytics retention/export is not audit retention/SIEM |
| DX-001–004 developer platform | Preview | Broad management CLI and TypeScript/Python SDKs, OpenAPI, examples, documentation suite | CLI/SDK request tests; Python unit tests/compile; example/root builds | Package publication smoke, production auth/context flow, complete compatibility coverage, authoring SDK, and measured ten-minute onboarding |
| Managed cloud deployment | Earlier public preview; current revision unproved | Worker assets/API plus D1, KV, authority Durable Object, tenant-indexed Analytics Engine emission, sibling capped analytics feed, staging target, and email/Sentry/config gates | Historical deploy/public site-health-session smoke only; current analytics evidence is local adapter/runtime testing | Deploy/migrate this revision; privileged signup/API/OAuth/MCP/audit/analytics/client journeys; Entra/Okta/SCIM; rollback/WAF/load/pen-test/SLO evidence |
| Docker Compose deployment | Preview | Compose stack, authenticated single-member Mongo replica set/keyfile, web/server images, health checks | Compose render; Dockerfile checks and image builds | Full authenticated stack journey, least-privilege production DB topology, persistence and backup/restore proof |
| Kubernetes deployment | Preview | Helm chart with probes, security, HA, Ingress, policies, internal/external Mongo options | Strict lint and default/minimal/HA/external-Mongo/air-gap renders | Real cluster install, readiness, MCP call, scale, backup/restore, upgrade/rollback, uninstall and air-gap proof |
| Public site and console | Public preview; current Insight revision unproved | Astro site and React API-backed console now include six Insight views in the working tree; the public URL proves only the earlier site revision | Historical Astro/public route QA; current analytics view has code/type/build evidence only | Playwright Insight journey, formal accessibility/performance audit, full CRUD, privileged live auth, and operational deployment proof |

## Mandatory scenarios

| Scenario | Current state | Existing proof | Missing proof |
| --- | --- | --- | --- |
| A. Two transports behind one endpoint | Partial | `pnpm demo:smoke` starts a real loopback server and asserts builtin plus remote HTTP discovery/calls through one composition, with correlated redacted audit evidence | Named external-client run, protocol conformance, and packaged-release acceptance |
| B. Entra role-based visibility | Partial | Role/assignment/mapping evaluation, epochs, and deterministic employee/finance list/call denial | Better Auth provider bridge, live Entra sign-in/claims, and automatic deprovision propagation |
| C. Connected-account isolation | Not started | Scoped session substrate only | Two real provider connections, isolation, refresh/revoke, secret-free logs |
| D. Regional routing and safe failover | Partial | No retry after ambiguous/side-effect completion | Regional rule evaluation, idempotent fallback and result ledger |
| E. Approval-gated action | Partial | Full-context generation/fingerprint slot, distinct approver decision, and exact one-shot retry are unit-tested and exercised over the real loopback API/MCP path | Deployed two-user notification/retry/audit and recovery proof |
| F. Publish/share/fork/install | Partial | Server/composition lifecycle, probe/drift, versions/pins/provenance | Immutable registry artifacts and share/fork/install lifecycle |
| G. Managed cloud to on-premises | Partial | Shared packages and fully validated secret-free import/export on a pristine local target | Live cloud export/import into Helm, credential reconfiguration, and no-cloud-callback execution |
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
