# Documentation

Documentation distinguishes implemented evidence from product intent. Begin
with the two status files before relying on any capability in production.

## Start here

- [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) — verified,
  partial, blocked, and unimplemented capabilities.
- [`known-limitations.md`](./known-limitations.md) — security and operational
  gaps that must not be hidden by marketing copy.
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — trust boundaries, storage, data
  plane, credential plane, and deployment topology.
- [`mcp-native-positioning.md`](./mcp-native-positioning.md) — MCP-native
  category, differentiation, product wedge, and proof requirements.
- [`feature-reference.md`](./feature-reference.md) — current capability catalog
  with Available now, Preview, Designed, and Blocked labels.
- [`requirements-traceability.md`](./requirements-traceability.md) — stable
  requirement families mapped to code, tests, and missing acceptance evidence.
- [`mcp-composition-lifecycle.md`](./mcp-composition-lifecycle.md) — registry,
  composition, session, discovery, execution, approval, and failure behavior.
- [`api-and-sdk-reference.md`](./api-and-sdk-reference.md) — control-plane API,
  MCP endpoint, TypeScript/Python SDKs, CLI, and concrete requests.
- [`mcp-client-compatibility.md`](./mcp-client-compatibility.md) — named-client
  evidence matrix, implemented MCP surface, blockers, and verification record.
- [`managed-cloud-fair-use.md`](./managed-cloud-fair-use.md) — published free
  defaults, counting semantics, enforcement behavior, and non-SLA boundary.
- [`usage-observability.md`](./usage-observability.md) — Insight Plane event,
  attribution, storage, API, console, privacy, retention, and evidence boundary.
- [`console-guide.md`](./console-guide.md) — authenticated/demo modes, each
  console area, current workflows, errors, and planned enterprise surfaces.
- [`configuration-reference.md`](./configuration-reference.md) — Node,
  managed cloud, web, Docker, Helm, storage, and security configuration.
- [`development.md`](./development.md) — workspace architecture, extension
  points, quality gates, and contribution workflow.
- [`connector-authoring.md`](./connector-authoring.md) — current upstream MCP
  contract, schema, auth, egress, side-effect, and publication expectations.
- [`troubleshooting.md`](./troubleshooting.md) — install, API, MCP, managed cloud,
  Docker/Kubernetes, and audit failure diagnosis.
- [`release-and-lts-policy.md`](./release-and-lts-policy.md) — current pre-1.0
  compatibility policy and the evidence required before stable or LTS claims.
- [`product-requirements.md`](./product-requirements.md) — complete product
  requirements and acceptance scenarios.

## Security and identity

- [`security/threat-model.md`](./security/threat-model.md)
- [`security/credential-handling.md`](./security/credential-handling.md)
- [`identity/entra-id.md`](./identity/entra-id.md)
- [`identity/scim.md`](./identity/scim.md)

## Policy and portability

- [`policy/routing-and-authorization.md`](./policy/routing-and-authorization.md)
- [`composio-capability-parity.md`](./composio-capability-parity.md)
- [`pattern-audit.md`](./pattern-audit.md)
- [`pattern-decisions.md`](./pattern-decisions.md)

## Self-hosted operations

- [`operations/runbook.md`](./operations/runbook.md)
- [`on-prem/installation.md`](./on-prem/installation.md)
- [`on-prem/air-gapped.md`](./on-prem/air-gapped.md)
- [`on-prem/backup-restore.md`](./on-prem/backup-restore.md)
- [`on-prem/upgrades-rollbacks.md`](./on-prem/upgrades-rollbacks.md)

When implementation evidence changes, update both the status matrix and known
limitations in the same change.
