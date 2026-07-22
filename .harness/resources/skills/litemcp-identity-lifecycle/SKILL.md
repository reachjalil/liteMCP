---
name: litemcp-identity-lifecycle
description: Implement or review LiteMCP authentication and identity lifecycle behavior involving Better Auth, OIDC, SAML, Entra ID, SCIM, organizations, roles, mappings, sessions, authorization epochs, service principals, credential revocation, or support grants. Use for packages/auth, identity/security logic in packages/core, contracts, platform API, runtime compositions, and docs/identity.
---

# LiteMCP Identity Lifecycle

Preserve stable identity and tenant authority across login, mapping, session
issuance, organization changes, service principals, revocation, and provider
failure. Authentication evidence never substitutes for an authorization check.

## Model first

For every flow, identify:

- issuer/provider, provider tenant, subject, email/claims, and verification state;
- internal user, organization, tenant, membership, role, and mapping provenance;
- session/service-principal ID, authorization epoch, scopes, expiry, and
  revocation source;
- lifecycle effects on credentials, compositions, policies, active sessions,
  audit records, and managed-cloud access.

Reject ambiguous or conflicting mappings rather than guessing ownership.

## Workflow

1. Read `packages/auth/README.md`, relevant `docs/identity/**`,
   `IMPLEMENTATION_STATUS.md`, `docs/known-limitations.md`, the security threat
   model, and current lifecycle tests. Treat target-state SCIM documents as
   design intent until the status and tests prove the fan-out is implemented.
2. Keep provider parsing and authentication in `packages/auth`; keep portable
   authorization/lifecycle policy in `packages/core`; enforce it again at API,
   gateway, storage, and composition boundaries.
3. Bind sessions and service principals to the verified organization/tenant and
   current authorization epoch. Do not accept an organization header that
   conflicts with authenticated authority.
4. Make SCIM/SSO ownership explicit. Prevent ownerless or cross-organization
   provider takeover, role escalation, and unsafe fallback mappings.
5. Fan lifecycle changes out atomically or with explicit recoverable state:
   invalidate sessions/epochs, credentials, grants, policies, and runtime access
   as required, with a correlated audit record.
6. Add tests for login success, mapping conflict, cross-tenant access, disabled
   organization/user, stale epoch, revoked service principal, provider outage,
   replay, concurrency, and secret-safe errors as applicable.
7. Update provider setup docs, limitations, configuration, and readiness claims.
8. For schema or migration changes, invoke `litemcp-deployment-readiness` and
   include local migration evidence. Treat any active high-severity Better Auth
   or SCIM advisory as a release blocker; verify current status with the
   production dependency audit rather than relying on a stale note.

## Focused evidence

```bash
pnpm --filter @litemcp/auth test
pnpm --filter @litemcp/contracts test
pnpm --filter @litemcp/core test
pnpm --filter @litemcp/platform-api test
pnpm --filter @litemcp/mcp-gateway test
pnpm --filter @litemcp/storage test
pnpm --filter @litemcp/server test
pnpm --filter @litemcp/managed-cloud test
pnpm managed-cloud:auth-schema:check
pnpm auth:migrate:mongodb:self-test
pnpm audit --prod --audit-level high
pnpm check
```

Do not use real provider credentials in tests or docs. Live identity-provider
acceptance is separate external evidence and requires explicit authorization.
