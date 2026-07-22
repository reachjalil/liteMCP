import {
  type MongoAnalyticsFailure,
  type MongoAnalyticsOptions,
  MongoAnalyticsStore,
  MongoDocumentStore,
} from "@litemcp/adapter-mongodb";
import {
  type AnalyticsQuery,
  type AnalyticsRecorderFailure,
  type AnalyticsSink,
  createFailOpenAnalyticsRecorder,
  type FailOpenAnalyticsRecorder,
  MemoryAnalyticsStore,
} from "@litemcp/analytics";
import {
  createLiteMcpAuth,
  createResendEmailSender,
  type EmailSender,
} from "@litemcp/auth";
import {
  CredentialCipher,
  type PlatformQuotaLimits,
  PlatformService,
  UNLIMITED_PLATFORM_QUOTAS,
} from "@litemcp/core";
import { BuiltinExecutor, McpGateway, RemoteHttpExecutor } from "@litemcp/mcp-gateway";
import { createPlatformApp } from "@litemcp/platform-api";
import { type DocumentStore, MemoryDocumentStore } from "@litemcp/storage";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { type Db, MongoClient } from "mongodb";
import { createSecureNodeFetch } from "./secure-fetch.js";
import { SupervisedStdioExecutor } from "./stdio-executor.js";

export type ServerRuntime = {
  app: ReturnType<typeof createPlatformApp>;
  close(): Promise<void>;
};

export type ServerAnalyticsConfig = {
  enabled: boolean;
  retentionSeconds: number;
  maxQueueSize: number;
  batchSize: number;
  flushIntervalMs: number;
};

export type ServerAnalyticsFailure = {
  source: "runtime" | "recorder" | "mongodb";
  phase: string;
  error: unknown;
  droppedEvents?: number;
};

export type ServerAnalyticsStore = AnalyticsSink &
  AnalyticsQuery & {
    flush?: () => Promise<void>;
  };

export type ServerAnalyticsDependencies = {
  createMemoryStore?: () => ServerAnalyticsStore;
  createMongoStore?: (
    database: Db,
    options: MongoAnalyticsOptions
  ) => ServerAnalyticsStore;
  onFailure?: (failure: ServerAnalyticsFailure) => void;
};

export type ServerRuntimeOptions = {
  analytics?: ServerAnalyticsDependencies;
};

export type ServerQuotaConfig = PlatformQuotaLimits;

export type ServerAnalyticsRuntime = {
  enabled: boolean;
  query?: AnalyticsQuery;
  recorder?: FailOpenAnalyticsRecorder;
  flush(): Promise<void>;
};

const ANALYTICS_DEFAULT_RETENTION_DAYS = 90;
const ANALYTICS_DEFAULT_MAX_QUEUE_SIZE = 10_000;
const ANALYTICS_DEFAULT_BATCH_SIZE = 250;
const ANALYTICS_DEFAULT_FLUSH_INTERVAL_MS = 100;
const SECONDS_PER_DAY = 24 * 60 * 60;

const booleanEnv = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
};

const strictBooleanEnv = (
  name: string,
  value: string | undefined,
  fallback: boolean
) => {
  if (value === undefined) return fallback;
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
      return true;
    case "0":
    case "false":
      return false;
    default:
      throw new Error(`${name} must be true, false, 1, or 0.`);
  }
};

const boundedIntegerEnv = (
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) => {
  if (value === undefined) return fallback;
  const parsed = Number(value.trim());
  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum ||
    value.trim() === ""
  ) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
};

export const parseServerAnalyticsConfig = (
  environment: NodeJS.ProcessEnv
): ServerAnalyticsConfig => {
  const retentionDays = boundedIntegerEnv(
    "ANALYTICS_RETENTION_DAYS",
    environment.ANALYTICS_RETENTION_DAYS,
    ANALYTICS_DEFAULT_RETENTION_DAYS,
    1,
    3_650
  );
  return {
    enabled: strictBooleanEnv(
      "ANALYTICS_ENABLED",
      environment.ANALYTICS_ENABLED,
      false
    ),
    retentionSeconds: retentionDays * SECONDS_PER_DAY,
    maxQueueSize: boundedIntegerEnv(
      "ANALYTICS_MAX_QUEUE_SIZE",
      environment.ANALYTICS_MAX_QUEUE_SIZE,
      ANALYTICS_DEFAULT_MAX_QUEUE_SIZE,
      1,
      100_000
    ),
    batchSize: boundedIntegerEnv(
      "ANALYTICS_BATCH_SIZE",
      environment.ANALYTICS_BATCH_SIZE,
      ANALYTICS_DEFAULT_BATCH_SIZE,
      1,
      1_000
    ),
    flushIntervalMs: boundedIntegerEnv(
      "ANALYTICS_FLUSH_INTERVAL_MS",
      environment.ANALYTICS_FLUSH_INTERVAL_MS,
      ANALYTICS_DEFAULT_FLUSH_INTERVAL_MS,
      0,
      60_000
    ),
  };
};

export const parseServerQuotaConfig = (
  environment: NodeJS.ProcessEnv
): ServerQuotaConfig => ({
  servers: boundedIntegerEnv(
    "LITEMCP_QUOTA_SERVERS",
    environment.LITEMCP_QUOTA_SERVERS,
    UNLIMITED_PLATFORM_QUOTAS.servers,
    0,
    Number.MAX_SAFE_INTEGER
  ),
  compositions: boundedIntegerEnv(
    "LITEMCP_QUOTA_COMPOSITIONS",
    environment.LITEMCP_QUOTA_COMPOSITIONS,
    UNLIMITED_PLATFORM_QUOTAS.compositions,
    0,
    Number.MAX_SAFE_INTEGER
  ),
  activeSessions: boundedIntegerEnv(
    "LITEMCP_QUOTA_ACTIVE_SESSIONS",
    environment.LITEMCP_QUOTA_ACTIVE_SESSIONS,
    UNLIMITED_PLATFORM_QUOTAS.activeSessions,
    0,
    Number.MAX_SAFE_INTEGER
  ),
  toolCallsPerDay: boundedIntegerEnv(
    "LITEMCP_QUOTA_TOOL_CALLS_PER_DAY",
    environment.LITEMCP_QUOTA_TOOL_CALLS_PER_DAY,
    UNLIMITED_PLATFORM_QUOTAS.toolCallsPerDay,
    0,
    Number.MAX_SAFE_INTEGER
  ),
});

const defaultAnalyticsFailureReporter = (failure: ServerAnalyticsFailure) => {
  const detail =
    failure.error instanceof Error ? failure.error.message : String(failure.error);
  console.warn(
    `[litemcp] analytics ${failure.source}/${failure.phase} failed; continuing: ${detail}`
  );
};

const safeReportAnalyticsFailure = (
  reporter: (failure: ServerAnalyticsFailure) => void,
  failure: ServerAnalyticsFailure
) => {
  try {
    reporter(failure);
  } catch {
    // Analytics diagnostics must remain fail-open too.
  }
};

const recorderFailure = (
  failure: AnalyticsRecorderFailure
): ServerAnalyticsFailure => ({
  source: "recorder",
  phase: failure.phase,
  error: failure.error,
});

const mongoFailure = (failure: MongoAnalyticsFailure): ServerAnalyticsFailure => ({
  source: "mongodb",
  phase: failure.phase,
  error: failure.error,
  droppedEvents: failure.droppedEvents,
});

const disabledAnalyticsRuntime = (): ServerAnalyticsRuntime => ({
  enabled: false,
  async flush() {},
});

export const createServerAnalyticsRuntime = (
  config: ServerAnalyticsConfig,
  database?: Db,
  dependencies: ServerAnalyticsDependencies = {}
): ServerAnalyticsRuntime => {
  if (!config.enabled) return disabledAnalyticsRuntime();

  const reporter = dependencies.onFailure ?? defaultAnalyticsFailureReporter;
  const report = (failure: ServerAnalyticsFailure) =>
    safeReportAnalyticsFailure(reporter, failure);
  let store: ServerAnalyticsStore;
  try {
    if (database) {
      const options: MongoAnalyticsOptions = {
        retentionSeconds: config.retentionSeconds,
        maxQueueSize: config.maxQueueSize,
        batchSize: config.batchSize,
        flushIntervalMs: config.flushIntervalMs,
        onError: (failure) => report(mongoFailure(failure)),
      };
      store = dependencies.createMongoStore
        ? dependencies.createMongoStore(database, options)
        : new MongoAnalyticsStore(database, options);
    } else {
      store = dependencies.createMemoryStore
        ? dependencies.createMemoryStore()
        : new MemoryAnalyticsStore();
    }
  } catch (error) {
    report({ source: "runtime", phase: "initialization", error });
    return disabledAnalyticsRuntime();
  }

  const recorder = createFailOpenAnalyticsRecorder(store, {
    onError: (failure) => report(recorderFailure(failure)),
  });
  return {
    enabled: true,
    query: store,
    recorder,
    async flush() {
      try {
        await recorder.flush();
      } catch (error) {
        report({ source: "runtime", phase: "recorder_flush", error });
      }
      try {
        await store.flush?.();
      } catch (error) {
        report({ source: "runtime", phase: "store_flush", error });
      }
    },
  };
};

const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const createEmailSender = (environment: NodeJS.ProcessEnv): EmailSender | undefined => {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.EMAIL_FROM?.trim();
  if (!apiKey && !from) return undefined;
  if (!apiKey || !from) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM must be configured together for email delivery."
    );
  }
  return createResendEmailSender({
    apiKey,
    from,
    replyTo: environment.EMAIL_REPLY_TO,
  });
};

export const createServerRuntime = async (
  environment: NodeJS.ProcessEnv = process.env,
  options: ServerRuntimeOptions = {}
): Promise<ServerRuntime> => {
  const demoMode = booleanEnv(environment.LITEMCP_DEMO_MODE, false);
  const insecureDev = booleanEnv(environment.LITEMCP_INSECURE_DEV, false);
  const localDevelopment = demoMode || insecureDev;
  const signupsEnabled = booleanEnv(environment.SIGNUPS_ENABLED, localDevelopment);
  const publicOrigin = environment.API_ORIGIN ?? "http://localhost:8787";
  const webOrigins = splitList(environment.WEB_ORIGIN);
  if (webOrigins.length === 0) webOrigins.push("http://localhost:4321");
  const emailSender = createEmailSender(environment);
  const authSecret = environment.BETTER_AUTH_SECRET;
  const analyticsConfig = parseServerAnalyticsConfig(environment);
  const quotas = parseServerQuotaConfig(environment);

  if (!localDevelopment && !environment.MONGODB_URI?.trim()) {
    throw new Error(
      "MONGODB_URI is required outside explicit demo or insecure-development mode."
    );
  }
  if (!localDevelopment && !authSecret?.trim()) {
    throw new Error(
      "BETTER_AUTH_SECRET is required outside explicit demo or insecure-development mode."
    );
  }
  if (!localDevelopment && signupsEnabled && !emailSender) {
    throw new Error(
      "Email delivery is required when production SIGNUPS_ENABLED is true."
    );
  }
  if (authSecret && authSecret.trim().length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
  const credentialMasterKey = environment.CREDENTIAL_MASTER_KEY?.trim();
  const credentialCipher = credentialMasterKey
    ? new CredentialCipher(credentialMasterKey)
    : undefined;

  let mongoClient: MongoClient | undefined;
  let mongoDatabase: Db | undefined;
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
    mongoDatabase = database;
    const mongoStore = new MongoDocumentStore(database, mongoClient);
    await mongoStore.ensureIndexes();
    store = mongoStore;

    if (authSecret) {
      auth = createLiteMcpAuth({
        database: mongodbAdapter(database, { client: mongoClient }),
        baseURL: environment.BETTER_AUTH_URL ?? publicOrigin,
        secret: authSecret,
        trustedOrigins: webOrigins,
        demoMode: localDevelopment,
        signupsEnabled,
        emailSender,
        applicationURL: webOrigins[0],
      });
    }
  }

  const analytics = createServerAnalyticsRuntime(
    analyticsConfig,
    mongoDatabase,
    options.analytics
  );
  const approvalWebhookUrl = environment.APPROVAL_WEBHOOK_URL?.trim();
  const platform = new PlatformService(store, {
    quotas,
    ...(credentialCipher ? { credentialCipher } : {}),
    ...(analytics.recorder ? { analyticsRecorder: analytics.recorder } : {}),
    analyticsEnabled: analytics.enabled,
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
  const upstreamTimeoutMs = Number(environment.UPSTREAM_TIMEOUT_MS ?? "20000");
  const unsafeHostStdioEnabled = booleanEnv(
    environment.LITEMCP_ENABLE_UNSAFE_HOST_STDIO,
    false
  );
  const secureOutboundFetch = createSecureNodeFetch({
    // Private addresses and plaintext HTTP are available only in explicit
    // local-development modes. Production resolves and pins public addresses.
    allowPrivateNetwork: localDevelopment,
    maxResponseBytes: Number(
      environment.UPSTREAM_MAX_RESPONSE_BYTES ?? String(2 * 1024 * 1024)
    ),
  });
  const executors = [
    new BuiltinExecutor(),
    new RemoteHttpExecutor(secureOutboundFetch, {
      allowPrivateNetwork: localDevelopment,
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
    ...(analytics.query ? { analytics: analytics.query } : {}),
    auth,
    publicOrigin,
    webOrigins,
    demoMode: localDevelopment,
  });
  return {
    app,
    close: async () => {
      try {
        await analytics.flush();
      } finally {
        await mongoClient?.close();
      }
    },
  };
};
