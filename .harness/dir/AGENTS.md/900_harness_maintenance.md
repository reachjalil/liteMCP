
## Harness Config maintenance

Harness Config guide version `2026-06-05.profile-isolation-packs` governs this
repository. For every change to skills, prompts, rules, hooks, commands, target
folders, settings, profiles, ignores, cleanup, or generated agent surfaces:

1. Use the `harness-config` skill guidance and edit `.harness` sources only.
2. Run `pnpm harness:validate`.
3. Preview with `pnpm harness:preview` and review every action.
4. Apply with `pnpm harness:activate` only after the preview matches intent.
5. Run `pnpm harness:preview` again and confirm convergence.

Treat `.agents`, `.claude`, root `AGENTS.md`, and root `CLAUDE.md` as generated
outputs. Do not make durable edits there. Preserve
`.claude/settings.local.json` as machine-local runtime state. After a fresh
checkout or a pull that changes `.harness`, run `pnpm setup:harness`.
