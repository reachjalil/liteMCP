#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseDocument } from "yaml";

const root = process.cwd();
const harnessBinary = resolve(
  root,
  "node_modules/.bin",
  process.platform === "win32" ? "harnessc.cmd" : "harnessc"
);
const profiles = [
  "deployment",
  "fast-iteration",
  "identity",
  "mcp-compatibility",
  "observability",
  "release",
  "security",
];

const validateSkills = () => {
  const skillsRoot = resolve(root, ".harness/resources/skills");
  const skillNames = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (skillNames.length < 9) {
    throw new Error(
      `Expected at least nine portable skills; found ${skillNames.length}.`
    );
  }

  for (const directoryName of skillNames) {
    const markdown = readFileSync(
      resolve(skillsRoot, directoryName, "SKILL.md"),
      "utf8"
    );
    const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!frontmatter) {
      throw new Error(`${directoryName}/SKILL.md has no YAML frontmatter.`);
    }
    const frontmatterDocument = parseDocument(frontmatter[1], { uniqueKeys: true });
    if (frontmatterDocument.errors.length > 0) {
      throw new Error(
        `${directoryName}/SKILL.md has invalid frontmatter: ${frontmatterDocument.errors[0].message}`
      );
    }
    const metadata = frontmatterDocument.toJS();
    if (
      metadata?.name !== directoryName ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directoryName) ||
      directoryName.length > 64
    ) {
      throw new Error(`${directoryName}/SKILL.md has an invalid or mismatched name.`);
    }
    if (
      typeof metadata.description !== "string" ||
      metadata.description.trim().length === 0 ||
      metadata.description.length > 1024 ||
      /[<>]/.test(metadata.description)
    ) {
      throw new Error(`${directoryName}/SKILL.md has an invalid description.`);
    }

    const interfacePath = resolve(skillsRoot, directoryName, "agents/openai.yaml");
    const interfaceDocument = parseDocument(readFileSync(interfacePath, "utf8"), {
      uniqueKeys: true,
    });
    if (interfaceDocument.errors.length > 0) {
      throw new Error(
        `${directoryName}/agents/openai.yaml is invalid: ${interfaceDocument.errors[0].message}`
      );
    }
    const interfaceConfig = interfaceDocument.toJS()?.interface;
    if (
      typeof interfaceConfig?.display_name !== "string" ||
      typeof interfaceConfig?.short_description !== "string" ||
      interfaceConfig.short_description.length > 80 ||
      typeof interfaceConfig?.default_prompt !== "string" ||
      !interfaceConfig.default_prompt.includes(`$${directoryName}`)
    ) {
      throw new Error(
        `${directoryName}/agents/openai.yaml is incomplete or mismatched.`
      );
    }
  }
  process.stdout.write(
    `SKILLS   ${skillNames.length}=frontmatter-and-interface-valid\n`
  );
};

const runHarnessIn = (cwd, ...args) => {
  const result = spawnSync(harnessBinary, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`harnessc ${args.join(" ")} exited with ${result.status}.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`harnessc ${args.join(" ")} did not return JSON: ${error.message}`);
  }
};

const runHarness = (...args) => runHarnessIn(root, ...args);

const readPlan = (result) => result.activation?.plan ?? result.plan;

const allActions = (plan) => [
  ...plan.targets.flatMap((target) =>
    target.actions.map((action) => ({
      kind: action.kind,
      scope: target.path,
      path: action.relativePath,
    }))
  ),
  ...(plan.dir?.actions ?? []).map((action) => ({
    kind: action.kind,
    scope: "dir",
    path: action.relativePath,
  })),
];

const assertPlan = (plan, allowedKinds, label) => {
  if (!plan) throw new Error(`${label} did not include an activation plan.`);
  const unexpected = allActions(plan).filter(
    (action) => !allowedKinds.has(action.kind)
  );
  if (unexpected.length > 0) {
    throw new Error(
      `${label} contains unexpected actions:\n${unexpected
        .map((action) => `- ${action.kind} ${action.scope}/${action.path}`)
        .join("\n")}`
    );
  }
};

const summarize = (plan) => {
  const counts = new Map();
  for (const action of allActions(plan)) {
    const key = `${action.scope}:${action.kind}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
};

validateSkills();

const validation = runHarness("validate", "--json");
if ((validation.diagnostics ?? []).some((diagnostic) => diagnostic.level === "error")) {
  throw new Error("Harness validation returned error diagnostics.");
}

const before = readPlan(runHarness("activate", "--json"));
const targetPaths = before.targets.map((target) => target.path).sort();
if (JSON.stringify(targetPaths) !== JSON.stringify(["./.agents", "./.claude"])) {
  throw new Error(`Unexpected Harness targets: ${targetPaths.join(", ")}`);
}
assertPlan(
  before,
  new Set(["create", "update", "keep", "preserve", "mutable"]),
  "Pre-apply preview"
);
process.stdout.write(`PREVIEW  ${summarize(before)}\n`);

const applied = readPlan(runHarness("activate", "--yes", "--json"));
assertPlan(
  applied,
  new Set(["create", "update", "keep", "preserve", "mutable"]),
  "Apply"
);
process.stdout.write(`APPLY    ${summarize(applied)}\n`);

const converged = readPlan(runHarness("activate", "--json"));
assertPlan(converged, new Set(["keep", "preserve"]), "Convergence preview");
if (converged.idempotent !== true) {
  throw new Error("Harness convergence preview did not report idempotent=true.");
}
process.stdout.write(`CONVERGE ${summarize(converged)}\n`);

for (const profile of [null, ...profiles]) {
  const label = profile ?? "neutral";
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "litemcp-harness-profile-"));
  try {
    cpSync(resolve(root, ".harness"), resolve(temporaryRoot, ".harness"), {
      recursive: true,
    });
    cpSync(resolve(root, ".harnessIgnore"), resolve(temporaryRoot, ".harnessIgnore"));
    if (profile) {
      writeFileSync(resolve(temporaryRoot, ".harnessProfile"), `${profile}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    }

    const profileValidation = runHarnessIn(temporaryRoot, "validate", "--json");
    if (
      (profileValidation.diagnostics ?? []).some(
        (diagnostic) => diagnostic.level === "error"
      )
    ) {
      throw new Error(`${label} profile validation returned error diagnostics.`);
    }
    const profilePreview = readPlan(runHarnessIn(temporaryRoot, "activate", "--json"));
    assertPlan(
      profilePreview,
      new Set(["create", "update", "keep", "preserve", "mutable"]),
      `${label} profile preview`
    );
    runHarnessIn(temporaryRoot, "activate", "--yes", "--json");

    const instructions = readFileSync(resolve(temporaryRoot, "AGENTS.md"), "utf8");
    const activeFocuses = instructions.match(/^## Active focus: .+$/gm) ?? [];
    const expectedFocuses = profile
      ? [
          readFileSync(
            resolve(
              root,
              ".harness/profiles",
              profile,
              "dir/AGENTS.md/250_active_profile.md"
            ),
            "utf8"
          )
            .split("\n")
            .find((line) => line.startsWith("## Active focus: ")),
        ]
      : [];
    if (JSON.stringify(activeFocuses) !== JSON.stringify(expectedFocuses)) {
      throw new Error(
        `${label} profile composed ${JSON.stringify(activeFocuses)}; expected ${JSON.stringify(expectedFocuses)}.`
      );
    }

    const profileConvergence = readPlan(
      runHarnessIn(temporaryRoot, "activate", "--json")
    );
    assertPlan(
      profileConvergence,
      new Set(["keep", "preserve"]),
      `${label} profile convergence preview`
    );
    if (profileConvergence.idempotent !== true) {
      throw new Error(`${label} profile did not converge.`);
    }
    process.stdout.write(
      `PROFILE  ${label}=${profile ? "one-overlay" : "zero-overlays"}-and-converged\n`
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

process.stdout.write("PASS  Harness validation, apply, and convergence\n");
