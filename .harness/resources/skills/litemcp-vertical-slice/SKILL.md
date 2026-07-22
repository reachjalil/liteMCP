---
name: litemcp-vertical-slice
description: Plan and implement small complete LiteMCP product iterations or bug fixes that cross contracts, core behavior, APIs, MCP gateway, adapters, SDKs, CLI, web UI, tests, and documentation. Use when a request describes a user-visible capability, behavior correction, or iterative enhancement and needs a repository-grounded order of work.
---

# LiteMCP Vertical Slice

Deliver the smallest end-to-end behavior that is useful, testable, reversible,
and honestly documented. Avoid partial layers, speculative frameworks, and
unbounded refactors.

## Slice definition

Before editing, write a compact contract:

- user/actor and tenant;
- trigger and observable outcome;
- authorization and failure behavior;
- data/state change and compatibility requirements;
- affected public surfaces;
- focused acceptance evidence;
- explicit non-goals.

## Implementation order

1. Inspect `IMPLEMENTATION_STATUS.md`, requirements traceability, known
   limitations, architecture, and the nearest tests.
2. Change portable contracts/schemas only when observable behavior needs them.
3. Implement framework-neutral policy and state transitions in `packages/core`.
4. Expose the behavior through `packages/platform-api`; update
   `packages/mcp-gateway` when the data plane changes.
5. Implement adapter/composition wiring without leaking infrastructure imports
   into portable packages or `apps/server`.
6. Update SDK, CLI, and UI consumers only for the supported contract.
7. Add positive, denial, cross-tenant, concurrency/retry, and dependency-failure
   tests that the slice actually needs.
8. Update docs, configuration examples, status, limitations, and traceability in
   the same patch. Do not claim live-provider or production evidence from unit
   tests.

## Iteration loop

Run narrow package test/type/build commands while iterating. Inspect the diff
for scope drift, then finish with the single full repository gate:

```bash
pnpm check
```

For Python SDK changes also run `pnpm python:test`.
Invoke the security, identity, observability, MCP, deployment, release, or
open-core skill when the slice crosses that boundary.

Report what is complete, what remains deliberately unsupported, commands run,
and any external acceptance that is still unproven.
