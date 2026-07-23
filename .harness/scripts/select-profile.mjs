import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const profiles = [
  "deployment",
  "fast-iteration",
  "identity",
  "mcp-compatibility",
  "observability",
  "open-core",
  "release",
  "security",
];

const root = process.cwd();
const manifest = resolve(root, ".harness/harness.toml");
const selector = resolve(root, ".harnessProfile");
const requested = process.argv[2];

if (!existsSync(manifest)) {
  throw new Error("Run this command from the LiteMCP repository root.");
}

if (!requested || requested === "list" || requested === "--list") {
  console.log(profiles.join("\n"));
  process.exit(0);
}

if (requested === "clear") {
  if (existsSync(selector)) {
    unlinkSync(selector);
  }
  console.log("Cleared the local Harness profile selector.");
} else {
  if (!profiles.includes(requested)) {
    throw new Error(
      `Unknown profile "${requested}". Choose one of: ${profiles.join(", ")}`
    );
  }
  writeFileSync(selector, `${requested}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`Selected the local Harness profile: ${requested}`);
}

console.log("Next: pnpm harness:validate && pnpm harness:preview");
console.log("After reviewing the plan: pnpm harness:activate");
