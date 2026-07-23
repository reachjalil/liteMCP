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
import type { Collection, Db, Filter, MongoClient } from "mongodb";

export * from "./analytics.js";

type MongoStoredDocument = StoredDocument & {
  _id: string;
  collection: CollectionName;
};

const internalId = (tenantId: string, collection: CollectionName, id: string) =>
  `${tenantId}:${collection}:${id}`;

const withoutInternalFields = <T extends StoredDocument>(
  value: MongoStoredDocument
): T => {
  const { _id: _ignoredId, collection: _ignoredCollection, ...document } = value;
  return document as T;
};

export class MongoDocumentStore implements DocumentStore {
  readonly capabilities: StoreCapabilities = {
    driver: "mongodb",
    consistency: "strong",
    atomicCompareAndSwap: true,
    transactions: true,
  };

  readonly #documents: Collection<MongoStoredDocument>;

  constructor(
    database: Db,
    readonly client?: MongoClient
  ) {
    this.#documents = database.collection<MongoStoredDocument>("litemcp_documents");
  }

  async ensureIndexes() {
    await Promise.all([
      this.#documents.createIndex(
        { tenantId: 1, collection: 1, id: 1 },
        { unique: true, name: "tenant_collection_id" }
      ),
      this.#documents.createIndex(
        { tenantId: 1, collection: 1, updatedAt: -1 },
        { name: "tenant_collection_updated" }
      ),
    ]);
  }

  async get<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    id: string
  ): Promise<T | null> {
    const value = await this.#documents.findOne({
      _id: internalId(tenantId, collection, id),
      tenantId,
      collection,
    });
    return value ? withoutInternalFields<T>(value) : null;
  }

  async list<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    options: ListOptions = {}
  ): Promise<ListResult<T>> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1_000);
    const cursorId = options.cursor
      ? Buffer.from(options.cursor, "base64url").toString("utf8")
      : undefined;
    const filter: Filter<MongoStoredDocument> = {
      tenantId,
      collection,
      ...(options.idPrefix
        ? {
            id: {
              $regex: `^${options.idPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
            },
          }
        : {}),
      ...(cursorId ? { _id: { $gt: cursorId } } : {}),
    };
    const values = await this.#documents
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit + 1)
      .toArray();
    const hasNext = values.length > limit;
    const page = hasNext ? values.slice(0, limit) : values;
    const last = page.at(-1);
    return {
      items: page.map((value) => withoutInternalFields<T>(value)),
      ...(hasNext && last
        ? { nextCursor: Buffer.from(last._id).toString("base64url") }
        : {}),
    };
  }

  async put<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    document: T,
    options: PutOptions = {}
  ): Promise<T> {
    if (document.tenantId !== tenantId) throw new TenantBoundaryError();
    const value: MongoStoredDocument = {
      ...document,
      _id: internalId(tenantId, collection, document.id),
      collection,
    };
    if (options.expectedRevision === null) {
      try {
        await this.#documents.insertOne(value);
        return document;
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          throw new StoreConflictError(`${collection}/${document.id} exists.`);
        }
        throw error;
      }
    }
    if (typeof options.expectedRevision === "number") {
      const result = await this.#documents.replaceOne(
        {
          _id: value._id,
          tenantId,
          collection,
          revision: options.expectedRevision,
        },
        value
      );
      if (result.matchedCount !== 1) {
        throw new StoreConflictError(`${collection}/${document.id} revision changed.`);
      }
      return document;
    }
    await this.#documents.replaceOne({ _id: value._id, tenantId, collection }, value, {
      upsert: true,
    });
    return document;
  }

  async delete(
    tenantId: string,
    collection: CollectionName,
    id: string,
    options: PutOptions = {}
  ): Promise<boolean> {
    const result = await this.#documents.deleteOne({
      _id: internalId(tenantId, collection, id),
      tenantId,
      collection,
      ...(typeof options.expectedRevision === "number"
        ? { revision: options.expectedRevision }
        : {}),
    });
    if (result.deletedCount === 0 && typeof options.expectedRevision === "number") {
      const existing = await this.get(tenantId, collection, id);
      if (existing) {
        throw new StoreConflictError(`${collection}/${id} revision changed.`);
      }
    }
    return result.deletedCount === 1;
  }
}
