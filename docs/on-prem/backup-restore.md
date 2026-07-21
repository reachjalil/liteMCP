# Backup and restore

MongoDB holds LiteMCP Composer configuration and identity state. A backup must therefore
be handled as sensitive credential-adjacent material even when connector tokens
are stored in an external vault. Encrypt backups, restrict access, and apply the
same residency and retention rules as the production deployment.

The repository scripts use MongoDB archive format with gzip for the `litemcp`
database. They never print the database URI. They do not back up Kubernetes Secrets,
TLS keys, external vault contents, object storage, identity-provider settings,
or cluster configuration.

## Define recovery objectives

Before production launch, record:

- recovery point objective and backup frequency;
- recovery time objective and restore owner;
- retention schedule and legal holds;
- encryption and key-rotation owner;
- off-site or cross-region copy policy;
- quarterly restore-drill evidence.

The logical dump is not a cross-collection point-in-time snapshot. Quiesce
writes while it runs when the recovery plan requires application-level
consistency. For large production replica sets, coordinate filesystem or
managed-service snapshots with the MongoDB operator. The included script is
appropriate for logical backups and smaller installations; it is not a
replacement for a database vendor's continuous backup system.

## Docker Compose backup

The stack must be running and the MongoDB replica set healthy:

```bash
./scripts/backup.sh --mode compose --output-dir /secure/litemcp-backups
```

The script runs `mongodump` inside the MongoDB container, writes a restrictive
archive, and creates a SHA-256 checksum when a checksum utility is available.
Copy both files to encrypted storage outside the Docker host.

## External MongoDB backup

Install a MongoDB Database Tools version compatible with the server. Provide
the URI through the process environment rather than a committed file. MongoDB
Database Tools may expose the expanded URI to same-host process inspection, so
run the backup on a dedicated administration host with restricted access:

```bash
export MONGODB_URI='set-this-through-your-secret-manager'
./scripts/backup.sh --mode external --output-dir /secure/litemcp-backups
unset MONGODB_URI
```

Use a dedicated backup principal with only the permissions required by
`mongodump`. On shared clusters, confirm the database scope with the database
administrator.

## Restore safety gates

Restore drops and recreates the `litemcp.*` namespaces. It requires the literal
confirmation `--confirm-restore litemcp`; omission is a hard stop. Restore first
into an isolated validation environment whenever possible.

Before restoring production:

1. Confirm the target cluster, database, tenant scope, archive timestamp, and
   application version.
2. Verify the archive checksum and decryption.
3. Take a fresh backup of the current state.
4. Stop server writes and drain MCP traffic. The static web workload may stay
   online behind a maintenance response.
5. Record the change ticket and rollback decision owner.

## Docker Compose restore

Stop the server while leaving MongoDB running:

```bash
docker compose \
  --env-file deploy/docker-compose/.env \
  -f deploy/docker-compose/compose.yaml \
  stop server

./scripts/restore.sh \
  --mode compose \
  --archive /secure/litemcp-backups/litemcp-mongodb-TIMESTAMP.archive.gz \
  --confirm-restore litemcp

docker compose \
  --env-file deploy/docker-compose/.env \
  -f deploy/docker-compose/compose.yaml \
  up --detach server
```

## External MongoDB restore

Scale the server workload to zero or otherwise block writes, then run:

```bash
export MONGODB_URI='set-this-through-your-secret-manager'
./scripts/restore.sh \
  --mode external \
  --archive /secure/litemcp-backups/litemcp-mongodb-TIMESTAMP.archive.gz \
  --confirm-restore litemcp
unset MONGODB_URI
```

For Kubernetes, scaling and resuming the server can be performed with the
deployment controller used by the release. Capture the current replica count
before changing it; do not assume it is one.

## Post-restore validation

Do not resume normal traffic until all checks pass:

- MongoDB replica-set health and replication lag;
- server `/health` and pod readiness;
- Better Auth session creation with a test identity;
- organization and environment boundaries;
- gateway, policy, upstream, and connector counts;
- one configuration export and one read-only MCP discovery call;
- audit and OpenTelemetry delivery;
- absence of unexpected cross-tenant records.

Existing sessions and encrypted records may depend on the matching
`BETTER_AUTH_SECRET`, vault keys, or KMS versions. Restoring the database without
those materials can make data unusable. Escrow and rotate those secrets under a
separate, audited process; do not place them in the MongoDB backup directory.
