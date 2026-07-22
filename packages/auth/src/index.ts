import { apiKey } from "@better-auth/api-key";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, bearer, jwt, organization, twoFactor } from "better-auth/plugins";

const encoder = new TextEncoder();
const resendEndpoint = "https://api.resend.com/emails";

const hashSecret = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

/** Better Auth 1.7 reserves this namespace for organization-scoped SCIM accounts. */
export const isReservedScimAccountProviderId = (providerId: unknown) =>
  typeof providerId === "string" && providerId.startsWith("scim:");

const builtInAccountProviderIds = new Set([
  "credential",
  "email-otp",
  "magic-link",
  "phone-number",
  "anonymous",
  "siwe",
]);

export const isReservedBuiltInAccountProviderId = (providerId: unknown) =>
  typeof providerId === "string" && builtInAccountProviderIds.has(providerId);

type ProviderNamespaceAdapter = {
  findOne(input: {
    model: "ssoProvider";
    where: [{ field: "providerId"; value: string }];
  }): Promise<unknown>;
};

const findSsoProviderById = (adapter: ProviderNamespaceAdapter, providerId: string) =>
  adapter.findOne({
    model: "ssoProvider",
    where: [{ field: "providerId", value: providerId }],
  });

const enforceProviderNamespaces = createAuthMiddleware(async (context) => {
  if (context.path !== "/sso/register") return;
  const providerId = (context.body as { providerId?: unknown } | undefined)?.providerId;
  if (typeof providerId !== "string") return;
  if (isReservedScimAccountProviderId(providerId)) {
    throw new APIError("UNPROCESSABLE_ENTITY", {
      message: "SSO provider IDs cannot use the reserved SCIM account namespace.",
    });
  }
  // The pinned SSO plugin checks raw SCIM provider-ID collisions after its
  // session and organization-admin checks. Do not move that stateful lookup
  // into this global hook: global hooks run before endpoint authorization.
});

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/** Provider-neutral delivery seam used by Better Auth lifecycle callbacks. */
export type EmailSender = {
  send(message: EmailMessage): Promise<void>;
};

export type ResendEmailSenderOptions = {
  apiKey: string;
  from: string;
  replyTo?: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * Minimal Resend REST adapter that works in both Node and Workers without
 * adding a provider SDK to the portable auth package.
 */
export const createResendEmailSender = (
  options: ResendEmailSenderOptions
): EmailSender => {
  const apiKey = options.apiKey.trim();
  const from = options.from.trim();
  const replyTo = options.replyTo?.trim() || undefined;
  if (!apiKey) throw new Error("A non-empty Resend API key is required.");
  if (!from) throw new Error("A non-empty email sender address is required.");
  const fetchEmail = options.fetch ?? globalThis.fetch;

  return {
    async send(message) {
      const response = await fetchEmail(resendEndpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Resend email delivery failed with HTTP status ${response.status}.`
        );
      }
    },
  };
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const actionMessage = (input: {
  to: string;
  subject: string;
  heading: string;
  detail: string;
  action: string;
  url: string;
}): EmailMessage => ({
  to: input.to,
  subject: input.subject,
  text: `${input.heading}\n\n${input.detail}\n\n${input.action}: ${input.url}\n\nIf you did not request this, you can ignore this email.`,
  html: `<h1>${escapeHtml(input.heading)}</h1><p>${escapeHtml(
    input.detail
  )}</p><p><a href="${escapeHtml(input.url)}">${escapeHtml(
    input.action
  )}</a></p><p>If you did not request this, you can ignore this email.</p>`,
});

export const createAuthEmailCallbacks = (
  sender: EmailSender,
  applicationURL: string
) => ({
  sendVerificationEmail: async (data: {
    user: { email: string; name: string };
    url: string;
  }) => {
    await sender.send(
      actionMessage({
        to: data.user.email,
        subject: "Verify your LiteMCP Composer email",
        heading: "Verify your email",
        detail: `Hi ${data.user.name}, confirm this email address to finish securing your account.`,
        action: "Verify email",
        url: data.url,
      })
    );
  },
  sendResetPassword: async (data: {
    user: { email: string; name: string };
    url: string;
  }) => {
    await sender.send(
      actionMessage({
        to: data.user.email,
        subject: "Reset your LiteMCP Composer password",
        heading: "Reset your password",
        detail: `Hi ${data.user.name}, use this one-time link to choose a new password.`,
        action: "Reset password",
        url: data.url,
      })
    );
  },
  sendInvitationEmail: async (data: {
    id: string;
    email: string;
    organization: { name: string };
    inviter: { user: { name: string } };
  }) => {
    const url = new URL("/login", applicationURL);
    url.searchParams.set("invitationId", data.id);
    await sender.send(
      actionMessage({
        to: data.email,
        subject: `Join ${data.organization.name} on LiteMCP Composer`,
        heading: `Join ${data.organization.name}`,
        detail: `${data.inviter.user.name} invited you to their LiteMCP Composer organization.`,
        action: "Review invitation",
        url: url.toString(),
      })
    );
  },
});

export type LiteMcpAuthOptions = {
  database: NonNullable<BetterAuthOptions["database"]>;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  demoMode?: boolean;
  signupsEnabled?: boolean;
  emailSender?: EmailSender;
  applicationURL?: string;
  /**
   * Deployment-owned plugins appended after the mandatory portable auth set.
   * Duplicate plugin ids are rejected so an extension cannot replace a core
   * organization, session, or identity endpoint implicitly.
   */
  additionalPlugins?: readonly LiteMcpAuthPlugin[];
};

export type LiteMcpAuthPlugin = NonNullable<BetterAuthOptions["plugins"]>[number];

const createProviderNamespaceGuard = () => {
  let adapter: ProviderNamespaceAdapter | undefined;
  const plugin: LiteMcpAuthPlugin = {
    id: "litemcp-provider-namespace-guard",
    init(context) {
      adapter = context.adapter as ProviderNamespaceAdapter;
    },
  };

  return {
    plugin,
    async canGenerateScimToken(input: { providerId: string; organizationId: string }) {
      if (isReservedBuiltInAccountProviderId(input.providerId) || !adapter) {
        return false;
      }
      const accountProviderId = `scim:${input.organizationId}:${input.providerId}`;
      const [rawProviderCollision, accountProviderCollision] = await Promise.all([
        findSsoProviderById(adapter, input.providerId),
        findSsoProviderById(adapter, accountProviderId),
      ]);
      return !rawProviderCollision && !accountProviderCollision;
    },
  };
};

export type LiteMcpAuth = {
  handler(request: Request): Promise<Response>;
  api: {
    getSession(input: { headers: Headers }): Promise<unknown>;
    getActiveMemberRole(input: {
      headers: Headers;
      query?: { organizationId?: string };
    }): Promise<unknown>;
  };
};

/**
 * Better Auth owns authentication and session lifecycle only. LiteMCP Composer's
 * control plane and gateway independently enforce tenant RBAC/ABAC policy.
 */
export const createLiteMcpAuthConfiguration = (
  options: LiteMcpAuthOptions
): BetterAuthOptions => {
  if (options.secret.trim().length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
  const demoMode = options.demoMode === true;
  const signupsEnabled = options.signupsEnabled ?? demoMode;
  if (signupsEnabled && !demoMode && !options.emailSender) {
    throw new Error(
      "Email delivery must be configured when production signups are enabled."
    );
  }
  const emailCallbacks = options.emailSender
    ? createAuthEmailCallbacks(
        options.emailSender,
        options.applicationURL ?? options.trustedOrigins[0] ?? options.baseURL
      )
    : undefined;
  const providerNamespaceGuard = createProviderNamespaceGuard();
  const corePlugins: LiteMcpAuthPlugin[] = [
    organization({
      allowUserToCreateOrganization: signupsEnabled,
      requireEmailVerificationOnInvitation: true,
      membershipLimit: 10_000,
      ...(emailCallbacks
        ? { sendInvitationEmail: emailCallbacks.sendInvitationEmail }
        : {}),
    }),
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    twoFactor({ issuer: "LiteMCP Composer" }),
    bearer(),
    jwt(),
    apiKey({
      references: "organization",
      defaultPrefix: "lmcp",
      enableSessionForAPIKeys: false,
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
    }),
    sso({
      provisionUserOnEveryLogin: true,
      organizationProvisioning: {
        disabled: false,
        defaultRole: "member",
      },
      saml: {
        enableInResponseToValidation: true,
        allowIdpInitiated: false,
        requestTTL: 5 * 60 * 1_000,
      },
    }),
    providerNamespaceGuard.plugin,
    scim({
      requiredRole: ["owner", "admin"],
      canGenerateToken: providerNamespaceGuard.canGenerateScimToken,
      storeSCIMToken: { hash: hashSecret },
    }),
  ];
  const additionalPlugins = [...(options.additionalPlugins ?? [])];
  const pluginIds = new Set(corePlugins.map((plugin) => plugin.id));
  for (const plugin of additionalPlugins) {
    const id = plugin.id.trim();
    if (!id) throw new Error("Additional Better Auth plugins require a non-empty id.");
    if (pluginIds.has(id)) {
      throw new Error(`Better Auth plugin id ${id} is already configured.`);
    }
    pluginIds.add(id);
  }
  return {
    appName: "LiteMCP Composer",
    baseURL: options.baseURL,
    basePath: "/api/auth",
    database: options.database,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    ...(emailCallbacks
      ? {
          emailVerification: {
            sendVerificationEmail: emailCallbacks.sendVerificationEmail,
            sendOnSignUp: !demoMode,
          },
        }
      : {}),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !signupsEnabled,
      requireEmailVerification: !demoMode,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: demoMode,
      revokeSessionsOnPasswordReset: true,
      ...(emailCallbacks
        ? { sendResetPassword: emailCallbacks.sendResetPassword }
        : {}),
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 30,
      cookieCache: { enabled: false },
    },
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 300, max: 5 },
        "/sso/register": { window: 300, max: 3 },
      },
    },
    hooks: {
      before: enforceProviderNamespaces,
    },
    advanced: {
      useSecureCookies: !demoMode,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: !demoMode,
      },
      database: {
        generateId: "uuid",
      },
    },
    plugins: [...corePlugins, ...additionalPlugins],
  };
};

export const createLiteMcpAuth = (options: LiteMcpAuthOptions): LiteMcpAuth =>
  betterAuth(createLiteMcpAuthConfiguration(options)) as unknown as LiteMcpAuth;
