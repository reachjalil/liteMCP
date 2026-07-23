
## Architecture and security invariants

- Authentication is not authorization. Derive tenant and actor identity from a
  trusted context, never from an unverified request field.
- Fail closed for authorization, lifecycle state, credential access, and audit
  integrity. Usage analytics is payload-free and fail-open by design; do not
  confuse it with the audit trail.
- Do not log or persist tool arguments, tool results, bearer tokens, raw
  credentials, or provider secrets in analytics, errors, fixtures, or docs.
- Preserve SSRF controls, redirect revalidation, private-address denial,
  bounded bodies, timeouts, and credential scoping in outbound requests.
- Tenant isolation must hold in contracts, storage keys, queries, caches,
  events, quotas, exports, and UI/API authorization—not only at the router.
- Treat authorization epochs, revocation, organization lifecycle, service
  principals, SSO/SCIM mappings, and support grants as coordinated state.
- Schema and migration changes need forward compatibility, operational
  ordering, backup/restore implications, and rollback or roll-forward evidence.
- Examples may contain placeholders only. Secrets and machine-local trust state
  stay out of Git and `.harness`.

Use the focused repository skills under `.agents/skills` or `.claude/skills`
for security, deployment, release, identity, observability, MCP compatibility,
open-core, and iteration work.
