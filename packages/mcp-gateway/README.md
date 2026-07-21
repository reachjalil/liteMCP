# `@litemcp/mcp-gateway`

The portable MCP data plane.

It negotiates the supported MCP version, authenticates scoped sessions, filters
`tools/list` through policy, rechecks every `tools/call`, validates arguments
against the advertised JSON Schema, pauses approval-gated actions, routes to an
executor, and records correlated audit evidence.

Included executors cover deterministic built-ins and bounded remote HTTP. Node
stdio is supplied separately by the server app because host process execution
is not portable and is not a production sandbox.
