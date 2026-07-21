---
title: "Developer Experience"
file: "12-developer-experience.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 1
---

# Developer Experience

## Reader Promise

The reader can see the first-use path, configuration model and contribution loop required for open-source adoption.

## Summary (≤120 words)

The adoption wedge must be materially easier than editing MCP settings in every client. The best first experience is an import-and-consolidate CLI: discover existing Claude, Cursor, VS Code and other MCP configs, normalize them, start a local gateway, and rewrite clients to one endpoint. The second wedge is connector verification: contributors get a schema, test harness and public compatibility badge. Cloud signup should be optional, never required for the open path.

## What We Found

## Time-to-first-value target

**Goal:** from existing scattered configuration to one local endpoint in under ten minutes, without creating an account.

```bash
curl -fsSL https://example.invalid/litemcp/install | sh
litemcp import --from all
litemcp doctor
litemcp serve
litemcp client configure --all
```

The CLI should:

1. discover known client configuration files;
2. redact and inventory secrets without uploading them;
3. assign deterministic server aliases and flag collisions;
4. classify transports and protocol versions;
5. run health, auth and schema probes;
6. start the local gateway;
7. write reversible client changes;
8. produce a migration report.

## Configuration-as-code

```yaml
apiVersion: gateway.litemcp.io/v1
kind: Gateway
metadata:
  name: engineering
spec:
  upstreams:
    - ref: github
    - ref: linear
  policyBundles:
    - ./policies/engineering.cedar
  toolNaming:
    strategy: server-prefix
  telemetry:
    otlpEndpoint: http://otel-collector:4317
```

Configuration supports environment overlays, secret references, schema validation and dry-run diffs. Every cloud UI action emits equivalent config or API calls.

## Local development

- single binary plus container image;
- Docker Compose and Helm charts;
- embedded SQLite for local use, PostgreSQL for production;
- mock OAuth provider and test vault;
- record/replay fixtures with automatic secret redaction;
- protocol conformance suite;
- `doctor` checks DNS, TLS, auth metadata, scopes and client compatibility;
- OpenTelemetry from the first request;
- deterministic seed/demo project.

## Connector SDK

A connector contribution includes:

- manifest and ownership metadata;
- auth schemes and least-scope mapping;
- tool/resource schemas;
- API transformation or remote MCP target;
- risk classifications;
- contract tests;
- sandbox/egress declarations;
- fixtures;
- changelog and semantic version;
- SBOM/provenance generation.

CI runs static analysis, secret scanning, dependency review, auth tests, destructive-action checks, protocol compatibility and smoke tests. Passing builds receive a signed badge; only reviewed builds enter the verified channel.

## Documentation system

Use a Diátaxis split:

- **Tutorials:** consolidate three local servers; add a managed OAuth connection.
- **How-to:** deploy on Kubernetes, use Vault, configure SCIM, migrate from Composio.
- **Reference:** MCP behavior, REST API, events, policies, connector manifest.
- **Explanation:** trust model, portability, metering, open-core boundary.

## Support model

- Community: GitHub Discussions/issues and public compatibility dashboard.
- Starter/Growth: email with best-effort targets.
- Business: business-hours response targets.
- Enterprise: named channel, production architecture review and contractual SLA.
- Connector Assurance: explicit repair target for verified connector regressions.

LiteLLM's enterprise support distinguishes standard support from an additional-fee 24/7 SLA. [S-003] liteMCP should make response targets and supported-version windows visible before contract.

## Confidence Notes

This is a proposed developer journey; no live liteMCP implementation exists. Client configuration locations and import safety must be validated across operating systems and evolving clients.

## Open Threads

Prototype import/rewrite for the five highest-use clients and measure recovery when a user uninstalls liteMCP or rolls configuration back.

## Sources Used

- [S-003]
