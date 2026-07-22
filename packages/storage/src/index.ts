export const collectionNames = [
  "organizations",
  "environments",
  "servers",
  "compositions",
  "policies",
  "roles",
  "role-assignments",
  "tenant-authority",
  "sessions",
  "session-attributions",
  "audit-events",
  "audit-heads",
  "identity-providers",
  "connected-accounts",
  "approvals",
  "service-principals",
  "oauth-clients",
  "oauth-codes",
  "oauth-refresh-tokens",
  "oauth-grants",
  "quota-counters",
  "activation-events",
  "idempotency",
] as const;

export type CollectionName = (typeof collectionNames)[number];

export type StoredDocument = {
  id: string;
  tenantId: string;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type StoreCapabilities = {
  driver: string;
  consistency: "strong" | "eventual";
  atomicCompareAndSwap: boolean;
  transactions: boolean;
};

export type ListOptions = {
  cursor?: string;
  limit?: number;
  idPrefix?: string;
};

export type ListResult<T extends StoredDocument> = {
  items: T[];
  nextCursor?: string;
};

export type PutOptions = {
  expectedRevision?: number | null;
};

export interface DocumentStore {
  readonly capabilities: StoreCapabilities;
  get<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    id: string
  ): Promise<T | null>;
  list<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    options?: ListOptions
  ): Promise<ListResult<T>>;
  put<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    document: T,
    options?: PutOptions
  ): Promise<T>;
  delete(
    tenantId: string,
    collection: CollectionName,
    id: string,
    options?: PutOptions
  ): Promise<boolean>;
}

export class StoreConflictError extends Error {
  readonly code = "STORE_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "StoreConflictError";
  }
}

export class TenantBoundaryError extends Error {
  readonly code = "TENANT_BOUNDARY_VIOLATION";

  constructor() {
    super("Document tenant does not match the requested tenant boundary.");
    this.name = "TenantBoundaryError";
  }
}

const encodeCursor = (offset: number) => btoa(JSON.stringify({ offset }));

const decodeCursor = (cursor?: string) => {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(atob(cursor)) as { offset?: unknown };
    return typeof parsed.offset === "number" && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    return 0;
  }
};

const clone = <T>(value: T): T => structuredClone(value);

export class MemoryDocumentStore implements DocumentStore {
  readonly capabilities: StoreCapabilities = {
    driver: "memory",
    consistency: "strong",
    atomicCompareAndSwap: true,
    transactions: false,
  };

  readonly #documents = new Map<string, StoredDocument>();

  #key(tenantId: string, collection: CollectionName, id: string) {
    return `${tenantId}\u0000${collection}\u0000${id}`;
  }

  async get<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    id: string
  ): Promise<T | null> {
    const value = this.#documents.get(this.#key(tenantId, collection, id));
    return value ? clone(value as T) : null;
  }

  async list<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    options: ListOptions = {}
  ): Promise<ListResult<T>> {
    const keyPrefix = `${tenantId}\u0000${collection}\u0000`;
    const idPrefix = options.idPrefix ?? "";
    const values = [...this.#documents.entries()]
      .filter(([key, document]) => {
        return (
          key.startsWith(keyPrefix) &&
          document.id.startsWith(idPrefix) &&
          document.tenantId === tenantId
        );
      })
      .map(([, value]) => clone(value as T))
      .sort((left, right) => left.id.localeCompare(right.id));
    const offset = decodeCursor(options.cursor);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1_000);
    const items = values.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return {
      items,
      ...(nextOffset < values.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
    };
  }

  async put<T extends StoredDocument>(
    tenantId: string,
    collection: CollectionName,
    document: T,
    options: PutOptions = {}
  ): Promise<T> {
    if (document.tenantId !== tenantId) throw new TenantBoundaryError();
    const key = this.#key(tenantId, collection, document.id);
    const current = this.#documents.get(key);
    if (options.expectedRevision === null && current) {
      throw new StoreConflictError(`${collection}/${document.id} already exists.`);
    }
    if (
      typeof options.expectedRevision === "number" &&
      current?.revision !== options.expectedRevision
    ) {
      throw new StoreConflictError(`${collection}/${document.id} revision changed.`);
    }
    this.#documents.set(key, clone(document));
    return clone(document);
  }

  async delete(
    tenantId: string,
    collection: CollectionName,
    id: string,
    options: PutOptions = {}
  ): Promise<boolean> {
    const key = this.#key(tenantId, collection, id);
    const current = this.#documents.get(key);
    if (!current) return false;
    if (
      typeof options.expectedRevision === "number" &&
      current.revision !== options.expectedRevision
    ) {
      throw new StoreConflictError(`${collection}/${id} revision changed.`);
    }
    return this.#documents.delete(key);
  }
}
