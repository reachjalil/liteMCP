import { MongoDocumentStore } from "@litemcp/adapter-mongodb";
import { createLiteMcpAuth } from "@litemcp/auth";
import { PlatformService } from "@litemcp/core";
import { BuiltinExecutor, McpGateway, RemoteHttpExecutor } from "@litemcp/mcp-gateway";
import { createPlatformApp } from "@litemcp/platform-api";
import { type DocumentStore, MemoryDocumentStore } from "@litemcp/storage";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import { createSecureNodeFetch } from "./secure-fetch.js";
import { SupervisedStdioExecutor } from "./stdio-executor.js";

export type ServerRuntime = {
  app: ReturnType<typeof createPlatformApp>;
  close(): Promise<void>;
};

const booleanEnv = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
};

const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const createServerRuntime = async (
  environment: NodeJS.ProcessEnv = process.env
): Promise<ServerRuntime> => {
  const demoMode = booleanEnv(environment.LITEMCP_DEMO_MODE, false);
  const publicOrigin = environment.API_ORIGIN ?? "http://localhost:8787";
  const webOrigins = splitList(environment.WEB_ORIGIN);
  if (webOrigins.length === 0) webOrigins.push("http://localhost:4321");

  let mongoClient: MongoClient | undefined;
  let store: DocumentStore = new MemoryDocumentStore();
  let auth: ReturnType<typeof createLiteMcpAuth> | undefined;

  if (environment.MONGODB_URI) {
    mongoClient = new MongoClient(environment.MONGODB_URI, {
      appName: "litemcp-server",
      maxPoolSize: 20,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 10_000,
    });
    await mongoClient.connect();
    const database = mongoClient.db(environment.MONGODB_DATABASE ?? "litemcp");
    const mongoStore = new MongoDocumentStore(database, mongoClient);
    await mongoStore.ensureIndexes();
    store = mongoStore;

    const authSecret = environment.BETTER_AUTH_SECRET;
    if (!authSecret) {
      if (!demoMode) {
        throw new Error("BETTER_AUTH_SECRET is required outside explicit demo mode.");
      }
    } else {
      auth = createLiteMcpAuth({
        database: mongodbAdapter(database, { client: mongoClient }),
        baseURL: environment.BETTER_AUTH_URL ?? publicOrigin,
        secret: authSecret,
        trustedOrigins: webOrigins,
        demoMode,
      });
    }
  }

  const platform = new PlatformService(store);
  const upstreamTimeoutMs = Number(environment.UPSTREAM_TIMEOUT_MS ?? "20000");
  const unsafeHostStdioEnabled = booleanEnv(
    environment.LITEMCP_ENABLE_UNSAFE_HOST_STDIO,
    false
  );
  const secureOutboundFetch = createSecureNodeFetch({
    // Private addresses and plaintext HTTP are only available in the explicit
    // local demo runtime. Production resolves and pins public addresses only.
    allowPrivateNetwork: demoMode,
    maxResponseBytes: Number(
      environment.UPSTREAM_MAX_RESPONSE_BYTES ?? String(2 * 1024 * 1024)
    ),
  });
  const executors = [
    new BuiltinExecutor(),
    new RemoteHttpExecutor(secureOutboundFetch, {
      allowPrivateNetwork: demoMode,
      timeoutMs: upstreamTimeoutMs,
    }),
    new SupervisedStdioExecutor({
      // This adapter is an evaluation escape hatch, not a sandbox. Requiring a
      // separately named unsafe opt-in prevents a populated allowlist from
      // silently enabling host command execution.
      allowedExecutables: unsafeHostStdioEnabled
        ? splitList(environment.LITEMCP_STDIO_ALLOWLIST)
        : [],
      timeoutMs: upstreamTimeoutMs,
    }),
  ];
  const gateway = new McpGateway({ platform, executors });
  const app = createPlatformApp({
    platform,
    gateway,
    auth,
    publicOrigin,
    webOrigins,
    demoMode,
  });
  return {
    app,
    close: async () => {
      await mongoClient?.close();
    },
  };
};
