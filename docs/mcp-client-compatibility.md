# MCP client compatibility

Snapshot: 2026-07-21. This matrix distinguishes implemented wire behavior from
evidence produced by a named, versioned client run. A client is not supported
merely because LiteMCP Composer returns valid JSON-RPC in unit tests.

## Evidence labels

| Label | Meaning |
| --- | --- |
| Verified | A named client version completed initialize, discovery, and a read-only call against a recorded LiteMCP revision and target |
| Wire-only | The LiteMCP endpoint has automated protocol coverage, but no named-client run is recorded |
| Blocked | A LiteMCP capability required for the intended connection path is absent |
| Not tested | No current run or sufficient evidence exists; this is not a support claim |

## Named-client matrix

No named client is verified yet. Version and configuration behavior outside
this repository can change, so the candidate paths below must be revalidated
against the exact client build used in each acceptance run.

| Client | Candidate connection path | Current result | Evidence / blocker |
| --- | --- | --- | --- |
| Claude Desktop | Remote Streamable HTTP; authentication/header behavior must be confirmed for the tested build | Not tested | No packaged run |
| claude.ai | Hosted MCP OAuth connector | Not tested | LiteMCP's OAuth wire path exists, but no claude.ai run or compatibility evidence is recorded |
| Claude Code | Remote Streamable HTTP with a scoped bearer token if the tested build supports the required configuration | Not tested | No packaged run |
| Cursor | Remote Streamable HTTP with a scoped bearer token if the tested build supports the required configuration | Not tested | No packaged run |
| VS Code | Remote Streamable HTTP with a scoped bearer token if the tested extension/build supports the required configuration | Not tested | No packaged run |
| ChatGPT | Hosted MCP OAuth connector | Not tested | LiteMCP's OAuth wire path exists, but no ChatGPT run or compatibility evidence is recorded |
| Codex | Remote Streamable HTTP with a scoped bearer token if the tested surface supports the required configuration | Not tested | No packaged run |

The `approvedClients` field on a LiteMCP session is descriptive metadata. It is
not cryptographic client binding and cannot turn an unverified client into a
supported one.

## Implemented server surface

| Surface | Current behavior | Evidence level |
| --- | --- | --- |
| Protocol revision | Responds with fixed `2025-11-25`; no multi-version negotiation | Wire-only |
| Authentication | Scoped bearer session is required for every handled MCP method | Wire-only |
| `initialize` | Returns server identity, tools, and logging capabilities | Wire-only |
| `ping` | Returns an empty result | Wire-only |
| `logging/setLevel` | Acknowledges the request; there is no client log delivery stream | Wire-only / partial |
| `tools/list` | Returns policy-filtered namespaced tools, schema, annotations, risk, version, and provenance | Wire-only |
| `tools/call` | Re-authorizes, validates, handles approval state, dispatches, bounds output, and records audit metadata | Wire-only |
| Notifications | Authenticated `notifications/*` messages are accepted with no feature-specific behavior | Partial, not conformance |
| Resources, prompts, completions, sampling, elicitation, subscriptions, progress, and tasks | Not implemented | Blocked |
| Streaming/resumability | Full Streamable HTTP streaming and resumability are not implemented; `legacy-sse` is not standards-faithful SSE | Blocked |
| MCP OAuth | Protected-resource and authorization-server metadata, bounded dynamic client registration, authenticated same-origin consent, PKCE authorization code, 15-minute bearer access, explicit optional `offline_access`, rotating refresh families, token revocation, and MCP challenges are implemented | Wire-only; no real-client acceptance proof |

Repository tests plus `scripts/smoke-managed-cloud.sh` can exercise authenticated
`initialize`, `tools/list`, and an explicitly selected read-only `tools/call`.
That smoke is a wire check, not named-client certification.

## Recording a compatibility run

A result can move to Verified only when the evidence records:

- client name, exact version/build, operating system, and extension version
  where applicable;
- LiteMCP git revision, deployment target, URL shape, and protocol revision;
- authentication method and configuration shape, with every credential
  redacted;
- successful initialize, filtered `tools/list`, and one deterministic read-only
  `tools/call`;
- expected denial of one hidden or unauthorized tool and the correlated audit
  request ID;
- session revocation behavior, reconnect behavior, and relevant client logs;
- date, operator, result, and links to sanitized artifacts.

Re-run verified entries on client updates, MCP revision changes, authentication
changes, or gateway transport changes. See
[`known-limitations.md`](./known-limitations.md) for the wider production
acceptance boundary.
