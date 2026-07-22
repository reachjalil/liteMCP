import { DurableObject } from "cloudflare:workers";
import {
  type CollectionName,
  type DocumentStore,
  type ListOptions,
  type ListResult,
  type PutOptions,
  type StoreCapabilities,
  StoreConflictError,
  type StoredDocument,
  TenantBoundaryError,
} from "@litemcp/storage";

export * from "./analytics.js";

export const authoritativeCollectionNames = [
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
] as const satisfies readonly CollectionName[];

const authoritativeCollections = new Set<CollectionName>(authoritativeCollectionNames);

export const isAuthoritativeCollection = (
  collection: CollectionName
): collection is (typeof authoritativeCollectionNames)[number] =>
  authoritativeCollections.has(collection);

const keyFor = (tenantId: string, collection: CollectionName, id: string) =>
  `v1/${encodeURIComponent(tenantId)}/${collection}/${encodeURIComponent(id)}`;

const prefixFor = (tenantId: string, collection: CollectionName) =>
  `v1/${encodeURIComponent(tenantId)}/${collection}/`;

/**
 * Cloudflare KV adapter for the edge deployment.
 *
 * KV is intentionally surfaced as eventually consistent. This class remains
 * available for KV-only deployments; managed cloud uses
 * `CloudflareHybridDocumentStore` to move authority data into per-tenant
 * Durable Objects. This adapter never claims transactional semantics.
 */
export class CloudflareKvDocumentStore implements DocumentStore {
  readonly capabilities: StoreCapabilities = {
    driver: "cloudflare-kv",
    consistency: "eventual",
    atomicCompareAndSwap: false,
    transactions: false,
  };

  constructor(private readonly kv: KVNamespace) {}

  async get<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    id: string
  ): Promise<T | null> {
    const value = await this.kv.get<T>(keyFor(tenantId, collection, id), "json");
    if (!value || value.tenantId !== tenantId) return null;
    return value;
  }

  async list<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    options: ListOptions = {}
  ): Promise<ListResult<T>> {
    const prefix = `${prefixFor(tenantId, collection)}${encodeURIComponent(
      options.idPrefix ?? ""
    )}`;
    const listed = await this.kv.list({
      prefix,
      limit: Math.min(Math.max(options.limit ?? 100, 1), 1_000),
      ...(options.cursor ? { cursor: options.cursor } : {}),
    });
    const values = await Promise.all(
      listed.keys.map((key) => this.kv.get<T>(key.name, "json"))
    );
    const items: T[] = [];
    for (const value of values) {
      if (value && value.tenantId === tenantId) items.push(value as T);
    }
    items.sort((left, right) => left.id.localeCompare(right.id));
    return {
      items,
      ...(!listed.list_complete && listed.cursor ? { nextCursor: listed.cursor } : {}),
    };
  }

  async put<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    document: T,
    options: PutOptions = {}
  ): Promise<T> {
    if (document.tenantId !== tenantId) throw new TenantBoundaryError();
    if (options.expectedRevision !== undefined) {
      const current = await this.get(tenantId, collection, document.id);
      if (options.expectedRevision === null && current) {
        throw new StoreConflictError(`${collection}/${document.id} exists.`);
      }
      if (
        typeof options.expectedRevision === "number" &&
        current?.revision !== options.expectedRevision
      ) {
        throw new StoreConflictError(`${collection}/${document.id} revision changed.`);
      }
    }
    await this.kv.put(
      keyFor(tenantId, collection, document.id),
      JSON.stringify(document)
    );
    return document;
  }

  async delete(
    tenantId: string,
    collection: CollectionName,
    id: string,
    options: PutOptions = {}
  ): Promise<boolean> {
    const current = await this.get(tenantId, collection, id);
    if (!current) return false;
    if (
      typeof options.expectedRevision === "number" &&
      current.revision !== options.expectedRevision
    ) {
      throw new StoreConflictError(`${collection}/${id} revision changed.`);
    }
    await this.kv.delete(keyFor(tenantId, collection, id));
    return true;
  }
}

const authorityOrigin = "https://tenant-authority.internal";

type AuthorityErrorBody = {
  code?: unknown;
  message?: unknown;
};

type AuthorityListBody<T extends StoredDocument> = {
  items: T[];
  nextCursor?: string;
};

const authorityUrl = (
  path: "/document" | "/documents",
  tenantId: string,
  collection: CollectionName,
  id?: string
) => {
  const url = new URL(path, authorityOrigin);
  url.searchParams.set("tenant", tenantId);
  url.searchParams.set("collection", collection);
  if (id !== undefined) url.searchParams.set("id", id);
  return url;
};

const parseAuthorityError = async (response: Response): Promise<AuthorityErrorBody> => {
  try {
    return (await response.json()) as AuthorityErrorBody;
  } catch {
    return {};
  }
};

/**
 * Cloudflare's production store: catalog documents remain in KV while
 * authorization-critical documents are serialized by one SQLite Durable
 * Object per tenant.
 *
 * The aggregate capabilities stay conservative because callers can still use
 * eventually-consistent KV collections. Authoritative collections do provide
 * strong, atomic revision checks through `isAuthoritativeCollection`.
 */
export class CloudflareHybridDocumentStore implements DocumentStore {
  readonly capabilities: StoreCapabilities = {
    driver: "cloudflare-kv+durable-object",
    consistency: "eventual",
    atomicCompareAndSwap: false,
    transactions: false,
  };

  readonly #kvStore: CloudflareKvDocumentStore;

  constructor(
    kv: KVNamespace,
    private readonly authority: DurableObjectNamespace
  ) {
    this.#kvStore = new CloudflareKvDocumentStore(kv);
  }

  #stub(tenantId: string) {
    return this.authority.get(this.authority.idFromName(tenantId));
  }

  async #assertAuthorityResponse(response: Response): Promise<void> {
    if (response.ok) return;
    const body = await parseAuthorityError(response);
    const message =
      typeof body.message === "string"
        ? body.message
        : `Tenant authority request failed with status ${response.status}.`;
    if (response.status === 409 || body.code === "STORE_CONFLICT") {
      throw new StoreConflictError(message);
    }
    if (body.code === "TENANT_BOUNDARY_VIOLATION") {
      throw new TenantBoundaryError();
    }
    throw new Error(message);
  }

  async get<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    id: string
  ): Promise<T | null> {
    if (!isAuthoritativeCollection(collection)) {
      return this.#kvStore.get<T>(tenantId, collection, id);
    }
    const response = await this.#stub(tenantId).fetch(
      authorityUrl("/document", tenantId, collection, id)
    );
    if (response.status === 404) return null;
    await this.#assertAuthorityResponse(response);
    const value = (await response.json()) as T;
    return value.tenantId === tenantId ? value : null;
  }

  async list<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    options: ListOptions = {}
  ): Promise<ListResult<T>> {
    if (!isAuthoritativeCollection(collection)) {
      return this.#kvStore.list<T>(tenantId, collection, options);
    }
    const url = authorityUrl("/documents", tenantId, collection);
    if (options.cursor) url.searchParams.set("cursor", options.cursor);
    if (options.idPrefix !== undefined) {
      url.searchParams.set("idPrefix", options.idPrefix);
    }
    url.searchParams.set(
      "limit",
      String(Math.min(Math.max(Math.floor(options.limit ?? 100), 1), 1_000))
    );
    const response = await this.#stub(tenantId).fetch(url);
    await this.#assertAuthorityResponse(response);
    const result = (await response.json()) as AuthorityListBody<T>;
    return {
      items: result.items.filter((item) => item.tenantId === tenantId),
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    };
  }

  async put<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    document: T,
    options: PutOptions = {}
  ): Promise<T> {
    if (!isAuthoritativeCollection(collection)) {
      return this.#kvStore.put(tenantId, collection, document, options);
    }
    if (document.tenantId !== tenantId) throw new TenantBoundaryError();
    const response = await this.#stub(tenantId).fetch(
      authorityUrl("/document", tenantId, collection, document.id),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          document,
          ...(options.expectedRevision !== undefined
            ? { expectedRevision: options.expectedRevision }
            : {}),
        }),
      }
    );
    await this.#assertAuthorityResponse(response);
    return (await response.json()) as T;
  }

  async delete(
    tenantId: string,
    collection: CollectionName,
    id: string,
    options: PutOptions = {}
  ): Promise<boolean> {
    if (!isAuthoritativeCollection(collection)) {
      return this.#kvStore.delete(tenantId, collection, id, options);
    }
    const response = await this.#stub(tenantId).fetch(
      authorityUrl("/document", tenantId, collection, id),
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(options.expectedRevision !== undefined
            ? { expectedRevision: options.expectedRevision }
            : {}),
        }),
      }
    );
    if (response.status === 404) return false;
    await this.#assertAuthorityResponse(response);
    return true;
  }
}

type SqlDocumentRow = {
  document: string;
  revision: number | null;
};

type SqlTenantRow = {
  value: string;
};

class AuthorityRequestError extends Error {}

const encodeAuthorityCursor = (offset: number) => btoa(JSON.stringify({ offset }));

const decodeAuthorityCursor = (cursor: string | null) => {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(atob(cursor)) as { offset?: unknown };
    return typeof value.offset === "number" &&
      Number.isInteger(value.offset) &&
      value.offset >= 0
      ? value.offset
      : 0;
  } catch {
    return 0;
  }
};

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

const isStoredDocument = (value: unknown): value is StoredDocument =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { id?: unknown }).id === "string" &&
  typeof (value as { tenantId?: unknown }).tenantId === "string";

const expectedRevisionFrom = (
  body: Record<string, unknown>
): number | null | undefined => {
  if (!("expectedRevision" in body)) return undefined;
  const value = body.expectedRevision;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new AuthorityRequestError("expectedRevision must be a number or null.");
};

/**
 * SQLite-backed per-tenant Durable Object used by
 * `CloudflareHybridDocumentStore`. Its HTTP surface is binding-internal only.
 */
export class TenantAuthorityDurableObject extends DurableObject<Record<string, never>> {
  readonly #storage: DurableObjectStorage;
  readonly #sql: SqlStorage;
  #tenantId: string | undefined;

  constructor(state: DurableObjectState, env: Record<string, never> = {}) {
    super(state, env);
    this.#storage = state.storage;
    this.#sql = state.storage.sql;
    this.#sql.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID
    `);
    this.#sql.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        document TEXT NOT NULL,
        revision REAL,
        PRIMARY KEY (collection, id)
      ) WITHOUT ROWID
    `);
    this.#tenantId = this.#sql
      .exec<SqlTenantRow>("SELECT value FROM metadata WHERE key = 'tenant'")
      .toArray()[0]?.value;
  }

  #bindTenant(tenantId: string) {
    if (this.#tenantId) {
      if (this.#tenantId !== tenantId) throw new TenantBoundaryError();
      return;
    }
    const boundTenantId = this.#storage.transactionSync(() => {
      this.#sql.exec(
        "INSERT OR IGNORE INTO metadata (key, value) VALUES ('tenant', ?)",
        tenantId
      );
      const row = this.#sql
        .exec<SqlTenantRow>("SELECT value FROM metadata WHERE key = 'tenant'")
        .toArray()[0];
      return row?.value;
    });
    if (boundTenantId !== tenantId) throw new TenantBoundaryError();
    this.#tenantId = boundTenantId;
  }

  #readDocument(collection: CollectionName, id: string) {
    return this.#sql
      .exec<SqlDocumentRow>(
        "SELECT document, revision FROM documents WHERE collection = ? AND id = ?",
        collection,
        id
      )
      .toArray()[0];
  }

  #route(url: URL) {
    const tenantId = url.searchParams.get("tenant");
    const collection = url.searchParams.get("collection");
    if (!tenantId) throw new AuthorityRequestError("tenant is required.");
    if (!collection || !authoritativeCollections.has(collection as CollectionName)) {
      throw new AuthorityRequestError("An authoritative collection is required.");
    }
    this.#bindTenant(tenantId);
    return { tenantId, collection: collection as CollectionName };
  }

  async #put(request: Request, url: URL) {
    const { tenantId, collection } = this.#route(url);
    const id = url.searchParams.get("id");
    if (id === null) throw new AuthorityRequestError("id is required.");
    const body = (await request.json()) as Record<string, unknown>;
    const document = body.document;
    if (!isStoredDocument(document) || document.id !== id) {
      throw new AuthorityRequestError(
        "A document matching the requested id is required."
      );
    }
    if (document.tenantId !== tenantId) throw new TenantBoundaryError();
    const expectedRevision = expectedRevisionFrom(body);
    this.#storage.transactionSync(() => {
      const current = this.#readDocument(collection, id);
      if (expectedRevision === null && current) {
        throw new StoreConflictError(`${collection}/${id} exists.`);
      }
      if (
        typeof expectedRevision === "number" &&
        current?.revision !== expectedRevision
      ) {
        throw new StoreConflictError(`${collection}/${id} revision changed.`);
      }
      const revision = typeof document.revision === "number" ? document.revision : null;
      this.#sql.exec(
        `INSERT INTO documents (collection, id, document, revision)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (collection, id) DO UPDATE SET
           document = excluded.document,
           revision = excluded.revision`,
        collection,
        id,
        JSON.stringify(document),
        revision
      );
    });
    return jsonResponse(document);
  }

  async #delete(request: Request, url: URL) {
    const { collection } = this.#route(url);
    const id = url.searchParams.get("id");
    if (id === null) throw new AuthorityRequestError("id is required.");
    const body = (await request.json()) as Record<string, unknown>;
    const expectedRevision = expectedRevisionFrom(body);
    const deleted = this.#storage.transactionSync(() => {
      const current = this.#readDocument(collection, id);
      if (!current) return false;
      if (
        typeof expectedRevision === "number" &&
        current.revision !== expectedRevision
      ) {
        throw new StoreConflictError(`${collection}/${id} revision changed.`);
      }
      this.#sql.exec(
        "DELETE FROM documents WHERE collection = ? AND id = ?",
        collection,
        id
      );
      return true;
    });
    return deleted
      ? jsonResponse({ deleted: true })
      : jsonResponse({ deleted: false }, 404);
  }

  #get(url: URL) {
    const { tenantId, collection } = this.#route(url);
    const id = url.searchParams.get("id");
    if (id === null) throw new AuthorityRequestError("id is required.");
    const row = this.#readDocument(collection, id);
    if (!row) return jsonResponse({ found: false }, 404);
    const document = JSON.parse(row.document) as StoredDocument;
    if (document.tenantId !== tenantId) return jsonResponse({ found: false }, 404);
    return jsonResponse(document);
  }

  #list(url: URL) {
    const { tenantId, collection } = this.#route(url);
    const idPrefix = url.searchParams.get("idPrefix") ?? "";
    const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 100, 1),
      1_000
    );
    const offset = decodeAuthorityCursor(url.searchParams.get("cursor"));
    const rows = this.#sql
      .exec<SqlDocumentRow>(
        `SELECT document, revision FROM documents
         WHERE collection = ? AND instr(id, ?) = 1
         ORDER BY id
         LIMIT ? OFFSET ?`,
        collection,
        idPrefix,
        limit + 1,
        offset
      )
      .toArray();
    const hasMore = rows.length > limit;
    const items = rows
      .slice(0, limit)
      .map((row) => JSON.parse(row.document) as StoredDocument)
      .filter((document) => document.tenantId === tenantId);
    return jsonResponse({
      items,
      ...(hasMore ? { nextCursor: encodeAuthorityCursor(offset + items.length) } : {}),
    });
  }

  override async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/document" && request.method === "GET") {
        return this.#get(url);
      }
      if (url.pathname === "/document" && request.method === "PUT") {
        return await this.#put(request, url);
      }
      if (url.pathname === "/document" && request.method === "DELETE") {
        return await this.#delete(request, url);
      }
      if (url.pathname === "/documents" && request.method === "GET") {
        return this.#list(url);
      }
      return jsonResponse({ code: "NOT_FOUND", message: "Not found." }, 404);
    } catch (error) {
      if (error instanceof StoreConflictError) {
        return jsonResponse({ code: error.code, message: error.message }, 409);
      }
      if (error instanceof TenantBoundaryError) {
        return jsonResponse({ code: error.code, message: error.message }, 400);
      }
      if (error instanceof AuthorityRequestError) {
        return jsonResponse({ code: "BAD_REQUEST", message: error.message }, 400);
      }
      console.error("Tenant authority Durable Object request failed.", error);
      return jsonResponse(
        { code: "INTERNAL_ERROR", message: "Tenant authority request failed." },
        500
      );
    }
  }
}
