# Harness migration ledger

This ledger records the behavior-preserving migration performed from the clean
Git checkpoint `a8f0bdd`. The selected targets are the Codex-compatible
`.agents` surface and the Claude-compatible `.claude` surface.

| Existing or new item | Classification | Authoritative source or exception | Generated output / tracking decision |
| --- | --- | --- | --- |
| `.agents/skills/harness-config/**` | Durable installed skill | Promoted byte-for-byte to `.harness/resources/skills/harness-config/**` | Generated in both targets; root target folders are ignored after convergence |
| `skills-lock.json` | Remote-skill provenance | Remains tracked at the repository root | Not projected |
| `.claude/.harnessIgnore` | Target-local projection control | Tracked as the narrow fresh-clone exception under the otherwise ignored generated target | Protects `settings.local.json` from Harness ownership |
| `.claude/settings.local.json` | Machine-local runtime and trust state | Intentionally left unmanaged; never copied into `.harness`; protected by target-local `.claude/.harnessIgnore` | Preserved in `.claude`; ignored by the target-scoped repository rule |
| Repository workflow skills | New durable portable resources | `.harness/resources/skills/**` | Generated in both targets |
| Persona focus profiles | New durable profile overlays | `.harness/profiles/*/dir/AGENTS.md/250_active_profile.md` | The selected profile replaces one composed `AGENTS.md` section |
| `AGENTS.md` | New durable root instructions | `.harness/dir/AGENTS.md/**` | Generated root file; ignored after convergence |
| `CLAUDE.md` | New durable Claude instructions | `.harness/dir/CLAUDE.md` | Generated root file; ignored after convergence |
| `.agents` | Declared Codex target | Generated from configured resource roots | Root-anchored Git ignore after convergence |
| `.claude` | Declared Claude target plus local runtime state | Generated resources; unmanaged local settings preserved | Generated children ignored; `.harnessIgnore` remains reviewed and tracked |
| `.harnessProfile` | Local profile selector | Written only by `.harness/scripts/select-profile.mjs` | Root-anchored Git ignore; never projected or committed |

No existing skills, prompts, rules, commands, hooks, agents, plugins, or MCP
configuration were found outside the installed `harness-config` skill. There
was no reviewed `.claude/settings.json` seed to migrate. Cleanup remains
preserve-by-default; this migration does not use `--remove-unmanaged` or
`--remove-orphans`.

## Completed verification (2026-07-22)

The repository uses Harness Config guide version
`2026-06-05.profile-isolation-packs` and pins `harnessc` exactly at
`1.0.0-alpha.10`. The initial migration preview showed 27 creates in each
target and two root instruction creates, with no removal/orphan action and the
existing Claude local settings preserved. The reviewed final refinement preview
showed eight skill updates per target and one composed `AGENTS.md` update. A
later CI/CD refinement preview showed three skill updates per target and one
composed `AGENTS.md` update; it was applied only after review. A subsequent
deployment-policy refinement previewed two skill updates per target and one
composed `AGENTS.md` update. The final artifact-promotion accuracy pass then
previewed two skill updates per target: it replaced an absolute cancellation
claim with idempotent/resumable mutation guidance and added archive-digest plus
Worker-version evidence. A final adversarial deployment pass previewed one
deployment-skill update per target for inactive-version-first schema changes,
externally enforced write freezes, full-schema postflight, and separately
managed triggers. Each plan was reviewed before application and followed by a
zero-change convergence preview. The final Durable Object lifecycle hardening
pass previewed exactly one deployment-skill update per target, documenting the
separately privileged first-deploy/lifecycle boundary and remote migration-tag
gate; it too converged to zero changes after application. One last
lifecycle-evidence refinement then previewed exactly one
deployment-skill update per target for account/resource identity, canonical
resource IDs, route/cron-safe config generation, disabled auto-provisioning,
candidate/run-bound version evidence, and separate new-versus-existing D1
sequences. A final preview of the same single skill added authenticated,
deterministically named CI artifact download rather than trusting a local
archive/metadata pair. Both plans were reviewed, applied, and converged to zero
changes. The final
state before the repository commit showed:

- `.agents`: 27 `keep`, zero create/update/remove/orphan;
- `.claude`: 27 `keep`, one preserved unmanaged local settings file, zero
  create/update/remove/orphan;
- root instructions: two `keep`;
- source/target skill trees: byte-identical;
- all seven profile selectors: exactly one matching overlay; neutral selection:
  zero overlays;
- all eight repository skills: official `quick_validate.py` pass;
- generated targets/root instructions/profile selector: ignored; every
  `.harness` source and `skills-lock.json`: trackable; no tracked Harness source
  is ignored.

Exact standalone reproduction commands:

```bash
npx --yes harnessc@1.0.0-alpha.10 validate
npx --yes harnessc@1.0.0-alpha.10 activate
npx --yes harnessc@1.0.0-alpha.10 activate --yes
npx --yes harnessc@1.0.0-alpha.10 activate
```

The locked repository equivalents are `pnpm harness:validate`,
`pnpm harness:preview`, `pnpm harness:activate`, and the CI-grade
`pnpm harness:ci`, which validates, previews, applies inside the disposable CI
checkout, rejects a non-converged second preview, and exercises neutral plus
all seven profile selections in isolated temporary workspaces.
