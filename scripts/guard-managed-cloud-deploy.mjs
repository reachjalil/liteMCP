#!/usr/bin/env node

const target = process.argv[2];

if (target !== "production" && target !== "staging") {
  process.stderr.write(
    "Usage: node scripts/guard-managed-cloud-deploy.mjs production|staging\n"
  );
  process.exitCode = 2;
} else {
  process.stderr.write(
    `BLOCKED: ad-hoc managed-cloud ${target} deploys are disabled. Use the exact-CI-artifact workflows for routine releases or docs/operations/cloudflare-durable-object-lifecycle.md for a separately approved first deployment/lifecycle change.\n`
  );
  process.exitCode = 1;
}
