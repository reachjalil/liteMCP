# Verification

Run these checks from the repository being set up or migrated.

## Git safety gate

Before migration edits:

```bash
git rev-parse --is-inside-work-tree
git status --short
```

Expected result:

- The repository is inside a Git worktree.
- `git status --short` is empty before any migration edits.
- If either check fails, pause before migration/adoption and offer options to
  initialize Git or preserve the dirty worktree first.

## Validate and preview

```bash
npx harnessc validate
npx harnessc activate
```

Expected result:

- `validate` reports no errors for the selected manifest.
- `activate` is a dry run and writes nothing.
- Wildcard `[[resources]].path` and `[[dir]].path` entries, when used, expand
  only to intended repo-local source roots.
- Wildcard `[[targets]].parent` entries, when used, expand only to intended
  output parents such as sibling Git worktrees, and every generated target uses
  the same static `[[targets]].path`.
- The plan explains creates, updates, keeps, preserved unmanaged files, mutable
  files, orphaned managed outputs, requested removals, and any target symlink
  conflicts.
- For full migration/adoption, durable root instruction files such as
  `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and equivalents are sourced from
  `.harness/dir` or explicitly documented as blocked/excepted.
- Profile-isolated packs, when used, report the selected profile roots and do
  not require manifest rewrites when switching profiles.

## Apply and confirm convergence

```bash
npx harnessc activate --yes
npx harnessc activate
```

Expected result:

- Declared targets receive only the intended files.
- External target parents receive generated output only under the explicit
  static target path, and no external folder is treated as a resource or dir
  source root.
- A second dry run converges to `keep` for managed files.
- Runtime-owned files declared in `.harnessMutable` are reported as `mutable` and
  are not overwritten.
- Profile-isolated packs project the selected pack plus same-name local
  profile roots, suppress matching base/general candidates and inactive sibling
  packs, and preserve unrelated resource or dir paths.
- Mutable files that should exist for fresh users have an initial seed under
  `.harness`; `.harnessMutable` is not an ignore rule. Existing non-secret
  target-level settings such as `.claude/settings.json` must be copied to the
  matching seed path, such as `.harness/resources/.claude/settings.json`, before
  they are marked mutable.
- Target symlink conflicts are resolved manually or by explicit
  `[activation].targetSymlinks = "replace"` / `--replace-target-symlinks`
  policy before apply.

## Generated output untracking

When generated target surfaces or generated `[[dir]]` outputs are tracked and
the user does not want generated output tracked after convergence:

```bash
git ls-files .agents .claude .cursor .gemini AGENTS.md CLAUDE.md GEMINI.md
git rm --cached -r .agents .claude .cursor .gemini
git rm --cached AGENTS.md CLAUDE.md GEMINI.md
git add .gitignore .harness AGENTS.md CLAUDE.md GEMINI.md README.md package.json
git diff --cached --name-status
git status --short
```

Use exact generated subtrees when only part of a surface is generated. Include
`.agents`, `.claude`, `.cursor`, `.gemini`, similar target folders, and
generated dir outputs such as `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` as
applicable; do not only untrack `.agents`.

Expected result:

- `git rm --cached -r` stages removal from the index only; generated files still
  exist in the working tree.
- `.gitignore`, `.harness` sources, activation instructions, and untracking are
  staged together with `git add`.
- The staged activation instructions include what to run on a fresh checkout
  and after `git pull` to refresh generated outputs.
- `git diff --cached --name-status` shows the intended source additions/updates
  and index removals for generated outputs, including generated target folders
  and generated root instruction outputs when applicable.
- A dry activation can regenerate the generated surfaces from `.harness`.
- Any file that would be lost is restored or migrated before completion.

## Gitignore anchoring

When generated outputs are gitignored, verify Git ignores only the top-level
generated outputs and does not hide Harness source paths. Build the checked
paths from the actual manifest and migration ledger, not only the examples:

```bash
git check-ignore -v .agents/ .claude/ AGENTS.md CLAUDE.md GEMINI.md
git check-ignore -v .harness/resources/.claude/settings.json || true
git ls-files -ci --exclude-standard .harness
```

Expected result:

- Root generated outputs match root-anchored patterns such as `/.agents/`,
  `/.claude/`, `/AGENTS.md`, `/CLAUDE.md`, or `/GEMINI.md`.
- `.harness/resources/.claude/settings.json` and similar target-derived source
  paths produce no ignore match. If they are ignored, root-anchor or narrow the
  generated-output patterns before staging.
- `git ls-files -ci --exclude-standard .harness` prints nothing. If it prints
  tracked `.harness` files ignored by the current rules, fix the ignore rules
  before staging or finishing the migration.
- Custom target names, exact generated subtrees, profile source paths, local
  source paths, and generated `[[dir]]` outputs discovered during inventory are
  added to the same matrix so missed use cases are caught by evidence.

## Review checklist

Inspect:

```bash
git diff -- .harness .harnessIgnore AGENTS.md CLAUDE.md .agents .claude .cursor .gemini
```

Confirm:

- durable shared source is under configured resource groups such as
  `.harness/resources`,
- wildcard source roots, if used, represent reviewed repo-local ownership such
  as `./packages/*/.harness/resources` rather than external repositories,
  home-directory state, or generated target folders,
- external target parents, if used, are output fanout only; `[[targets]].path`
  remains static and explicit,
- profile-isolated packs, if used, isolate only the intended logical paths,
  leave unrelated resources or dir outputs active, and allow same-name local
  profile roots to participate,
- durable root instruction files such as `AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, and equivalents are copied into `.harness/dir` as direct
  Markdown files by default, or explicitly documented as blocked/excepted,
- `.harnessComposable`, `.harnessRef`, or split root instructions are used only
  for concrete reasons such as deduplication, profile overlays, local overlays,
  or target-specific tails,
- resource groups have README files when their purpose is not obvious,
- live harness surfaces are outputs, not source folders,
- target-specific differences are encoded as target-derived overrides,
- mutable target-level settings such as `.claude/settings.json` are copied to
  `.harness/resources/.claude/settings.json` or explicitly blocked as
  secret/local state before `.harnessMutable` is used,
- secrets and local machine settings are absent from `.harness`,
- scoped `.harnessIgnore` files protect logs, caches, generated files,
  source-only files, and output-local boundaries,
- gitignored harness surfaces can be regenerated from `.harness` plus the
  selected manifest,
- root `.gitignore` uses root-anchored generated-output patterns and does not
  ignore `.harness` source paths such as
  `.harness/resources/.claude/settings.json`,
- the ignore verification was built from the repo's actual targets, generated
  dir outputs, target-derived source paths, and configured source roots rather
  than only hard-coded example surfaces,
- tracked activation instructions tell users and agents how to run activation
  on a fresh checkout and after `git pull` when generated harness outputs are
  gitignored.
- if generated harness target surfaces or generated dir outputs were already
  tracked by Git, `git rm --cached -r` or `git rm --cached` was actually run for
  every tracked generated output, staged with `git add`, visible as expected
  deletions in `git diff --cached --name-status`, and verified for no
  working-tree data loss.

## Explain Checks

Use `explain` for representative paths:

```bash
npx harnessc explain .harness/resources/skills/foo/SKILL.md --json
npx harnessc explain .agents/skills/foo/SKILL.md --json
```

Confirm ignored resources report the expected winning `.harnessIgnore` rule.
For profile, profile-isolation, or local-layer changes, confirm the explanation
uses the logical source path the user expects and that excluded pack siblings
are absent because of profile isolation rather than a broad `.harnessIgnore`
rule.

## Cleanup Checks

Before using cleanup:

```bash
npx harnessc activate --remove-unmanaged
```

Confirm every `remove` is expected. Target-output `.harnessIgnore` and
`.harnessProfile` files should be preserved. Do not use cleanup to compensate
for an unclear source layout.

Orphaned managed outputs are a separate category from unmanaged entries. They
are target files a configured source could still produce, but the active
profile or target selection no longer projects for that path, such as outputs
left behind after a `.harnessProfile` change. They are preserved by default and
appear as `orphan` in the plan:

```bash
npx harnessc activate --remove-orphans
```

`--remove-orphans` deletes only orphaned outputs whose current bytes still match
the non-active source projection; edited orphans, mutable files, and
target-output `.harnessIgnore`/`.harnessProfile` files are still preserved.
Review the dry-run plan and confirm each `orphan` removal is expected before
applying.
