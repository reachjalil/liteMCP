import { CloudflareKvDocumentStore } from "@litemcp/adapter-cloudflare";
import { createLiteMcpAuth } from "@litemcp/auth";
import { PlatformService } from "@litemcp/core";
import { BuiltinExecutor, McpGateway, RemoteHttpExecutor } from "@litemcp/mcp-gateway";
import { createPlatformApp } from "@litemcp/platform-api";

export type CloudflareEnv = {
  ASSETS: Fetcher;
  AUTH_DB: D1Database;
  DATA_KV: KVNamespace;
  BETTER_AUTH_SECRET: string;
  PUBLIC_ORIGIN: string;
  WEB_ORIGINS: string;
  LITEMCP_DEMO_MODE: string;
};

let cachedRuntime:
  | {
      authDatabase: D1Database;
      dataStore: KVNamespace;
      secret: string;
      publicOrigin: string;
      webOrigins: string;
      demoMode: string;
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

const createRequestApp = (env: CloudflareEnv) => {
  if (
    cachedRuntime?.authDatabase === env.AUTH_DB &&
    cachedRuntime.dataStore === env.DATA_KV &&
    cachedRuntime.secret === env.BETTER_AUTH_SECRET &&
    cachedRuntime.publicOrigin === env.PUBLIC_ORIGIN &&
    cachedRuntime.webOrigins === env.WEB_ORIGINS &&
    cachedRuntime.demoMode === env.LITEMCP_DEMO_MODE
  ) {
    return cachedRuntime.app;
  }
  const demoMode = env.LITEMCP_DEMO_MODE === "true";
  if (demoMode && !isSafeDemoOrigin(env.PUBLIC_ORIGIN)) {
    throw new Error(
      "Managed-cloud demo mode requires a loopback PUBLIC_ORIGIN and cannot be enabled on a public deployment."
    );
  }
  const store = new CloudflareKvDocumentStore(env.DATA_KV);
  const platform = new PlatformService(store);
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
      })
    : undefined;
  const app = createPlatformApp({
    platform,
    gateway,
    auth,
    publicOrigin: env.PUBLIC_ORIGIN,
    webOrigins,
    demoMode,
  });
  cachedRuntime = {
    authDatabase: env.AUTH_DB,
    dataStore: env.DATA_KV,
    secret: env.BETTER_AUTH_SECRET,
    publicOrigin: env.PUBLIC_ORIGIN,
    webOrigins: env.WEB_ORIGINS,
    demoMode: env.LITEMCP_DEMO_MODE,
    app,
  };
  return app;
};

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    const canonicalRedirect = getCanonicalRedirect(request.url, env.PUBLIC_ORIGIN);
    if (canonicalRedirect) return Response.redirect(canonicalRedirect, 308);
    const workerFirst =
      url.pathname === "/health" ||
      url.pathname === "/ready" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/mcp/") ||
      url.pathname.startsWith("/demo-upstreams/");
    if (!workerFirst) return env.ASSETS.fetch(request);
    return createRequestApp(env).fetch(request);
  },
} satisfies ExportedHandler<CloudflareEnv>;
