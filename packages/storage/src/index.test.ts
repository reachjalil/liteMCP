import { describe, expect, it } from "vitest";

import {
  MemoryDocumentStore,
  StoreConflictError,
  TenantBoundaryError,
} from "./index.js";

describe("MemoryDocumentStore", () => {
  it("enforces tenant boundaries on reads and writes", async () => {
    const store = new MemoryDocumentStore();
    await store.put("org_a", "servers", {
      id: "server_1",
      tenantId: "org_a",
      revision: 1,
    });

    expect(await store.get("org_b", "servers", "server_1")).toBeNull();
    await expect(
      store.put("org_b", "servers", {
        id: "server_2",
        tenantId: "org_a",
        revision: 1,
      })
    ).rejects.toBeInstanceOf(TenantBoundaryError);
  });

  it("uses optimistic revisions to reject lost updates", async () => {
    const store = new MemoryDocumentStore();
    const record = { id: "policy_1", tenantId: "org_a", revision: 1 };
    await store.put("org_a", "policies", record, { expectedRevision: null });

    await expect(
      store.put(
        "org_a",
        "policies",
        { ...record, revision: 2 },
        { expectedRevision: 0 }
      )
    ).rejects.toBeInstanceOf(StoreConflictError);
  });
});
