export type DocumentationReference = {
  slug: string;
  index: string;
  title: string;
  shortTitle: string;
  description: string;
  boundary: string;
  repositoryPath: string;
  useWhen: string[];
  sections: Array<{
    title: string;
    description: string;
  }>;
  related: Array<{
    label: string;
    href: string;
  }>;
};

export const documentationReferences: DocumentationReference[] = [
  {
    slug: "feature-reference",
    index: "R1",
    title: "Feature reference",
    shortTitle: "Features",
    description:
      "Map every major product surface to implemented evidence, preview work, designed capabilities, and the next proof required.",
    boundary:
      "Availability describes the current repository snapshot. “Available now” means tested in the local vertical slice, not production-certified or generally available.",
    repositoryPath: "docs/feature-reference.md",
    useWhen: [
      "Evaluating what can be demonstrated today versus what remains designed or blocked.",
      "Planning a pilot, design-partner review, or implementation milestone without relying on marketing shorthand.",
      "Tracing a capability to its current evidence and the next acceptance test.",
    ],
    sections: [
      {
        title: "Composer and gateway",
        description:
          "Registration, namespaces, publication guards, protocol negotiation, discovery, execution, schema validation, and transport boundaries.",
      },
      {
        title: "Identity and governance",
        description:
          "Better Auth, organization RBAC, scoped sessions, SSO and SCIM previews, policy parity, approvals, and routing status.",
      },
      {
        title: "Operations and deployment",
        description:
          "Audit, readiness, export, backup, upgrades, SDKs, Docker, Kubernetes, and the blocked live managed cloud release.",
      },
    ],
    related: [
      {
        label: "Configuration reference",
        href: "/docs/reference/configuration-reference",
      },
      {
        label: "Composition lifecycle",
        href: "/docs/reference/mcp-composition-lifecycle",
      },
      { label: "Security boundary", href: "/security" },
    ],
  },
  {
    slug: "requirements-traceability",
    index: "R2",
    title: "Requirements traceability",
    shortTitle: "Traceability",
    description:
      "Connect stable product-requirement families to their implementation, scoped verification, and the exact acceptance evidence still missing.",
    boundary:
      "This is a family-level traceability matrix. A passing unit test proves only its named behavior and never upgrades an entire enterprise requirement to complete.",
    repositoryPath: "docs/requirements-traceability.md",
    useWhen: [
      "Reviewing whether a product requirement is implemented, previewed, designed, or blocked.",
      "Planning acceptance work across tenancy, MCP, policy, identity, sessions, approvals, observability, and deployment.",
      "Preventing UI, schema, or plugin scaffolding from being mistaken for end-to-end proof.",
    ],
    sections: [
      {
        title: "Requirement families",
        description:
          "Stable requirement ranges mapped to primary implementation, verification evidence, and required completion evidence.",
      },
      {
        title: "Mandatory scenarios",
        description:
          "The eight end-to-end enterprise scenarios, their current partial proof, and what a credible acceptance run must add.",
      },
      {
        title: "Evidence locations",
        description:
          "Where tests, deployment assets, implementation status, security gates, and known blockers are maintained.",
      },
    ],
    related: [
      { label: "Feature reference", href: "/docs/reference/feature-reference" },
      { label: "Development guide", href: "/docs/reference/development" },
      { label: "Security boundary", href: "/security" },
    ],
  },
  {
    slug: "mcp-composition-lifecycle",
    index: "R3",
    title: "MCP composition lifecycle",
    shortTitle: "MCP lifecycle",
    description:
      "Follow one governed endpoint from upstream registration and versioned composition through discovery, policy, execution, provenance, and audit.",
    boundary:
      "The current slice implements MCP initialize, tools/list, and tools/call. Full protocol conformance, immutable promotion history, connected accounts, and distributed routing remain release work.",
    repositoryPath: "docs/mcp-composition-lifecycle.md",
    useWhen: [
      "Designing namespaces, aliases, version pins, and a stable downstream MCP contract.",
      "Reviewing exactly where identity, policy, approval, schema validation, routing, and audit run.",
      "Understanding failure behavior before introducing side-effecting tools.",
    ],
    sections: [
      {
        title: "Register and compose",
        description:
          "Core objects, endpoint safety, pinned upstream definitions, stable namespaces, aliases, draft guards, and publication state.",
      },
      {
        title: "Discover and execute",
        description:
          "Scoped sessions, protocol initialization, list/call authorization parity, JSON Schema validation, approvals, dispatch, and provenance.",
      },
      {
        title: "Fail safely and stay portable",
        description:
          "Explicit failure semantics, executor security boundaries, secret-safe export, and the shared managed cloud and Kubernetes contract.",
      },
    ],
    related: [
      { label: "Feature reference", href: "/docs/reference/feature-reference" },
      { label: "API and SDK reference", href: "/docs/reference/api-and-sdk-reference" },
      { label: "Policy product surface", href: "/product/policy" },
    ],
  },
  {
    slug: "console-guide",
    index: "R4",
    title: "Management console guide",
    shortTitle: "Console",
    description:
      "Navigate the connected management console, distinguish authenticated and demo modes, and use each implemented workflow without inferring unfinished features.",
    boundary:
      "The console is an early API-backed vertical slice. Read-only and preview areas are not complete enterprise workflows, and navigation labels do not prove implementation.",
    repositoryPath: "docs/console-guide.md",
    useWhen: [
      "Registering a server, creating a composition, simulating policy, or issuing a short-lived session through the UI.",
      "Determining which console areas are available now, previewed, or only designed.",
      "Recovering from validation, authentication, readiness, or uncertain mutation results safely.",
    ],
    sections: [
      {
        title: "Modes and navigation",
        description:
          "Authenticated organization context, explicit loopback demo mode, URL-hash navigation, and availability by console area.",
      },
      {
        title: "Current workflows",
        description:
          "Server registration, one-member composition creation, policy simulation, scoped session issue/revoke, audit, and approval visibility.",
      },
      {
        title: "Errors and planned surfaces",
        description:
          "Request correlation, safe retry guidance, incomplete CRUD and revocation journeys, and the enterprise surfaces still required.",
      },
    ],
    related: [
      { label: "Getting started", href: "/docs/getting-started" },
      { label: "API and SDK reference", href: "/docs/reference/api-and-sdk-reference" },
      { label: "Feature reference", href: "/docs/reference/feature-reference" },
    ],
  },
  {
    slug: "api-and-sdk-reference",
    index: "R5",
    title: "API, SDK, and CLI reference",
    shortTitle: "API and SDKs",
    description:
      "Use the implemented control-plane routes, MCP endpoint, response envelopes, TypeScript and Python clients, and operational CLI.",
    boundary:
      "The API is pre-1.0 and its CRUD surface is intentionally incomplete. SDK packages have not yet passed public-registry publication smoke tests.",
    repositoryPath: "docs/api-and-sdk-reference.md",
    useWhen: [
      "Calling the local demo or authenticated control plane without guessing routes or headers.",
      "Issuing a short-lived session and negotiating MCP with a supported client.",
      "Choosing between curl, the TypeScript SDK, the Python SDK, and the CLI.",
    ],
    sections: [
      {
        title: "Authentication and envelopes",
        description:
          "Explicit demo headers, production membership authority, MCP bearer sessions, request IDs, and structured problem responses.",
      },
      {
        title: "Implemented routes",
        description:
          "Health, readiness, overview, servers, compositions, policy simulation, sessions, audit, identity metadata, approvals, export, and MCP.",
      },
      {
        title: "Client surfaces",
        description:
          "Concrete curl requests, TypeScript and Python examples, CLI commands, compatibility guidance, and current publication limits.",
      },
    ],
    related: [
      { label: "Getting started", href: "/docs/getting-started" },
      { label: "MCP lifecycle", href: "/docs/reference/mcp-composition-lifecycle" },
      { label: "Development guide", href: "/docs/reference/development" },
    ],
  },
  {
    slug: "connector-authoring",
    index: "R6",
    title: "MCP server and connector authoring",
    shortTitle: "Connector authoring",
    description:
      "Build an upstream MCP server that composes cleanly, with stable tools, bounded schemas, explicit side effects, safe errors, and documented security expectations.",
    boundary:
      "This is the current integration contract, not a shipped connector SDK or publication pipeline. Container isolation and broader MCP capability support remain planned.",
    repositoryPath: "docs/connector-authoring.md",
    useWhen: [
      "Designing a remote HTTP MCP server for registration and composition.",
      "Defining tool schemas, risk, provider scopes, idempotency, pagination, limits, and machine-readable errors.",
      "Testing authentication, SSRF, egress, denial, timeout, session revocation, provenance, and audit behavior.",
    ],
    sections: [
      {
        title: "Protocol and tool contract",
        description:
          "The supported MCP slice, minimum initialize/list/call behavior, stable naming, self-contained JSON Schema, and bounded payloads.",
      },
      {
        title: "Security and side effects",
        description:
          "Credential-free endpoints, future credential brokerage, DNS/egress controls, risk labels, idempotency, retries, and safe errors.",
      },
      {
        title: "Integration and publication",
        description:
          "A ten-step local verification loop and the provenance, SBOM, compatibility, documentation, and revocation evidence future publication requires.",
      },
    ],
    related: [
      { label: "MCP lifecycle", href: "/docs/reference/mcp-composition-lifecycle" },
      { label: "API and SDK reference", href: "/docs/reference/api-and-sdk-reference" },
      { label: "Development guide", href: "/docs/reference/development" },
    ],
  },
  {
    slug: "configuration-reference",
    index: "R7",
    title: "Configuration reference",
    shortTitle: "Configuration",
    description:
      "Configure the portable Node server, managed cloud app, static web surface, CLI, Docker Compose, Helm, and storage adapters.",
    boundary:
      "Examples are safe templates, not production secrets or acceptance evidence. Workers KV remains evaluation-grade for security-sensitive multi-writer authority.",
    repositoryPath: "docs/configuration-reference.md",
    useWhen: [
      "Preparing exact origins, authentication secrets, persistence, and runtime safety flags.",
      "Comparing the provider-specific managed cloud bindings with the portable Node and MongoDB deployment.",
      "Reviewing Docker, Helm, storage guarantees, and the configuration-change checklist.",
    ],
    sections: [
      {
        title: "Runtime settings",
        description:
          "Node environment variables, demo guards, MongoDB and Better Auth requirements, remote-execution bounds, and unsafe stdio controls.",
      },
      {
        title: "Deployment settings",
        description:
          "Managed cloud bindings, Astro build behavior, Docker Compose topology, Helm values, secret references, probes, and network policy.",
      },
      {
        title: "Guarantees and review",
        description:
          "Memory, MongoDB, and Workers KV consistency boundaries plus a repeatable pre-deployment configuration checklist.",
      },
    ],
    related: [
      { label: "Self-hosting", href: "/docs/self-hosting" },
      { label: "Operations runbook", href: "/docs/reference/operations-runbook" },
      { label: "Managed cloud preview", href: "/cloud" },
    ],
  },
  {
    slug: "operations-runbook",
    index: "R8",
    title: "Operations runbook",
    shortTitle: "Operations",
    description:
      "Prepare, deploy, validate, monitor, recover, and document the portable Node and Kubernetes distribution with explicit evidence gates.",
    boundary:
      "The runbook defines required acceptance. It does not claim a live Kubernetes install, restore rehearsal, upgrade, or managed cloud smoke has passed.",
    repositoryPath: "docs/operations/runbook.md",
    useWhen: [
      "Preparing a controlled pilot or change window with named owners and rollback criteria.",
      "Building health, readiness, backup, restore, upgrade, and routine-review procedures.",
      "Responding to session, credential, audit-integrity, or unexpected-egress incidents.",
    ],
    sections: [
      {
        title: "Preflight and acceptance",
        description:
          "Immutable versions, durable storage, secret custody, configuration review, deployment commands, and a fourteen-step smoke contract.",
      },
      {
        title: "Operate and recover",
        description:
          "Health versus readiness, routine checks, backups, isolated restore, upgrades, compatibility verification, and rollback triggers.",
      },
      {
        title: "Respond with evidence",
        description:
          "Incident playbooks, safe diagnostics bundles, managed cloud checks, and the evidence required before status claims change.",
      },
    ],
    related: [
      { label: "Self-hosting", href: "/docs/self-hosting" },
      {
        label: "Configuration reference",
        href: "/docs/reference/configuration-reference",
      },
      { label: "Security center", href: "/security" },
    ],
  },
  {
    slug: "troubleshooting",
    index: "R9",
    title: "Troubleshooting",
    shortTitle: "Troubleshooting",
    description:
      "Diagnose installation, control-plane, MCP, managed cloud, Docker, Kubernetes, readiness, audit, and incident failures from the first broken layer.",
    boundary:
      "Troubleshooting must preserve request IDs while redacting credentials and payloads. Never weaken readiness, egress, demo, or isolation controls merely to make a check pass.",
    repositoryPath: "docs/troubleshooting.md",
    useWhen: [
      "A frozen install, local port, health/readiness, authentication, membership, or endpoint validation check fails.",
      "A session, tool discovery/call, upstream network, stdio, Wrangler, Compose, or Helm path behaves unexpectedly.",
      "Collecting a minimal diagnostics bundle or responding to audit-integrity and sensitive-data concerns.",
    ],
    sections: [
      {
        title: "Workspace and control plane",
        description:
          "Version and install checks, port conflicts, health versus readiness, authentication, membership, and endpoint validation.",
      },
      {
        title: "Gateway and deployments",
        description:
          "Sessions, list/call parity, schemas, remote egress, stdio, managed cloud bootstrap, Compose, Kubernetes, DNS, and probes.",
      },
      {
        title: "Diagnostics and help",
        description:
          "Audit continuity, sensitive-data response, safe reproduction details, request correlation, and private security reporting.",
      },
    ],
    related: [
      { label: "Operations runbook", href: "/docs/reference/operations-runbook" },
      {
        label: "Configuration reference",
        href: "/docs/reference/configuration-reference",
      },
      { label: "Getting started", href: "/docs/getting-started" },
    ],
  },
  {
    slug: "development",
    index: "R10",
    title: "Development guide",
    shortTitle: "Development",
    description:
      "Work in the monorepo, preserve the portable boundary, run quality gates, and extend domain, storage, executor, security, and documentation surfaces.",
    boundary:
      "This is contributor guidance for the pre-1.0 repository. Passing local gates does not substitute for provider, cluster, conformance, or security acceptance.",
    repositoryPath: "docs/development.md",
    useWhen: [
      "Setting up the exact pnpm workspace and locating deployment versus portable package responsibilities.",
      "Adding a domain capability, storage adapter, or MCP executor without coupling core behavior to infrastructure.",
      "Preparing a contribution with security, failure-path, documentation, and cross-target validation.",
    ],
    sections: [
      {
        title: "Workspace and workflow",
        description:
          "Prerequisites, repository map, dependency rules, local demo workflow, and the complete quality-command set.",
      },
      {
        title: "Extension checklists",
        description:
          "Sequenced guidance for domain features, NoSQL adapters, MCP executors, SDK/UI exposure, and negative tests.",
      },
      {
        title: "Security and documentation",
        description:
          "Tenant, policy, credential, side-effect, revocation, consistency, unsafe-mode, status-label, and evidence review questions.",
      },
    ],
    related: [
      { label: "Feature reference", href: "/docs/reference/feature-reference" },
      { label: "API and SDK reference", href: "/docs/reference/api-and-sdk-reference" },
      { label: "Open-source project", href: "/open-source" },
    ],
  },
  {
    slug: "usage-observability",
    index: "R11",
    title: "Usage observability and analytics",
    shortTitle: "Usage analytics",
    description:
      "Understand payload-free usage facts, exact quota standing, tenant analytics APIs, storage boundaries, and the six Insight Plane console views.",
    boundary:
      "Analytics is fail open and can be incomplete. Managed queries currently use a capped exact event feed; audit remains the fail-closed evidence path, and alerts, SIEM delivery, WebSockets, and deployed acceptance remain outstanding.",
    repositoryPath: "docs/usage-observability.md",
    useWhen: [
      "Interpreting usage, latency, client, identity, policy, approval, session, and tool-flow views.",
      "Integrating the tenant-scoped analytics JSON or CSV routes without confusing analytics with quota or audit authority.",
      "Choosing MongoDB or managed-cloud analytics settings and reviewing their retention, capacity, and failure boundaries.",
    ],
    sections: [
      {
        title: "Events and attribution",
        description:
          "Strict payload-free facts, first-write self-reported client attribution, request and audit correlation, and terminal call semantics.",
      },
      {
        title: "Storage and APIs",
        description:
          "Memory, MongoDB time-series, Analytics Engine emission, capped tenant feed queries, exact quota standing, and tenant-derived HTTP access.",
      },
      {
        title: "Console and evidence boundary",
        description:
          "Dashboard, Live, Tools, Identities, Sessions, and Policy insights plus the explicit proof and delivery work still outstanding.",
      },
    ],
    related: [
      { label: "Management console", href: "/docs/reference/console-guide" },
      { label: "API and SDK reference", href: "/docs/reference/api-and-sdk-reference" },
      {
        label: "Configuration reference",
        href: "/docs/reference/configuration-reference",
      },
    ],
  },
];

export const documentationSourceUrl = (repositoryPath: string) =>
  `https://github.com/reachjalil/liteMCP/blob/main/${repositoryPath}`;
