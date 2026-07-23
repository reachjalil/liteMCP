---
name: litemcp-release-qualification
description: Qualify LiteMCP release candidates, CI/CD policy, container publication, versioning, staging-to-production promotion, release evidence, dependency advisories, SBOM/provenance, and rollback. Use for tags, release workflows, image/chart/package publication, required checks, release notes, or claims that a revision is production-ready.
---

# LiteMCP Release Qualification

Evaluate one immutable candidate, not a moving branch. A release is qualified
only when its evidence, artifacts, promotion history, and claims all refer to
the same SHA and digests.

## Candidate record

Capture:

- full Git SHA and clean source state;
- server/web image digests, environment-specific managed-cloud archive SHA-256
  values, uploaded Worker version IDs, and any chart or package versions;
- CI run, dependency/secret scan, SBOM and provenance/attestation evidence;
- staging deployment and authenticated acceptance for that same candidate;
- schema migrations and forward/rollback constraints;
- production environment approval and post-deploy smoke plan;
- known limitations and unresolved security advisories.

Do not qualify `main`, `edge`, or another mutable tag by name alone.

## Gates

1. Run `pnpm check`, `pnpm harness:ci`, `pnpm python:test`,
   `pnpm ci:policy`, and the applicable deployment render, local migration, and
   dry-run checks. Harness CI must apply in the disposable checkout and prove a
   second preview contains only stable `keep`/preserved local actions.
2. Run `pnpm audit --prod --audit-level high`; an active high-severity advisory
   blocks release until upgraded or a reviewed compensating control is encoded
   as policy and evidence.
3. Require secret scanning and least-privilege, SHA-pinned workflow actions.
4. Build immutable artifacts first, scan the exact digests, then promote mutable
   aliases without rebuilding. Bind evidence and candidate tags to the CI run
   attempt, prevent older runs from moving `edge` backward, and document that
   aliases across separate image repositories cannot update atomically.
5. Require successful staging evidence for the exact candidate before
   production promotion. For managed cloud, verify the staging archive digest,
   deployed Worker version, migration set, and smoke evidence, then deploy the
   separately qualified production archive by its uploaded Worker version ID.
   Verify repository-admin environment and branch protections exist instead of
   inferring them from workflow YAML. A manual workflow dispatch still proves
   CI/staging or reruns the full qualification gates.
6. Keep release notes, `IMPLEMENTATION_STATUS.md`,
   `docs/known-limitations.md`, compatibility evidence, and requirements
   traceability truthful and synchronized.
7. Verify rollback can target an exact application version and explicitly state
   which database changes are not automatically reversible.

## Current repository caveat

Before adding npm publication, inspect workspace dependencies. Public
`@litemcp/sdk` and `@litemcp/cli` currently consume the npm-non-publishable
`@litemcp/contracts` workspace package (`private: true`); a tarball/consumer
smoke must pass and the dependency must be published, bundled, or removed before
npm automation can be called usable. This packaging limitation does not make
the Apache-2.0 contracts proprietary.

## Authority

Qualification is read-only unless the user explicitly asks to publish, tag,
deploy, change branch protection, approve an environment, or create a release.
External authorization never waives a failed gate. Stop at the blocker, report
pass/fail per gate, and do not dilute a blocker into a warning.
