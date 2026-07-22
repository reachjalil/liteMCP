# Composio-informed capability evidence matrix

Status: current evidence matrix. It is a build/test contract, not a marketing
claim. The current implementation is not at parity, and this document does not
assert competitor superiority.

Research observations about Composio are time-stamped to 2026-07-20 and resolve
through the
[`evidence ledger`](../deep-dive-research-litellm-litemcp-business-model/19-evidence-ledger.md),
especially [S-025]–[S-032]. They were based on public documentation and source,
not a live product trial. Revalidate them before an external comparison.

## Status rules

- **Complete:** automated end-to-end proof exists for the described
  LiteMCP Composer capability.
- **Partial:** design/scaffolding or a subset exists, but the user journey is not
  proved.
- **Not started:** no implementation evidence exists.
- **Intentionally different:** the product deliberately solves the need with a
  different open/portable model and the difference is tested.

Screens, schemas, mocks, and documents alone do not establish parity.

## Matrix

| Capability class | LiteMCP Composer expectation | Current components/evidence | Required proof | Status / limitations |
| --- | --- | --- | --- | --- |
| Toolkits/integrations | Public/private MCP and skill registry, semantic versions, SDK, OpenAPI import, and several real reference integrations | Server lifecycle, manual MCP probe/import, version pins, schema-drift quarantine, aliases, provenance, broad management SDKs/CLI, and a local two-upstream example | Publish/install/fork; authenticated integrations; skill and OpenAPI lifecycles; named compatibility tests | Partial; no connector/tool count may be claimed |
| Auth configurations | Reusable open auth profiles, BYO OAuth apps, and policy-controlled OAuth/OIDC/API-key/basic/bearer/service-account strategies | MCP authorization-server substrate has consent, PKCE, optional rotating refresh, and revoke; service principals issue scoped sessions; upstream credential profiles remain design only | Upstream auth profiles/vault, provider callback fixtures, connected-account scope/revoke/rotation, and live client/provider proof | Partial for MCP client authorization; upstream auth profiles not started |
| Connected accounts | Per-user/shared encrypted connections with refresh, revoke, ownership, scope, and portability | Threat/credential requirements only | Two-user isolation and selective revoke scenario with secret-redaction tests | Not started |
| User sessions | Identity-scoped short-lived gateway sessions with endpoint, tool view, connections, expiry, client binding, and revocation | Tenant-scoped hashed sessions, inventory/revoke, epochs/freeze, OAuth grant-family invalidation, console/SDK/CLI surfaces, and local tests | Live IdP subject binding, connected accounts, cryptographic client binding, provider lifecycle fan-out, and deployed invalidation proof | Partial |
| Hosted MCP endpoint | Stable Streamable HTTP endpoint per composition/environment plus scoped sessions | MCP initialize, tools/list, and tools/call through a scoped composition endpoint; local example calls builtin and remote HTTP tools | External standard-client run, full protocol conformance, genuine SSE, and correlated packaged evidence | Partial |
| Tool discovery | Canonical MCP lists plus lazy/searchable, deterministic, provenance-rich, policy-filtered discovery | Namespaced, provenance-rich tools/list with identity-policy filtering, guessed-name denial, and manual bounded upstream initialize/tools-list import | Resources/prompts, large-catalog search, authenticated/scheduled discovery, deployed invalidation, and named-client matrix | Partial |
| Tool execution | Validated, audited proxy execution with approvals, timeouts, safe retries, transforms, credentials, and route rules | JSON Schema validation, policy/final-context recheck, full-context one-shot approvals, quotas, bounded execution, cancellation/timeout, audit, and no retry after ambiguous dispatch | Credential broker, transforms, server-side approval resume, strict dispatch barrier, route engine, idempotency ledger, and conformance suite | Partial |
| Triggers | Webhook/poll subscriptions with signatures, retry, dedupe, dead letter, replay, and audit | Event requirements only | Duplicate/replay/signature/failure recovery integration suite | Not started |
| Sandbox | Isolated container execution with CPU/memory/process/filesystem/time and egress control | Threat model only | Escape/host-socket/egress/resource/cleanup tests locally and on Kubernetes | Not started |
| Framework adapters | Plain MCP first, TypeScript and Python SDKs, adapters only where they reduce friction | Typed TypeScript SDK, dependency-light Python SDK, and runnable local-composition example | Published-package smoke tests, full resource coverage, auth flows, and stable compatibility policy | Partial |
| CLI | Context/login, import, init/dev/doctor, server/skill lifecycle, composition/policy/session/deploy/export, logs and diagnostics | Operational CLI package plus deployment doctor and lifecycle scripts | Published-package smoke, auth/context journey, complete resource coverage, and noninteractive end-to-end proof | Partial |
| Logs/analytics | OTel traces, metadata-only execution logs, health, audit, quotas, and policy/route explanations | Separate fail-closed audit and fail-open payload-free usage facts; self-reported client attribution; total/upstream latency; deterministic aggregates; tenant JSON/CSV API; six console views; exact quotas; Mongo time-series and managed Analytics Engine/capped-feed adapters | Deploy current path; complete managed history, OpenTelemetry, SIEM/audit retention, O-F alerts/digests, WebSocket/change-stream live transport, transactional outbox, and external audit anchoring | Partial |
| White-label connection UX | Organization branding and embeddable/self-hosted account connection flow | UI requirements only | Branded tenant isolation, accessible OAuth/re-consent, CSP and redirect tests | Not started |
| Enterprise identity | Entra ID, generic OIDC, production-capable open SAML, SCIM, group/claim mapping, and service principals | Better Auth plugin wiring; email/bootstrap code; persisted roles; encrypted IdP records and mapping evaluation; one-time-secret service principals; manual deprovision revocation | Bridge IdP/member/SCIM events, live Entra/Okta/SAML/SCIM and claim ingestion, deployed first-admin and headless-agent journeys | Partial; provider interoperability is unproven |
| Enterprise governance | RBAC/ABAC, approvals, SIEM export, retention, emergency revocation, and promotion | Roles/assignments/mappings, default-deny policy lifecycle/lint, epochs/freeze, list/call/final-context checks, separation-of-duty approvals, and audit export | Live identity mapping; transactional promotion/outbox; strict dispatch barrier; SIEM/retention; deployed multi-user proof | Partial |
| On-premises/VPC | Compose, production-oriented Helm target, external dependencies, HA, air gap, backup, upgrade, rollback, and diagnostics | Frozen-lock images build; authenticated single-member Mongo Compose renders; strict Helm lint and multiple profiles render; scripts and runbooks exist | Live full-stack and Kubernetes journeys, least-privilege Mongo/TLS, backup/restore, upgrade/rollback, scaling, and disconnected tests | Partial; configuration render is not runtime proof |
| Portability | Open schemas and complete export/import; managed and self-hosted run the same core without cloud authority | Shared portable packages, provider adapters, validated secret-free configuration import/export, Worker bundle, Node images, and Helm renders | Live cloud-to-on-prem execution with managed-cloud egress blocked and secret re-consent/reference replacement | Partial; no exit test exists |

## Deliberate differences

### Open product and operated managed cloud

LiteMCP Composer keeps the complete, independently operable product in the
public Apache-2.0 repository. The credential and event planes are not yet
implemented. A separate proprietary sibling owns only the operated-service
control plane: hosted customer lifecycle, billing, service entitlements,
support access, provisioning, and fleet releases. The public managed-cloud
preview is currently free with transparent fair-use limits, but future hosted
plans may be paid after their terms are published. Signup remains controlled
and no availability or production-readiness claim is made.

This is intentionally different only when the same journeys pass in both
deployments. Until then it is an architectural commitment, not achieved
portability.

### Composition and policy

The LiteMCP Composer roadmap centers first-class immutable compositions,
namespaced provenance, identity-specific preview, deterministic route rules,
policy simulation, and a cloud-exit acceptance test. The current slice implements a
subset: pinned compositions, aliases/provenance, policy simulation, and
identity-scoped tool filtering. The route engine and cloud exit remain untested.

### Catalog claims

The research found no common connector-count unit and no public shared
compatibility method ([S-026], [S-039], [S-055], [S-056]). LiteMCP Composer will
report connectors, MCP servers, skills, capabilities, and named passing targets
separately. Community publication is never described as verification.

## Evidence index to add during implementation

For each row, link:

1. owned source modules and schema versions;
2. unit/integration/conformance test names;
3. end-to-end scenario/run output;
4. supported deployment profiles;
5. known limits and unsupported protocol/provider versions;
6. release containing the evidence.

Parity may be announced only when all mandatory rows required for the claim are
complete and the comparison has been revalidated against current primary
sources.
