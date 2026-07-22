import { describe, expect, it, vi } from "vitest";

import {
  createAuthEmailCallbacks,
  createLiteMcpAuthConfiguration,
  createResendEmailSender,
  type EmailMessage,
  isReservedBuiltInAccountProviderId,
  isReservedScimAccountProviderId,
  type LiteMcpAuthPlugin,
} from "./index.js";

const baseOptions = {
  database: {} as never,
  baseURL: "https://api.example.com",
  secret: "a-production-secret-with-at-least-32-characters",
  trustedOrigins: ["https://app.example.com"],
};

const providerNamespaceAdapter = (collisions: Set<string>) => {
  const findOne = vi.fn(
    async (input: {
      model: "ssoProvider";
      where: [{ field: "providerId"; value: string }];
    }) =>
      collisions.has(`${input.model}:${input.where[0].value}`)
        ? { id: "collision" }
        : null
  );
  return { adapter: { findOne }, findOne };
};

const providerNamespaceCallbacks = async (
  configuration: ReturnType<typeof createLiteMcpAuthConfiguration>,
  adapter: { findOne: ReturnType<typeof vi.fn> }
) => {
  const guard = configuration.plugins?.find(
    (plugin) => plugin.id === "litemcp-provider-namespace-guard"
  );
  await guard?.init?.({ adapter } as never);
  const scimPlugin = configuration.plugins?.find((plugin) => plugin.id === "scim");
  return scimPlugin?.options?.canGenerateToken as (input: {
    providerId: string;
    organizationId: string;
    user: never;
    member: never;
  }) => Promise<boolean>;
};

describe("createLiteMcpAuth", () => {
  it("rejects weak session secrets before creating an auth instance", () => {
    expect(() =>
      createLiteMcpAuthConfiguration({
        database: {} as never,
        baseURL: "http://localhost:8787",
        secret: "weak",
        trustedOrigins: ["http://localhost:4321"],
        demoMode: true,
      })
    ).toThrow("at least 32");
  });

  it("keeps demo registration enabled without requiring email delivery", () => {
    const configuration = createLiteMcpAuthConfiguration({
      ...baseOptions,
      demoMode: true,
    });

    expect(configuration.emailAndPassword).toMatchObject({
      disableSignUp: false,
      requireEmailVerification: false,
      autoSignIn: true,
    });
    expect(configuration.rateLimit).toMatchObject({
      enabled: true,
      storage: "database",
    });
  });

  it("lets the signup kill switch close registration even in demo mode", () => {
    const configuration = createLiteMcpAuthConfiguration({
      ...baseOptions,
      demoMode: true,
      signupsEnabled: false,
    });

    expect(configuration.emailAndPassword?.disableSignUp).toBe(true);
  });

  it("defaults production registration to disabled", () => {
    const configuration = createLiteMcpAuthConfiguration(baseOptions);
    expect(configuration.emailAndPassword).toMatchObject({
      disableSignUp: true,
      requireEmailVerification: true,
      autoSignIn: false,
    });
  });

  it("requires a delivery provider before production registration can open", () => {
    expect(() =>
      createLiteMcpAuthConfiguration({ ...baseOptions, signupsEnabled: true })
    ).toThrow("Email delivery must be configured");
  });

  it("wires verification and password-reset callbacks when email is configured", () => {
    const configuration = createLiteMcpAuthConfiguration({
      ...baseOptions,
      signupsEnabled: true,
      emailSender: { send: vi.fn() },
    });

    expect(configuration.emailVerification?.sendVerificationEmail).toBeTypeOf(
      "function"
    );
    expect(configuration.emailVerification?.sendOnSignUp).toBe(true);
    expect(configuration.emailAndPassword?.sendResetPassword).toBeTypeOf("function");
  });

  it("appends deployment plugins without mutating the caller array", () => {
    const hostedPlugin: LiteMcpAuthPlugin = { id: "hosted-billing" };
    const additionalPlugins = [hostedPlugin];
    const configuration = createLiteMcpAuthConfiguration({
      ...baseOptions,
      additionalPlugins,
    });

    expect(configuration.plugins?.at(-1)).toBe(hostedPlugin);
    expect(configuration.plugins?.map((plugin) => plugin.id)).toContain(
      "hosted-billing"
    );
    expect(additionalPlugins).toEqual([hostedPlugin]);
  });

  it("rejects deployment plugins that collide with core or sibling plugin ids", () => {
    expect(() =>
      createLiteMcpAuthConfiguration({
        ...baseOptions,
        additionalPlugins: [{ id: "organization" }],
      })
    ).toThrow("plugin id organization is already configured");
    expect(() =>
      createLiteMcpAuthConfiguration({
        ...baseOptions,
        additionalPlugins: [{ id: "hosted" }, { id: "hosted" }],
      })
    ).toThrow("plugin id hosted is already configured");
  });

  it("reserves Better Auth's organization-scoped SCIM account namespace", async () => {
    expect(isReservedScimAccountProviderId("scim:organization-a:entra")).toBe(true);
    expect(isReservedScimAccountProviderId("entra")).toBe(false);
    expect(isReservedScimAccountProviderId(undefined)).toBe(false);
    const configuration = createLiteMcpAuthConfiguration(baseOptions);
    const before = configuration.hooks?.before;
    const { adapter, findOne } = providerNamespaceAdapter(new Set());
    await expect(
      before?.({
        path: "/sso/register",
        body: { providerId: "scim:organization-a:entra" },
        context: { adapter },
      } as never)
    ).rejects.toThrow("reserved SCIM account namespace");
    expect(findOne).not.toHaveBeenCalled();
  });

  it("keeps the pinned SSO plugin's raw SCIM collision check behind authorization", async () => {
    const configuration = createLiteMcpAuthConfiguration(baseOptions);
    const ssoPlugin = configuration.plugins?.find((plugin) => plugin.id === "sso");
    const registerSSOProvider = ssoPlugin?.endpoints?.registerSSOProvider;
    if (!registerSSOProvider)
      throw new Error("Pinned SSO registration endpoint missing");
    const now = new Date("2026-01-01T00:00:00.000Z");
    const findOne = vi.fn(
      async (input: { model: string; where: { field: string; value: string }[] }) => {
        if (input.model === "member") return { role: "owner" };
        if (input.model === "scimProvider") return { id: "scim-provider" };
        return null;
      }
    );

    await expect(
      registerSSOProvider({
        path: "/sso/register",
        body: {
          providerId: "entra",
          issuer: "https://idp.example.com",
          domain: "example.com",
          organizationId: "organization-a",
        },
        context: {
          session: {
            session: {
              id: "session-a",
              createdAt: now,
              updatedAt: now,
              userId: "user-a",
              expiresAt: new Date("2026-01-02T00:00:00.000Z"),
              token: "test-session-token",
            },
            user: {
              id: "user-a",
              createdAt: now,
              updatedAt: now,
              email: "admin@example.com",
              emailVerified: true,
              name: "Admin",
            },
          },
          adapter: { findMany: vi.fn(async () => []), findOne },
          hasPlugin: (id: string) => id === "organization" || id === "scim",
          options: configuration,
          socialProviders: [],
          trustedProviders: [],
          logger: {
            warn: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
          },
        },
      } as never)
    ).rejects.toThrow("already used by a SCIM provider");
    expect(findOne).toHaveBeenNthCalledWith(1, {
      model: "member",
      where: [
        { field: "userId", value: "user-a" },
        { field: "organizationId", value: "organization-a" },
      ],
    });
    expect(findOne).toHaveBeenNthCalledWith(2, {
      model: "scimProvider",
      where: [{ field: "providerId", value: "entra" }],
    });
  });

  it("keeps SCIM provider IDs out of built-in and SSO account namespaces", async () => {
    expect(isReservedBuiltInAccountProviderId("credential")).toBe(true);
    expect(isReservedBuiltInAccountProviderId("email-otp")).toBe(true);
    expect(isReservedBuiltInAccountProviderId("entra")).toBe(false);

    const collisions = new Set<string>();
    const { adapter, findOne } = providerNamespaceAdapter(collisions);
    const canGenerateToken = await providerNamespaceCallbacks(
      createLiteMcpAuthConfiguration(baseOptions),
      adapter
    );
    const input = {
      providerId: "entra",
      organizationId: "organization-a",
      user: undefined as never,
      member: undefined as never,
    };

    await expect(
      canGenerateToken({ ...input, providerId: "credential" })
    ).resolves.toBe(false);
    expect(findOne).not.toHaveBeenCalled();

    collisions.add("ssoProvider:entra");
    await expect(canGenerateToken(input)).resolves.toBe(false);
    collisions.clear();
    collisions.add("ssoProvider:scim:organization-a:entra");
    await expect(canGenerateToken(input)).resolves.toBe(false);
    collisions.clear();
    await expect(canGenerateToken(input)).resolves.toBe(true);
    expect(findOne).toHaveBeenCalledWith({
      model: "ssoProvider",
      where: [{ field: "providerId", value: "entra" }],
    });
    expect(findOne).toHaveBeenCalledWith({
      model: "ssoProvider",
      where: [{ field: "providerId", value: "scim:organization-a:entra" }],
    });
  });
});

describe("auth email callbacks", () => {
  it("delivers verification, password reset, and invitation messages", async () => {
    const messages: EmailMessage[] = [];
    const callbacks = createAuthEmailCallbacks(
      { send: async (message) => void messages.push(message) },
      "https://app.example.com"
    );

    await callbacks.sendVerificationEmail({
      user: { email: "ada@example.com", name: "Ada <Admin>" },
      url: "https://api.example.com/api/auth/verify-email?token=a&next=b",
    });
    await callbacks.sendResetPassword({
      user: { email: "ada@example.com", name: "Ada" },
      url: "https://app.example.com/reset-password?token=reset",
    });
    await callbacks.sendInvitationEmail({
      id: "invite token",
      email: "grace@example.com",
      organization: { name: "Example Org" },
      inviter: { user: { name: "Ada" } },
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({
      to: "ada@example.com",
      subject: "Verify your LiteMCP Composer email",
    });
    expect(messages[0]?.html).toContain("Ada &lt;Admin&gt;");
    expect(messages[0]?.html).toContain("token=a&amp;next=b");
    expect(messages[1]?.subject).toContain("Reset");
    expect(messages[2]?.text).toContain(
      "https://app.example.com/login?invitationId=invite+token"
    );
  });
});

describe("Resend REST email sender", () => {
  it("sends provider-neutral messages through the Resend endpoint", async () => {
    const fetchEmail = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 200 })
    );
    const sender = createResendEmailSender({
      apiKey: "re_secret",
      from: "LiteMCP <hello@example.com>",
      replyTo: "support@example.com",
      fetch: fetchEmail,
    });

    await sender.send({
      to: "ada@example.com",
      subject: "Welcome",
      text: "Welcome to LiteMCP Composer.",
      html: "<p>Welcome to LiteMCP Composer.</p>",
    });

    expect(fetchEmail).toHaveBeenCalledOnce();
    const [url, init] = fetchEmail.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer re_secret",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: "LiteMCP <hello@example.com>",
      to: ["ada@example.com"],
      reply_to: "support@example.com",
    });
  });

  it("surfaces provider delivery failures", async () => {
    const sender = createResendEmailSender({
      apiKey: "re_secret",
      from: "hello@example.com",
      fetch: async () => new Response(null, { status: 429 }),
    });

    await expect(
      sender.send({ to: "ada@example.com", subject: "Hi", text: "Hi" })
    ).rejects.toThrow("HTTP status 429");
  });
});
