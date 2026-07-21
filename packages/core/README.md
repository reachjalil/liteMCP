# `@litemcp/core`

Portable domain services for the LiteMCP Composer control plane. The package owns demo
seeding, registry and composition workflows, deterministic policy evaluation,
scoped session issuance and revocation, approval request creation, secret-free
export, and redacted hash-chained audit records.

It depends on the `DocumentStore` port and Web-standard crypto APIs. It must not
import Cloudflare, Node server, Docker, or Kubernetes runtime APIs.
