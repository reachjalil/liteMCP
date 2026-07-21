# Applications

Applications are deployment composition roots. They assemble portable packages
with a specific HTTP runtime, persistence adapter, and delivery model. Product
rules should remain in `packages`; app code should mainly configure bindings and
lifecycle.

| App | Role | Runtime |
| --- | --- | --- |
| [`web`](./web/README.md) | Public site, sign-in, and management console | Astro static output with React islands |
| [`managed-cloud`](./managed-cloud/README.md) | Managed cloud offering | Cloudflare Workers, Static Assets, KV, and D1 |
| [`server`](./server/README.md) | Portable enterprise/self-hosted service | Node.js, Hono, and MongoDB |

The product name is **managed cloud**. Cloudflare is its current infrastructure
provider, not a domain-layer dependency. Provider-specific code stays in the
managed cloud composition root and `packages/adapter-cloudflare`.
