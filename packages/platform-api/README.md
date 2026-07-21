# `@litemcp/platform-api`

Hono control-plane and MCP HTTP routes shared by every deployment.

The package provides health/readiness, Better Auth routing, organization
membership resolution, management RBAC, validated registry/composition/session
operations, policy simulation, audit and export endpoints, RFC 9457-style
problems, request IDs, CORS/security headers, OpenAPI, and the MCP endpoint.

Apps inject storage, auth, gateway, allowed origins, and the public origin. Demo
headers are honored only when the app explicitly enables demo mode.
