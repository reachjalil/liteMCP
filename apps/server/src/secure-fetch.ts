import { lookup as dnsLookup } from "node:dns/promises";
import type { IncomingHttpHeaders, RequestOptions } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import {
  isDemoPrivateIpAddress as sharedIsDemoPrivateIpAddress,
  isPublicIpAddress as sharedIsPublicIpAddress,
} from "@litemcp/mcp-gateway";

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type SecureNodeFetchOptions = {
  /** Only set by the explicitly enabled local demo runtime. */
  allowPrivateNetwork?: boolean;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  /** Test seam; production uses the operating system resolver. */
  resolve?: (hostname: string) => Promise<readonly ResolvedAddress[]>;
};

const DEFAULT_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Shared with the managed gateway's literal-address policy. */
export const isPublicIpAddress = sharedIsPublicIpAddress;

const isDemoPrivateIpAddress = sharedIsDemoPrivateIpAddress;

const normalizeHostname = (hostname: string) =>
  hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

const isSpecialHostname = (hostname: string) => {
  if (!hostname.includes(".")) return true;
  return (
    hostname === "localhost" ||
    [
      ".localhost",
      ".local",
      ".localdomain",
      ".internal",
      ".arpa",
      ".onion",
      ".test",
      ".example",
      ".invalid",
    ].some((suffix) => hostname.endsWith(suffix))
  );
};

const abortReason = (signal: AbortSignal) =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");

const withAbort = async <T>(promise: Promise<T>, signal: AbortSignal) => {
  if (signal.aborted) throw abortReason(signal);
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
};

const validateLimit = (value: number | undefined, fallback: number) => {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Secure fetch byte limits must be positive safe integers.");
  }
  return limit;
};

const resolveAll = async (hostname: string): Promise<ResolvedAddress[]> => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));
};

const resolveAndValidate = async (
  hostname: string,
  signal: AbortSignal,
  options: SecureNodeFetchOptions
) => {
  const literalFamily = isIP(hostname);
  const addresses: readonly ResolvedAddress[] = literalFamily
    ? [
        {
          address: hostname,
          family: literalFamily === 6 ? 6 : 4,
        },
      ]
    : await withAbort((options.resolve ?? resolveAll)(hostname), signal);

  if (addresses.length === 0) {
    throw new Error("The upstream hostname did not resolve to an address.");
  }
  for (const record of addresses) {
    if (isIP(record.address) !== record.family) {
      throw new Error("DNS resolution returned an invalid address record.");
    }
    const allowed =
      isPublicIpAddress(record.address) ||
      (options.allowPrivateNetwork && isDemoPrivateIpAddress(record.address));
    if (!allowed) {
      // Reject the whole answer set: accepting only its public member would let
      // a DNS response steer different clients toward an internal destination.
      throw new Error("DNS resolution returned a private or special-use address.");
    }
  }
  return addresses[0] as ResolvedAddress;
};

const readRequestBody = async (
  request: Request,
  maxBytes: number
): Promise<Buffer | undefined> => {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await withAbort(reader.read(), request.signal);
      if (result.done) break;
      const chunk = Buffer.from(result.value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("The upstream request exceeded its byte limit.");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
};

const responseHeaders = (headers: IncomingHttpHeaders) => {
  const result = new Headers();
  for (const [name, rawValue] of Object.entries(headers)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== undefined) result.append(name, String(value));
    }
  }
  return result;
};

const createRequestHeaders = (
  request: Request,
  url: URL,
  hostname: string,
  body: Buffer | undefined
) => {
  const headers: Record<string, string> = {};
  for (const [name, value] of request.headers) headers[name] = value;
  for (const unsafe of [
    "connection",
    "content-length",
    "host",
    "keep-alive",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) {
    delete headers[unsafe];
  }
  const formattedHostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  headers.host = `${formattedHostname}${url.port ? `:${url.port}` : ""}`;
  if (body) headers["content-length"] = String(body.byteLength);
  return headers;
};

const dispatchRequest = async (
  request: Request,
  url: URL,
  hostname: string,
  pinned: ResolvedAddress,
  body: Buffer | undefined,
  maxResponseBytes: number
) =>
  await new Promise<Response>((resolve, reject) => {
    let settled = false;
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const pinnedLookup: LookupFunction = (lookupHostname, lookupOptions, callback) => {
      if (normalizeHostname(lookupHostname) !== hostname) {
        callback(new Error("The connection attempted an unexpected DNS lookup."), []);
        return;
      }
      if (lookupOptions.all) {
        callback(null, [pinned]);
      } else {
        callback(null, pinned.address, pinned.family);
      }
    };
    const requestOptions: RequestOptions = {
      protocol: url.protocol,
      hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: request.method,
      headers: createRequestHeaders(request, url, hostname, body),
      agent: false,
      lookup: pinnedLookup,
      // `servername` is consumed by https.request; keeping `hostname` as the
      // origin name also keeps certificate identity checks on that name.
      ...(url.protocol === "https:" && isIP(hostname) === 0
        ? { servername: hostname }
        : {}),
    };
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const outgoing = transport(requestOptions, (incoming) => {
      const status = incoming.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        finishReject(new Error("Upstream redirects are not allowed."));
        incoming.destroy();
        return;
      }
      const declaredLength = Number(incoming.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        finishReject(new Error("The upstream response exceeded its byte limit."));
        incoming.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      incoming.on("data", (rawChunk: Buffer | string) => {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
        total += chunk.byteLength;
        if (total > maxResponseBytes) {
          finishReject(new Error("The upstream response exceeded its byte limit."));
          incoming.destroy();
          return;
        }
        chunks.push(chunk);
      });
      incoming.once("aborted", () =>
        finishReject(new Error("The upstream response was interrupted."))
      );
      incoming.once("error", finishReject);
      incoming.once("end", () => {
        if (settled) return;
        const payload = Buffer.concat(chunks, total);
        try {
          const response = new Response(payload.byteLength > 0 ? payload : null, {
            status,
            statusText: incoming.statusMessage,
            headers: responseHeaders(incoming.headers),
          });
          settled = true;
          resolve(response);
        } catch (error) {
          finishReject(error);
        }
      });
    });
    const abort = () => outgoing.destroy(abortReason(request.signal));
    request.signal.addEventListener("abort", abort, { once: true });
    outgoing.once("upgrade", (_response, socket) => {
      socket.destroy();
      finishReject(new Error("HTTP protocol upgrades are not allowed."));
    });
    outgoing.once("error", (error) => {
      request.signal.removeEventListener("abort", abort);
      finishReject(error);
    });
    outgoing.once("close", () => request.signal.removeEventListener("abort", abort));
    outgoing.end(body);
  });

/**
 * A Node-only fetch implementation for outbound MCP calls. DNS is resolved and
 * validated once, then the validated address is supplied through a per-request
 * lookup callback. This closes the validation/connect DNS-rebinding window while
 * preserving the origin hostname for Host, TLS SNI, and certificate validation.
 */
export const createSecureNodeFetch = (
  options: SecureNodeFetchOptions = {}
): typeof fetch => {
  const maxRequestBytes = validateLimit(
    options.maxRequestBytes,
    DEFAULT_MAX_REQUEST_BYTES
  );
  const maxResponseBytes = validateLimit(
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES
  );
  const implementation = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only HTTP(S) upstream endpoints are supported.");
    }
    if (url.username || url.password || url.hash) {
      throw new Error("Upstream URLs cannot contain credentials or fragments.");
    }
    if (url.protocol !== "https:" && !options.allowPrivateNetwork) {
      throw new Error("Remote upstream endpoints must use HTTPS.");
    }
    const hostname = normalizeHostname(url.hostname);
    if (!hostname) throw new Error("The upstream hostname is missing.");
    if (
      isIP(hostname) === 0 &&
      isSpecialHostname(hostname) &&
      !options.allowPrivateNetwork
    ) {
      throw new Error("Local and special-use hostnames are blocked by default.");
    }
    const body = await readRequestBody(request, maxRequestBytes);
    const pinned = await resolveAndValidate(hostname, request.signal, options);
    if (request.signal.aborted) throw abortReason(request.signal);
    return await dispatchRequest(
      request,
      url,
      hostname,
      pinned,
      body,
      maxResponseBytes
    );
  };
  return implementation as typeof fetch;
};
