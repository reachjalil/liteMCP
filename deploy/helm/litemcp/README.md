# LiteMCP Composer Helm chart

This chart installs the portable LiteMCP Composer web console and API/MCP server. It
does not install MongoDB: production deployments must use a reachable MongoDB
replica set so transactions and change streams retain their documented
semantics.

## Prerequisites

- Kubernetes 1.25 or newer
- Helm 3.12 or newer
- MongoDB replica set for production
- An ingress controller when `ingress.enabled=true`
- metrics-server when either HPA is enabled

The chart currently follows the validated `edge` images in GHCR. At this
snapshot those packages are published but private, so an installation must set
`imagePullSecrets` or override both image repositories/tags with images your
cluster can pull. Production releases should pin immutable digests.

## Install

Create an operator-managed Secret. The default chart expects both keys in
`litemcp-secrets`; separate Secrets and key names are also supported.

```sh
kubectl create namespace litemcp
kubectl -n litemcp create secret generic litemcp-secrets \
  --from-literal=MONGODB_URI="$MONGODB_URI" \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -hex 32)"

helm upgrade --install litemcp ./deploy/helm/litemcp \
  --namespace litemcp \
  --set-string config.webOrigin=https://litemcp.example.com \
  --set-string config.apiOrigin=https://litemcp.example.com
```

Do not commit credential-bearing values files. `mongodb.uri` and `auth.secret`
exist for disposable local smoke tests; Helm stores those values in release
state. Prefer `mongodb.existingSecret` and `auth.existingSecret`, ideally backed
by an external-secret controller or your cluster's approved secret manager.

## Profiles

| File | Purpose |
| --- | --- |
| `examples/minimal-values.yaml` | Single-replica evaluation |
| `examples/ha-values.yaml` | HPA, disruption budgets, topology spread, TLS ingress |
| `examples/external-mongodb-values.yaml` | Separately managed MongoDB and auth Secrets |
| `examples/air-gapped-values.yaml` | Internal image registry and restricted egress |

Apply a profile with `-f`, then replace all `.example` hostnames and referenced
Secret names with values for the target cluster. `config.apiOrigin` is required
because the server returns it in generated MCP endpoints; clients must be able
to reach it. Same-origin ingress deployments normally use the public web HTTPS
origin for both values.

## Runtime contract

The server listens on `8787` and exposes `/health`. The web container listens
on `8080`. The server receives `MONGODB_URI` and `BETTER_AUTH_SECRET` from
Secret references and `WEB_ORIGIN`/`API_ORIGIN` from a ConfigMap. Demo mode is
disabled by default. The web container proxies same-origin API, auth, MCP, and
readiness requests to the release-qualified server Service.

The default ingress sends `/api` and `/mcp` to the server and `/` to the web
service. Long-lived MCP responses may require ingress-controller-specific
streaming and timeout annotations; the HA example includes nginx settings.

## Security defaults

Pods run as the non-root UID/GID declared by each shipped image (Node `1000`,
nginx `101`) with the runtime-default seccomp profile, all Linux capabilities
dropped, privilege escalation disabled, a read-only root filesystem, and no
mounted service-account token. Writable paths are bounded `emptyDir` scratch
volumes. Resource requests/limits, startup/readiness/liveness probes, rolling
updates, disruption budgets, and NetworkPolicies are enabled by default.

The generic NetworkPolicy permits inbound traffic on only the application
ports, server egress on DNS, HTTP(S), and MongoDB ports, and web egress on DNS
plus the selected server pods. Replace broad server destination rules with
cluster-specific namespace selectors, pod selectors, or CIDRs when enforcing a
strict egress policy. Remote MCP servers on custom ports require an additional
server egress rule.

## Validation

```sh
helm lint deploy/helm/litemcp
helm template litemcp deploy/helm/litemcp --namespace litemcp

for profile in deploy/helm/litemcp/examples/*.yaml; do
  helm lint deploy/helm/litemcp -f "$profile"
  helm template litemcp deploy/helm/litemcp -f "$profile" >/dev/null
done
```
