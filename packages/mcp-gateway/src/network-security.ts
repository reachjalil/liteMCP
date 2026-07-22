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

const IPV6_SPECIAL_CIDRS = [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["2620:4f:8000::", 48],
  ["3fff::", 20],
] as const;

export const ipv4Number = (address: string) => {
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

export const ipv6Hextets = (rawAddress: string): number[] | null => {
  let address = rawAddress.toLowerCase();
  if (address.startsWith("[") && address.endsWith("]")) {
    address = address.slice(1, -1);
  }
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
  if ((!compressed && zeroCount !== 0) || (compressed && zeroCount < 1)) return null;
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

export const ipFamily = (address: string): 4 | 6 | 0 => {
  if (ipv4Number(address) !== null) return 4;
  return ipv6Hextets(address) ? 6 : 0;
};

/** True only for ordinary globally routable unicast addresses. */
export const isPublicIpAddress = (address: string) => {
  const family = ipFamily(address);
  if (family === 4) {
    return !IPV4_SPECIAL_CIDRS.some(([base, prefix]) =>
      ipv4InCidr(address, base, prefix)
    );
  }
  if (family !== 6 || !ipv6InCidr(address, "2000::", 3)) return false;
  return !IPV6_SPECIAL_CIDRS.some(([base, prefix]) =>
    ipv6InCidr(address, base, prefix)
  );
};

export const isDemoPrivateIpAddress = (address: string) => {
  if (ipFamily(address) === 4) {
    return IPV4_DEMO_PRIVATE_CIDRS.some(([base, prefix]) =>
      ipv4InCidr(address, base, prefix)
    );
  }
  if (ipFamily(address) !== 6) return false;
  return ipv6InCidr(address, "::1", 128) || ipv6InCidr(address, "fc00::", 7);
};

export const normalizeHostname = (hostname: string) =>
  hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

export const isSpecialHostname = (hostname: string) => {
  const normalized = normalizeHostname(hostname);
  if (!normalized.includes(".")) return true;
  return [
    ".localhost",
    ".local",
    ".localdomain",
    ".internal",
    ".arpa",
    ".onion",
    ".test",
    ".example",
    ".invalid",
  ].some((suffix) => normalized.endsWith(suffix));
};
