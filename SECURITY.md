# Security policy

LiteMCP Composer is security-sensitive infrastructure. Please do not open a
public issue for a suspected vulnerability.

## Reporting public-product vulnerabilities

Use GitHub's private vulnerability reporting feature on this repository. Include
the affected version, deployment topology, reproduction steps, impact, and any
suggested mitigation. Do not include live credentials or customer data.

We will acknowledge a complete report as soon as maintainers are available,
coordinate remediation and disclosure with the reporter, and publish an
advisory when users need to act. Until a formal support policy is announced,
this project does not promise a response-time SLA.

## Reporting operated-service incidents

Incidents involving the proprietary operated service, billing, a managed
client, or customer-specific infrastructure follow the private contact and
escalation channel published with that service. Do not put customer data,
service credentials, or production details in a public issue. If it is unclear
whether a report affects the public product or the operated service, use this
repository's private vulnerability reporting channel and maintainers will route
it safely.

## Supported versions

The project is currently pre-1.0. Only the latest commit and latest published
release receive community security fixes. Hosted-service response targets,
commercial support grants, and any LTS commitments are separate service terms;
they do not change access to public security fixes or the license of the public
product.

## Security boundary

The Apache-2.0 product must remain self-hostable without proprietary packages,
remote entitlement checks, mandatory telemetry, or any other call-home
dependency. The proprietary sibling may consume the public product, but the
public product must not require the sibling. Operated-service secrets, customer
data, billing systems, and fleet/client operations remain outside this public
repository. See [`OPEN_CORE.md`](./OPEN_CORE.md).

## Deployment responsibility

Read [`docs/security/threat-model.md`](./docs/security/threat-model.md),
[`docs/security/credential-handling.md`](./docs/security/credential-handling.md),
and [`docs/known-limitations.md`](./docs/known-limitations.md) before exposing a
deployment to untrusted networks. The demonstration mode, in-memory store, KV
single-writer flow, and local stdio supervisor are not production security
boundaries.
