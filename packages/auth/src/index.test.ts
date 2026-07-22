import { describe, expect, it, vi } from "vitest";

import {
  createAuthEmailCallbacks,
  createLiteMcpAuthConfiguration,
  createResendEmailSender,
  type EmailMessage,
  type LiteMcpAuthPlugin,
} from "./index.js";

const baseOptions = {
  database: {} as never,
  baseURL: "https://api.example.com",
  secret: "a-production-secret-with-at-least-32-characters",
  trustedOrigins: ["https://app.example.com"],
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
