import { describe, expect, it } from "vitest";

import { parseArguments } from "./index.js";

describe("parseArguments", () => {
  it("parses values and boolean flags without executing commands", () => {
    expect(
      parseArguments(["policy-test", "--tool", "finance.issue_refund", "--json"])
    ).toEqual({
      command: "policy-test",
      flags: { tool: "finance.issue_refund", json: true },
    });
  });
});
