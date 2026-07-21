# `@litemcp/adapter-mongodb`

MongoDB implementation of the portable `DocumentStore` for Node.js and
Kubernetes deployments.

Documents use tenant-qualified IDs and indexes. Revision writes use conditional
replacement, and production installations should use a replica set so
transactions, reliable failover, backup, and restore procedures are available.
