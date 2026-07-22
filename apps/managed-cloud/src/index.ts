import { waitUntil } from "cloudflare:workers";
import {
  CloudflareAnalyticsEngineSink,
  CloudflareHybridDocumentStore,
  CloudflareTenantFeedStore,
  TenantAuthorityDurableObject,
  TenantFeedDurableObject,
} from "@litemcp/adapter-cloudflare";
import {
  CompositeAnalyticsSink,
  createFailOpenAnalyticsRecorder,
  type FailOpenAnalyticsRecorder,
} from "@litemcp/analytics";
import {
  createLiteMcpAuth,
  createResendEmailSender,
  type EmailSender,
} from "@litemcp/auth";
import { CredentialCipher, PlatformService } from "@litemcp/core";
import { BuiltinExecutor, McpGateway, RemoteHttpExecutor } from "@litemcp/mcp-gateway";
import { createPlatformApp } from "@litemcp/platform-api";
import * as Sentry from "@sentry/cloudflare";

export type CloudflareEnv = {
  ASSETS: Fetcher;
  AUTH_DB: D1Database;
  DATA_KV: KVNamespace;
  TENANT_AUTHORITY: DurableObjectNamespace;
  TENANT_FEED: DurableObjectNamespace;
  USAGE_ANALYTICS: AnalyticsEngineDataset;
  ANALYTICS_ENABLED?: string;
  TENANT_FEED_MAX_EVENTS?: string;
  BETTER_AUTH_SECRET?: string;
  PUBLIC_ORIGIN: string;
  WEB_ORIGINS: string;
  LITEMCP_DEMO_MODE?: string;
  SIGNUPS_ENABLED?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  CREDENTIAL_MASTER_KEY?: string;
  APPROVAL_WEBHOOK_URL?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
};

let cachedRuntime:
  | {
      authDatabase: D1Database;
      dataStore: KVNamespace;
      tenantAuthority: DurableObjectNamespace;
      tenantFeed: DurableObjectNamespace;
      usageAnalytics: AnalyticsEngineDataset;
      analyticsEnabled: string | undefined;
      secret: string | undefined;
      publicOrigin: string;
      webOrigins: string;
      demoMode: string | undefined;
      signupsEnabled: string | undefined;
      resendApiKey: string | undefined;
      emailFrom: string | undefined;
      emailReplyTo: string | undefined;
      credentialMasterKey: string | undefined;
      approvalWebhookUrl: string | undefined;
      app: ReturnType<typeof createPlatformApp>;
    }
  | undefined;

export const isSafeDemoOrigin = (origin: string) => {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
};

export const getCanonicalRedirect = (requestUrl: string, publicOrigin: string) => {
  try {
    const request = new URL(requestUrl);
    const canonical = new URL(publicOrigin);
    if (request.hostname !== `www.${canonical.hostname}`) return undefined;
    request.protocol = canonical.protocol;
    request.host = canonical.host;
    return request.toString();
  } catch {
    return undefined;
  }
};

export const shouldRouteToWorker = (pathname: string) =>
  pathname === "/health" ||
  pathname === "/ready" ||
  pathname.startsWith("/api/") ||
  pathname.startsWith("/mcp/") ||
  pathname.startsWith("/.well-known/") ||
  pathname.startsWith("/oauth/") ||
  pathname.startsWith("/demo-upstreams/");

const enabledEnv = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
};

export type ManagedAnalyticsBindings = {
  ANALYTICS_ENABLED?: string;
  TENANT_FEED?: DurableObjectNamespace;
  USAGE_ANALYTICS?: AnalyticsEngineDataset;
};

export type ManagedAnalyticsRuntime = {
  enabled: boolean;
  recorder?: FailOpenAnalyticsRecorder;
  query?: CloudflareTenantFeedStore;
};

/**
 * Creates the managed Insight Plane without coupling analytics to request
 * success. Cloudflare's request-scoped `waitUntil` is the production deferrer;
 * tests may inject an equivalent scheduler.
 */
export const resolveManagedAnalyticsRuntime = (
  env: ManagedAnalyticsBindings,
  defer: (work: Promise<void>) => void = waitUntil
): ManagedAnalyticsRuntime => {
  const enabled = enabledEnv(env.ANALYTICS_ENABLED, false);
  if (!enabled) return { enabled: false };
  if (!env.USAGE_ANALYTICS || !env.TENANT_FEED) {
    throw new Error(
      "ANALYTICS_ENABLED requires USAGE_ANALYTICS and TENANT_FEED bindings."
    );
  }
  const query = new CloudflareTenantFeedStore(env.TENANT_FEED);
  const sink = new CompositeAnalyticsSink([
    new CloudflareAnalyticsEngineSink(env.USAGE_ANALYTICS),
    query,
  ]);
  return {
    enabled: true,
    query,
    recorder: createFailOpenAnalyticsRecorder(sink, { defer }),
  };
};

export type ManagedCloudAuthConfiguration = {
  demoMode: boolean;
  signupsEnabled: boolean;
  emailSender?: EmailSender;
};

export const resolveManagedCloudAuthConfiguration = (
  env: Pick<
    CloudflareEnv,
    | "BETTER_AUTH_SECRET"
    | "PUBLIC_ORIGIN"
    | "LITEMCP_DEMO_MODE"
    | "SIGNUPS_ENABLED"
    | "RESEND_API_KEY"
    | "EMAIL_FROM"
    | "EMAIL_REPLY_TO"
  >
): ManagedCloudAuthConfiguration => {
  const demoMode = enabledEnv(env.LITEMCP_DEMO_MODE, false);
  if (demoMode && !isSafeDemoOrigin(env.PUBLIC_ORIGIN)) {
    throw new Error(
      "Managed-cloud demo mode requires a loopback PUBLIC_ORIGIN and cannot be enabled on a public deployment."
    );
  }
  const signupsEnabled = enabledEnv(env.SIGNUPS_ENABLED, demoMode);
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (Boolean(apiKey) !== Boolean(from)) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM must be configured together for email delivery."
    );
  }
  const emailSender =
    apiKey && from
      ? createResendEmailSender({
          apiKey,
          from,
          replyTo: env.EMAIL_REPLY_TO,
        })
      : undefined;
  if (!demoMode && !env.BETTER_AUTH_SECRET?.trim()) {
    throw new Error("BETTER_AUTH_SECRET is required for managed cloud.");
  }
  if (!demoMode && signupsEnabled && !emailSender) {
    throw new Error(
      "Email delivery is required when production SIGNUPS_ENABLED is true."
    );
  }
  return { demoMode, signupsEnabled, emailSender };
};

const createRequestApp = (env: CloudflareEnv) => {
  if (
    cachedRuntime?.authDatabase === env.AUTH_DB &&
    cachedRuntime.dataStore === env.DATA_KV &&
    cachedRuntime.tenantAuthority === env.TENANT_AUTHORITY &&
    cachedRuntime.tenantFeed === env.TENANT_FEED &&
    cachedRuntime.usageAnalytics === env.USAGE_ANALYTICS &&
    cachedRuntime.analyticsEnabled === env.ANALYTICS_ENABLED &&
    cachedRuntime.secret === env.BETTER_AUTH_SECRET &&
    cachedRuntime.publicOrigin === env.PUBLIC_ORIGIN &&
    cachedRuntime.webOrigins === env.WEB_ORIGINS &&
    cachedRuntime.demoMode === env.LITEMCP_DEMO_MODE &&
    cachedRuntime.signupsEnabled === env.SIGNUPS_ENABLED &&
    cachedRuntime.resendApiKey === env.RESEND_API_KEY &&
    cachedRuntime.emailFrom === env.EMAIL_FROM &&
    cachedRuntime.emailReplyTo === env.EMAIL_REPLY_TO &&
    cachedRuntime.credentialMasterKey === env.CREDENTIAL_MASTER_KEY &&
    cachedRuntime.approvalWebhookUrl === env.APPROVAL_WEBHOOK_URL
  ) {
    return cachedRuntime.app;
  }
  const { demoMode, signupsEnabled, emailSender } =
    resolveManagedCloudAuthConfiguration(env);
  const store = new CloudflareHybridDocumentStore(env.DATA_KV, env.TENANT_AUTHORITY);
  const analytics = resolveManagedAnalyticsRuntime(env);
  const credentialMasterKey = env.CREDENTIAL_MASTER_KEY?.trim();
  const approvalWebhookUrl = env.APPROVAL_WEBHOOK_URL?.trim();
  const platform = new PlatformService(store, {
    analyticsEnabled: analytics.enabled,
    ...(analytics.recorder ? { analyticsRecorder: analytics.recorder } : {}),
    ...(credentialMasterKey
      ? { credentialCipher: new CredentialCipher(credentialMasterKey) }
      : {}),
    ...(approvalWebhookUrl
      ? {
          approvalNotifier: async (notification) => {
            const response = await fetch(approvalWebhookUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                text: `LiteMCP approval ${notification.approvalId} is waiting for ${notification.toolName}.`,
                litemcp: notification,
              }),
              redirect: "error",
              signal: AbortSignal.timeout(5_000),
            });
            if (!response.ok) {
              throw new Error(`Approval webhook returned HTTP ${response.status}.`);
            }
          },
        }
      : {}),
  });
  const gateway = new McpGateway({
    platform,
    executors: [
      new BuiltinExecutor(),
      new RemoteHttpExecutor(fetch, {
        allowPrivateNetwork: false,
        timeoutMs: 20_000,
      }),
    ],
  });
  const webOrigins = env.WEB_ORIGINS.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const auth = env.BETTER_AUTH_SECRET
    ? createLiteMcpAuth({
        database: env.AUTH_DB,
        baseURL: env.PUBLIC_ORIGIN,
        secret: env.BETTER_AUTH_SECRET,
        trustedOrigins: webOrigins,
        demoMode,
        signupsEnabled,
        emailSender,
        applicationURL: webOrigins[0] ?? env.PUBLIC_ORIGIN,
      })
    : undefined;
  const app = createPlatformApp({
    platform,
    gateway,
    ...(analytics.query ? { analytics: analytics.query } : {}),
    auth,
    publicOrigin: env.PUBLIC_ORIGIN,
    webOrigins,
    demoMode,
    ...(env.SENTRY_DSN
      ? {
          reportError: ({ error, requestId, request }) => {
            Sentry.withScope((scope) => {
              scope.setTag("request_id", requestId);
              scope.setTag("route", new URL(request.url).pathname);
              scope.setContext("request", { method: request.method });
              Sentry.captureException(error);
            });
          },
        }
      : {}),
  });
  cachedRuntime = {
    authDatabase: env.AUTH_DB,
    dataStore: env.DATA_KV,
    tenantAuthority: env.TENANT_AUTHORITY,
    tenantFeed: env.TENANT_FEED,
    usageAnalytics: env.USAGE_ANALYTICS,
    analyticsEnabled: env.ANALYTICS_ENABLED,
    secret: env.BETTER_AUTH_SECRET,
    publicOrigin: env.PUBLIC_ORIGIN,
    webOrigins: env.WEB_ORIGINS,
    demoMode: env.LITEMCP_DEMO_MODE,
    signupsEnabled: env.SIGNUPS_ENABLED,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
    emailReplyTo: env.EMAIL_REPLY_TO,
    credentialMasterKey: env.CREDENTIAL_MASTER_KEY,
    approvalWebhookUrl: env.APPROVAL_WEBHOOK_URL,
    app,
  };
  return app;
};

const handler = {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    const canonicalRedirect = getCanonicalRedirect(request.url, env.PUBLIC_ORIGIN);
    if (canonicalRedirect) return Response.redirect(canonicalRedirect, 308);
    if (!shouldRouteToWorker(url.pathname)) return env.ASSETS.fetch(request);
    return createRequestApp(env).fetch(request);
  },
} satisfies ExportedHandler<CloudflareEnv>;

export default Sentry.withSentry(
  (env: CloudflareEnv) => ({
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.SENTRY_ENVIRONMENT ?? "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  }),
  handler
);

export { TenantAuthorityDurableObject, TenantFeedDurableObject };
