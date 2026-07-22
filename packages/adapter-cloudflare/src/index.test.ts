/// <reference types="node" />

import { DatabaseSync, type StatementSync } from "node:sqlite";

import {
  StoreConflictError,
  type StoredDocument,
  TenantBoundaryError,
} from "@litemcp/storage";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {},
}));

import {
  authoritativeCollectionNames,
  CloudflareHybridDocumentStore,
  isAuthoritativeCollection,
  TenantAuthorityDurableObject,
} from "./index.js";

type SqlBinding = string | number | null;

class NodeSqlStorage {
  readonly database = new DatabaseSync(":memory:");

  exec<T extends Record<string, SqlBinding>>(query: string, ...bindings: SqlBinding[]) {
    const statement = this.database.prepare(query);
    const rows = this.#hasResultColumns(statement)
      ? statement.all(...bindings)
      : this.#run(statement, bindings);
    return {
      toArray: () => rows as T[],
    } as SqlStorageCursor<T>;
  }

  #hasResultColumns(statement: StatementSync) {
    return statement.columns().length > 0;
  }

  #run(statement: StatementSync, bindings: SqlBinding[]) {
    statement.run(...bindings);
    return [];
  }

  close() {
    this.database.close();
  }
}

class NodeDurableObjectStorage {
  readonly sqlStorage = new NodeSqlStorage();
  readonly sql = this.sqlStorage as unknown as SqlStorage;

  transactionSync<T>(callback: () => T): T {
    this.sqlStorage.database.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.sqlStorage.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlStorage.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.sqlStorage.close();
  }
}

const createAuthority = () => {
  const storage = new NodeDurableObjectStorage();
  const authority = new TenantAuthorityDurableObject({
    storage,
  } as unknown as DurableObjectState);
  return { authority, storage };
};

class FakeDurableObjectNamespace {
  readonly requestedTenantIds: string[] = [];
  readonly #objects = new Map<string, ReturnType<typeof createAuthority>>();

  idFromName(name: string) {
    this.requestedTenantIds.push(name);
    return { name } as unknown as DurableObjectId;
  }

  get(id: DurableObjectId) {
    const name = id.name;
    if (!name) throw new Error("A named Durable Object id is required in this test.");
    let entry = this.#objects.get(name);
    if (!entry) {
      entry = createAuthority();
      this.#objects.set(name, entry);
    }
    return {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        entry.authority.fetch(new Request(input, init)),
    } as unknown as DurableObjectStub;
  }

  close() {
    for (const entry of this.#objects.values()) entry.storage.close();
  }
}

class FakeKvNamespace {
  readonly documents = new Map<string, string>();

  async get<T>(key: string, type: "json"): Promise<T | null> {
    if (type !== "json") throw new Error("Only JSON reads are supported in this test.");
    const value = this.documents.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async put(key: string, value: string) {
    this.documents.set(key, value);
  }

  async delete(key: string) {
    this.documents.delete(key);
  }

  async list(options: { prefix?: string; limit?: number; cursor?: string }) {
    const offset = Number(options.cursor ?? "0");
    const keys = [...this.documents.keys()]
      .filter((key) => key.startsWith(options.prefix ?? ""))
      .sort()
      .slice(offset, offset + (options.limit ?? 100));
    const nextOffset = offset + keys.length;
    const hasMore =
      [...this.documents.keys()].filter((key) => key.startsWith(options.prefix ?? ""))
        .length > nextOffset;
    return {
      keys: keys.map((name) => ({ name })),
      list_complete: !hasMore,
      ...(hasMore ? { cursor: String(nextOffset) } : {}),
    };
  }
}

const document = (tenantId: string, id: string, revision: number): StoredDocument => ({
  id,
  tenantId,
  revision,
});

describe("CloudflareHybridDocumentStore", () => {
  const namespaces: FakeDurableObjectNamespace[] = [];

  afterEach(() => {
    for (const namespace of namespaces) namespace.close();
    namespaces.length = 0;
  });

  const createStore = () => {
    const kv = new FakeKvNamespace();
    const namespace = new FakeDurableObjectNamespace();
    namespaces.push(namespace);
    return {
      kv,
      namespace,
      store: new CloudflareHybridDocumentStore(
        kv as unknown as KVNamespace,
        namespace as unknown as DurableObjectNamespace
      ),
    };
  };

  it("keeps catalog data in KV and sends authority data to a tenant object", async () => {
    const { kv, namespace, store } = createStore();

    await store.put(
      "tenant-a",
      "environments",
      document("tenant-a", "environment-a", 1)
    );
    await store.put("tenant-a", "sessions", document("tenant-a", "session-a", 1));

    expect(kv.documents.size).toBe(1);
    expect([...kv.documents.keys()][0]).toContain("/environments/");
    expect(namespace.requestedTenantIds).toEqual(["tenant-a"]);
    await expect(
      store.get("tenant-a", "environments", "environment-a")
    ).resolves.toEqual(document("tenant-a", "environment-a", 1));
    await expect(store.get("tenant-a", "sessions", "session-a")).resolves.toEqual(
      document("tenant-a", "session-a", 1)
    );
  });

  it("routes every security-sensitive collection through the authority", () => {
    expect(authoritativeCollectionNames).toEqual([
      "sessions",
      "session-attributions",
      "tenant-authority",
      "roles",
      "role-assignments",
      "identity-providers",
      "servers",
      "compositions",
      "policies",
      "approvals",
      "audit-heads",
      "audit-events",
      "quota-counters",
      "oauth-codes",
      "oauth-clients",
      "oauth-refresh-tokens",
      "oauth-grants",
      "service-principals",
    ]);
    for (const collection of authoritativeCollectionNames) {
      expect(isAuthoritativeCollection(collection)).toBe(true);
    }
    expect(isAuthoritativeCollection("environments")).toBe(false);
  });

  it("applies revision checks atomically", async () => {
    const { store } = createStore();
    await store.put("tenant-a", "sessions", document("tenant-a", "session-a", 1), {
      expectedRevision: null,
    });
    await expect(
      store.put("tenant-a", "sessions", document("tenant-a", "session-a", 2), {
        expectedRevision: null,
      })
    ).rejects.toBeInstanceOf(StoreConflictError);

    const updates = await Promise.allSettled([
      store.put("tenant-a", "sessions", document("tenant-a", "session-a", 2), {
        expectedRevision: 1,
      }),
      store.put("tenant-a", "sessions", document("tenant-a", "session-a", 3), {
        expectedRevision: 1,
      }),
    ]);
    expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(updates.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (updates.find((result) => result.status === "rejected") as PromiseRejectedResult)
        .reason
    ).toBeInstanceOf(StoreConflictError);
  });

  it("routes first-write-wins session attribution through tenant authority", async () => {
    const { kv, namespace, store } = createStore();
    const attribution = document("tenant-a", "session-a", 1);
    const writes = await Promise.allSettled([
      store.put("tenant-a", "session-attributions", attribution, {
        expectedRevision: null,
      }),
      store.put("tenant-a", "session-attributions", attribution, {
        expectedRevision: null,
      }),
    ]);

    expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(kv.documents.size).toBe(0);
    expect(namespace.requestedTenantIds).toEqual(["tenant-a", "tenant-a"]);
    await expect(
      store.get("tenant-a", "session-attributions", "session-a")
    ).resolves.toEqual(attribution);
  });

  it("lists by prefix with stable cursor pagination", async () => {
    const { store } = createStore();
    await Promise.all([
      store.put("tenant-a", "audit-events", document("tenant-a", "pref-b", 1)),
      store.put("tenant-a", "audit-events", document("tenant-a", "other", 1)),
      store.put("tenant-a", "audit-events", document("tenant-a", "pref-a", 1)),
    ]);

    const first = await store.list("tenant-a", "audit-events", {
      idPrefix: "pref-",
      limit: 1,
    });
    expect(first.items.map((item) => item.id)).toEqual(["pref-a"]);
    expect(first.nextCursor).toBeTypeOf("string");

    const second = await store.list("tenant-a", "audit-events", {
      idPrefix: "pref-",
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second).toEqual({ items: [document("tenant-a", "pref-b", 1)] });
  });

  it("enforces revision-aware delete and tenant isolation", async () => {
    const { store } = createStore();
    await store.put("tenant-a", "approvals", document("tenant-a", "approval-a", 2));
    await store.put("tenant-b", "approvals", document("tenant-b", "approval-a", 1));

    await expect(
      store.delete("tenant-a", "approvals", "approval-a", {
        expectedRevision: 1,
      })
    ).rejects.toBeInstanceOf(StoreConflictError);
    await expect(
      store.delete("tenant-a", "approvals", "approval-a", {
        expectedRevision: 2,
      })
    ).resolves.toBe(true);
    await expect(store.delete("tenant-a", "approvals", "approval-a")).resolves.toBe(
      false
    );
    await expect(store.get("tenant-b", "approvals", "approval-a")).resolves.toEqual(
      document("tenant-b", "approval-a", 1)
    );
    await expect(
      store.put("tenant-a", "approvals", document("tenant-b", "wrong-tenant", 1))
    ).rejects.toBeInstanceOf(TenantBoundaryError);
  });
});

describe("TenantAuthorityDurableObject", () => {
  it("pins each object to the first tenant that addresses it", async () => {
    const { authority, storage } = createAuthority();
    const first = await authority.fetch(
      new Request(
        "https://tenant-authority.internal/document?tenant=tenant-a&collection=sessions&id=missing"
      )
    );
    const crossed = await authority.fetch(
      new Request(
        "https://tenant-authority.internal/document?tenant=tenant-b&collection=sessions&id=missing"
      )
    );

    expect(first.status).toBe(404);
    expect(crossed.status).toBe(400);
    await expect(crossed.json()).resolves.toMatchObject({
      code: "TENANT_BOUNDARY_VIOLATION",
    });
    storage.close();
  });
});
