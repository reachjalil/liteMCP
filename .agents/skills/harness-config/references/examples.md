# Practical Examples

Use these examples as starting points. Adapt names to the user's repo instead
of forcing a taxonomy.

## Minimal Greenfield Or Scoped Setup

Best when a new repo or explicitly scoped non-migration change wants one
portable skill catalog and one generated surface. For full migration/adoption
of an existing repo, use `.harness/dir` for durable root instruction files as
shown in the next example.

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

Keeping `AGENTS.md` as a normal tracked root file is acceptable for this
greenfield or explicitly scoped path. It is not the full-adoption default for
existing durable root instruction files.

## Clean Full Migration With One Resources Root

Best when existing skills, prompts, support manifests, and target settings
should move into one reviewed source root.

```toml
version = 1

[[resources]]
path = "./.harness/resources"

[[targets]]
path = "./.agents"

[[targets]]
path = "./.claude"

[[dir]]
path = "./.harness/dir"
```

```text
.harness/
  dir/
    AGENTS.md
    CLAUDE.md
  resources/
    README.md
    .claude/
      settings.json
      .harnessMutable
    skills/
      harness-config/
      agent-review/
      ui-review/
      platform-review/
        SKILL.md
    prompts/
    hooks.json
    agents/
```

Target-level settings stay at their target-derived path:
`.harness/resources/.claude/settings.json`. Do not put them inside
`skills/` or an unrelated resource group. Skill folder names should match
how the user thinks: workflow, team, strategy, mode, agent set, product area,
or reusable concern.

Durable root instruction files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
and equivalents should be copied into `.harness/dir` as direct Markdown files
by default during full adoption. Use `.harnessComposable`, `.harnessRef`, or
split root instructions only when there is a concrete reason such as
deduplication, profile overlays, local overlays, or target-specific tails.
Leaving a durable root instruction file only as a normal tracked repo file
requires an explicit blocker or user-directed exception in the final summary.

## Multiple Resource Roots

Best only when a concern catalog is optional, profile-selected, separately
owned, or local/private. Good examples are testing, deployment, UI, security,
or docs resources that a team intentionally combines with profiles or
profile-specific dir instructions.

```toml
[[resources]]
path = "./.harness/resources"

[[resources]]
path = "./.harness/resources-testing"

[[resources]]
path = "./.harness/resources-deployment"

[[resources]]
path = "./.harness/resources-ui"

[[resources]]
path = "./.harness/local/resources"
```

```text
.harness/
  resources/
    .claude/
      settings.json
      .harnessMutable
    skills/
    prompts/
  resources-testing/
    README.md
    skills/
  resources-deployment/
    README.md
    skills/
    hooks.json
  resources-ui/
    README.md
    skills/
  local/
    resources/
```

## Local Developer Overrides

Best when a developer wants experiments or personal additions without treating
generated targets as source.

```toml
[[resources]]
path = "./.harness/resources"

[[resources]]
path = "./.harness/local/resources"
```

```text
.harness/local/
  resources/
    skills/
      experimental-review/
        SKILL.md
    plugins/
    agents/
```

Suggest this `.gitignore` entry when local work should stay private:

```gitignore
.harness/local/
```

Promote useful local work by moving it into a tracked resource subfolder and
reviewing the diff.

## Wildcard Source Roots

Best when a repository already has a regular reviewed source layout, such as a
monorepo where each package owns its own Harness source.

```toml
[[resources]]
path = "./packages/*/.harness/resources"

[[dir]]
path = "./packages/*/.harness/dir"

[[targets]]
path = "./.agents"

[[targets]]
path = "./.claude"
```

```text
packages/api/.harness/resources/skills/api-contract/SKILL.md
packages/docs/.harness/resources/prompts/docs-style.md
packages/web/.harness/dir/AGENTS.md/140_web.md

.agents/skills/api-contract/SKILL.md
.agents/prompts/docs-style.md
AGENTS.md
```

Use this only for repo-local source roots that should be observable from the
repository. Patterns expand to existing real directories. Do not use wildcard
resources or dir roots to pull source from sibling repositories, home
directories, or generated target folders.

## External Target Parent Fanout

Best when a developer has sibling Git worktrees and wants the same reviewed
Harness source projected into each worktree's runtime folder.

```toml
[[resources]]
path = "./.harness/resources"

[[dir]]
path = "./.harness/dir"

[[targets]]
parent = "../worktrees/*"
path = "./.codex"
```

```text
.harness/resources/skills/review/SKILL.md
.harness/dir/.codex/BRANCH_GUIDE.md/100_shared.md

../worktrees/feature-login/.codex/skills/review/SKILL.md
../worktrees/release-hardening/.codex/BRANCH_GUIDE.md
```

The target `parent` chooses physical output placement and may be outside the
repo. The target `path` stays static and explicit because activation may need to
create it under each resolved parent. Source roots, profile roots, ignore
rules, and mutable declarations stay anchored in the repo unless they are
target-output-local controls inside a concrete target.

## Profile-Based Activation Across Resource Groups

Best when the repo has switchable modes such as `frontend`, `security-review`,
`cloudflare-react`, `team-a`, or `personal`.

```toml
[[resources]]
path = "./.harness/resources"

[[resources]]
path = "./.harness/local/resources"
```

```text
.harnessProfile                         # contains: cloudflare-react
.harness/
  resources/
    skills/
      generic-review/
        SKILL.md
      vite-worker-imports/
        SKILL.md
      worker-deploy/
        SKILL.md
  profiles/
    cloudflare-react/
      .harnessProfileRoot               # contains: cloudflare-react
      resources/
        .harnessIgnore
```

Profile-local ignore:

```gitignore
# .harness/profiles/cloudflare-react/resources/.harnessIgnore
skills/generic-review/**
```

Use profile overlays for files the profile adds or replaces. Use profile-local
`.harnessIgnore` when the profile mainly enables or suppresses existing
resources.

## Profile-Isolated Packs

Best when a profile should enable one portable bundle and make that bundle
exclusive for selected logical paths, without rewriting the manifest or using a
repo-root ignore gate.

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

```text
.harnessProfile                         # contains: frontend
.harness/
  resources/
    prompts/
      shared.md                         # unrelated shared output
    skills/
      baseline/
        SKILL.md                        # suppressed by selected pack
  packs/
    frontend/
      .harnessProfileRoot               # contains: frontend
      .harnessProfileIsolation
      resources/
        skills/frontend/SKILL.md
      dir/
        AGENTS.md/.harnessComposable
        AGENTS.md/100_frontend.md
    backend/
      .harnessProfileRoot               # contains: backend
      .harnessProfileIsolation
  local-packs/
    frontend/
      .harnessProfileRoot               # contains: frontend
      resources/
        skills/local-frontend/SKILL.md
```

Example isolation declaration:

```toml
version = 1

[isolate]
resources = ["skills/**"]
dir = ["AGENTS.md", "AGENTS.md/**"]
```

With `frontend` selected, matching non-profile skills and inactive sibling
packs are suppressed. The same-name local frontend pack still participates, and
unrelated paths such as `prompts/shared.md` or `PROJECT_GUIDE.md` continue to
project. Use negated patterns such as `!skills/shared/**` only when a selected
pack should leave a specific shared path outside the exclusive area.

## Nested `.harnessIgnore`

Best when a rule belongs next to the resource it controls.

```text
.harness/
  resources/
    .harnessIgnore
    skills/
      vite-worker-imports/
        SKILL.md
      scratch/
        SKILL.md
```

```gitignore
# .harness/resources/.harnessIgnore
skills/scratch/**
```

## Mutable Claude Settings

Best when Claude should receive a reviewed `settings.json` on first activation,
but the file may be changed by the runtime or user after that.

```toml
version = 1

[[resources]]
path = "./.harness/resources"

[[targets]]
path = "./.claude"
```

```text
.harness/
  resources/
    .claude/
      settings.json
      .harnessMutable

.claude/
  settings.json
```

```gitignore
# .harness/resources/.claude/.harnessMutable
settings.json
```

Activation creates `.claude/settings.json` when missing. After that, dry runs
should report it as `mutable` unless `--force-mutable` is used. Do not place
`settings.json` in `.claude/.harnessIgnore` if the repo expects fresh users to
receive the seed; target-output ignores block projection.

For full migration, an existing non-secret `.claude/settings.json` that should
exist for fresh users must be copied to
`.harness/resources/.claude/settings.json` before adding the mutable rule. Do
not only list it in `.harnessMutable`, and do not leave the only copy in the
generated `.claude` surface unless it is explicitly blocked as secret/local
state.

For selective activation inside a group:

```gitignore
# broad boundary
skills/**

# re-open one skill
!skills/
!skills/vite-worker-imports/
!skills/vite-worker-imports/**
```

Use `npx harnessc explain <path> --json` when a resource is unexpectedly
ignored or included.

## Generated Surfaces With Activation Instructions

Best when `.agents`, `.claude`, `.cursor`, or `.gemini` should not clutter
version control.

Tracked activation instructions:

```text
README.md
package.json
.harness/
```

Use `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` for tracked activation
instructions only when that root instruction file is intentionally tracked and
not a generated `[[dir]]` output.

`.gitignore`:

```gitignore
# Harness-generated target surfaces at repo root
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

Package script:

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

Optional guarded post-install hook, only when the repo wants generated surfaces
restored automatically after dependency install:

```json
{
  "scripts": {
    "postinstall": "node .harness/scripts/activate-if-missing.mjs"
  }
}
```

Keep the guard script small and repo-specific: check that
`.harness/harness.toml` exists, skip CI or read-only installs if needed, and
activate only when the generated surfaces the repo expects are missing.

Activation note:

```text
Harness surfaces are generated. On fresh checkout, run:

  npx harnessc validate
  npx harnessc activate

After `git pull`, run the same commands when `.harness` changed.
```

Do not gitignore generated surfaces until the activation path is tracked and
obvious for both fresh checkout and after-update workflows.

If generated surfaces are already tracked by Git, adding `.gitignore` does not
untrack them. After activation converges and the user does not want generated
outputs tracked, untrack every generated surface or exact generated subtree and
stage the safe transition:

```bash
git ls-files .agents .claude .cursor .gemini
git rm --cached -r .agents .claude .cursor .gemini
git add .gitignore .harness AGENTS.md CLAUDE.md GEMINI.md README.md package.json
git diff --cached --name-status
git check-ignore -v .harness/resources/.claude/settings.json || true
```

Use only the surfaces or subtrees that actually apply. Verify generated files
still exist in the working tree after `git rm --cached` and that activation can
regenerate them from `.harness`; migrate or restore anything missing before
completion. `git check-ignore -v` must not report `.harness` source paths as
ignored. If it does, root-anchor or narrow the generated-output ignore rules
before staging.
