import { serve } from "@hono/node-server";

import { createServerRuntime } from "./runtime.js";

const port = Number(process.env.PORT ?? "8787");
const demoValue = process.env.LITEMCP_DEMO_MODE?.toLowerCase();
const demoMode = demoValue === "true" || demoValue === "1";
const insecureDevValue = process.env.LITEMCP_INSECURE_DEV?.toLowerCase();
const insecureDev = insecureDevValue === "true" || insecureDevValue === "1";
const localDevelopment = demoMode || insecureDev;
const hostname = process.env.HOST ?? (localDevelopment ? "127.0.0.1" : "0.0.0.0");
const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
if (
  localDevelopment &&
  !loopbackHosts.has(hostname) &&
  process.env.LITEMCP_UNSAFE_DEMO_BIND !== "true"
) {
  throw new Error(
    "Demo and insecure-development modes may bind only to loopback. Set LITEMCP_UNSAFE_DEMO_BIND=true only in an isolated test environment."
  );
}
const runtime = await createServerRuntime();
const server = serve({ fetch: runtime.app.fetch, port, hostname }, (info) => {
  console.log(`[litemcp] server listening on http://${info.address}:${info.port}`);
});

const shutdown = async (signal: string) => {
  console.log(`[litemcp] received ${signal}; draining.`);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await runtime.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
