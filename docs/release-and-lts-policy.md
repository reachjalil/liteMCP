# Release and LTS policy

## Current policy

LiteMCP Composer is pre-1.0. Releases may change contracts while the product and
conformance suites stabilize. Breaking changes must be called out in the
changelog and include a migration path when persisted data or exported
configuration is affected.

Community security and correctness fixes target the latest released minor line.
There is no published long-term-support duration or response-time SLA yet.

## Intended stable policy

Before 1.0, the project will publish:

- a compatibility window for MCP, API, configuration, and storage schemas;
- signed images, packages, checksums, SBOMs, and provenance;
- supported Kubernetes, MongoDB, Node.js, and Cloudflare runtime versions;
- upgrade, rollback, export/import, and disaster-recovery release gates;
- an LTS calendar and severity-based security response policy.

Commercial LTS may fund backports, release qualification, and operational
support. All fixes and product capabilities remain in the Apache-2.0 repository.
