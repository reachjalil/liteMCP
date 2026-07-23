# ADR 0001: Open product core and proprietary hosted control plane

- Status: Accepted
- Date: 2026-07-22

## Context

LiteMCP Composer must distinguish the independently usable product from the
work needed to operate that product as a commercial hosted service. Earlier
documentation described the full roadmap as Apache-2.0 and the public tree
already contains a Cloudflare composition under `apps/managed-cloud`. A new
boundary must therefore be clear about future ownership without implying that
previously published source can be made proprietary retroactively.

The repository is also pre-1.0. Calling the public product complete must
describe an operability boundary, not overstate implementation maturity or
production evidence.

## Decision

1. The public Apache-2.0 repository is the complete, independently operable
   product boundary. It contains the product capabilities, console and APIs,
   adapters, SDKs, CLI, and Docker/Kubernetes self-hosting assets.
2. A public deployment must work without proprietary packages, a vendor
   account, a license or billing server, mandatory telemetry, or any other
   call-home dependency.
3. A separately maintained proprietary sibling owns the operated hosted
   service: production infrastructure and secrets, billing and metering,
   service plans, fleet and managed-client operations, commercial support
   grants and entitlements, design-partner intake and applicant data, SLAs,
   on-call response, and compliance operations.
4. Dependencies are one-way. The proprietary sibling may consume released or
   checked-out public product code; public product builds and runtime paths may
   not depend on the sibling.
5. All source already published under Apache-2.0 keeps that grant. The existing
   `apps/managed-cloud` composition remains Apache-licensed historical and
   reference source. This decision does not remove or relicense it.
6. Material changes to this boundary require a public ADR and updates to
   [`OPEN_CORE.md`](../../OPEN_CORE.md). They operate prospectively and cannot
   revoke historical Apache-2.0 grants.

## Consequences

- Users can inspect, modify, deploy, and operate the public product without a
  commercial relationship or hidden runtime dependency.
- The hosted service can develop operational systems and service economics on
  a separate lifecycle while reusing the public product.
- Features required for the product itself must land publicly. Service-only
  concerns can remain in the proprietary sibling when the self-hosted product
  does not need them.
- Maintainers must review new dependencies, telemetry, entitlement checks, and
  deployment assumptions against the no-call-home and one-way dependency
  rules.
- Some currently public hosted-composition code may remain as historical or
  reference material even if future operated-service implementation moves to a
  sibling repository.

## Non-goals

This decision does not declare the pre-1.0 implementation feature-complete or
production-ready. It does not remove public files, require use of a hosted
service, create a license gate for self-hosting, or change the license of any
previously published revision.
