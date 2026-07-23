# Local composition example

This runnable TypeScript example demonstrates the client experience LiteMCP Composer is
designed to provide: one short-lived credential and one MCP endpoint spanning
multiple upstream tools.

It is an assertive product proof, not a console-log sample. It uses the
TypeScript SDK to:

1. issue a ten-minute employee session for the demo composition;
2. initialize an authenticated MCP Streamable HTTP session;
3. assert the employee's policy-filtered catalog and hidden refund tool;
4. call the aliased built-in `sum` tool and remote
   `finance.list_invoices` tool through the same endpoint;
5. prove a guessed hidden call is denied;
6. pause a finance refund for an exact-context approval, approve it as a
   separate demo administrator, and execute it once;
7. verify correlated audit evidence contains neither credentials nor tool
   arguments/results; and
8. revoke the employee session and prove the gateway rejects it.

## Run it

Run the complete proof from the repository root:

```bash
pnpm demo:smoke
```

The command reserves a loopback port, starts a real portable Node server,
waits for readiness, runs every assertion, and shuts the server down even when
the proof fails. It is also part of `pnpm check` and the CI test job.

For interactive inspection, start the repository's local demo first:

```bash
LITEMCP_DEMO_MODE=true pnpm dev
```

Then run the example from another terminal:

```bash
pnpm --filter @litemcp/example-local-composition dev
```

Set `LITEMCP_API_URL` if the control plane is not listening on
`http://127.0.0.1:8787`.

The example deliberately uses the fixed `org_demo` tenant and an employee role.
It is a local product proof, not a production authentication pattern or a
named-client compatibility claim. See the
[TypeScript SDK guide](../../packages/sdk-typescript/README.md) for client
configuration, the
[compatibility matrix](../../docs/mcp-client-compatibility.md) for named-client
evidence, and the [threat model](../../docs/security/threat-model.md) for the
production trust boundary.
