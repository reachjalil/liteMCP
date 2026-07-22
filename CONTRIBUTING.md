# Contributing

Thank you for helping build LiteMCP Composer. Contributions to code,
documentation, tests, threat models, deployment tooling, and interoperability
fixtures are welcome under the Apache-2.0 license.

## Development

Requirements: Node.js 22.12 or newer, Corepack, and pnpm 10.30.2.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

Keep product behavior in portable packages. `apps/managed-cloud` is the
historical/reference Cloudflare composition already published under
Apache-2.0; Cloudflare-specific imports belong only there or in
`packages/adapter-cloudflare`. Node and Kubernetes-specific behavior belongs in
the corresponding adapters. The separately maintained proprietary
hosted-service sibling is not a contribution target for this repository.
Validate every external boundary, keep authentication separate from
authorization, and add a negative authorization or tenant-isolation test for
security-sensitive work.

## Pull requests

Keep changes focused, explain behavior and tradeoffs, include tests, and update
`IMPLEMENTATION_STATUS.md` and `docs/known-limitations.md` when evidence changes.
Material changes to the public/proprietary boundary must update
[`OPEN_CORE.md`](./OPEN_CORE.md) and include a public architecture decision
record. Generated files should be reproducible. Never commit secrets, customer
data, proprietary service configuration, billing integrations, fleet-operation
automation, or provider tokens.

By submitting a contribution, you agree that it is licensed under Apache-2.0.
No pull request or later repository change can revoke the Apache-2.0 grant for
source already published under that license.
All contributors must follow the [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
