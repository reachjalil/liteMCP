# Air-gapped installation

An air-gapped LiteMCP Composer installation uses the same Helm chart and application
images as a connected installation, but every artifact is mirrored into an
approved internal registry before it crosses the boundary. The application
must not depend on the LiteMCP Composer managed cloud control plane to start or serve requests.

Air-gapped does not necessarily mean zero egress. OIDC discovery, SAML identity
providers, SCIM provisioning, and remote MCP upstreams may require explicitly
approved routes. Document each route instead of allowing general internet
egress.

## Artifact inventory

Mirror and retain these artifacts:

- `ghcr.io/reachjalil/litemcp-server:<version>`;
- `ghcr.io/reachjalil/litemcp-web:<version>`;
- the `deploy/helm/litemcp` chart directory or a packaged chart;
- MongoDB images only if the customer operates MongoDB in the same boundary;
- image digests, signatures, provenance attestations, SBOMs, release notes, and
  the matching source commit.

The Helm chart has no requirement to download a database subchart. Production
MongoDB is external to the release.

## Prepare artifacts in the connected zone

Use immutable release tags and record the resolved digests:

```bash
docker pull ghcr.io/reachjalil/litemcp-server:VERSION
docker pull ghcr.io/reachjalil/litemcp-web:VERSION
docker inspect --format='{{index .RepoDigests 0}}' \
  ghcr.io/reachjalil/litemcp-server:VERSION
docker inspect --format='{{index .RepoDigests 0}}' \
  ghcr.io/reachjalil/litemcp-web:VERSION
helm lint deploy/helm/litemcp
helm package deploy/helm/litemcp --destination /secure/export
```

Export images with the organization's approved registry replication system. If
an OCI registry transfer is unavailable, `docker save` can create a transport
archive, but the archive still needs malware scanning, a checksum, encryption,
and controlled chain of custody.

## Import and configure

Import the images into an internal registry, then start from
`deploy/helm/litemcp/examples/air-gapped-values.yaml`. Set:

- both image repositories to their internal-registry locations;
- immutable image tags or digests;
- `image.*.pullPolicy` to `IfNotPresent` or `Never`, according to cluster image
  distribution;
- any required `imagePullSecrets`;
- existing Secret names for `MONGODB_URI` and `BETTER_AUTH_SECRET`;
- ingress, DNS, and certificate references that exist inside the boundary.

Render before installation:

```bash
helm template litemcp /secure/import/litemcp-chart \
  --namespace litemcp \
  --values /secure/path/air-gapped-values.yaml > /tmp/litemcp-rendered.yaml
```

Check that every rendered image uses the internal registry and that no
plaintext credential appears in the manifest.

## Network policy and DNS

The default chart policy limits inbound traffic by workload role. Customize
egress rules for the actual environment. A useful allowlist normally includes:

- cluster DNS;
- MongoDB replica-set members;
- the approved identity provider;
- explicitly configured remote MCP servers and OAuth providers;
- internal OpenTelemetry, SIEM, mail, and secrets endpoints when enabled.

Do not add a blanket `0.0.0.0/0` exception simply to make connector setup pass.
Treat each new upstream as a security change and test DNS rebinding and private
address controls at the application boundary as well.

## Offline verification

Run these checks inside the disconnected environment:

```bash
helm lint /secure/import/litemcp-chart
kubectl -n litemcp rollout status deployment --timeout=10m
kubectl -n litemcp get pods,services,networkpolicies
```

Verify web sign-in, server `/health`, one read-only MCP discovery request, one
policy denial, one approved invocation, and configuration export without any
LiteMCP Composer managed cloud endpoint reachable.

## Updating an air-gapped installation

Transfer a complete, versioned release bundle. Never mix a chart from one
release with images from another. Keep the previous bundle locally until the
new release passes smoke tests and its rollback window closes. Follow
[upgrades and rollbacks](upgrades-rollbacks.md) and take a verified backup
before changing versions.
