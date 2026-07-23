import { describe, expect, it } from "vitest";

import { CredentialCipher } from "./security.js";

describe("CredentialCipher", () => {
  it("encrypts credentials with tenant-bound authenticated encryption", async () => {
    const cipher = new CredentialCipher("a-production-master-key-that-is-long-enough");
    const envelope = await cipher.encrypt("org_alpha", "client-secret-value");

    expect(envelope).toMatch(/^enc:v1:/);
    expect(envelope).not.toContain("client-secret-value");
    await expect(cipher.decrypt("org_alpha", envelope)).resolves.toBe(
      "client-secret-value"
    );
    await expect(cipher.decrypt("org_beta", envelope)).rejects.toThrow();
  });

  it("rejects undersized deployment keys", () => {
    expect(() => new CredentialCipher("too-short")).toThrow("at least 32 bytes");
  });
});
