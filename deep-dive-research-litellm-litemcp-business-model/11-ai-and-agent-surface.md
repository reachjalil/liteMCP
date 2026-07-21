---
title: "Agent and Tool Surface"
file: "11-ai-and-agent-surface.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 1
---

# Agent and Tool Surface

## Reader Promise

The reader can distinguish valuable agent-facing capabilities from gateway scope creep.

## Summary (≤120 words)

liteMCP should improve how agents discover and safely invoke tools, but it should not become an agent framework or model gateway. The product should expose deterministic tool search, provenance, risk metadata, approval states and execution evidence through MCP. Sandboxing belongs where connector code or API transformation executes. Model selection, planning and conversational memory remain outside scope.

## What We Found

## Product boundary

**In scope**

- normalized tool discovery across upstream servers;
- deterministic search and context-efficient result sets;
- tool provenance, version, required scopes and risk annotations;
- policy-filtered visibility;
- approval-required responses for sensitive actions;
- safe connector execution and sandboxing;
- compatibility tests and schema-drift handling;
- invocation telemetry and replay metadata without payload retention.

**Out of scope**

- choosing or hosting LLMs;
- general prompt management;
- agent planning/memory;
- arbitrary workflow automation engine;
- vector database or RAG platform;
- proprietary tool-calling protocol.

This boundary prevents direct overlap with LiteLLM's model-gateway core while allowing interoperability: an organization may route model calls through LiteLLM and tool calls through liteMCP.

## Tool discovery

A gateway that returns thousands of schemas wastes context and increases selection error. Composio documents contextual tool retrieval rather than loading every tool definition. [S-026] liteMCP should implement an open deterministic index:

- lexical + semantic search over names/descriptions/schema fields;
- policy filtering before ranking;
- connector, risk and account filters;
- stable results for identical query/index versions;
- no model call required for baseline search;
- optional customer-supplied embedding model;
- explicit `search_tools` meta-tool plus normal `tools/list`.

Every result should include:

```json
{
  "tool_uid": "github.issue.create",
  "display_name": "Create issue",
  "connector_build": "sha256:…",
  "risk": "write",
  "approval": "policy-dependent",
  "required_scopes": ["issues:write"],
  "last_verified_at": "…",
  "compatibility": {"status": "passing", "report_url": "…"}
}
```

## Risk and approvals

Tool definitions carry default risk classes: read, write, destructive, financial, identity/admin and code execution. Organizations may override. Policy can return:

- `allow`;
- `deny`;
- `require_approval`;
- `allow_with_transform` (for example, redact fields or cap amount);
- `allow_once` with a short-lived grant.

The agent receives structured status and may present a human approval link. Approval must bind the exact tool, normalized arguments hash, account and expiry to prevent bait-and-switch.

## Sandboxing

Connector code that translates APIs or runs local commands executes in a constrained runtime:

- no ambient credentials;
- per-invocation network allowlist;
- read-only base image;
- CPU/memory/time limits;
- ephemeral filesystem;
- signed connector digest;
- output-size cap;
- trace and security events.

Compute is billed separately because its cost profile differs from routing.

## Schema drift

When upstream schemas change:

1. build pipeline detects and diffs;
2. compatibility suite runs against supported clients/protocols;
3. risky changes require review;
4. a new immutable connector build is published;
5. canary gateways receive it;
6. fleet rollout pauses on error-rate regression;
7. prior build remains available for rollback.

Composio markets self-healing and schema-drift handling; liteMCP should turn that claim into inspectable compatibility evidence rather than opaque repair. [S-026]

## Interoperation with model gateways

- Preserve OpenTelemetry trace context across LiteLLM and liteMCP.
- Accept workload identity minted by a shared IdP, not LiteLLM-specific keys.
- Publish tool cost/latency metadata that an agent runtime may use.
- Avoid coupling tool execution bills to LLM token spend.

## Confidence Notes

The agent-surface design is proposed. The need to avoid loading all schemas and to preserve policy/provenance is well supported conceptually, but optimal search quality requires testing.

## Open Threads

Benchmark deterministic search against model-based tool retrieval on representative catalogs and measure tool-selection accuracy, latency and context cost.

## Sources Used

- [S-026]
