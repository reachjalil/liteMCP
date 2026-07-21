# `@litemcp/auth`

Better Auth configuration shared by the managed cloud and Node deployments.

The current composition includes secure production cookies, password policy,
organizations, administrator primitives, two-factor authentication, bearer/JWT
sessions, organization-scoped API keys, OIDC/SAML SSO, and SCIM provider
support. D1 and MongoDB remain app-level storage choices.

This package authenticates identities. Route permissions, policy decisions,
tenant isolation, and MCP execution authorization remain explicit product
boundaries outside Better Auth.
