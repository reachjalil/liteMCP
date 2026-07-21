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
| Toolkits/integrations | Public/private MCP and skill registry, semantic versions, SDK, OpenAPI import, and several real reference integrations | Server registration, version pins, aliases, provenance, TypeScript/Python SDKs, and a local two-upstream example | Publish/install/fork; authenticated integrations; skill and OpenAPI lifecycles; compatibility tests | Partial; no connector/tool count may be claimed |
| Auth configurations | Reusable open auth profiles, BYO OAuth apps, and policy-controlled OAuth/OIDC/API-key/basic/bearer/service-account strategies | Credential design only | Standards-faithful flows, scope validation, callback/revoke/rotation, export, and provider fixtures | Not started |
| Connected accounts | Per-user/shared encrypted connections with refresh, revoke, ownership, scope, and portability | Threat/credential requirements only | Two-user isolation and selective revoke scenario with secret-redaction tests | Not started |
| User sessions | Identity-scoped short-lived gateway sessions with endpoint, tool view, connections, expiry, client binding, and revocation | Tenant-scoped hashed sessions, endpoint/token issue, expiry, explicit revoke, SDK surface, and tests | Live IdP subject binding, connected accounts, cryptographic client binding, authorization epochs, and full introspection journey | Partial |
| Hosted MCP endpoint | Stable Streamable HTTP endpoint per composition/environment plus scoped sessions | MCP initialize, tools/list, and tools/call through a scoped composition endpoint; local example calls builtin and remote HTTP tools | External standard-client run, full protocol conformance, genuine SSE, and correlated packaged evidence | Partial |
| Tool discovery | Canonical MCP lists plus lazy/searchable, deterministic, provenance-rich, policy-filtered discovery | Namespaced, provenance-rich tools/list with identity-policy filtering and guessed-name denial tests | Resources/prompts, large-catalog search, dynamic upstream discovery, distributed invalidation, and named-client matrix | Partial |
| Tool execution | Validated, audited proxy execution with approvals, timeouts, safe retries, transforms, credentials, and route rules | JSON Schema validation, policy recheck, argument-bound approval pause, bounded remote execution, cancellation/timeout, audit, and no replay after ambiguous dispatch | Credential broker, transforms, approval resume, route engine, idempotency ledger, and conformance suite | Partial |
| Triggers | Webhook/poll subscriptions with signatures, retry, dedupe, dead letter, replay, and audit | Event requirements only | Duplicate/replay/signature/failure recovery integration suite | Not started |
| Sandbox | Isolated container execution with CPU/memory/process/filesystem/time and egress control | Threat model only | Escape/host-socket/egress/resource/cleanup tests locally and on Kubernetes | Not started |
| Framework adapters | Plain MCP first, TypeScript and Python SDKs, adapters only where they reduce friction | Typed TypeScript SDK, dependency-light Python SDK, and runnable local-composition example | Published-package smoke tests, full resource coverage, auth flows, and stable compatibility policy | Partial |
| CLI | Context/login, import, init/dev/doctor, server/skill lifecycle, composition/policy/session/deploy/export, logs and diagnostics | Operational CLI package plus deployment doctor and lifecycle scripts | Published-package smoke, auth/context journey, complete resource coverage, and noninteractive end-to-end proof | Partial |
| Logs/analytics | OTel traces, metadata-only execution logs, health, audit, quotas, and policy/route explanations | Request-correlated, redacted, sequence/hash-linked audit metadata with API/UI view and export | OpenTelemetry, SIEM delivery, retention, quotas, dashboards, strong serialization, and external anchoring | Partial |
| White-label connection UX | Organization branding and embeddable/self-hosted account connection flow | UI requirements only | Branded tenant isolation, accessible OAuth/re-consent, CSP and redirect tests | Not started |
| Enterprise identity | Entra ID, generic OIDC, production-capable open SAML, SCIM, group/claim mapping, and service principals | Better Auth organization, admin, 2FA, bearer, JWT, API-key, OIDC/SAML SSO, and SCIM plugin wiring; D1 migration and Mongo composition | Live Entra OIDC, claim/group mapping, SCIM conformance and deprovision revocation, first-admin bootstrap, and service-principal journey | Partial; provider interoperability is unproven |
| Enterprise governance | RBAC/ABAC, approvals, SIEM export, retention, emergency revocation, and promotion | Organization-role checks, deterministic default-deny policy, list/call agreement tests, simulator, approval pause, and audit export | Policy lifecycle, independent approval decision/resume, revocation epochs, SIEM/retention, separation of duties, and promotion | Partial |
| On-premises/VPC | Compose, production-oriented Helm target, external dependencies, HA, air gap, backup, upgrade, rollback, and diagnostics | Frozen-lock images build; Compose renders; strict Helm lint and multiple profiles render; scripts and runbooks exist | Live full-stack and Kubernetes journeys, Mongo auth, backup/restore, upgrade/rollback, scaling, and disconnected tests | Partial; configuration render is not runtime proof |
| Portability | Open schemas and complete export/import; managed and self-hosted run the same core without cloud authority | Shared portable packages, provider adapters, secret-safe configuration export, Worker dry-run, Node images, and Helm renders | Live cloud-to-on-prem export/import execution with managed cloud egress blocked and secret re-consent/reference replacement | Partial; no exit test exists |

## Deliberate differences

### Open product and free managed cloud

LiteMCP Composer is intended not to reproduce a proprietary hosted-backend
boundary or paid feature tier. The current vertical slice and the complete
product roadmap are public. The credential and event planes are not yet
implemented. The managed cloud is intended to be free with transparent
fair-use limits when it becomes available; no live service is claimed today.

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
