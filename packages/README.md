# Packages

Packages contain portable product behavior and infrastructure ports. Deployable
apps assemble them; packages should not depend on an app.

## Product and protocol

| Package | Responsibility |
| --- | --- |
| [`contracts`](./contracts/README.md) | Zod schemas and shared TypeScript domain/API types |
| [`core`](./core/README.md) | Tenancy, compositions, policy decisions, sessions, approvals, and audit |
| [`mcp-gateway`](./mcp-gateway/README.md) | MCP negotiation, filtered discovery, validation, and upstream execution |
| [`platform-api`](./platform-api/README.md) | Authenticated Hono control-plane routes and OpenAPI |
| [`auth`](./auth/README.md) | Better Auth configuration, organizations, MFA, API keys, SSO, and SCIM |

## Persistence and infrastructure

| Package | Responsibility |
| --- | --- |
| [`storage`](./storage/README.md) | Portable tenant-scoped NoSQL `DocumentStore` contract and memory adapter |
| [`adapter-cloudflare`](./adapter-cloudflare/README.md) | Eventually consistent Workers KV implementation |
| [`adapter-mongodb`](./adapter-mongodb/README.md) | Strong revision-safe MongoDB implementation |

## Developer interfaces

| Package | Responsibility |
| --- | --- |
| [`sdk-typescript`](./sdk-typescript/README.md) | Typed control-plane and MCP session client |
| [`sdk-python`](./sdk-python/README.md) | Dependency-light Python client |
| [`cli`](./cli/README.md) | Operator and automation commands |

All packages are ESM and strict TypeScript unless the target ecosystem requires
otherwise. External inputs belong behind validated contracts; authentication
does not replace tenant authorization.
