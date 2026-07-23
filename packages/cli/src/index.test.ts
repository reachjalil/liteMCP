import { afterEach, describe, expect, it, vi } from "vitest";

import { parseArguments, readJsonInput, run } from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("parseArguments", () => {
  it("parses values and boolean flags without executing commands", () => {
    expect(
      parseArguments(["policy-test", "--tool", "finance.issue_refund", "--json"])
    ).toEqual({
      command: "policy-test",
      flags: { tool: "finance.issue_refund", json: true },
    });
  });

  it("reads inline JSON objects and rejects non-object input", async () => {
    await expect(
      readJsonInput({ input: '{"name":"Finance"}' }, "server-create")
    ).resolves.toEqual({ name: "Finance" });
    await expect(readJsonInput({ input: "[]" }, "server-create")).rejects.toThrow(
      "must be a JSON object"
    );
  });

  it("runs lifecycle commands through the SDK with explicit drift acceptance", async () => {
    let captured: Request | undefined;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = new Request(input, init);
      return new Response(
        JSON.stringify({ data: { status: "healthy" }, meta: { requestId: "test" } }),
        { headers: { "content-type": "application/json" } }
      );
    });

    await expect(
      run([
        "server-probe",
        "--api",
        "https://api.example.test",
        "--tenant",
        "org_test",
        "--id",
        "server_finance",
        "--accept-drift",
      ])
    ).resolves.toBe(0);

    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe(
      "https://api.example.test/api/v1/servers/server_finance/probe"
    );
    await expect(captured?.json()).resolves.toEqual({ acceptDrift: true });
  });

  it("binds approval decisions to the listed generation and fingerprint", async () => {
    let captured: Request | undefined;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = new Request(input, init);
      return new Response(
        JSON.stringify({ data: { status: "approved" }, meta: { requestId: "test" } }),
        { headers: { "content-type": "application/json" } }
      );
    });

    await expect(
      run([
        "approval-decide",
        "--api",
        "https://api.example.test",
        "--tenant",
        "org_test",
        "--id",
        "approval_one",
        "--decision",
        "approved",
        "--reason",
        "Reviewed against ticket FIN-42.",
        "--generation",
        "4",
        "--fingerprint",
        "b".repeat(64),
      ])
    ).resolves.toBe(0);

    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe(
      "https://api.example.test/api/v1/approvals/approval_one/decision"
    );
    await expect(captured?.json()).resolves.toEqual({
      decision: "approved",
      reason: "Reviewed against ticket FIN-42.",
      generation: 4,
      fingerprint: "b".repeat(64),
    });
  });

  it("rejects an invalid approval generation before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run([
        "approval-decide",
        "--id",
        "approval_one",
        "--decision",
        "denied",
        "--reason",
        "Request changed.",
        "--generation",
        "0",
        "--fingerprint",
        "c".repeat(64),
      ])
    ).rejects.toThrow("approval-decide --generation must be a positive integer");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
