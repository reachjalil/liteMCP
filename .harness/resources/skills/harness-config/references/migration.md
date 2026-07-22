# Migration

Use this when the repository already has agent-facing files or folders.
Migration should feel helpful and opinionated, but still reversible and
grounded in the user's repo conventions.

## Inventory

Before inventory that can lead to edits, enforce the Git safety gate:

```bash
git rev-parse --is-inside-work-tree
git status --short
```

If the repository is not inside a Git worktree, pause and offer options before
full migration or adoption: help run `git init`, make an initial commit, or set
up the user's preferred version control first. If `git status --short` is not
empty, pause and offer options before migration edits: review, commit, stash, or
otherwise preserve the existing changes. A clean Git checkpoint is required
because the migration will move source, activate generated outputs, and may
untrack generated surfaces.

Look for:

```bash
rg --files | rg '(^|/)(AGENTS.md|CLAUDE.md|\\.agents|\\.claude|\\.cursor|\\.gemini|skills|plugins|rules|prompts|commands|hooks|agents|settings|mcp|skills-lock\\.json)($|/)'
```

Classify each file as one of:

- durable reusable source;
- target-specific wrapper or packaging;
- repo-relative instruction output;
- runtime-owned local state;
- secret, credential, cache, generated artifact, or trust/permission state.

Also inspect git state before broad moves:

```bash
git status --short
git ls-files AGENTS.md CLAUDE.md .agents .claude .cursor .gemini 2>/dev/null
```

If the repo is under git and the relevant files are tracked, explain that the
transition is easy to review and revert. If important files are untracked,
inspect and summarize them before moving or replacing anything.

Do not treat a large tracked `.agents`, `.claude`, `.cursor`, or `.gemini`
catalog as a reason to stop with a plan-only answer. In a version-controlled
repo, tracked durable files are usually the safest migration source: inventory
and classify them, then make reversible `.harness` source changes and verify
with Harness commands. Pause before editing only for concrete blockers such as
secrets, runtime trust state, unclear ownership, important untracked files, or
destructive cleanup.

## Migration Completeness

When the user asks to set up or migrate Harness config, the default expectation
is a complete migration of durable reviewed agent resources that can be safely
classified. Do not migrate only the `harness-config` helper skill while leaving
other durable skills or prompts unmanaged.

For each discovered live surface, decide:

- migrate portable skills, plugins, rules, prompts, commands, hooks, agents,
  and shared config into a configured `.harness/resources*` root;
- represent target-specific variants as target-derived overrides;
- copy durable root instruction files such as `AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, and equivalents into `.harness/dir` as direct Markdown files by
  default;
- copy target-level mutable seeds that should exist for fresh users, especially
  non-secret `.claude/settings.json`, into matching target-derived source paths
  such as `.harness/resources/.claude/settings.json` before adding
  `.harnessMutable`;
- leave runtime-owned settings, caches, logs, trust state, credentials, and
  unclear files unmanaged with an explicit reason.

If a repo has many resources, still aim for a clean full migration in one
deliberate pass. Do not recommend batching or a plan-only checkpoint as the
normal path. Pause only when a resource contains secrets, runtime trust state,
executable install behavior, unclear ownership, important untracked content, or
another concrete risk that needs user review. If you must pause, do not write
migration files or call the setup complete; name the blocker and the exact
resources that require a decision.

Do not say `.harness` is now the repository's source of truth when only a
subset was migrated. Say the migration is blocked or incomplete, and name which
live files remain source or unmanaged. This distinction matters because an
agent may otherwise delete, ignore, or overwrite durable resources that were
never moved.

Before editing, inventory the repo and proceed with the full transition by
default. Use the Full Transition Definition below as the implementation and
best-practice checklist: satisfy each applicable row, or identify a blocker or
explicit user preference before activation. Keep the layout as simple as the
repo allows, and use examples as patterns rather than a forced file tree. The
final summary must include:

- skill guide version;
- explicit targets and why each existing surface is included or excluded;
- the chosen layout, including any concern roots based on the repo's workflows,
  domains, teams, target agent sets, or reusable concerns;
- resource roots and grouping vocabulary chosen from the repo's own structure;
- confirmation that target-level seeds such as `.claude/settings.json` stay at
  target-derived paths under the resources root, for example
  `.harness/resources/.claude/settings.json`;
- root-file strategy, including the `.harness/dir` copies made by default and
  any blocked or user-directed exceptions;
- root instruction updates that tell future agents to use Harness config
  guidance for any agent-configuration operation;
- mutable files copied into `.harness` as seed files and their seed locations;
- confirmation that `.claude/settings.json` and similar target-level settings
  were copied as mutable seeds or explicitly blocked as secret/local state;
- target-output `.harnessIgnore` files needed in generated surfaces such as
  `.agents` or `.claude`;
- generated-surface root `.gitignore` entries added after convergence, or the
  explicit user preference or constraint for keeping generated output tracked;
- `git rm --cached -r` commands actually run for tracked generated surfaces,
  including `.agents`, `.claude`, `.cursor`, `.gemini`, or exact generated
  subtrees, and the staged no-data-loss check;
- tracked regeneration commands or setup notes, such as package scripts,
  Makefile targets, justfile recipes, README steps, or a guarded install hook;
- cleanup policy, especially whether unmanaged live files are preserved,
  migrated, archived, or explicitly approved for removal;
- concrete blockers, if any.
- concrete file trees for each common pattern that applies, especially mutable
  settings, direct root instructions, composable root instructions,
  target-derived overrides, and target-output ignores.

If `.claude` exists, contains skills/settings, or has target-specific behavior,
the recommended plan should include `[[targets]] path = "./.claude"` unless
there is a specific reason not to.

## Full Transition Definition

A full transition has all of these properties:

| Area | Full-transition best practice |
| --- | --- |
| Git safety gate | The repository is a Git worktree with a clean `git status --short` before migration edits; otherwise migration pauses while the user is offered options to initialize Git or preserve dirty work before continuing. |
| Migration ledger | Every durable live path, root instruction file, target-level seed, generated target surface, generated `[[dir]]` output, and blocker is recorded with a `.harness` destination, generated output path, tracking decision, or explicit exception before activation and untracking. |
| Source of truth | Durable agent configuration lives under configured `.harness` source roots. Wildcard source roots are used only for repo-local repeated ownership such as package-owned `.harness` folders. |
| Live surfaces | `.agents`, `.claude`, `.cursor`, `.gemini`, and similar folders are generated outputs with root `.gitignore` entries after convergence, unless the user wants generated output tracked. |
| Skills/resources | Every reusable skill, plugin, prompt, rule, command, hook, and agent is migrated or explicitly blocked with a reason. |
| Root files | Durable root instructions such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and equivalents are copied into `.harness/dir` as direct Markdown files by default, or explicitly documented as blocked/excepted. |
| Agent guidance | Root agent instructions tell future agents to modify `.harness` sources and use Harness validation/activation for any agent-config change. |
| Mutable files | Files matched by `.harnessMutable` are copied into `.harness` as source seeds when they should exist for fresh users; target-level settings such as `.claude/settings.json` are seeded at `.harness/resources/.claude/settings.json` unless explicitly blocked as secret/local state. |
| Cleanup | Unmanaged live files are preserved until migrated, archived, or explicitly approved for deletion after a dry-run removal list. |
| Target ignores | Generated surfaces have target-output `.harnessIgnore` files when a target needs local-only output rules. |
| External target parents | `[[targets]].parent` is used only for output placement such as sibling Git worktrees; `[[targets]].path` remains static and explicit. |
| Profile-isolated packs | `.harnessProfileIsolation` is used only when a selected profile should be exclusive for chosen logical resource or dir paths; same-name local profile roots remain active, unrelated paths remain shared, and the manifest is not rewritten for normal toggles. |
| Git ignore and untracking | Root `.gitignore` ignores each root-level generated target surface, generated `[[dir]]` output, or exact generated subtree after convergence unless the user wants generated output tracked; use root-anchored patterns such as `/.claude/` and `/AGENTS.md` so `.harness` source paths are not ignored. Build a repo-specific `git check-ignore -v` matrix from the ledger and prove generated outputs are ignored while `.harness`, profile, local, and target-derived source paths are not. Target-output `.harnessIgnore` is still used separately for Harness projection boundaries. If generated files are already tracked, run `git rm --cached -r` or `git rm --cached` for every tracked generated output, stage the transition with `git add`, verify the staged deletions, and verify no working-tree data was lost. |
| Regeneration path | A tracked command or setup note tells users and agents how to validate and activate generated surfaces on a fresh checkout. |
| Local state | Secrets, caches, logs, credentials, trust state, and machine-local settings stay out of `.harness`. |
| Verification | Activation converges after apply. |

Anything less is blocked/incomplete, not the recommended final state.

Use this same table as the implementation checklist before the final summary.
Do not apply activation or claim migration success while durable resources
remain only in live target surfaces.

## Choose Resource Groups

Move durable projected resources into configured resource roots. Start with the
simplest reviewed layout that preserves behavior and matches the repo's
vocabulary. For many first migrations, one configured root is enough:

```text
.harness/resources/
  README.md
  .claude/
    settings.json
    .harnessMutable
  skills/
    agent-review/
    ui-review/
  prompts/
  rules/
  plugins/
```

Inside that root, use meaningful folders only when they help review or reuse.
Let the repo supply the vocabulary: workflows, strategies, teams, modes, agent
sets, products, reusable concerns, or domains.

Target-level files must stay at the target-derived path under the root. For
example, `.claude/settings.json` belongs at
`.harness/resources/.claude/settings.json`, with
`.harness/resources/.claude/.harnessMutable` when it is a create-once mutable
seed. Do not place target-level settings under `skills/`,
an optional catalog, or another unrelated resource group.

Before implementing, spend time understanding the repository and choose the
layout that matches the repo's structure. These options are examples:

| Option | Layout | When to choose |
| --- | --- | --- |
| Default organized | one `.harness/resources` root with `.claude/`, `skills/`, `prompts/`, `rules/`, and `plugins/` siblings | recommended for most first clean migrations, including large skill catalogs |
| Organized subfolders | one `.harness/resources` root with skill families under `skills/` | many skills or prompts with clear workflow/domain names |
| Multiple roots | `.harness/resources`, `.harness/resources-testing`, `.harness/resources-deployment`, `.harness/resources-ui`, `.harness/local/resources` | only when concern catalogs are independently optional, profile-selected, separately owned, or private/local |

Choose deliberately and explain why in the final summary. Do not invent a
concern taxonomy when the repo does not have one; also do not flatten a repo
that already has clear boundaries.

```text
.harness/
  resources/
    README.md
    .claude/
      settings.json
      .harnessMutable
    skills/
      review/
      ui/
      platform/
    prompts/
    rules/
    plugins/
  local/
    resources/
```

Manifest:

```toml
[[resources]]
path = "./.harness/resources"

[[resources]]
path = "./.harness/local/resources"
```

Short README files make resource groups portable and copy/pasteable:

```markdown
# Harness Resources

Shared skills, prompts, wrappers, and target-level seeds for this repository's
generated harness surfaces. Personal experiments belong in
`.harness/local/resources`.
```

## Profile-Isolated Packs

Use profile-isolated packs when the user wants profile selection to enable one
portable bundle and disable matching base/general resources or inactive sibling
bundles. Do not implement normal pack toggles by rewriting `harness.toml` or by
adding broad root `.harnessIgnore` rules.

Manifest shape:

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

Pack shape:

```text
.harnessProfile                         # contains: frontend
.harness/packs/frontend/
  .harnessProfileRoot                   # contains: frontend
  .harnessProfileIsolation
  resources/skills/frontend/SKILL.md
  dir/AGENTS.md/.harnessComposable
  dir/AGENTS.md/100_frontend.md
.harness/local-packs/frontend/
  .harnessProfileRoot                   # contains: frontend
  resources/skills/local-frontend/SKILL.md
```

Isolation declaration:

```toml
version = 1

[isolate]
resources = ["skills/**"]
dir = ["AGENTS.md", "AGENTS.md/**"]
```

This makes the selected profile exclusive for `skills/**` and `AGENTS.md`.
Unrelated outputs continue to project, and same-name local profile roots
participate after shared roots through normal ordered source precedence. Use
negated isolation patterns only for deliberate shared carve-outs, such as
`!skills/shared/**`.

## Root Instructions

During full migration or adoption, copy durable repo-level instruction files
such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and similar always-on agent
guidance into `.harness/dir` by default. Do not leave those files only as
normal tracked repo files after adoption unless there is a concrete blocker or
the user explicitly directs that exception. Record the exception in the final
summary and checklist.

Do not automatically split root instruction files. Prefer direct copied
Markdown files for simple one-file outputs:

```text
.harness/dir/AGENTS.md
```

- Use `.harnessComposable` and `.harnessRef` only when composition removes real
  duplication, shares a base across multiple root files, enables
  profiles/local overlays, or supports target-specific tails.
- Convert long procedural root instructions into skills, then leave concise
  root pointers.
- Add or preserve a short Harness maintenance note in `AGENTS.md`, `CLAUDE.md`,
  or equivalent root instructions. The note should say that any future
  operation touching skills, prompts, rules, hooks, commands, target folders,
  settings, ignores, cleanup, or generated surfaces must use Harness config
  guidance, edit `.harness` sources, preview activation, and verify
  convergence.

Example direct copied root instruction:

```text
.harness/dir/AGENTS.md
```

Example maintenance note:

```markdown
## Harness Config Maintenance

This repository manages agent configuration with Harness config. For any change
to skills, prompts, rules, hooks, commands, target folders, settings, ignores,
cleanup, or generated agent surfaces, use the `harness-config` skill guidance,
edit `.harness` sources, run `npx harnessc validate`, preview
`npx harnessc activate`, apply with `npx harnessc activate --yes`, and confirm a
second dry run converges. Treat `.agents`, `.claude`, `.cursor`, `.gemini`, and
similar target folders as generated outputs after adoption.
```

Example composable root instructions, only when the split is useful:

```text
.harness/dir/AGENTS.md/
  .harnessComposable
  100_project.md
  200_workflows.md

.harness/dir/CLAUDE.md/
  .harnessComposable
  .harnessRef
  300_claude_tail.md
```

## Preserve Target Differences

Use target-derived overrides for exact target-specific files:

```text
.harness/resources/skills/review/SKILL.md
.harness/resources/skills/review/.claude/SKILL.md
.harness/resources/.agents/hooks.json
.harness/resources/.claude/hooks.json
```

Do not duplicate entire resource groups unless the target behavior is genuinely
different.

## Common Transition Trees

Use concrete trees in the migration plan. The goal is for the user to approve
the exact source and output shape, not infer it from Harness terminology.

### Claude Settings As A Mutable Seed

Use this when an existing `.claude/settings.json` should be present for fresh
users, but Claude may edit it locally after first activation.

Before:

```text
.claude/
  settings.json
```

After:

```text
.harness/
  resources/
    .claude/
      settings.json
      .harnessMutable

.claude/
  settings.json
```

`.harness/resources/.claude/settings.json` is the reviewed seed.
`.harness/resources/.claude/.harnessMutable` should contain:

```gitignore
settings.json
```

Do not use `.claude/.harnessIgnore` for this file if the repo wants fresh users
to receive the seed. Target-output `.harnessIgnore` blocks projection for that
target; `.harnessMutable` allows one initial projection and then preserves
runtime edits.

This is required for full migration when a non-secret `.claude/settings.json`
already exists and should remain available to fresh users. Do not leave it only
in `.claude`, do not only add it to `.harnessMutable`, and do not call the
migration complete if the reviewed seed was not copied into `.harness` or
explicitly blocked as secret/local state.

### Direct Root Instruction Copy

Use this for a simple root `AGENTS.md` or `CLAUDE.md` that does not need
composition:

```text
.harness/
  dir/
    AGENTS.md
```

Do not create `.harness/dir/AGENTS.md/.harnessComposable` with one part unless
there is a real reason to support composition, references, profiles, or local
overlays.

### Composable Root Instructions

Use this only when the split has a reason:

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

### Shared Resource With Target Override

Use this when most skill content is shared and only Claude needs different
bytes:

```text
.harness/
  resources/
    skills/
      review/
        SKILL.md
        references/
        .claude/
          SKILL.md
```

The generated `.claude/skills/review/SKILL.md` receives the override. Other
declared targets receive the base `SKILL.md`.

### Target-Output Ignore

Use this only when one generated target needs local output boundaries:

```text
.claude/
  skills/
    review/
      .harnessIgnore
```

Example target-output ignore:

```gitignore
logs/
generated/
```

This does not migrate source and does not create mutable files. It filters only
that target's final output.

## Cleanup And Narrowing

Narrowing the active projection is not the same thing as deleting the old
skills. If the user asks for "only these skills active", first decide where the
inactive durable skills will live:

- keep them in a configured archive/catalog source such as
  `.harness/resources/archive` or `.harness/resources/all-skills`;
- move them to a local/private source when they are personal;
- document them as intentionally unmanaged with a reason;
- delete them only after the user explicitly approves deletion.

Run `npx harnessc activate` before any cleanup and show the exact unmanaged
removal list. Use `npx harnessc activate --yes --remove-unmanaged` only when
each removed durable item is already represented in `.harness`, intentionally
archived, or explicitly approved for deletion. If the old live target folder is
the only copy of a skill, removing it is data loss even when git can recover it.

When the narrowing comes from a `.harnessProfile` or target selection change,
the stale outputs are reported as `orphan`, not unmanaged `remove`, because a
configured non-active source could still produce them. Orphans are preserved by
default; `npx harnessc activate --yes --remove-orphans` deletes only unedited
orphans whose bytes still match the non-active source, leaving edited orphans
and mutable files in place. Review the dry-run `orphan` list before applying.

## Local Layer

Recommend `.harness/local/` as a first-class local workspace:

```toml
[[resources]]
path = "./.harness/resources"

[[resources]]
path = "./.harness/local/resources"
```

Use it for:

- local skills, plugins, agents, prompts, and wrappers;
- experimental skill edits before promotion;
- personal profile roots or selectors;
- local dir instruction parts when `[[dir]]` is in use;
- temporary ignores.

Suggest `.harness/local/` in `.gitignore` when the user wants this layer
private. Promote useful experiments into tracked resource groups after review.

## `.harnessIgnore` Locality

Prefer scoped ignore files close to the thing they control:

```text
.harnessIgnore                                  # broad repo boundaries
.harness/resources/.harnessIgnore               # source root boundaries
.harness/resources/skills/foo/.harnessIgnore
.harness/profiles/security/resources/.harnessIgnore
.agents/skills/foo/.harnessIgnore               # local output boundary
```

Use root `.harnessIgnore` for obvious global rules. Use source-local ignores
for resource-specific source-only files. Use profile-local ignores for
switchable modes. Use target-output ignores for local output preferences.

Keep ignore patterns narrow and evidence-based. Do not add broad defaults like
`**/*.local.*` or `**/*.local.json` unless those file families actually exist
and the user wants every match excluded or runtime-owned. Prefer exact known
paths such as `**/settings.local.json`.

## Generated Surfaces And Cleanup

Live harness surfaces and generated `[[dir]]` outputs are generated outputs
after full migration. The
best-practice default is to add root `.gitignore` entries for them once all
durable target resources are represented in `.harness` and activation
converges. This keeps skills and reusable resources in one reviewed source
location. Do this unless the user wants generated output tracked. Pair it with
tracked activation instructions outside the generated output set so users and
agents know how to activate them on a fresh checkout and refresh them after
updates such as `git pull`.

Use root-anchored `.gitignore` patterns for Git tracking policy. Do not use
unanchored entries such as `.claude/` or `AGENTS.md`; they can ignore
target-derived source paths under `.harness`, such as
`.harness/resources/.claude/settings.json`.

```gitignore
# Harness-generated agent surfaces
/.agents/
/.claude/
/.cursor/
/.gemini/

# Harness-generated root instruction outputs
/AGENTS.md
/CLAUDE.md
/GEMINI.md

# Harness source must remain tracked
!/.harness/
!/.harness/**
```

If only part of a surface is generated, ignore the exact generated subtree
instead:

```gitignore
# Harness-generated Claude skills; other Claude files stay tracked
/.claude/skills/
```

Do not confuse this with target-output `.harnessIgnore`. A target-output
`.harnessIgnore` inside `.agents` or `.claude` controls what Harness projects
into that target. Root `.gitignore` controls whether generated outputs are
tracked by Git. A complete migration normally needs both when local target
boundaries exist.

If generated files are already tracked, adding `.gitignore` is not enough and
reporting a follow-up is not enough. After `.harness` represents the durable
source and activation converges, actually untrack every generated target
surface, exact generated subtree, and generated `[[dir]]` output that should no
longer be tracked:

```bash
git ls-files .agents .claude .cursor .gemini AGENTS.md CLAUDE.md GEMINI.md
git rm --cached -r .agents .claude .cursor .gemini
git rm --cached AGENTS.md CLAUDE.md GEMINI.md
git add .gitignore .harness AGENTS.md CLAUDE.md GEMINI.md README.md package.json
git diff --cached --name-status
git status --short
git check-ignore -v .harness/resources/.claude/settings.json || true
```

Use exact subtrees instead when only part of a target is generated. Include
`.agents`, `.claude`, `.cursor`, `.gemini`, similar generated surfaces, and
generated dir outputs such as `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` as
applicable; do not special-case only `.agents`. `git rm --cached` must not
remove working-tree files. Verify representative generated files still exist
after untracking and that `npx harnessc activate` can regenerate them from
`.harness`. `git diff --cached --name-status` must show the expected staged
deletions from the index for generated outputs that are no longer tracked. If
any file would be lost because it was not migrated, restore or migrate it before
claiming completion. `git check-ignore -v` should not report `.harness` source
paths as ignored; if it does, root-anchor or narrow the generated-output ignore
rules before staging.

Before staging, create a repo-specific ignore matrix instead of trusting the
example list. Check at least:

- every declared generated target root or exact generated subtree,
- every generated `[[dir]]` root output,
- representative `.harness/resources`, `.harness/dir`, profile, and local
  source files,
- target-derived source paths that share generated-surface names, such as
  `.harness/resources/.claude/settings.json`,
- any custom target name or similar surface discovered during inventory.

Generated outputs should match root-anchored ignore rules. Source paths should
produce no ignore match. Fix the rules and re-run the matrix until both sides
match intent.

Good activation instruction examples:

```text
# AGENTS.md

Harness surfaces are generated. Run:

  npx harnessc validate
  npx harnessc activate

After pulling changes that touch `.harness`, run the same commands to refresh
generated outputs.
```

If `npx` is unavailable, explain that Node.js/npm must be installed before
Harness CLI commands can run. Use the repo's normal setup path, or on macOS
suggest:

```bash
brew install node
node --version
npm --version
npx --version
```

```json
{
  "scripts": {
    "harness:validate": "npx harnessc validate",
    "harness:preview": "npx harnessc activate",
    "harness:activate": "npx harnessc activate --yes",
    "setup:harness": "npm run harness:validate && npm run harness:activate",
    "update:harness": "npm run setup:harness"
  }
}
```

For repos with `package.json`, prefer explicit scripts first. Add a
`postinstall` hook only when the repo already uses install-time setup or the
user wants generated harness surfaces restored automatically. For after-pull
refreshes, prefer an explicit `update:harness`/`setup:harness` script and README
instruction; add a tracked opt-in post-merge hook setup only when the repo
already uses trusted hooks and the user approves automatic activation after
`git pull`. If you add an automatic path, make it guarded so install or update
does not overwrite active user work. A common shape is a small tracked script
that activates only when the manifest exists and the declared generated
surfaces are missing:

```json
{
  "scripts": {
    "postinstall": "node .harness/scripts/activate-if-missing.mjs"
  }
}
```

Use equivalent Makefile targets, justfile recipes, README setup commands, or
repo-specific bootstrap/update scripts when those are more natural than
`package.json`.

Use `--remove-unmanaged` only after the dry run clearly shows removals the user
expects. Target-output `.harnessIgnore` and `.harnessProfile` files are local
controls and should be preserved during cleanup.

## Symlinks

Harness config does not follow symlinks while discovering sources or targets.
If a symlinked harness surface points to checked-in agent config and the repo is
under git, replacing it with explicit projection is often a good cleanup.

Workflow:

1. Inspect where the symlink points.
2. Preserve or migrate the real source content into `.harness`.
3. Run `npx harnessc activate` and review the plan.
4. Use `--replace-target-symlinks` or `[activation].targetSymlinks = "replace"`
   only when replacing the link itself is intended.

Stop and ask before changing symlinks that point outside the repo, into a home
directory, secrets, runtime state, or shared machine path.

## Keep Local State Local

Do not move secrets, credentials, caches, runtime permission files, hook trust,
MCP auth, or local machine settings into `.harness`.

## Final Response Checklist

Report enough detail for the user to understand what changed quickly:

- targets declared in `.harness/harness.toml`;
- resource groups created and counts by kind, such as `skills: 4`,
  `prompts: 2`, `hooks: 1`;
- durable root instruction files copied into `.harness/dir`, or explicitly
  documented as blocked/excepted;
- target-specific overrides created;
- files intentionally left unmanaged and why;
- generated-output `.gitignore` entries added after convergence, and any
  `git rm --cached -r` or `git rm --cached` commands run for tracked generated
  target surfaces, generated dir outputs, or exact generated subtrees;
- confirmation that generated-output `.gitignore` patterns are root-anchored
  and the repo-specific ignore matrix proves generated outputs are ignored while
  `.harness`, profile, local, and target-derived source paths are not ignored;
- staged deletion and no-data-loss verification: `git diff --cached
  --name-status` shows expected deletions from the index, generated files still
  exist locally, activation can regenerate them from `.harness`, and the staged
  diff was inspected;
- commands run: `validate`, dry `activate`, `activate --yes`, convergence dry
  run;
- tracked activation command or setup note added;
- tracked after-update command or setup note added for refreshing generated
  outputs after `git pull`;
- any remaining migration follow-up.

Prefer this format:

```markdown
**Migration Status**
| Question | Answer |
| --- | --- |
| Complete migration? | Yes |
| Generated targets | `.agents`, `.claude` |
| Source roots | `.harness/resources`, `.harness/dir` |
| Gitignore best practice | Root `.gitignore` ignores generated target surfaces and generated dir outputs after convergence unless intentionally tracked |
| Activation path | `npm run setup:harness`; after `git pull`, run `npm run update:harness` |

**Resource Coverage**
| Kind | Migrated | Left unmanaged | Notes |
| --- | ---: | ---: | --- |
| Skills | 8 | 0 | Shared skills now in `.harness/resources/skills` |
| Prompts | 3 | 0 | Projected to declared targets |
| Runtime state | 0 | 4 | Kept out of `.harness` |

**Verification**
| Command | Result |
| --- | --- |
| `npx harnessc validate` | passed |
| `npx harnessc activate` | reviewed |
| `npx harnessc activate --yes` | applied |
| `npx harnessc activate` | converged |
```

For users who seem new to Harness config, add a short "What this means" section
before next steps:

```text
`.harness` is the editable source. The live `.agents` and `.claude` folders are
generated outputs, so future skill edits should happen under `.harness`.
```

For advanced users, use terse bullets after the tables and include exact paths
and flags rather than introductory explanation.

Use `.harnessMutable` for source templates that should be created once and then
left runtime-owned. Prefer source-local mutable files because they make the
contract visible beside the seed:

```text
.harness/resources/.claude/settings.json
.harness/resources/.claude/.harnessMutable
```

```gitignore
# .harness/resources/.claude/.harnessMutable
settings.json
```

Ignored files stay out of projection. Mutable files are projected when missing
and then preserved. Every mutable file that should exist for a fresh user needs
a seed in `.harness`; do not mark a target file mutable without migrating its
intended initial version.
