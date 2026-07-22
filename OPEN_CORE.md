# Open product core and hosted control plane

LiteMCP Composer separates an Apache-2.0 product from the proprietary systems
used to operate a hosted service. This document defines that boundary for
contributors, users, and maintainers.

Here, **complete** means that the public product is independently operable. It
does not mean that every roadmap item is implemented or that the current
pre-1.0 release is production-proven. See
[`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) and
[`docs/known-limitations.md`](./docs/known-limitations.md) for current evidence
and limitations.

## Public Apache-2.0 product

The public repository contains the product capabilities needed to build and
operate a self-hosted LiteMCP Composer deployment:

| Boundary | Public contents |
| --- | --- |
| Portable product | MCP gateway, policy, identity, compositions, approvals, audit, analytics, contracts, and storage abstractions |
| Self-hosted applications | Management console, API, portable Node service, and local examples |
| Deployment assets | Container images, Docker Compose configuration, Kubernetes/Helm assets, and operator documentation |
| Developer and operator interfaces | TypeScript and Python SDKs, CLI, schemas, OpenAPI, and extension points |
| Cloudflare reference | The existing `apps/managed-cloud` composition and Cloudflare adapter already published under Apache-2.0 |

The public product must remain usable without:

- access to a private repository or proprietary package;
- a LiteMCP-operated account, license server, or billing endpoint;
- mandatory telemetry, remote entitlement checks, or any other call-home
  dependency; or
- a commercial support agreement.

Self-hosted operators control their runtime, configuration, credentials, and
product data. Optional integrations must be documented and explicitly enabled.

## Proprietary hosted-service sibling

A separately maintained proprietary sibling owns the service-specific work
required to run LiteMCP Composer as an operated offering:

| Boundary | Proprietary sibling responsibility |
| --- | --- |
| Operated service | Production infrastructure, service configuration, secrets, releases, incident response, and on-call operations |
| Service economics | Billing, metering, plans, invoices, and hosted-service entitlements |
| Fleet and client operations | Multi-deployment fleet management, managed upgrades, client operations, and customer-specific automation |
| Service assurance | Commercial support grants and entitlements, SLA enforcement, compliance operations, and service-specific reporting |

Those systems may consume the public product. The public product must not
depend on them. Buying the hosted service or support changes the service
relationship; it does not unlock, relicense, or complete the Apache product.

## Historical Apache grants

Everything already published from this repository under Apache-2.0 remains
available under that license. Moving, renaming, replacing, or discontinuing a
file in a later revision cannot revoke the license granted for an earlier
revision. In particular, the current `apps/managed-cloud` files are historical
Apache-licensed source. Describing their future role as a reference composition
does not relicense them or transfer those revisions into the proprietary
sibling.

New contributions accepted into this repository are Apache-2.0 contributions
under [`CONTRIBUTING.md`](./CONTRIBUTING.md). Private service credentials,
customer data, production configuration, billing integrations, and proprietary
fleet operations do not belong here.

## Changing the boundary

Any material boundary change requires a public architecture decision record
and corresponding updates to this document, governance, security, and support
guidance. Boundary changes apply prospectively and cannot alter historical
Apache-2.0 grants. The initial decision is recorded in
[`docs/adr/0001-open-product-core-hosted-control-plane.md`](./docs/adr/0001-open-product-core-hosted-control-plane.md).
