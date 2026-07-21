# Deployment

LiteMCP Composer has one portable product and two hosting models: the managed cloud and a
customer-operated Node.js/Kubernetes distribution.

| Path | Use |
| --- | --- |
| [`docker-compose`](./docker-compose/) | Local evaluation with web, server, and a MongoDB replica set |
| [`docker`](./docker/) | Hardened multi-stage server and static web images |
| [`helm/litemcp`](./helm/litemcp/README.md) | Kubernetes installation with external MongoDB and existing Secrets |

Operations runbooks live in [`docs/on-prem`](../docs/on-prem/). Start with the
installation guide, then read air-gap, backup/restore, and upgrade/rollback
before production use.

```bash
pnpm docker:up
pnpm helm:lint
pnpm helm:template
```

No deployment command proves production readiness by itself. Record the exact
image, migration, configuration, smoke-test, backup, and rollback evidence for
each environment.
