# Quick Start

Use this when the repository has no existing agent folders, or when the user
wants a clean first Harness config setup.

## Prerequisite

Harness CLI commands use `npx`, so Node.js/npm must be installed. If `npx` is
missing, tell the user this is a Node toolchain prerequisite and suggest the
repo's normal setup path. On macOS, a concrete example is:

```bash
brew install node
node --version
npm --version
npx --version
```

## Minimal Portable Catalog

Start with one resource root, one explicit target, and a small tracked root
instruction file:

```toml
version = 1

[[resources]]
path = "./.harness/resources"

[[targets]]
path = "./.agents"
```

```text
AGENTS.md
.harnessIgnore
.harness/
  harness.toml
  resources/
    README.md
    skills/
      review/
        SKILL.md
```

`AGENTS.md` can stay as a normal tracked file in this minimal greenfield path.
It gives a fresh checkout and future agents enough context before any generated
harness surface exists. This is not the full-migration default for existing
durable root instruction files; during full adoption, copy files such as
`AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` into `.harness/dir` unless an explicit
blocker or user-directed exception is documented. Add `.claude`, `.cursor`,
`.gemini`, or another target only when the repository has real content for that
harness surface.

## Resource Root README

Add a concise README when the purpose is not obvious:

```markdown
# Shared Harness Resources

Portable skills, rules, and wrappers used by this repository's generated
harness surfaces. Run `npx harnessc validate && npx harnessc activate` to
preview projection before applying.
```

Keep README files short. Their job is to make a folder copy/pasteable and
reviewable, not to duplicate the full standard.

## When To Add `[[dir]]`

Use a `[[dir]]` root when repo-relative generated outputs are useful:

- `AGENTS.md`, `CLAUDE.md`, or similar files should be generated from
  `.harness`;
- multiple root instruction files should share a base through `.harnessRef`;
- a profile or local layer should add or replace instruction parts;
- the repo wants activation to regenerate root instruction outputs.

Example:

```toml
[[dir]]
path = "./.harness/dir"
```

```text
.harness/
  dir/
    AGENTS.md
```

Use a direct copied file for simple one-file outputs. Use composable leaves only
when the split is useful:

```text
.harness/
  dir/
    AGENTS.md/
      .harnessComposable
      100_project.md
      200_workflows.md
    CLAUDE.md/
      .harnessComposable
      .harnessRef
      300_claude_tail.md
```

Do not split root instructions into composable parts unless the split makes
review, reuse, or profile/local customization better. A simple tracked
`AGENTS.md` or a direct copied `.harness/dir/AGENTS.md` is often the right
first step.

## Optional Local Layer

Offer a local layer when the user wants personal skills, plugins, agents,
prompts, temporary wrappers, or experiments before promoting them back into
tracked source:

```toml
[[resources]]
path = "./.harness/resources"

[[resources]]
path = "./.harness/local/resources"
```

Add local dir roots only when `[[dir]]` is already useful:

```toml
[[dir]]
path = "./.harness/dir"

[[dir]]
path = "./.harness/local/dir"
```

Later roots win at the same logical output path. Suggest adding
`.harness/local/` to `.gitignore` when the user wants those overrides private;
do not require it.

## Optional Wildcard Layouts

Use wildcard manifest paths only when the repository already has a repeated
layout worth preserving.

For a monorepo with package-owned Harness source:

```toml
[[resources]]
path = "./packages/*/.harness/resources"

[[dir]]
path = "./packages/*/.harness/dir"
```

For sibling Git worktree outputs:

```toml
[[targets]]
parent = "../worktrees/*"
path = "./.codex"
```

Keep source-root wildcards repo-local. `[[targets]].parent` may point outside
the repo because it is output placement only. `[[targets]].path` must remain
static and explicit; activation may create it under each resolved parent.

For portable profile packs, use wildcard pack roots plus a profile selector:

```toml
[[resources]]
path = "./.harness/resources"

[[resources]]
path = "./.harness/packs/*/resources"

[[resources]]
path = "./.harness/local-packs/*/resources"

[[dir]]
path = "./.harness/dir"

[[dir]]
path = "./.harness/packs/*/dir"

[[dir]]
path = "./.harness/local-packs/*/dir"
```

Inside a selected pack, add `.harnessProfileRoot` and optionally
`.harnessProfileIsolation`:

```toml
version = 1

[isolate]
resources = ["skills/**"]
dir = ["AGENTS.md", "AGENTS.md/**"]
```

Use profile isolation when the selected pack should be exclusive for specific
logical resource or dir paths. Same-name local packs still participate, while
inactive sibling packs and matching general resources are suppressed.

## Generated Surfaces

Generated harness surfaces such as `.agents`, `.claude`, `.cursor`, and
`.gemini` should be treated as disposable outputs after full migration. For an
existing repo, the best-practice default is to add root-anchored
`.gitignore` entries such as `/.agents/` and `/.claude/` for generated surfaces
or exact generated subtrees once all durable skills and reusable resources are
represented in `.harness` and activation converges, unless the user wants
generated outputs tracked. Do not use unanchored generated-surface patterns that
can match `.harness` source paths. Pair this with a tracked activation note so a
fresh checkout knows how to regenerate them. Good activation instruction
options:

- a short tracked `AGENTS.md`;
- a `README.md` setup section;
- package scripts such as `harness:validate`, `harness:preview`,
  `harness:activate`, and `setup:harness`;
- a Makefile target, justfile recipe, or repo bootstrap script;
- a guarded post-install hook when the repo wants generated surfaces restored
  automatically after dependency install.

Example package script:

```json
{
  "scripts": {
    "harness:validate": "npx harnessc validate",
    "harness:preview": "npx harnessc activate",
    "harness:activate": "npx harnessc activate --yes",
    "setup:harness": "npm run harness:validate && npm run harness:activate"
  }
}
```

Do not add hidden install-time mutation by default. If `postinstall` is useful
for the repo, make it guarded and document what it does.

Always dry run before first apply:

```bash
npx harnessc validate
npx harnessc activate
```

Review the plan. Apply only when the target files match the user's intent:

```bash
npx harnessc activate --yes
npx harnessc activate
```

The second dry run should converge to `keep` for managed files and `mutable`
for runtime-owned files.
