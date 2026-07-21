import { describe, expect, it } from "vitest";

import { createServerRuntime } from "./runtime.js";

describe("portable Node runtime", () => {
  it("starts against the in-memory demo adapter without external services", async () => {
    const runtime = await createServerRuntime({
      LITEMCP_DEMO_MODE: "true",
      API_ORIGIN: "http://localhost:8787",
      WEB_ORIGIN: "http://localhost:4321",
    });
    const response = await runtime.app.request("/health");
    expect(response.status).toBe(200);
    expect((await response.json()).storage.driver).toBe("memory");
    await runtime.close();
  });

  it("fails closed when demo mode and authentication are not configured", async () => {
    const runtime = await createServerRuntime({});
    const response = await runtime.app.request("/api/v1/overview");
    expect(response.status).toBe(503);
    const readiness = await runtime.app.request("/ready");
    expect(readiness.status).toBe(503);
    await runtime.close();
  });
});
