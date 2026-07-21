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

const keyFor = (tenantId: string, collection: CollectionName, id: string) =>
  `v1/${encodeURIComponent(tenantId)}/${collection}/${encodeURIComponent(id)}`;

const prefixFor = (tenantId: string, collection: CollectionName) =>
  `v1/${encodeURIComponent(tenantId)}/${collection}/`;

/**
 * Cloudflare KV adapter for the edge deployment.
 *
 * KV is intentionally surfaced as eventually consistent. High-contention
 * policy/auth mutations are serialized through the control-plane operation
 * journal; the production target is the same contract backed by a per-tenant
 * Durable Object. This adapter never claims transactional semantics.
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
