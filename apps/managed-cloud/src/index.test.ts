import { describe, expect, it } from "vitest";

import { getCanonicalRedirect, isSafeDemoOrigin } from "./index.js";

describe("managed-cloud demo guard", () => {
  it("allows only loopback origins", () => {
    expect(isSafeDemoOrigin("http://localhost:8787")).toBe(true);
    expect(isSafeDemoOrigin("http://studio.localhost:8787")).toBe(true);
    expect(isSafeDemoOrigin("http://127.0.0.1:8787")).toBe(true);
    expect(isSafeDemoOrigin("https://litemcpcomposer.com")).toBe(false);
    expect(isSafeDemoOrigin("not-a-url")).toBe(false);
  });
});

describe("managed-cloud canonical domain", () => {
  it("redirects the www route to the configured apex origin", () => {
    expect(
      getCanonicalRedirect(
        "https://www.litemcpcomposer.com/docs?source=www",
        "https://litemcpcomposer.com"
      )
    ).toBe("https://litemcpcomposer.com/docs?source=www");
    expect(
      getCanonicalRedirect(
        "https://litemcpcomposer.com/docs",
        "https://litemcpcomposer.com"
      )
    ).toBeUndefined();
  });
});
