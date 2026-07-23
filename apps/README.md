# Applications

Applications are deployment composition roots. They assemble portable packages
with a specific HTTP runtime, persistence adapter, and delivery model. Product
rules should remain in `packages`; app code should mainly configure bindings and
lifecycle. Every app in this public repository is Apache-2.0 source, and the
public product remains independently operable through its self-hosted targets
without a proprietary dependency or mandatory call-home.

| App | Role | Runtime |
| --- | --- | --- |
| [`web`](./web/README.md) | Public site, sign-in, and management console | Astro static output with React islands |
| [`managed-cloud`](./managed-cloud/README.md) | Historical/reference Cloudflare composition (Apache-2.0) | Cloudflare Workers, Static Assets, KV, and D1 |
| [`server`](./server/README.md) | Portable enterprise/self-hosted service | Node.js, Hono, and MongoDB |

`managed-cloud` is a legacy technical workspace name; it does not identify the
source of the proprietary operated service. Provider-specific public reference
code stays in that composition root and `packages/adapter-cloudflare`.

A separately maintained proprietary sibling owns production hosted-service
configuration and secrets, billing, fleet and managed-client operations, and
commercial support grants and entitlements. It may consume these public apps;
the public apps must not depend on it. Historical Apache-2.0 grants, including
for the current `managed-cloud` source, remain unchanged. See
[`OPEN_CORE.md`](../OPEN_CORE.md).
