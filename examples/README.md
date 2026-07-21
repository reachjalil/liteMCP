# Examples

Examples are small executable proofs of public interfaces. They must use SDKs
and HTTP/MCP contracts rather than private package internals.

## Local composition

[`local-composition`](./local-composition/) creates a short-lived employee
session, negotiates MCP, lists the policy-filtered tools, calls the `sum` alias,
and calls the remote finance sandbox through the same endpoint.

With the explicit demo server running:

```bash
pnpm --filter @litemcp/example-local-composition dev
```

Never place production credentials in examples. Use deterministic fixtures and
keep expected authorization failures in automated gateway tests.
