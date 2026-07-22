export type CapabilityStatus = "Available now" | "Preview" | "Planned";

export type ProductPage = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  summary: string;
  signal: string;
  stage: CapabilityStatus;
  capabilities: Array<{
    title: string;
    description: string;
    status: CapabilityStatus;
  }>;
  workflow: Array<{
    step: string;
    title: string;
    description: string;
  }>;
  controls: string[];
};

export const productPages: ProductPage[] = [
  {
    slug: "composer",
    eyebrow: "Composition plane",
    title: "Build one MCP from the servers you already run.",
    description:
      "Compose pinned MCP server definitions behind one stable endpoint today; richer schema diff, promotion, and collision workflows remain on the roadmap.",
    summary:
      "Composer is a working preview for namespaced, version-pinned tool composition and strict portable import/export. Full protocol objects and live cross-target promotion still require end-to-end proof.",
    signal: "Versioned, inspectable, reversible",
    stage: "Preview",
    capabilities: [
      {
        title: "Namespaced tool composition",
        description:
          "Combine pinned MCP server definitions with explicit namespaces, aliases, and retained upstream provenance.",
        status: "Available now",
      },
      {
        title: "Portable configuration export",
        description:
          "Export tenant configuration without secrets; live import from managed cloud to Kubernetes remains unproven.",
        status: "Preview",
      },
      {
        title: "Stable endpoint",
        description:
          "Publish a scoped endpoint whose namespaced tool surface can combine builtin and remote HTTP members.",
        status: "Available now",
      },
      {
        title: "Schema-aware promotion",
        description:
          "Compare tool, resource, and prompt schemas before promoting or rolling back an immutable release.",
        status: "Planned",
      },
    ],
    workflow: [
      {
        step: "01",
        title: "Register",
        description:
          "Import remote URLs, stdio packages, containers, or OpenAPI definitions.",
      },
      {
        step: "02",
        title: "Compose",
        description:
          "Select capabilities, establish namespaces, and resolve collisions.",
      },
      {
        step: "03",
        title: "Publish",
        description:
          "Release a versioned endpoint with policy, identity, and health attached.",
      },
    ],
    controls: [
      "Immutable composition versions",
      "Capability-level aliases",
      "Environment promotion",
      "Rollback to a known release",
      "Portable configuration export",
      "Upstream schema diff",
    ],
  },
  {
    slug: "registry",
    eyebrow: "Supply plane",
    title: "Know exactly what enters your MCP estate.",
    description:
      "Register and inspect tenant-scoped MCP server definitions now, with artifact signing, sharing, compatibility evidence, and revocation planned.",
    summary:
      "The current registry preview tracks server metadata and version pins. It does not yet provide a complete artifact or skill lifecycle.",
    signal: "Provenance over popularity",
    stage: "Preview",
    capabilities: [
      {
        title: "Multiple visibility modes",
        description:
          "Publish publicly, privately to an organization, or through an unlisted reference.",
        status: "Preview",
      },
      {
        title: "Pinned server definitions",
        description:
          "Register semantic version metadata and pin compositions to an explicit upstream version.",
        status: "Available now",
      },
      {
        title: "Compatibility evidence",
        description:
          "Attach protocol, client, authentication, and schema test results to each release.",
        status: "Planned",
      },
      {
        title: "Artifact revocation",
        description:
          "Block a compromised version or publisher without waiting for every client to update.",
        status: "Planned",
      },
    ],
    workflow: [
      {
        step: "01",
        title: "Inspect",
        description:
          "Probe capabilities, required scopes, source metadata, and transport support.",
      },
      {
        step: "02",
        title: "Verify",
        description:
          "Run compatibility and security checks against a declared release artifact.",
      },
      {
        step: "03",
        title: "Distribute",
        description:
          "Install, fork, share, or revoke the artifact through explicit policy.",
      },
    ],
    controls: [
      "Publisher identity",
      "License and source metadata",
      "Signed release checksums",
      "Security notices",
      "Fork and install lineage",
      "Organization allowlists",
    ],
  },
  {
    slug: "identity",
    eyebrow: "Identity plane",
    title: "Carry real identity all the way to the tool call.",
    description:
      "Issue scoped gateway sessions today and evaluate Better Auth federation wiring, while connected accounts and production claim mapping remain planned.",
    summary:
      "The identity preview binds authenticated subjects and service principals to roles, organization context, and short-lived MCP sessions. Live provider validation and upstream credential brokering remain open.",
    signal: "A principal, not a bearer token",
    stage: "Preview",
    capabilities: [
      {
        title: "Workforce identity wiring",
        description:
          "Configure Better Auth OIDC/SAML providers; live enterprise provider and group/claim mapping tests remain outstanding.",
        status: "Preview",
      },
      {
        title: "Lifecycle provisioning",
        description:
          "Target open SCIM user and group lifecycle management with comprehensive credential invalidation.",
        status: "Planned",
      },
      {
        title: "Connected accounts",
        description:
          "Broker approved OAuth, API-key, and service-account connections per identity and environment.",
        status: "Planned",
      },
      {
        title: "Scoped sessions",
        description:
          "Issue short-lived gateway sessions for a precise composition, principal, and policy context.",
        status: "Available now",
      },
    ],
    workflow: [
      {
        step: "01",
        title: "Authenticate",
        description:
          "Resolve the workforce user, workload, or service principal at the control plane.",
      },
      {
        step: "02",
        title: "Bind",
        description:
          "Attach organization roles, groups, claims, and approved connected accounts.",
      },
      {
        step: "03",
        title: "Issue",
        description:
          "Mint a short-lived data-plane session with explicit audience and scope.",
      },
    ],
    controls: [
      "OIDC and SAML SSO",
      "SCIM directories",
      "Group-to-role mapping",
      "Service principals",
      "Credential references",
      "Revocation and session expiry",
    ],
  },
  {
    slug: "policy",
    eyebrow: "Decision plane",
    title: "Control discovery and execution with the same decision.",
    description:
      "Hide disallowed capabilities before discovery and enforce the decision again when a caller attempts execution.",
    summary:
      "The current policy slice supports draft authoring, linting, simulation, single-active activation, discovery filtering, and deterministic execution decisions. Live distributed-target validation remains preview work.",
    signal: "Default deny, explained",
    stage: "Preview",
    capabilities: [
      {
        title: "Capability filtering",
        description:
          "Shape tools/list for each scoped principal; resources, prompts, and skills remain planned protocol surfaces.",
        status: "Available now",
      },
      {
        title: "Execution enforcement",
        description:
          "Re-evaluate policy at invocation so hidden tools cannot be called by guessing a name.",
        status: "Available now",
      },
      {
        title: "Human approval",
        description:
          "Pause sensitive actions and bind a pending record to the exact request; independent decision and resume are not shipped.",
        status: "Preview",
      },
      {
        title: "Decision simulation",
        description:
          "Test a principal and action before deployment with a trace of every matched rule.",
        status: "Available now",
      },
    ],
    workflow: [
      {
        step: "01",
        title: "Describe",
        description:
          "Express subjects, capabilities, conditions, limits, and approval requirements.",
      },
      {
        step: "02",
        title: "Simulate",
        description:
          "Inspect the allow or deny result and the exact rules that produced it.",
      },
      {
        step: "03",
        title: "Enforce",
        description:
          "Apply the versioned policy at discovery, routing, and execution boundaries.",
      },
    ],
    controls: [
      "Role and group bindings",
      "Data classification rules",
      "Rate and concurrency limits",
      "Egress restrictions",
      "Time-bound approvals",
      "Decision audit trail",
    ],
  },
  {
    slug: "routing",
    eyebrow: "Runtime plane",
    title: "Route deterministically, then fail explicitly.",
    description:
      "Preserve explicit upstream selection and bounded failure behavior today; health, geography, residency, cost, and failover routing are planned.",
    summary:
      "The gateway currently dispatches to an explicit eligible member and avoids replay after an ambiguous side effect. A full route evaluator is not yet implemented.",
    signal: "No invisible fallback",
    stage: "Planned",
    capabilities: [
      {
        title: "Context-aware rules",
        description:
          "Match principal attributes, environment, region, capability, and request metadata.",
        status: "Planned",
      },
      {
        title: "Health-aware selection",
        description:
          "Exclude unhealthy deployments using current schema probes and health samples.",
        status: "Planned",
      },
      {
        title: "Failure isolation",
        description:
          "Bound requests, responses, redirects, cancellation, and timeouts; circuit breakers and concurrency bulkheads remain planned.",
        status: "Preview",
      },
      {
        title: "Safe retries",
        description:
          "Do not replay an ambiguous post-dispatch side effect; a complete idempotency and failover ledger remains planned.",
        status: "Preview",
      },
    ],
    workflow: [
      {
        step: "01",
        title: "Qualify",
        description:
          "Filter upstreams by policy, identity, capability, environment, and health.",
      },
      {
        step: "02",
        title: "Select",
        description:
          "Evaluate ordered deterministic rules against the remaining candidates.",
      },
      {
        step: "03",
        title: "Execute",
        description:
          "Propagate cancellation and correlation while enforcing runtime limits.",
      },
    ],
    controls: [
      "Ordered routing rules",
      "Circuit breakers",
      "Concurrency bulkheads",
      "Cancellation propagation",
      "Retry classification",
      "Explicit unavailable errors",
    ],
  },
  {
    slug: "observability",
    eyebrow: "Evidence plane",
    title: "Trace the decision, not just the HTTP request.",
    description:
      "Understand payload-free MCP usage, latency, client attribution, policy decisions, approvals, and audit-linked session flows from one tenant-scoped surface.",
    summary:
      "Usage analytics and the tamper-evident audit chain are separate by design: analytics is high-volume and fail-open, while audit evidence remains fail-closed. OpenTelemetry, alerts, SIEM delivery, SLOs, and external anchoring remain roadmap work.",
    signal: "Metadata by default",
    stage: "Preview",
    capabilities: [
      {
        title: "Usage and latency",
        description:
          "Graph tool attempts, denials, errors, total and upstream latency, reported MCP clients, identities, and sessions without storing arguments or results.",
        status: "Preview",
      },
      {
        title: "Append-only audit",
        description:
          "Record tenant-scoped, redacted identity, policy, target, and outcome metadata in a sequence/hash-linked chain.",
        status: "Available now",
      },
      {
        title: "Governance insights",
        description:
          "Inspect matched-rule hits, zero-hit rules, denial hotspots, approval latency, discovery conversion, unused visible tools, and tool-to-tool flows.",
        status: "Preview",
      },
      {
        title: "Open export",
        description:
          "Export tenant-filtered analytics as hardened CSV or JSON. Standards-based telemetry and SIEM push delivery remain planned.",
        status: "Preview",
      },
    ],
    workflow: [
      {
        step: "01",
        title: "Observe",
        description:
          "Capture one strict, payload-free fact at each discovery, decision, approval, session, and terminal call boundary.",
      },
      {
        step: "02",
        title: "Investigate",
        description:
          "Move from trends to a tool, subject ID, or session timeline and its request-correlated audit receipt.",
      },
      {
        step: "03",
        title: "Tune",
        description:
          "Use rule hits, denials, visible-but-unused tools, and flows to refine least-privilege policy.",
      },
    ],
    controls: [
      "Usage and latency graphs",
      "Live polling feed",
      "Append-only audit events",
      "CSV and JSON export",
      "Payload-free dimensions",
      "Configurable retention",
    ],
  },
  {
    slug: "on-prem",
    eyebrow: "Operations plane",
    title: "Run the same control plane inside your boundary.",
    description:
      "Build the portable Node and web images and render the Helm chart without a managed cloud dependency; production cluster proof is still pending.",
    summary:
      "On-prem is a first-class open deployment target. The chart and runbooks are a preview until live install, recovery, upgrade, and air-gap tests pass.",
    signal: "No license server. No required egress.",
    stage: "Preview",
    capabilities: [
      {
        title: "Portable deployment",
        description:
          "Build Docker images, render Compose, and lint/render Helm profiles; runtime cluster validation remains pending.",
        status: "Preview",
      },
      {
        title: "Existing infrastructure",
        description:
          "Render external MongoDB, Secret, Ingress, certificate, and network-policy configuration; vault and telemetry integration are planned.",
        status: "Preview",
      },
      {
        title: "Lifecycle operations",
        description:
          "Use checked-in operational scripts and runbooks; live backup, restore, upgrade, and rollback proof remains outstanding.",
        status: "Preview",
      },
      {
        title: "Restricted environments",
        description:
          "Target disconnected operation with mirrored, signed artifacts after the release and air-gap test gates pass.",
        status: "Planned",
      },
    ],
    workflow: [
      {
        step: "01",
        title: "Preflight",
        description:
          "Validate storage, DNS, ingress, certificates, secrets, and identity before install.",
      },
      {
        step: "02",
        title: "Install",
        description:
          "Render reviewed Helm values; deploy pinned and signed artifacts after the release gates exist.",
      },
      {
        step: "03",
        title: "Operate",
        description:
          "Use documented backup, restore, upgrade, rollback, and diagnostic runbooks.",
      },
    ],
    controls: [
      "Docker Compose evaluation",
      "Production-oriented Helm target",
      "Air-gapped artifact mirroring",
      "External secret providers",
      "Backup and restore jobs",
      "LTS release channels",
    ],
  },
];

export const productLinks = productPages.map(({ slug, title }) => ({
  href: `/product/${slug}`,
  label: title.split(".")[0] ?? slug,
  shortLabel:
    slug === "on-prem" ? "On-prem" : slug.charAt(0).toUpperCase() + slug.slice(1),
}));

export const publicNavigation = [
  { href: "/product/composer", label: "Product" },
  { href: "/cloud", label: "Managed cloud" },
  { href: "/open-source", label: "Open source" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/enterprise", label: "Enterprise" },
];

export const platformLayers = [
  {
    index: "01",
    title: "Compose",
    detail: "Servers + skills",
  },
  {
    index: "02",
    title: "Govern",
    detail: "Identity + policy",
  },
  {
    index: "03",
    title: "Route",
    detail: "Health + context",
  },
  {
    index: "04",
    title: "Observe",
    detail: "Trace + audit",
  },
];
