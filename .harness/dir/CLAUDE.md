# Claude Code instructions

Read and follow root `AGENTS.md` before changing this repository; it is the
shared authority for architecture, security, validation, open-core boundaries,
and Harness maintenance. If an active profile is selected, its focus appears in
the `Active focus` section of `AGENTS.md`.

Use the portable skills generated in `.claude/skills`. Invoke the narrowest
matching `litemcp-*` skill for security, identity, observability, MCP
compatibility, deployment, release, open-core, or vertical-slice work. Keep
plans grounded in repository files and verify implementation claims with
commands, tests, or rendered configuration.

`CLAUDE.md`, `AGENTS.md`, and `.claude/skills` are generated from `.harness`.
Never make durable edits to those outputs. Keep
`.claude/settings.local.json`, permission decisions, credentials, caches, and
other machine-local state outside `.harness`.
