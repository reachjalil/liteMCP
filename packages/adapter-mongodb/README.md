# `@litemcp/adapter-mongodb`

MongoDB implementation of the portable `DocumentStore` for Node.js and
Kubernetes deployments.

Documents use tenant-qualified IDs and indexes. Revision writes use conditional
replacement, and production installations should use a replica set so
transactions, reliable failover, backup, and restore procedures are available.

## Insight Plane

`MongoAnalyticsStore` implements both `AnalyticsSink` and `AnalyticsQuery` for
self-hosted deployments. `ensureMongoAnalyticsCollection` creates
`usage_events` as a MongoDB time-series collection with:

- `ts` as the time field and `{ tenantId }` as the metadata field;
- configurable `expireAfterSeconds` retention (90 days by default);
- tenant/time, tenant/session/time, and tenant/event-type/time indexes.

Emission validates the strict payload-free `UsageEvent`, then enters a bounded
in-process queue. Queue overflow, invalid events, setup failures, and batch
write failures are counted in `store.stats`; `recordUsage` and `flush` never
reject because of those failures. The queue is intentionally lossy and
fail-open—durable compliance evidence remains in the audit chain.

Queries perform a tenant-and-time bounded Mongo read and use the portable
`@litemcp/analytics` aggregators. `maxQueryRangeMs` and `maxQueryEvents` protect
the process from unbounded scans. Query limit or database failures do reject and
should be translated to the analytics API's problem response.
