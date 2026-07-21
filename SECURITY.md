# Security policy

LiteMCP Composer is security-sensitive infrastructure. Please do not open a
public issue for a suspected vulnerability.

## Reporting

Use GitHub's private vulnerability reporting feature on this repository. Include
the affected version, deployment topology, reproduction steps, impact, and any
suggested mitigation. Do not include live credentials or customer data.

We will acknowledge a complete report as soon as maintainers are available,
coordinate remediation and disclosure with the reporter, and publish an
advisory when users need to act. Until a formal support policy is announced,
this project does not promise a response-time SLA.

## Supported versions

The project is currently pre-1.0. Only the latest commit and latest published
release receive community security fixes. A commercial LTS policy has not yet
been finalized.

## Deployment responsibility

Read [`docs/security/threat-model.md`](./docs/security/threat-model.md),
[`docs/security/credential-handling.md`](./docs/security/credential-handling.md),
and [`docs/known-limitations.md`](./docs/known-limitations.md) before exposing a
deployment to untrusted networks. The demonstration mode, in-memory store, KV
single-writer flow, and local stdio supervisor are not production security
boundaries.
