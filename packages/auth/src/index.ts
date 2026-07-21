import { apiKey } from "@better-auth/api-key";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, bearer, jwt, organization, twoFactor } from "better-auth/plugins";

const encoder = new TextEncoder();

const hashSecret = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export type LiteMcpAuthOptions = {
  database: NonNullable<BetterAuthOptions["database"]>;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  demoMode?: boolean;
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
export const createLiteMcpAuth = (options: LiteMcpAuthOptions): LiteMcpAuth => {
  if (options.secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
  const demoMode = options.demoMode === true;
  return betterAuth({
    appName: "LiteMCP Composer",
    baseURL: options.baseURL,
    basePath: "/api/auth",
    database: options.database,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: !demoMode,
      requireEmailVerification: !demoMode,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: demoMode,
      revokeSessionsOnPasswordReset: true,
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
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 300, max: 5 },
        "/sso/register": { window: 300, max: 3 },
      },
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
    plugins: [
      organization({
        allowUserToCreateOrganization: demoMode,
        requireEmailVerificationOnInvitation: true,
        membershipLimit: 10_000,
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
      scim({
        requiredRole: ["owner", "admin"],
        providerOwnership: { enabled: true },
        storeSCIMToken: { hash: hashSecret },
      }),
    ],
  }) as unknown as LiteMcpAuth;
};
