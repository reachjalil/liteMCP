---
name: litemcp-security-review
description: Review or implement LiteMCP changes that affect authentication, authorization, tenant isolation, credentials, network egress, audit integrity, usage privacy, storage keys, schemas, lifecycle state, or security-sensitive CI and deployment controls. Use for threat modeling, security regressions, cross-tenant checks, incident fixes, and any change under packages/auth, packages/core, packages/mcp-gateway, packages/platform-api, packages/storage, adapters, apps/server/src/secure-fetch.ts, or docs/security.
---

# LiteMCP Security Review

Protect the tenant and trust boundaries without turning a review into a generic
checklist. Trace the concrete request, identity, data, and failure paths that the
change touches, then require evidence at those boundaries.

## Workflow

1. Read `SECURITY.md`, `docs/security/threat-model.md`,
   `docs/policy/routing-and-authorization.md`, and the nearest package tests.
2. Identify trusted and untrusted inputs, tenant/actor derivation, privileged
   state, secrets, external calls, storage keys, logs, and emitted events.
3. State the invariants and abuse cases before editing. Include cross-tenant,
   stale-session, revoked-principal, guessed-resource, retry, and dependency
   failure cases when applicable.
4. Preserve package boundaries: portable policy in `packages/core`, transport
   enforcement in API/gateway layers, infrastructure behavior in adapters or
   compositions.
5. Add focused negative tests alongside the positive path. A router-level tenant
   check is insufficient when storage, cache, export, analytics, or event keys
   can still cross boundaries.
6. Run affected tests and types, then `pnpm check`. Run
   `pnpm audit --prod --audit-level high` for release-facing work and treat an
   unresolved high advisory as a blocker.
7. When support grants, staff access, customer operations, or another operated
   service concern is involved, read `OPEN_CORE.md` and invoke
   `litemcp-open-core-boundary`. Keep commercial implementation in the private
   sibling behind a portable, least-privilege public seam.
8. Report invariants checked, evidence run, residual risks, and any claim or
   documentation that must remain limited.

## Non-negotiable invariants

- Authentication does not grant authorization. Resolve tenant and actor from a
  verified context; never trust client-supplied ownership fields.
- Authorization, lifecycle denial, credential access, and audit integrity fail
  closed. Usage analytics is deliberately payload-free and fail-open.
- Never log, persist, export, or fixture tool arguments/results, raw tokens,
  provider credentials, session secrets, or encryption material.
- Preserve SSRF and redirect defenses, DNS/private-address checks, scoped
  credentials, bounded bodies, timeouts, and safe error redaction.
- Bind storage, cache, rate-limit, analytics, export, audit, and Durable Object
  keys to the verified tenant and stable resource identity.
- Coordinate authorization epochs, revocation, organization lifecycle, support
  grants, service principals, SSO/SCIM mappings, and active sessions.
- Concurrency-sensitive writes need revision/compare-and-set behavior and tests
  proving state cannot commit without its required audit record.
- Keep secrets and machine-local trust state out of Git, fixtures, generated
  Harness sources, CI artifacts, and command output.

## Focused validation

Select the smallest affected package commands first, for example:

```bash
pnpm --filter @litemcp/auth test
pnpm --filter @litemcp/core test
pnpm --filter @litemcp/mcp-gateway test
pnpm --filter @litemcp/platform-api test
pnpm --filter @litemcp/server test
pnpm check
```

For deploy or schema changes, also invoke `litemcp-deployment-readiness`. Do not
deploy, rotate secrets, run remote migrations, or publish as part of a review
unless the user explicitly authorizes that external mutation.
