const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64UrlEncode = (value: Uint8Array) => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const base64UrlDecode = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const sha256Base64Url = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
};

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortValue(entry)])
    );
  }
  return value;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(sortValue(value));

const sensitiveKey =
  /(?:authorization|cookie|password|secret|token|api[-_]?key|credential|private[-_]?key|code)/i;

export const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redactSecrets(entry),
    ])
  );
};

export const randomId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

export const nowIso = () => new Date().toISOString();

export const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

/**
 * Small portable envelope used for control-plane credentials. A tenant-specific
 * AES key is derived from the deployment master key with HKDF, so one encrypted
 * value cannot be moved across tenant boundaries. Production deployments should
 * source the master key from a secret manager and rotate it deliberately.
 */
export class CredentialCipher {
  readonly #masterKey: Promise<CryptoKey>;

  constructor(masterKey: string) {
    if (encoder.encode(masterKey).byteLength < 32) {
      throw new Error("CREDENTIAL_MASTER_KEY must contain at least 32 bytes.");
    }
    this.#masterKey = crypto.subtle.importKey(
      "raw",
      encoder.encode(masterKey),
      "HKDF",
      false,
      ["deriveKey"]
    );
  }

  async #tenantKey(tenantId: string) {
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: encoder.encode(`litemcp:${tenantId}`),
        info: encoder.encode("litemcp-credential-envelope-v1"),
      },
      await this.#masterKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async encrypt(tenantId: string, plaintext: string) {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(tenantId) },
      await this.#tenantKey(tenantId),
      encoder.encode(plaintext)
    );
    return `enc:v1:${base64UrlEncode(nonce)}:${base64UrlEncode(
      new Uint8Array(ciphertext)
    )}`;
  }

  async decrypt(tenantId: string, envelope: string) {
    const [prefix, version, nonceValue, ciphertextValue, ...extra] =
      envelope.split(":");
    if (
      prefix !== "enc" ||
      version !== "v1" ||
      !nonceValue ||
      !ciphertextValue ||
      extra.length > 0
    ) {
      throw new Error("Unsupported credential envelope.");
    }
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlDecode(nonceValue),
        additionalData: encoder.encode(tenantId),
      },
      await this.#tenantKey(tenantId),
      base64UrlDecode(ciphertextValue)
    );
    return decoder.decode(plaintext);
  }
}
