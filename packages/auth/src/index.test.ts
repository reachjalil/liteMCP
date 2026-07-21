import { describe, expect, it } from "vitest";

import { createLiteMcpAuth } from "./index.js";

describe("createLiteMcpAuth", () => {
  it("rejects weak session secrets before creating an auth instance", () => {
    expect(() =>
      createLiteMcpAuth({
        database: {} as never,
        baseURL: "http://localhost:8787",
        secret: "weak",
        trustedOrigins: ["http://localhost:4321"],
        demoMode: true,
      })
    ).toThrow("at least 32");
  });
});
