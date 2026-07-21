# Local composition example

This runnable TypeScript example demonstrates the client experience LiteMCP Composer is
designed to provide: one short-lived credential and one MCP endpoint spanning
multiple upstream tools.

It uses the TypeScript SDK to:

1. issue a ten-minute employee session for the demo composition;
2. initialize an authenticated MCP Streamable HTTP session;
3. list the policy-filtered tool catalog;
4. call the aliased built-in `sum` tool; and
5. call the remote `finance.list_invoices` tool through the same endpoint.

## Run it

Start the repository's local demo first:

```bash
LITEMCP_DEMO_MODE=true pnpm dev
```

Then run the example from another terminal:

```bash
pnpm --filter @litemcp/example-local-composition dev
```

Set `LITEMCP_API_URL` if the control plane is not listening on
`http://localhost:8787`.

The example deliberately uses the fixed `org_demo` tenant and an employee role.
It is a local product walkthrough, not a production authentication pattern. See
the [TypeScript SDK guide](../../packages/sdk-typescript/README.md) for client
configuration and the [threat model](../../docs/security/threat-model.md) for the
production trust boundary.
