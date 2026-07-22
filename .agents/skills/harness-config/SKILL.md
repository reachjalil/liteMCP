---
name: harness-config
description: Use when working with Harness config in a customer repository. Triggers include setting up, adopting, migrating, validating, activating, or troubleshooting .harness/harness.toml, .harness resources, AGENTS.md, CLAUDE.md, .agents, .claude, .cursor, .gemini, skills, rules, plugins, prompts, hooks, .harnessIgnore, .harnessMutable, mutable files, or CLI commands such as npx harnessc validate and npx harnessc activate.
version: 2026-06-05.profile-isolation-packs
---

# Harness Config

Skill guide version: `2026-06-05.profile-isolation-packs`.

When using this skill for setup or migration, include the skill guide version in
the initial status update and final summary, so the user can tell whether an
agent used the current adoption rules.

When recommending this skill to another agent or writing a setup prompt, require
the agent to install or update the skill from the canonical GitHub path, then
read the local installed `SKILL.md` before changing files. Do not rely on cached,
inherited, or previously loaded copies of the skill.

For an existing repository, "set up Harness config" means a full migration of
durable agent configuration by default. If the user asks for a narrower change,
do that only as a clearly scoped exception and do not describe it as Harness
config adoption or migration.

When the repository is under version control and the relevant agent files are
tracked, treat that as a good migration surface: inventory, classify, and make
reversible source changes instead of stopping with only a recommended plan. A
large tracked `.agents` or `.claude` catalog is normal migration work, not a
blocker by itself.

This SKILL.md is the operating core. It holds the decision model, workflow,
rules, and guardrails. Detailed file trees, checklists, reporting templates, and
per-tool scenarios live in `references/`; load the matching reference before
doing that part of the work rather than implementing from memory.

## Purpose

Use this skill to help a user operate Harness config in their own repository.
Make agent configuration portable, useful, reviewable, and reusable by moving
durable configuration into `.harness` source roots and treating live harness
surfaces such as `.agents`, `.claude`, `.cursor`, and `.gemini` as generated
outputs once adoption begins.

Once a repository adopts Harness config, any future operation that adds, removes,
narrows, splits, cleans, or reassigns agent configuration must follow this
skill's guidance: edit `.harness` sources, preview activation, explain any
cleanup, and confirm convergence. Do not treat target folders as ordinary source
folders after adoption.

Always inspect the repository before broad changes. Identify what looks like
durable source, generated output, target-specific wrapper, local runtime state,
or sensitive state, then recommend an opinionated but reversible path that
matches the repo's conventions. Prefer supported `npx harnessc` commands whenever
the CLI can initialize, validate, preview, explain, or apply the transition; use
file edits for source authoring, migration choices, and cases the CLI does not
automate.

Use https://www.harnessconfig.dev/ as the public reference for standard or CLI
behavior.

## Reference Map

Read the narrowest reference needed before making changes. Do not implement from
memory: load the matching reference, follow its checklist, then edit. If a task
spans migration, CLI, and verification, read each matching reference first.

- `references/quick-start.md` — greenfield setup: minimal manifest, small
  portable catalog, optional local layer, first activation. Use when no
  meaningful agent configuration exists yet.
- `references/migration.md` — migration from existing root instruction files,
  runtime folders, skills, plugins, rules, prompts, agents, hooks, and local
  settings, with concrete file trees. Use when `.agents`, `.claude`, `.cursor`,
  `.gemini`, skills, rules, hooks, commands, or settings already exist.
- `references/skills-sh-adoption.md` — user installed this skill from skills.sh
  or GitHub, or wants to promote `npx skills` installs into reviewed `.harness`
  source. Read first when the skill was just installed and `.harness` does not
  exist yet.
- `references/harness-conversion-scenarios.md` — detailed scenarios for
  converting Codex, Claude Code, Gemini CLI, Cursor, plugins/extensions, hooks,
  MCP, rules, commands, and subagents. Use for plugin/extension packs and
  per-tool conversions.
- `references/examples.md` — practical adoption examples: minimal catalogs,
  resource groups, local layers, profiles, profile-isolated packs, nested
  ignores, generated surfaces, mutable seeds, activation scripts, and the file
  trees referenced throughout this skill.
- `references/cli.md` — CLI command usage, dry-run behavior, activation flags,
  plan actions, and troubleshooting.
- `references/verification.md` — validation, dry-run activation, apply,
  convergence, gitignore matrix, generated-output untracking, and review checks.
- `references/checklists.md` — full Structure, Full Transition, and Best
  Practice Review tables. Load while implementing, proving completeness, or
  auditing an existing setup.
- `references/reporting.md` — communication depth, progress-update tables, the
  Full Install Summary template, and final-response templates.

Recognize the adoption state and route accordingly: skill installed but no
`.harness` yet → `skills-sh-adoption.md` then `quick-start.md`/`migration.md`;
new repository → `quick-start.md`; existing agent surfaces → `migration.md` and
`harness-conversion-scenarios.md`; plugin/extension packs →
`harness-conversion-scenarios.md`. When the repo is already using `.harness`,
inspect the manifest, sources, ignores, and targets first, then use `cli.md` and
`verification.md`.

## Decision Model

Use these defaults unless the user's repository clearly points elsewhere.

- **Simplest reviewed layout first.** Choose the smallest `.harness` source
  layout that preserves durable agent configuration and is easy to review. One
  `.harness/resources` root is a good first default; add roots only for a real
  ownership, profile, local/private, or reuse boundary.
- **Examples are a pattern library.** Use the file trees in
  `references/examples.md` as patterns, not a required taxonomy. Keep
  target-level seeds at target-derived paths such as
  `.harness/resources/.claude/settings.json`, but adapt names and grouping to
  the repo's existing language.
- **Resource grouping follows the repo.** Group by workflow, team, domain, mode,
  target agent set, or concern only when it improves review or reuse. Add short
  `README.md` files only for non-obvious groups.
- **Wildcard source roots are for repeated reviewed ownership.** Use wildcard
  `[[resources]].path` and `[[dir]].path` only when the repo already has a
  regular source layout, such as package-owned `.harness` folders in a monorepo.
  Keep them repo-local and observable; never pull source from sibling
  repositories, home directories, or runtime output folders.
- **External target parents are output placement only.** Use
  `[[targets]].parent` for worktree-style output fanout while the source stays in
  the repository. Keep `[[targets]].path` static and explicit, such as
  `./.codex`; never put wildcard syntax in target `path`.
- **Understand before installing.** Read enough of the repo to choose useful
  grouping. Do not flatten a repo that already has clear teams, domains,
  workflows, agent sets, or reusable concerns. Report the chosen structure in
  progress updates and the final summary.
- **Git safety gate is mandatory.** Before full migration, confirm the repo is
  inside a Git worktree and `git status --short` is clean. If the repo is not
  using Git, pause and offer options first: help run `git init`, add an initial
  commit, or set up the user's preferred version control. If the worktree is
  dirty, pause and offer options first: review, commit, stash, or otherwise
  preserve the changes. Do not edit migration files, run activation, or untrack
  generated surfaces until the gate is clean.
- **Clean version control supports action.** Once the gate passes, broad
  migration is reviewable and revertible. When asked to configure, adopt, or
  migrate, proceed end-to-end after inventory unless you find a concrete blocker
  such as secrets, runtime trust state, unclear ownership, untracked important
  files, or destructive cleanup. Do not stop at a plan-only response just because
  the catalog is large.
- **Migrate from an inventory ledger, not memory.** Maintain a ledger while
  working: each durable live path, root instruction file, target-level seed,
  generated target surface, generated `[[dir]]` output, and blocker gets a
  destination, exception, or cleanup action. Drive file copies, activation,
  `.gitignore`, `git rm --cached`, and the summary from the ledger.
- **Node/npx prerequisites are user-facing.** CLI examples use `npx`, so the
  repo needs Node.js/npm available. If `node`, `npm`, or `npx` is missing,
  explain that this is a toolchain prerequisite (for example `brew install node`
  on macOS), then verify `node --version`, `npm --version`, and `npx --version`
  before continuing.
- **Target-level seeds stay target-level.** Files that live at a target root,
  such as `.claude/settings.json` or target hooks/config files, are seeded at the
  matching target-derived path under the resources root, such as
  `.harness/resources/.claude/settings.json` — not buried inside a skill folder
  or unrelated resource group.
- **Full migration root files use `[[dir]]`.** During full adoption, durable
  repo-level instruction files such as `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`
  belong under a configured `.harness/dir*` source, by default as direct copied
  Markdown files. Use `.harnessComposable`, `.harnessRef`, or splits only for a
  concrete reason such as deduplication, profile/local overlays, or
  target-specific tails. Leaving a root instruction file live-only needs an
  explicit blocker or user-directed exception.
- **Profiles as modes.** Teach profiles as switchable modes across resource
  groups and concern-specific dir instructions first, file overlays second. Use
  profile-local `.harnessIgnore` to enable or suppress resources without copying
  a whole catalog. See `references/examples.md`.
- **Profile-isolated packs for exclusive bundles.** When a selected mode should
  own a whole logical area such as `skills/**` or `AGENTS.md`, use a pack-shaped
  `.harnessProfileRoot` with `.harnessProfileIsolation`. The selector chooses the
  pack; the isolation file suppresses matching non-profile outputs while
  same-name active profile roots, including local overrides, still participate.
  Do not emulate exclusive packs by rewriting `harness.toml` or adding broad root
  `.harnessIgnore` gates.
- **Local as first-class.** Recommend `.harness/local/resources` for personal
  skills, plugins, agents, prompts, experiments, and private wrappers;
  `.harness/local/dir` only when repo-relative outputs need local overlays. Put
  local roots after shared roots; suggest gitignoring `.harness/local/` when the
  user wants it private.
- **Nested ignores for locality.** Keep repo-root `.harnessIgnore` small; put
  scoped `.harnessIgnore` files near the resource group, skill, profile, or
  output subtree they control.
- **Mutable is not ignore.** Use `.harnessMutable` for files copied from source
  only when missing, then owned by the runtime. Ignore means "do not project";
  mutable means "project the seed once, then preserve runtime edits." If a
  target-level mutable file already exists, such as `.claude/settings.json`, copy
  its reviewed non-secret initial value to the target-derived source path, such
  as `.harness/resources/.claude/settings.json`, before adding `.harnessMutable`.
  The migration is incomplete if a fresh-user mutable seed was not copied into
  `.harness` or explicitly blocked.
- **Target-output ignores are part of migration.** When a generated surface such
  as `.agents`, `.claude`, `.cursor`, or `.gemini` has local-only output rules,
  add a target-local `.harnessIgnore` in that surface or subtree for runtime
  output boundaries, keeping source-local ignores near source.
- **Full migration required for existing surfaces.** Migrate all durable skills,
  plugins, rules, prompts, commands, hooks, agents, and reusable wrappers into
  `.harness` in the same pass. Do not ship a helper-skill-only, minimal-manifest,
  or incomplete migration as the recommended setup. Stop before writing or
  applying migration files only if the full transition cannot be completed from
  current evidence; then report the blocker and the exact durable resources that
  need user review.
- **Generated outputs are disposable after full migration.** Once durable
  resources and root instructions are represented in `.harness` and activation
  converges, add root-anchored `.gitignore` entries for generated target
  surfaces such as `/.agents/`, `/.claude/`, `/.cursor/`, `/.gemini/`, exact
  generated subtrees, and generated `[[dir]]` outputs such as `/AGENTS.md`,
  `/CLAUDE.md`, or `/GEMINI.md`; add `!/.harness/` and `!/.harness/**` when
  needed. Do not use unanchored entries like `.claude/` or `AGENTS.md` that can
  hide `.harness` source. Pair with a tracked fresh-checkout/after-update
  activation path, and if any generated output is already tracked, run
  `git rm --cached -r`/`git rm --cached` for every tracked generated output and
  stage the untracking. Full procedure in `references/verification.md`.
- **Generated-output ignore verification is evidence-based.** After writing the
  rules, build a path matrix from the actual manifest and ledger and run
  `git check-ignore -v`: generated outputs must be ignored; `.harness`, profile,
  local, and target-derived source paths such as
  `.harness/resources/.claude/settings.json` must not be. Fix or document
  exceptions before staging. See `references/verification.md`.
- **Git ignore is not projection ignore.** Use `.gitignore` to stop tracking
  generated surfaces; use target-output `.harnessIgnore` only to control Harness
  projection boundaries. Neither substitutes for the other.
- **Regeneration path is part of adoption.** When generated surfaces may be
  absent on a fresh checkout, add a repo-native activation path: `package.json`
  scripts, Makefile targets, justfile recipes, README steps, or a root
  instruction note. Prefer explicit `harness:validate`, `harness:preview`, and
  `harness:activate` scripts; use a guarded `postinstall` only when the repo
  already accepts install-time setup.
- **Preserve unmanaged until adoption is proven.** Do not use
  `--remove-unmanaged` to make a narrowed projection look clean unless the
  removed live files are already represented in `.harness`, intentionally
  archived, or explicitly approved for deletion. Preserve first, inventory,
  migrate or archive, then remove only after previewing exact removals.
- **Orphaned managed outputs are preserve-by-default too.** Stale target files
  left behind after a `.harnessProfile` or target selection change are reported
  as `orphan`, not `remove`. They are a distinct plan category from unmanaged
  entries and are kept by default. Use `--remove-orphans` only after reviewing
  the dry run; it deletes only unedited orphans whose bytes still match the
  non-active source, while edited orphans, mutable files, and target-output
  `.harnessIgnore`/`.harnessProfile` files stay in place.
- **Preserve behavior, then make `.harness` authoritative.** Preserve behavior
  during migration and verification. After convergence, simplify duplicated
  wrappers, symlinks, and stale live outputs so skills have one reviewed source
  location.
- **Write the maintenance contract into agent instructions.** Add a concise
  Harness config note to `AGENTS.md`, `CLAUDE.md`, or equivalent root
  instructions so future agents know agent config must change through `.harness`
  sources and be validated with Harness commands.

## Workflow

1. Identify the intent — quick start, migration, CLI usage, verification, or
   troubleshooting — and read the matching reference before editing or running
   commands.
2. If the skill was just installed from skills.sh or GitHub and `.harness` does
   not exist, treat the task as adoption and read
   `references/skills-sh-adoption.md` first.
3. Inspect existing agent files and harness surfaces before editing.
4. For full migration, enforce the Git safety gate:
   `git rev-parse --is-inside-work-tree` succeeds and `git status --short` is
   clean. If not, pause and offer options first (initialize Git, commit, stash,
   or otherwise preserve state) before any migration edit.
5. Build a migration ledger from the inventory: for each durable live path,
   target-level seed, root instruction output, generated surface, generated dir
   output, and cleanup candidate, record the `.harness` destination, output path,
   tracked/ignored decision, or explicit blocker. Drive all later steps from it.
6. Choose explicit targets from actual intended surfaces. Declare `.claude`,
   `.agents`, `.cursor`, `.gemini`, matching root files, or runtime settings as
   targets when durable content exists for them; do not infer targets from
   folders that merely exist.
7. Choose the simplest layout that fits. Default to one `.harness/resources` root
   with meaningful subfolders; use multiple roots only for a real concern
   catalog, ownership boundary, profile specialization, or private/local layer.
8. Create or update `.harness/harness.toml` with explicit `[[resources]]` source
   roots before projecting skills, rules, plugins, prompts, agents, hooks,
   commands, or MCP config.
9. Migrate every durable reviewed skill, rule, plugin, prompt, command, hook,
   agent, and root instruction file you can confidently classify. Copy durable
   root instruction files into `.harness/dir` as direct Markdown by default.
   Leave a file live-only only when it is runtime-owned, secret/local,
   generated/cache, unsupported, or unclear — with a reason. If durable resources
   remain unmigrated, stop and report the blocker instead of activating an
   incomplete projection.
10. Keep runtime state, secrets, caches, and local settings out of committed
    `.harness`; offer optional local layers when they fit.
11. Add scoped `.harnessIgnore` files for exclusions and narrow `.harnessMutable`
    entries for runtime-owned files. Copy a mutable file's reviewed seed into
    `.harness` before listing it; for `.claude/settings.json`, seed
    `.harness/resources/.claude/settings.json` and add
    `.harness/resources/.claude/.harnessMutable` containing `settings.json`. Add
    target-output `.harnessIgnore` files inside generated surfaces only when a
    target needs local output boundaries.
12. Validate and converge: `npx harnessc validate`, `npx harnessc activate`
    (dry), `npx harnessc activate --yes`, then `npx harnessc activate` again to
    confirm `keep`/`mutable` convergence. Use `npx harnessc explain <path>` for
    confusing paths. Command detail in `references/cli.md`.
13. After convergence, handle generated-output `.gitignore` and untracking: add
    root-anchored ignores for generated surfaces and dir outputs, add
    `!/.harness/` when needed, build and run a `git check-ignore -v` matrix from
    the ledger, and `git rm --cached -r`/`git rm --cached` any already-tracked
    generated output, staging the untracking with `git add`. Verify staged
    deletions and no working-tree loss. Procedure in `references/verification.md`.
14. Add a repo-native regeneration command (package scripts, Makefile, justfile,
    or scripts) plus a tracked note for fresh checkout and after `git pull`.
15. Use `--remove-unmanaged`/`--remove-orphans` only after every removed durable
    item is migrated, archived, or explicitly approved; otherwise preserve and
    finish without destructive cleanup.
16. Before the final response, run the Full Transition Checklist
    (`references/checklists.md`) and report the result. Do not claim
    best-practice adoption unless every applicable row passes or an explicit user
    preference/constraint is recorded.

## Full Transition Checklist

The full row-by-row tables — Structure, Full Transition, and Best Practice
Review — live in `references/checklists.md`. Load that file while implementing
and again before the final summary. The critical gates that must pass for an
existing repo:

- Git safety gate clean before edits.
- Inventory and migration ledger complete.
- Every durable skill/resource under a configured `.harness/resources*` root.
- Durable root instruction files copied into `.harness/dir` (or blocked/excepted).
- Agent instructions updated to route future agent-config changes through
  `.harness`.
- Mutable seeds copied into `.harness` before `.harnessMutable`.
- Generated-output `.gitignore` root-anchored, `.harness` source proven not
  ignored, untracking staged, no data loss.
- Tracked activation path for fresh checkout and after `git pull`.
- Cleanup previewed; `--remove-unmanaged`/`--remove-orphans` only after approval.
- `validate`, dry activate, apply, and second dry activate converge.

If a gate cannot be satisfied, stop and report the exact blocker instead of doing
an incomplete adoption.

## Migration Autonomy

Use risk tiers when deciding whether to stop before making broad changes:

- **Low risk:** the repo is under git, relevant files are tracked or easily
  recreated, the working tree state is understood, no secrets or runtime trust
  state are involved, and the target migration is easy to review. Make reversible
  source edits and verify with dry-run activation.
- **Medium risk:** generated and manual surfaces are mixed, symlinks are present,
  ownership is unclear, or important files are untracked. Proceed with
  non-destructive migration where possible; stop before symlink replacement,
  destructive cleanup, or moving unclear files.
- **High risk:** secrets, credentials, local permissions, hook trust, MCP auth,
  approval policy, private machine settings, or executable install behavior are
  involved. Do not migrate automatically.

Symlinks are a normal migration opportunity when they point to checked-in agent
configuration and the repo is under git. Harness config does not follow symlinks;
it projects ordinary files. Use dry-run activation first, then replace target
symlinks only when the user or manifest explicitly selects that policy.

## Target Rules

- Choose explicit targets only; do not infer targets from folders that happen to
  exist.
- Do not treat `.agents`, `.claude`, `.cursor`, `.gemini`, or another live
  harness surface as source after migration begins.
- After full migration, add root-anchored `.gitignore` entries for generated
  live harness surfaces or exact generated subtrees, with reviewed source in
  `.harness` and tracked activation instructions that regenerate them. Do not use
  unanchored generated-surface patterns that also match `.harness` source paths.

## Source Rules

- Use `.harness/resources*` roots for reusable resources that project into target
  harness surfaces. Group resources when it makes ownership, review, or reuse
  clearer; keep the layout simple when the repo does not need more shape.
- Use `.harness/dir*` for durable repo-relative instruction files such as root
  `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and similar files during full adoption.
  Prefer direct copied Markdown files for simple outputs; use `.harnessComposable`,
  `.harnessRef`, or split instructions only when composition removes real
  duplication, supports target-specific tails, or enables profiles/local
  overlays. Leaving a durable root instruction file only as a normal tracked repo
  file after adoption requires an explicit blocker or user-directed exception.
- For single-developer or experimental customization, offer optional ordered
  local source roots such as `.harness/local/resources` and `.harness/local/dir`.
  Explain that later roots override earlier exact paths, and suggest `.gitignore`
  entries only when the user wants that local space uncommitted.
- Use target-derived overrides such as `.harness/resources/.claude/...` only for
  files that must differ by harness surface.
- Keep secrets, credentials, runtime caches, and local machine settings out of
  `.harness`.

## CLI Rules

Use `npx harnessc` by default in customer repositories. These commands require
Node.js/npm/npx. If `npx` is unavailable, tell the user to install Node.js with
the repo's preferred toolchain first. On macOS, a simple example is:

```bash
brew install node
node --version
npm --version
npx --version
```

1. `npx harnessc validate`
2. `npx harnessc activate`
3. Review the dry-run plan.
4. `npx harnessc explain <path>` for surprising paths.
5. `npx harnessc activate --yes`
6. `npx harnessc activate`

For command details, flags, plan actions, and troubleshooting, read
`references/cli.md`.

## Guardrails

- Do not work on Harness config CLI implementation or specification design with
  this skill. This skill is for customer repository usage, setup, migration,
  activation, and verification.
- Do not move secrets, credentials, runtime caches, or local machine settings
  into `.harness`.
- Do not run unreviewed hook scripts, plugin install scripts, MCP servers, or
  generated commands from a repository before explaining the trust boundary and
  getting user approval.
- Use `npx harnessc activate` as a dry run before any `--yes` activation.
- Do not recommend gitignoring generated harness surfaces until durable resources
  have been migrated and tracked activation instructions tell users and agents
  how to run activation on a fresh checkout. After that, prefer gitignoring them.
- Prefer reversible source edits and show the user what changed with `git diff`
  when practical.
- Preserve existing behavior first; simplify only after activation is stable and
  reviewable.

## Reporting

Use concise tables, not dense prose, for setup and migration summaries. Assess
the user's familiarity from their wording; if unclear, assume they are new to
Harness config but technically comfortable, and adjust depth without changing the
standard — full migration stays the preferred target for existing surfaces.

Always report: whether the migration was complete or blocked (name the blocker in
one sentence if blocked); the Full Transition Checklist result; what was migrated
by kind and what was left unmanaged and why; which targets are now generated; the
exact validate/dry-run/apply/convergence commands run; and the next steps if
durable files remain. Never imply `.harness` is the repository-wide source of
truth unless every durable resource was migrated or intentionally left unmanaged.

For progress-update tables, the Full Install Summary template, and the
final-response and blocked-response templates, read `references/reporting.md`.
