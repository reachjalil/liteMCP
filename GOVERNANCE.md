# Governance

LiteMCP Composer is currently maintainer-led. Design decisions are discussed in
issues and pull requests, and substantial compatibility or security changes
should be captured as architecture decisions before implementation.

The public repository is the source of truth for the Apache-2.0 product. It is
the complete, independently operable product boundary, including product
capabilities such as identity, policy, audit, analytics, the management
console, APIs, adapters, SDKs, CLI, and Docker/Kubernetes self-hosting assets.
Here, complete means operable without private code, a vendor account, a license
or billing endpoint, or mandatory call-home. It is not a claim that the pre-1.0
implementation is feature-complete or production-proven.

A separately maintained proprietary sibling owns the operated hosted service,
production infrastructure and secrets, billing and metering, service plans,
fleet and managed-client operations, commercial support grants and
entitlements, SLAs, on-call response, and compliance operations. It may depend
on the public product; public builds and runtime paths must not depend on it.

Material changes to this boundary require a public architecture decision and
an update to [`OPEN_CORE.md`](./OPEN_CORE.md). All source already published
under Apache-2.0—including the current `apps/managed-cloud` composition—keeps
that grant. Governance decisions, file movement, or later removal cannot revoke
the license for historical revisions.

As the contributor community grows, this document should evolve to define
maintainer nomination, voting, release authority, conflicts of interest, and an
appeal process.
