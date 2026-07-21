---
title: "Product Roadmap and Validation Gates"
file: "32-product-roadmap.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 1
---

# Product Roadmap and Validation Gates

## Reader Promise

The reader can sequence product work so that commercial and security hypotheses are tested before expensive breadth.

## Summary (≤120 words)

The roadmap begins with an open consolidation wedge, then adds portable authentication, verified connectors and cloud operations. Enterprise controls arrive only after the data plane, threat model and compatibility discipline are credible. Each phase has an evidence gate; catalog breadth and sales hiring are deliberately delayed. The roadmap aims to avoid building a large integration company before proving that customers value assurance.

## What We Found

## Phase 0 — 0 to 30 days: falsify the wedge

**Build**

- read-only client config inventory;
- architecture/threat model;
- competitor bake-off script;
- connector economics spreadsheet;
- naming shortlist.

**Research**

- 20 interviews;
- 3 candidate design partners;
- provider OAuth approval matrix for first 10 connectors.

**Gate**

Proceed only if managed auth or connector reliability is a repeated top-two pain and at least three teams accept a pilot.

## Phase 1 — 30 to 90 days: open gateway proof

**Ship Apache alpha**

- import Claude/Cursor/VS Code-style configs;
- one Streamable HTTP endpoint;
- stdio and remote upstream adapters;
- protocol negotiation;
- namespaced tool discovery;
- health/schema probes;
- API-key/OIDC resource-server baseline;
- local encrypted secret store;
- policy allow/deny;
- OpenTelemetry;
- export/rollback.

**Pilot**

- 3–5 design partners;
- 10 upstreams per partner;
- read-only actions first.

**Gate**

- <30 minutes median activation;
- >95% discovery parity on target clients;
- no unresolved high-severity auth finding;
- at least one partner willing to pay for the next phase.

## Phase 2 — months 3 to 6: portable auth and verification

**Ship**

- connected accounts and BYO OAuth apps;
- callback service;
- token refresh/revocation;
- execution grants;
- connector manifest/SDK;
- signed builds/SBOM;
- compatibility runner;
- public verified registry;
- 25 high-value connectors;
- schema-diff/canary/rollback;
- cloud private beta.

**Gate**

- 25 connectors passing named targets;
- <4 engineering hours median monthly maintenance per connector;
- 99.9% data-plane availability in pilot;
- 5 paying organizations;
- exit test runs cloud config on self-hosted core.

## Phase 3 — months 6 to 12: commercial cloud

**Ship**

- public Free/Starter/Growth;
- managed OAuth apps where approvals complete;
- regional token vault;
- metadata audit;
- connector status/SLO;
- billing by successful execution + active connection;
- team sharing and richer policy;
- 50 verified connectors;
- Connector Assurance beta.

**Gate**

- 20 paying organizations;
- 3–6% activated-to-paid signal or credible enterprise-led alternative;
- >75% infrastructure gross margin before support;
- connector repair objective met for 90 days;
- no customer payload required for core diagnostics.

## Phase 4 — months 9 to 18: enterprise

**Ship**

- SAML/OIDC/SCIM;
- delegated admin and approvals;
- SIEM/export/retention;
- BYOK/HSM and private networking;
- VPC/self-hosted managed broker;
- HA/multi-region/federation;
- 12-month LTS;
- enterprise support/SLA;
- cloud marketplace procurement.

**Gate**

- 5+ annual contracts;
- repeatable security review;
- two referenceable customers;
- support/on-call capacity and error budgets;
- audited portability/exit process.

## Phase 5 — months 18 to 24: ecosystem scale

**Consider**

- 100+ verified connectors only if economics support;
- third-party verifier program;
- vendor certification partnerships;
- neutral subregistry;
- foundation/governance path;
- REST/gRPC virtualization expansion;
- compatibility benchmark consortium.

## Explicit non-goals through month 12

- general agent framework;
- model routing;
- workflow builder;
- 1,000-connector marketing race;
- proprietary MCP dialect;
- mandatory cloud account for core;
- payload analytics;
- custom enterprise forks without upstream path.

## Release policy

- `edge`: rapid protocol/client support;
- `stable`: monthly tested release;
- `lts`: twice-yearly line with 12 months security/compatibility;
- connector builds independent from gateway binary;
- emergency revocation without forced gateway upgrade;
- signed release manifest and rollback instructions.

This deliberately differs from LiteLLM's documented rolling four-minor/no-LTS policy because tool/credential infrastructure needs predictable enterprise maintenance. [S-003]

## Confidence Notes

The sequence is feasible at a conceptual level, but team capacity, provider approvals and connector complexity can move dates. Gates matter more than calendar promises.

## Open Threads

Estimate engineering effort after selecting the first 25 connectors and completing the auth threat model.

## Sources Used

- [S-003]
