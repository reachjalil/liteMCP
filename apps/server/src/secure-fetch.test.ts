import { once } from "node:events";
import { createServer, type RequestListener, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createSecureNodeFetch, isPublicIpAddress } from "./secure-fetch.js";

const servers = new Set<Server>();

const listen = async (
  handler: RequestListener
): Promise<{ server: Server; port: number }> => {
  const server = createServer(handler);
  servers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind a TCP port.");
  }
  return { server, port: address.port };
};

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        })
    )
  );
  servers.clear();
});

describe("secure Node outbound fetch", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "100::1",
    "2001::1",
    "2001:db8::1",
    "2002:0808:0808::1",
    "3fff::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
  ])("rejects special-use address %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2001:4860:4860::8888", "2606:4700:4700::1111"])(
    "accepts globally routable address %s",
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    }
  );

  it("rejects the entire DNS answer when any A or AAAA record is special-use", async () => {
    const secureFetch = createSecureNodeFetch({
      resolve: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "::ffff:127.0.0.1", family: 6 },
      ],
    });

    await expect(
      secureFetch("https://upstream.example.com/mcp", { redirect: "error" })
    ).rejects.toThrow("private or special-use");
  });

  it("keeps metadata and other non-private special ranges blocked in demo mode", async () => {
    const secureFetch = createSecureNodeFetch({
      allowPrivateNetwork: true,
      resolve: async () => [{ address: "169.254.169.254", family: 4 }],
    });

    await expect(secureFetch("http://metadata.example.com/latest")).rejects.toThrow(
      "private or special-use"
    );
  });

  it("pins the validated address while retaining the origin Host header", async () => {
    let seenHost = "";
    const { port } = await listen((request, response) => {
      seenHost = request.headers.host ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
    });
    let resolutionCount = 0;
    const secureFetch = createSecureNodeFetch({
      allowPrivateNetwork: true,
      resolve: async (hostname) => {
        expect(hostname).toBe("upstream.example");
        resolutionCount += 1;
        return [{ address: "127.0.0.1", family: 4 }];
      },
    });

    const response = await secureFetch(`http://upstream.example:${port}/mcp?q=1`, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ping: true }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(resolutionCount).toBe(1);
    expect(seenHost).toBe(`upstream.example:${port}`);
  });

  it("never follows redirects", async () => {
    let requests = 0;
    const { port } = await listen((_request, response) => {
      requests += 1;
      response.writeHead(302, { location: "/internal" });
      response.end();
    });
    const secureFetch = createSecureNodeFetch({ allowPrivateNetwork: true });

    await expect(
      secureFetch(`http://127.0.0.1:${port}/start`, { redirect: "follow" })
    ).rejects.toThrow("redirects are not allowed");
    expect(requests).toBe(1);
  });

  it("bounds streamed response bodies", async () => {
    const { port } = await listen((_request, response) => {
      response.write("12345678");
      response.end("abcdefgh");
    });
    const secureFetch = createSecureNodeFetch({
      allowPrivateNetwork: true,
      maxResponseBytes: 12,
    });

    await expect(secureFetch(`http://127.0.0.1:${port}/large`)).rejects.toThrow(
      "response exceeded its byte limit"
    );
  });

  it("cancels an in-flight connection with the caller's AbortSignal", async () => {
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const { port } = await listen(() => {
      markStarted?.();
    });
    const secureFetch = createSecureNodeFetch({ allowPrivateNetwork: true });
    const controller = new AbortController();
    const pending = secureFetch(`http://127.0.0.1:${port}/slow`, {
      signal: controller.signal,
    });
    await started;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
