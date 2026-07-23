# Checklists

Load this file when implementing a migration, proving completeness, or auditing
an existing setup. SKILL.md keeps the condensed gates; this file keeps the full
row-by-row tables. Do not present an adoption as best-practice complete until the
applicable rows here pass or an explicit user preference/constraint is recorded.

## Structure Checklist

During implementation, use these examples for every row that applies:

| Pattern | Expected source shape | Generated/target behavior |
| --- | --- | --- |
| Default resource root | `.harness/resources/.claude`, `.harness/resources/skills`, `.harness/resources/prompts`, `.harness/resources/rules` | One manifest source root projects target-level files and resources together |
| Claude settings seed | `.harness/resources/.claude/settings.json` plus `.harness/resources/.claude/.harnessMutable` containing `settings.json` | `.claude/settings.json` is created once, then reported `mutable` |
| Simple `AGENTS.md` | `.harness/dir/AGENTS.md` | root `AGENTS.md` is copied from one source file during full adoption |
| Composable `AGENTS.md` | `.harness/dir/AGENTS.md/.harnessComposable` plus numbered parts | root `AGENTS.md` is assembled; use only for real composition |
| Shared skill | `.harness/resources/skills/<name>/SKILL.md` | projects to every declared target |
| Target-specific skill | `.harness/resources/skills/<name>/.claude/SKILL.md` | `.claude` receives override; other targets receive base |
| Wildcard source roots | `./packages/*/.harness/resources` and `./packages/*/.harness/dir` for package-owned reviewed source | Existing repo-local package source joins projection without manifest edits per package |
| Profile-isolated pack | `.harness/packs/<profile>/.harnessProfileRoot` plus `.harnessProfileIsolation` and wildcard `./.harness/packs/*/resources` / `dir` roots | The selected profile owns declared logical paths such as `skills/**` or `AGENTS.md`, while unrelated outputs and same-name local overlays still project |
| External target fanout | `[[targets]].parent = "../worktrees/*"` with static `path = "./.codex"` | Same reviewed source projects into each sibling worktree output |
| Target-output ignore | `.claude/**/.harnessIgnore` in the generated surface | filters that target only; not a seed and not source migration |
| Generated-output untracking | root `.gitignore` contains root-anchored generated target surfaces such as `/.agents/`, `/.claude/`, `/.cursor/`, `/.gemini/`, generated dir outputs such as `/AGENTS.md`, `/CLAUDE.md`, `/GEMINI.md`, or exact generated subtrees unless the user wants generated outputs tracked; `.harness` source paths are not ignored | Git stops treating generated outputs as source after convergence; if generated files are already tracked, run `git rm --cached -r` or `git rm --cached` for every tracked generated output, stage with `git add`, verify staged deletions, and verify no working-tree data loss |
| Repo-native activation | `package.json` scripts, Makefile target, justfile recipe, README setup step, or guarded install hook | Fresh checkouts can regenerate generated surfaces without guessing commands |

## Full Transition Checklist

Use this checklist for any existing repository while implementing and again
before the final summary. If a row cannot be satisfied, stop and report the exact
blocker instead of doing an incomplete adoption.

| Gate | Best-practice check |
| --- | --- |
| Git safety gate | The repo is inside a Git worktree and `git status --short` was clean before migration edits; otherwise migration paused while the user was offered options to initialize Git or preserve dirty work before continuing. |
| Inventory complete | All `AGENTS.md`, `CLAUDE.md`, `.agents`, `.claude`, `.cursor`, `.gemini`, skills, plugins, rules, prompts, commands, hooks, agents, settings, and MCP files were scanned. |
| Migration ledger complete | Every durable live path, root instruction file, target-level seed, generated target surface, generated dir output, and blocker has a recorded destination, exception, or cleanup action before activation or untracking. |
| Clean full migration | The migration is not limited to `.harness/harness.toml`, `.harnessIgnore`, helper skills, or maintenance notes while other durable resources remain live-only. |
| Durable resources migrated | Every durable reusable skill/resource is under a configured `.harness/resources*` root; only runtime-owned, secret/local, cache/generated, unsupported, or unclear files remain live-only with a reason. |
| Target differences preserved | Runtime-specific differences are represented as target-derived overrides, not copied live surfaces. |
| Root instructions represented | Durable root instruction files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and equivalents are copied into `.harness/dir` as direct Markdown files by default, or explicitly documented as blocked/excepted. |
| Agent instructions updated | `AGENTS.md`, `CLAUDE.md`, or equivalent root instructions tell future agents to use Harness config guidance for any agent-config operation and to edit `.harness` sources instead of generated target folders. |
| Mutable seeds present | Every mutable file that should exist for a fresh user is copied into `.harness` as the seed before it is listed in `.harnessMutable`; target-level settings such as `.claude/settings.json` are seeded at `.harness/resources/.claude/settings.json`; activation creates them once and then preserves runtime edits. |
| File structures represented | Source and target trees for mutable settings, root instructions, target overrides, and target-output ignores are implemented or reported with blockers. |
| Ignores are narrow | `.harnessIgnore` contains only evidence-based patterns; no broad `*.local.*` families unless explicitly justified. |
| Target ignores present | Generated surfaces such as `.agents` or `.claude` have target-output `.harnessIgnore` files when they need local output boundaries. |
| Generated-output untracking staged | After full migration and convergence, root `.gitignore` ignores root-level generated target surfaces such as `/.agents/`, `/.claude/`, `/.cursor/`, `/.gemini/`, generated dir outputs such as `/AGENTS.md`, `/CLAUDE.md`, `/GEMINI.md`, or exact generated subtrees, with a tracked fresh-checkout and after-update activation path outside the generated output set, unless the user wants generated outputs tracked; if generated files were already tracked, `git rm --cached -r` or `git rm --cached` was run for every tracked generated output and the result was staged with `git add`. |
| Harness source not ignored | Root `.gitignore` does not ignore `.harness` source paths, including target-derived source such as `.harness/resources/.claude/settings.json`; use `git check-ignore -v` to prove this when generated-output ignores are added. |
| Ignore matrix verified | A repo-specific `git check-ignore -v` matrix proves expected generated outputs are ignored and representative `.harness`, profile, local, and target-derived source paths are not ignored; any missed target name, exact generated subtree, or nested source path is fixed or explicitly excepted. |
| Staged deletions verified | `git diff --cached --name-status` shows expected staged deletions for generated outputs removed from the index, including agent surface folders and generated root instruction outputs when applicable. |
| No data loss verified | The staged diff and working tree were inspected after untracking; generated files still exist locally, activation can regenerate them from `.harness`, and any mismatch was fixed before completion. |
| Activation path tracked | When generated outputs are gitignored, a repo-native fresh-checkout and after-update activation path exists for validation and activation, including what to run after `git pull`; package repos usually expose explicit harness scripts and may use a guarded `postinstall` or opt-in post-merge hook setup when that fits the repo. |
| Cleanup reviewed | Any `--remove-unmanaged` or `--remove-orphans` run has a reviewed dry-run removal list; no durable skill/resource is deleted from live surfaces unless it exists in `.harness`, is archived, or the user explicitly approved deletion; edited orphans and mutable files stay in place. |
| Activation verified | `npx harnessc validate`, dry `activate`, `activate --yes`, and a second dry `activate` all pass and converge. |

Full transition means `.harness` is the reviewed source for durable agent
configuration, while live harness surfaces are generated outputs and local
runtime state remains outside source. It does not mean copying every runtime file
into `.harness`: secrets, caches, logs, trust state, credentials, and
machine-local settings stay local.

## Best Practice Review Checklist

Use this checklist when the user asks whether an existing Harness config setup is
correct, even when they are not asking for a migration:

| Area | Best-practice check |
| --- | --- |
| Skill version | The installed `harness-config` skill reports the current skill guide version in `SKILL.md`. |
| Source of truth | Durable skills, prompts, rules, hooks, commands, agents, and shared settings are represented in configured `.harness` source roots. |
| Resource organization | Resource groups reflect the repo's real workflows, domains, teams, target agent sets, or reusable concerns when grouping improves review or reuse; a simple layout is acceptable when it remains clear. |
| Target-level seeds | Files such as `.claude/settings.json` are seeded at `.harness/resources/.claude/settings.json`, not hidden inside a skill folder or unrelated resource group; migration is incomplete if the seed is omitted without an explicit blocker. |
| Explicit targets | Every intended live surface is declared as `[[targets]]`; no target is inferred only because a folder exists. |
| Root instructions | Durable root instruction files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and equivalents are represented in `.harness/dir` during full adoption, or explicitly documented as blocked/excepted; `.harnessComposable` is used only when composition adds value. |
| Mutable files | Mutable files that fresh users need are copied into `.harness` as seeds before `.harnessMutable`; `.harnessMutable` is not used as a substitute for source migration. |
| Ignore locality | Source-local ignores live near source; target-output `.harnessIgnore` files live inside `.agents`, `.claude`, or relevant target subtrees when a generated surface needs local output rules. |
| Generated-output untracking | Root `.gitignore` ignores each generated target surface, generated dir output, or exact generated subtree with root-anchored patterns such as `/.claude/` and `/AGENTS.md` after convergence unless the user wants generated outputs tracked; `.harness` source paths are proven not ignored; tracked generated files are actually removed from the index with `git rm --cached -r` or `git rm --cached`, staged with `git add`, checked in `git diff --cached --name-status`, and verified for no working-tree data loss. |
| Activation path | Fresh checkouts and post-`git pull` updates have a tracked way to run Harness validation and activation, such as package scripts, Makefile targets, justfile recipes, README steps, setup/update scripts, a guarded `postinstall`, or an opt-in post-merge hook setup when generated outputs are gitignored. |
| Cleanup safety | `--remove-unmanaged` and `--remove-orphans` are not used until removals are previewed and each durable item is migrated, archived, or explicitly approved for deletion. |
| Verification | `npx harnessc validate`, dry activation, apply, and a second dry activation converge. |

Report best-practice reviews with a table of findings, risks, and recommended
actions. If multiple improvements are possible, provide options and recommend the
option that best matches the repo's size and ownership model.
