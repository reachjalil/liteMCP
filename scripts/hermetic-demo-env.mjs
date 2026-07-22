#!/usr/bin/env node

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const allowedEnvironmentNames = [
  "PATH",
  "SystemRoot",
  "COMSPEC",
  "PATHEXT",
  "TMPDIR",
  "TEMP",
  "TMP",
  "NO_COLOR",
  "FORCE_COLOR",
];

export const createHermeticDemoEnvironment = (source) =>
  Object.fromEntries(
    allowedEnvironmentNames.flatMap((name) =>
      typeof source[name] === "string" ? [[name, source[name]]] : []
    )
  );

const selfTest = () => {
  const result = createHermeticDemoEnvironment({
    PATH: "/safe/bin",
    TMPDIR: "/safe/tmp",
    MONGODB_URI: "mongodb://production.invalid",
    APPROVAL_WEBHOOK_URL: "https://hooks.invalid/production",
    RESEND_API_KEY: "must-not-cross-the-proof-boundary",
    EMAIL_FROM: "production@example.invalid",
    BETTER_AUTH_SECRET: "must-not-cross-the-proof-boundary",
    CREDENTIAL_MASTER_KEY: "must-not-cross-the-proof-boundary",
    ANALYTICS_ENABLED: "true",
    NODE_OPTIONS: "--import=must-not-cross-the-proof-boundary",
  });
  assert.deepEqual(result, { PATH: "/safe/bin", TMPDIR: "/safe/tmp" });
  process.stdout.write("PASS  local proof child environment is hermetic\n");
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  selfTest();
}
