---
name: litemcp-mcp-compatibility
description: Implement or verify LiteMCP MCP protocol, transport, OAuth, discovery, execution, composition, gateway, SDK, example, or named-client compatibility behavior. Use when changing packages/mcp-gateway, MCP routes in platform API/server compositions, protocol revisions, tool/resource/prompt exposure, Streamable HTTP or stdio behavior, compatibility claims, or docs/mcp-client-compatibility.md.
---

# LiteMCP MCP Compatibility

Separate protocol-correct wire behavior from evidence for a named client and
version. Passing internal tests does not prove a product-specific client claim.

## Scope the claim

Record the protocol revision, transport, authentication/OAuth mode, client name
and exact version when applicable, server/composition topology, and feature set
being claimed. Mark untested cells as unverified rather than compatible.

## Verification flow

1. Read `docs/mcp-client-compatibility.md`,
   `docs/mcp-composition-lifecycle.md`, gateway tests, and current SDK/example
   usage.
2. Preserve capability negotiation, request/response IDs, JSON-RPC errors,
   cancellation/timeouts, pagination, and transport lifecycle semantics.
3. Verify initialize and discovery before execution. Test at least one safe,
   read-only allowed call and denial of a guessed, hidden, disabled, or
   unauthorized tool.
4. Exercise tenant binding, composition lifecycle state, policy evaluation,
   credential scoping, rate/size limits, audit correlation, usage correlation,
   revocation, and upstream failure.
5. Keep tool arguments/results out of analytics and secret-bearing errors.
6. Update contracts, gateway/core/API, SDKs/examples, and the compatibility
   matrix together when public behavior changes.

## Focused evidence

```bash
pnpm --filter @litemcp/contracts test
pnpm --filter @litemcp/core test
pnpm --filter @litemcp/mcp-gateway test
pnpm --filter @litemcp/platform-api test
pnpm --filter @litemcp/sdk test
pnpm --filter @litemcp/example-local-composition build
pnpm check
```

When `packages/sdk-python` changes, also run:

```bash
pnpm python:test
```

For a named-client claim, record a dated manual or automated transcript that
contains no secrets or payload data. If OAuth, browser approval, or a live client
cannot be exercised, report protocol evidence only and leave the client claim
unverified.
