---
title: "Data Model and Event Surface"
file: "09-data-model-and-events.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 1
---

# Data Model and Event Surface

## Reader Promise

The reader can see what liteMCP stores, what it deliberately avoids storing, and how operational and billing events compose.

## Summary (≤120 words)

A gateway that manages identity and tools becomes a sensitive system of record. liteMCP should store normalized metadata, encrypted credential envelopes and policy state, but default to not retaining tool payloads. Event schemas must support audit, billing, reliability analysis and incident response without forcing customers to expose business data. Connector and compatibility artifacts should be immutable and content-addressed.

## What We Found

## Canonical relationship model

```text
Organization
 ├─ Environment
 │   ├─ Gateway
 │   │   ├─ GatewayBinding → UpstreamServer
 │   │   ├─ PolicyBinding → PolicyVersion
 │   │   └─ Invocation
 │   ├─ Principal
 │   │   └─ ConnectedAccount → AuthConfig → CredentialEnvelope
 │   └─ ApprovalRequest
 └─ BillingAccount

ConnectorDefinition
 ├─ ConnectorVersion
 │   └─ ConnectorBuild → SBOM + Signature + CompatibilityReport
 └─ ToolDescriptor
```

### Identifier rules

- Internal IDs are opaque UUID/ULID values.
- Human aliases are unique within an environment and may change.
- Tool policy binds to a stable tool UID plus connector version range, not only a display name.
- Builds are content-addressed by digest.
- Credential envelopes reference a vault location and key version; plaintext is never part of the relational record.
- External provider account identifiers are encrypted or irreversibly hashed where practical.

## Invocation record

Default metadata:

| Field | Purpose |
|---|---|
| `invocation_id` | Trace and support correlation |
| `organization_id`, `environment_id`, `gateway_id` | Tenant and deployment scope |
| `principal_id` | Actor, pseudonymizable |
| `tool_uid`, `connector_build_digest` | Exact action provenance |
| `policy_decision_id` | Explain authorization result |
| `connected_account_id` | Credential binding, no token |
| `started_at`, `duration_ms` | SLO and billing |
| `outcome_category` | Success, denial, auth expiry, upstream error, etc. |
| `attempt_count` | Internal retry visibility |
| `upstream_status_class` | Coarse error signal |
| `request_bytes`, `response_bytes` | Capacity planning |
| `trace_id` | OpenTelemetry correlation |
| `payload_retained` | Explicit false by default |

Composio's enterprise page similarly frames audit as metadata-only rather than payload storage. [S-026] liteMCP should make that the default at every tier, while allowing customer-side payload logging through an OpenTelemetry collector under customer control.

## Event topics

- `gateway.config.published`
- `upstream.health.changed`
- `upstream.schema.changed`
- `connector.build.published`
- `connector.build.revoked`
- `compatibility.test.completed`
- `connection.created`
- `connection.refresh.failed`
- `connection.revoked`
- `policy.decision`
- `approval.requested`
- `approval.decided`
- `invocation.started`
- `invocation.completed`
- `invocation.failed`
- `security.suspected_ssrf`
- `billing.usage.recorded`

Events use CloudEvents-compatible envelopes `[inference]`, with tenant-scoped sequence numbers and at-least-once delivery. Consumers must deduplicate by event ID.

## Schema evolution

- Additive fields do not require a major version.
- Removing or changing semantics requires a new event type/version.
- Connector schema changes generate explicit diffs before activation.
- A build cannot mutate after publication; a bad build is revoked and superseded.
- The registry keeps signed tombstones so downstream caches can reject revoked artifacts.
- Compatibility reports record client, gateway, connector, upstream, auth mode and protocol revision.

## Retention

| Data | Community self-host | Cloud default | Enterprise |
|---|---|---|---|
| Config/policy | Customer-controlled | Life of account + export window | Contract |
| Invocation metadata | Customer-controlled | 30–90 days by tier | Up to multi-year |
| Tool payloads | Off | Off | Customer-controlled destination |
| Credential material | Customer vault/local | Managed encrypted vault | BYOK/HSM/VPC options |
| Compatibility evidence | Public aggregates | Long-lived | Private fleet history |
| Billing events | N/A | Statutory/contractual minimum | Contract |

## Data residency

The control plane should be regional, but the data plane must run independently with cached signed config if the control plane is unavailable. Enterprise customers should be able to pin config, metadata and credentials to a region and route telemetry to their own storage.

## Confidence Notes

The data model is proposed. Metadata-only logging and immutable build provenance are design commitments, not observed liteMCP behavior. Retention periods are packaging assumptions.

## Open Threads

Determine whether reliability learning can use privacy-preserving aggregates without creating a customer-data processing burden or weakening diagnostic value.

## Sources Used

- [S-026]
