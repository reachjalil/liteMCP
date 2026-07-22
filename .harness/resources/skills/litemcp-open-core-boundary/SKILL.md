---
name: litemcp-open-core-boundary
description: Review or implement changes that affect LiteMCP's Apache-2.0 public product, private managed-cloud control plane, licensing, billing, customer management, operated-service integrations, package/repository dependencies, release pairing, or claims about self-hosting and managed cloud. Use for boundary moves, new private seams, public/private API contracts, or changes to OPEN_CORE.md and its ADR.
---

# LiteMCP Open-Core Boundary

Keep the public repository genuinely usable and self-hostable while allowing a
private operated-service control plane to integrate through explicit, versioned
seams. Historical Apache-2.0 grants and public functionality are not revoked by
moving future hosted implementation.

## Authority

Read `OPEN_CORE.md`, `docs/adr/0001-open-product-core-hosted-control-plane.md`,
`ARCHITECTURE.md`, `GOVERNANCE.md`, `SECURITY.md`, and `SUPPORT.md`. Those files
define the current boundary; do not infer a new licensing policy from a code
move or private repository name.

## Boundary tests

For each change, answer:

- Can a user build, configure, run, secure, observe, back up, upgrade, and extend
  the on-prem product without private code, a license server, billing, call-home,
  or an operated LiteMCP account?
- Is shared protocol, contract, SDK, migration, or deployment behavior kept in
  the public repo when self-hosters need it?
- Does private code own only operated-service concerns such as fleet/customer
  management, commercial entitlements, staff tooling, incident coordination,
  managed rollout, or vendor integrations?
- Is the seam explicit, least-privilege, tenant-bound, versioned, testable, and
  free of private package imports in public code?
- Are compatibility, version skew, release pairing, failure isolation, and
  rollback documented without leaking customer or proprietary details?
- Do website, pricing, README, status, limitations, and support claims match the
  implementation that is actually public?

## Change workflow

1. Map files, APIs, schemas, operational ownership, and user-visible behavior on
   both sides of the seam.
2. Keep or introduce a portable public interface before private integration.
   Public code must degrade honestly when an operated-service capability is
   absent; it must not silently phone home.
3. Add contract and compatibility tests at the public seam. Avoid a sibling
   checkout or private package as a public build/test prerequisite.
4. Update the boundary ADR and governance/security/support docs for a material
   change. Also update `OPEN_CORE.md`, `ARCHITECTURE.md`,
   `IMPLEMENTATION_STATUS.md`, `docs/known-limitations.md`, and relevant
   README/site claims when behavior or product positioning changes. Boundary
   decisions apply prospectively.
5. Validate the public repo from a clean checkout with only documented public
   dependencies and configuration.
6. If the sibling `../liteMCP-cloud` is present and explicitly in scope, inspect
   its `docs/open-core-boundary.md`, `core.lock.json`, and `vendor/litemcp`
   gitlink. Run `scripts/verify-core-bridge.mjs`, require the gitlink and lock to
   name the exact committed public SHA, and validate both repositories. Do not
   assume authorization to commit or push either repository.
7. Report which capabilities remain public, which operated-service behavior is
   private, and any paired-version requirement.

Do not copy private customer data, secrets, proprietary source, or internal
deployment configuration into this repository while documenting the seam.
