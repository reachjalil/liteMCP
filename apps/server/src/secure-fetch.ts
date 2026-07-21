import { lookup as dnsLookup } from "node:dns/promises";
import type { IncomingHttpHeaders, RequestOptions } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

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

const IPV4_SPECIAL_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

const IPV4_DEMO_PRIVATE_CIDRS = [
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
] as const;

// Special-purpose blocks that sit inside 2000::/3 global unicast space.
const IPV6_SPECIAL_CIDRS = [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["2620:4f:8000::", 48],
  ["3fff::", 20],
] as const;

const ipv4Number = (address: string) => {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return (
    ((((octets[0] ?? 0) << 24) >>> 0) |
      ((octets[1] ?? 0) << 16) |
      ((octets[2] ?? 0) << 8) |
      (octets[3] ?? 0)) >>>
    0
  );
};

const ipv4InCidr = (address: string, base: string, prefix: number) => {
  const value = ipv4Number(address);
  const baseValue = ipv4Number(base);
  if (value === null || baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
};

const ipv6Hextets = (rawAddress: string): number[] | null => {
  let address = rawAddress.toLowerCase();
  if (address.startsWith("[") && address.endsWith("]")) {
    address = address.slice(1, -1);
  }
  // Scoped addresses are never valid remote service destinations.
  if (address.includes("%")) return null;

  if (address.includes(".")) {
    const separator = address.lastIndexOf(":");
    const ipv4 = separator >= 0 ? address.slice(separator + 1) : address;
    const value = ipv4Number(ipv4);
    if (value === null) return null;
    address = `${address.slice(0, separator + 1)}${((value >>> 16) & 0xffff).toString(
      16
    )}:${(value & 0xffff).toString(16)}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = (halves[0] ?? "").split(":").filter(Boolean);
  const right = (halves[1] ?? "").split(":").filter(Boolean);
  const compressed = halves.length === 2;
  const zeroCount = 8 - left.length - right.length;
  if ((!compressed && zeroCount !== 0) || (compressed && zeroCount < 1)) {
    return null;
  }
  const parts = [
    ...left,
    ...Array.from({ length: compressed ? zeroCount : 0 }, () => "0"),
    ...right,
  ];
  if (parts.length !== 8) return null;
  const values = parts.map((part) =>
    /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : Number.NaN
  );
  return values.every(Number.isInteger) ? values : null;
};

const ipv6InCidr = (address: string, base: string, prefix: number) => {
  const value = ipv6Hextets(address);
  const baseValue = ipv6Hextets(base);
  if (!value || !baseValue) return false;
  let remaining = prefix;
  for (let index = 0; index < 8 && remaining > 0; index += 1) {
    const bits = Math.min(remaining, 16);
    const mask = (0xffff << (16 - bits)) & 0xffff;
    if (((value[index] ?? 0) & mask) !== ((baseValue[index] ?? 0) & mask)) {
      return false;
    }
    remaining -= bits;
  }
  return true;
};

/** Returns true only for ordinary, globally routable unicast addresses. */
export const isPublicIpAddress = (address: string) => {
  const family = isIP(address);
  if (family === 4) {
    return !IPV4_SPECIAL_CIDRS.some(([base, prefix]) =>
      ipv4InCidr(address, base, prefix)
    );
  }
  if (family !== 6) return false;

  // This fail-closed global-unicast gate also excludes mapped IPv4, ULA,
  // link-local, multicast, loopback, unspecified, NAT64, and discard prefixes.
  if (!ipv6InCidr(address, "2000::", 3)) return false;
  return !IPV6_SPECIAL_CIDRS.some(([base, prefix]) =>
    ipv6InCidr(address, base, prefix)
  );
};

const isDemoPrivateIpAddress = (address: string) => {
  if (isIP(address) === 4) {
    return IPV4_DEMO_PRIVATE_CIDRS.some(([base, prefix]) =>
      ipv4InCidr(address, base, prefix)
    );
  }
  if (isIP(address) !== 6) return false;
  return ipv6InCidr(address, "::1", 128) || ipv6InCidr(address, "fc00::", 7);
};

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
