# LiteMCP agent instructions

LiteMCP is an open-core, strict-TypeScript monorepo for composing, securing,
operating, and observing MCP servers. Preserve the public self-hosted product:
the Apache-2.0 repository must remain usable without the private managed-cloud
control plane, licensing services, billing, call-home behavior, or a proprietary
package. Read `OPEN_CORE.md`, `ARCHITECTURE.md`, and
`IMPLEMENTATION_STATUS.md` before changing product boundaries or claims.

Use Node.js 22.12 or newer and pnpm 10.30.2. The project is ESM-first, uses
strict TypeScript, Biome, Vitest, Turbo, Astro/React, Hono, Docker Compose,
Helm, and a Cloudflare Worker composition.
