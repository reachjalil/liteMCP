#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(directory, "wrangler.jsonc"), "utf8"));
const environmentName = process.argv[2] ?? "production";
const target =
  environmentName === "production" ? config : config.env?.[environmentName];
if (!target) {
  throw new Error(`Unknown managed-cloud environment: ${environmentName}`);
}

const publicOrigin = target.vars?.PUBLIC_ORIGIN;
const signupsEnabled = target.vars?.SIGNUPS_ENABLED;
const demoMode = target.vars?.LITEMCP_DEMO_MODE;
if (!publicOrigin || !["false", "true"].includes(signupsEnabled)) {
  throw new Error(
    `Managed-cloud ${environmentName} must define PUBLIC_ORIGIN and SIGNUPS_ENABLED.`
  );
}

process.stdout.write(
  `Building web assets for managed-cloud ${environmentName} (${publicOrigin}).\n`
);
const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(executable, ["--filter", "@litemcp/web", "build"], {
  cwd: resolve(directory, "../.."),
  env: {
    ...process.env,
    LITEMCP_DEMO_MODE: demoMode ?? "false",
    PUBLIC_API_ORIGIN: publicOrigin,
    SIGNUPS_ENABLED: signupsEnabled,
  },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
