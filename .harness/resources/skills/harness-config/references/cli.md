# CLI

Use this reference when the user asks how to run Harness config locally, preview
activation, apply changes, validate a repository, or troubleshoot command
output.

## Prerequisite

`npx harnessc` requires Node.js/npm/npx. If `node`, `npm`, or `npx` is not
available, explain that the user needs the Node toolchain before Harness CLI
commands can run. Prefer the repository's documented setup path. On macOS, a
common Homebrew example is:

```bash
brew install node
node --version
npm --version
npx --version
```

Do not present missing `npx` as a Harness config validation failure; install or
ask the user to install the prerequisite, then rerun the Harness command.

## Command order

Run from the repository root:

```bash
npx harnessc validate
npx harnessc activate
```

`validate` checks the selected manifest and source layout. `activate` without
`--yes` is a dry run and should not write files.

Use `explain` for any path that surprises the user:

```bash
npx harnessc explain .harness/resources/skills/foo/SKILL.md --json
npx harnessc explain .agents/skills/foo/SKILL.md --json
```

After reviewing the plan, apply:

```bash
npx harnessc activate --yes
```

Then confirm convergence:

```bash
npx harnessc activate
```

A healthy second dry run reports managed files as stable and mutable runtime
files as preserved.

## Common options

- `--root <path>`: run against another repository root.
- `--config <path>`: use a non-default manifest path.
- `--yes`: apply the activation plan.
- `--force-mutable`: rewrite files protected by `.harnessMutable` rules.
- `--keep-unmanaged`: preserve unmanaged target files.
- `--remove-unmanaged`: remove unmanaged target files when the plan says so.
- `--keep-orphans`: preserve orphaned managed outputs (the default).
- `--remove-orphans`: remove only orphaned managed outputs whose current bytes
  still match the non-active source projection; edited orphans stay in place.
- `--replace-target-symlinks`: replace a target symlink when projection needs
  to occupy that path.

Use removal and symlink replacement flags only after the user has inspected the
dry-run plan. Prefer the declarative manifest policy when a repository
intentionally replaces target symlinks:

```toml
[activation]
targetSymlinks = "replace"
```

## Reading plans

Treat the dry-run plan as the user review surface:

- `create`: a managed file will be written.
- `update`: a managed file will change.
- `keep`: a managed file already matches the source.
- `mutable`: a runtime-owned file is intentionally preserved.
- `preserve`: an unmanaged file is left alone.
- `orphan`: a managed output a configured source could still produce, but the
  active profile or target selection no longer projects for that path. Kept by
  default; removed only by `--remove-orphans` when the bytes still match the
  non-active source.
- `remove`: an unmanaged file is removed only when explicitly requested.

If the plan includes unexpected creates or updates, stop and inspect the source
layout, manifest targets, `.harnessIgnore`, and target-derived overrides before
applying.

Use `npx harnessc explain <path>` when the user asks why a specific source or
output path participates, is overridden, is ignored, re-included by a deeper
logical rule, or missing from the projection.

## Generated Surfaces

Generated harness surfaces can be gitignored when they are reproducible from
`.harness`. For existing repositories, prefer that steady state after full
migration and convergence so skills have one reviewed source location. Require
tracked activation instructions: a root instruction note, README setup section,
Makefile target, justfile recipe, or package scripts such as:

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

Prefer explicit scripts first. Add a guarded `postinstall` hook only when the
repo already uses install-time setup or the user wants generated surfaces
restored automatically after dependency install.

On a fresh checkout, users and agents should know to run:

```bash
npx harnessc validate
npx harnessc activate
```

before relying on `.agents`, `.claude`, `.cursor`, `.gemini`, or another
generated surface.

## Troubleshooting

- Missing target output usually means the target is not declared in
  `.harness/harness.toml`.
- Unexpected target output usually means a source file is under
  `.harness/resources` or `.harness/dir` without the intended
  `.harnessIgnore` boundary.
- An ignored resource can be explained with `npx harnessc explain <path>
  --json`; inspect the `ignore.source.finalMatch` or
  `ignore.targetOutput.finalMatch` fields.
- Unexpected overwrites usually mean a runtime-owned file is not matched by
  `.harnessMutable`.
- Stale files left behind after switching a `.harnessProfile` or target
  selection usually appear as `orphan`, not `remove`. They are preserved by
  default; use `--remove-orphans` after reviewing the dry run only when those
  unedited outputs should be cleaned.
- Divergent `.agents` and `.claude` output should usually be represented with
  target-derived overrides, not copied source trees.

When command behavior is unclear, use `harnessconfig.dev` as the public
reference and prefer dry-run activation before writing files.
