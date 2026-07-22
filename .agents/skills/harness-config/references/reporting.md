# Reporting And Communication

Read this when preparing setup/migration status updates, progress tables, and
final summaries. SKILL.md owns the rules; this file owns the templates and the
communication depth guidance.

## Communication Depth

Assess the user's Harness config familiarity from their wording and the repo
state. If unclear, assume they are new to Harness config but technically
comfortable. Adjust explanation depth without changing the migration standard:
full migration remains the preferred target for existing agent surfaces.

Use concise tables for setup and migration summaries. Tables make it harder to
overclaim scope and easier for the user to review risk. Avoid dense prose when a
small table can show the same facts.

While changing a repository with existing agent files, track and later summarize:

- what Harness config can manage in the current repo;
- the inventory counts by surface and type, especially how many existing
  skills/plugins/rules/prompts/commands/hooks/agents will be migrated;
- which existing files look like durable source, target-specific wrappers, or
  runtime state;
- what resource-group vocabulary seems natural for the repo, such as workflows,
  strategies, teams, modes, agent sets, or reusable concerns;
- which durable root instruction files were copied into `.harness/dir`, and any
  explicit blocker or user-directed exception;
- which targets should be declared and why;
- which steps can use `npx harnessc`;
- which steps require ordinary file edits because they are source migration,
  content authoring, or currently outside CLI automation.

Keep the explanation short but concrete. Do not imply that installing the skill
or running `harnessc` automatically decides the migration policy for the user.

## Progress Update Template

```markdown
**Assessment**
| Area | Found | Migration decision |
| --- | --- | --- |
| Skills | `.agents/skills/*`, `.claude/skills/*` | Move durable skills into `.harness/resources/skills` |
| Runtime state | `settings.local.json`, logs | Seed intended mutable files in `.harness`; ignore caches/logs |
| Targets | `.agents`, `.claude` | Declare explicit targets |

**Install Path**
| Step | Action | Why |
| --- | --- | --- |
| 1 | Inventory all live surfaces | Avoid missing skills/resources |
| 2 | Move durable resources to `.harness` | Make one reviewed source |
| 3 | Activate and converge | Prove generated surfaces are reproducible |
```

For newer users, add a one-sentence meaning line before the tables:

```text
Harness config will make `.harness` the reviewed source and regenerate `.agents`
or `.claude` from it.
```

For experienced users, skip the basics and lead with decisions and commands:

```markdown
**Migration Decisions**
| Decision | Value |
| --- | --- |
| Targets | `.agents`, `.claude` |
| Source roots | `.harness/resources`, `.harness/dir` |
| Generated surfaces | Gitignored after convergence |
```

## Full Install Summary Template

For an existing repository, do the full clean install/migration first, then
summarize the decisions with a table like this:

```markdown
**Full Transition Installed**
Skill guide: `2026-06-05.profile-isolation-packs`

| Decision | Recommendation | Reason |
| --- | --- | --- |
| Targets | `.agents`, `.claude` | Both surfaces exist and contain durable config |
| Source roots | simplest reviewed `.harness` layout for this repo; use wildcard source roots only for repo-local repeated ownership such as package-owned `.harness` folders | Keeps source easy to review while preserving durable config |
| Resource layout | target-level seeds plus skills/prompts/rules grouped by repo vocabulary | Examples are adapted to the repo, not forced |
| Root files | direct copy `.harness/dir/AGENTS.md` | Durable root instructions are represented in `.harness/dir` by default during full adoption |
| Agent instructions | add Harness maintenance note to `AGENTS.md`/`CLAUDE.md` | Future agents must use Harness guidance for agent-config changes |
| Mutable files | copy `.claude/settings.json` seed to `.harness/resources/.claude/settings.json`, declare it in `.harnessMutable` | Fresh users get the file once; runtime edits are preserved |
| Target ignores | add `.agents/.harnessIgnore` or subtree ignores when needed | Target-local output boundaries belong with the generated surface |
| External target parents | use `[[targets]].parent` only for output placement such as sibling worktrees; keep `[[targets]].path` static | Supports worktree fanout without making external folders source |
| Generated surfaces | add root-anchored `/.agents/`, `/.claude/`, or equivalent generated outputs to root `.gitignore` after convergence unless the user wants generated outputs tracked | Live surfaces are reproducible outputs without ignoring `.harness` source |
| Activation path | add `package.json` scripts, Makefile target, justfile recipe, README step, or guarded install hook | Fresh checkouts can regenerate inactive harness surfaces |
| Cleanup | preserve unmanaged until migrated or explicitly approved for removal | Narrowing active skills must not delete the only copy |

| Existing item | Action |
| --- | --- |
| `.agents/skills/*` | migrate durable skills |
| `.claude/skills/*` | migrate as shared files or `.claude` overrides |
| `.claude/settings.json` | seed in `.harness`, mark mutable if runtime-owned |
```

If the install omits an existing harness surface such as `.claude`, explain why.
If there is no good reason, include it. Do not finish with an incomplete target
set just because the CLI can create a minimal manifest quickly.

## Final Response Template

After setup or migration, report:

- whether this was a complete migration or blocked before completion;
- the Full Transition Checklist result from implementation;
- what was migrated into `.harness` and how many resources by kind;
- what was intentionally left unmanaged and why;
- which targets are now generated from `.harness`;
- the exact validation, dry-run, apply, and convergence commands run;
- the next obvious migration steps if any durable files remain.

Never imply `.harness` is the repository-wide source of truth unless the
inventory shows every durable agent resource was migrated or intentionally left
unmanaged. Do not present incomplete adoption as the recommended end state; if
completion is blocked, name the blocker and the exact remaining resources.

```markdown
**Result**
Complete migration: yes/no. If no, state the blocker in one sentence.

| Resource kind | Migrated | Left unmanaged |
| --- | ---: | --- |
| Skills | 6 | 0 |
| Prompts | 2 | 0 |
| Runtime state | 0 | 3 local files |

| Command | Result |
| --- | --- |
| `npx harnessc validate` | passed |
| `npx harnessc activate` | reviewed creates/updates |
| `npx harnessc activate --yes` | applied |
| second `npx harnessc activate` | converged to keep/mutable |

**What changed**
- `.harness` is now the source for all durable skills/resources.
- `.agents` and `.claude` are generated and can be gitignored.
```

If blocked, use:

```markdown
**Blocked Before Full Migration**
| Remaining item | Why it was not moved | Needed decision |
| --- | --- | --- |
| `.agents/skills/foo/settings.local.json` | runtime-owned local state | ignore or mutable seed |
```
