# `@litemcp/adapter-cloudflare`

Workers KV implementation of the portable `DocumentStore`.

This adapter is intentionally honest about KV semantics: consistency is
eventual, compare-and-swap is not atomic, and transactions are unavailable. Use
it for the managed cloud evaluation/read-model path. Security-sensitive
multi-writer mutations require a per-tenant serialized coordinator before the
cloud topology is production-ready.
