# `@litemcp/storage`

The portable NoSQL storage contract used by product services.

`DocumentStore` requires tenant-scoped reads, cursor listing, revision-aware
writes, explicit consistency capabilities, and tenant-boundary validation. The
included memory adapter is deterministic and useful for tests and the explicit
local demo; it is not durable production storage.

Adapters must report their real guarantees. An eventually consistent adapter
must never present a check-then-write operation as an atomic transaction.
