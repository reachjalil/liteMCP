
## Working and validation workflow

Start with `rg`/`rg --files`, inspect the nearest package scripts and tests, and
preserve unrelated working-tree changes. Implement the smallest complete slice;
do not silently widen public APIs, compatibility claims, deployment authority,
or the open-core boundary.

Use focused package checks while iterating, then run the full repository gate
before handoff:

```bash
pnpm check
```

For Python SDK changes, run `pnpm python:test`. Changes to Harness sources,
workflows, dependencies, or delivery controls also require the applicable
formal gates:

```bash
pnpm harness:ci
pnpm ci:policy
pnpm security:audit
pnpm security:audit:all
```

Deployment changes also require the render/dry-run commands documented in
`deploy/`, plus `pnpm managed-cloud:auth-schema:check` for Better Auth/D1
changes and shell syntax checks for edited scripts. Use
`pnpm auth:migrate:mongodb:self-test` when the guarded MongoDB auth migration
changes. Never deploy, migrate a remote database, publish, push, rotate a secret,
or perform destructive cleanup unless the user explicitly authorizes that
external mutation.

Tests should cover the applicable positive, denial, cross-tenant, revocation,
concurrency, retry, and dependency-failure paths. Keep
`IMPLEMENTATION_STATUS.md`, `docs/known-limitations.md`, requirements
traceability, API/SDK docs, and compatibility evidence aligned with behavior.
