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

Keep product behavior in portable packages. The managed cloud product
composition root is `apps/managed-cloud`; Cloudflare-specific imports belong
only there or in `packages/adapter-cloudflare`. Node and Kubernetes-specific
behavior belongs in the corresponding adapters. Validate every external
boundary, keep authentication separate from authorization, and add a negative
authorization or tenant-isolation test for security-sensitive work.

## Pull requests

Keep changes focused, explain behavior and tradeoffs, include tests, and update
`IMPLEMENTATION_STATUS.md` and `docs/known-limitations.md` when evidence changes.
Generated files should be reproducible. Never commit secrets, customer data, or
provider tokens.

By submitting a contribution, you agree that it is licensed under Apache-2.0.
All contributors must follow the [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
