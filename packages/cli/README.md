# `@litemcp/cli`

Operational CLI for the implemented LiteMCP Composer slice. Run
`litemcp help` for the currently supported commands. Commands support `--json`
for automation and never write session tokens to URLs.

The primary onboarding flow is registry → probe → compose → publish:

```sh
litemcp server-create --file server.json --tenant org_demo
litemcp server-probe --id server_finance --tenant org_demo
litemcp composition-create --file composition.json --tenant org_demo
litemcp composition-publish --id composition_company --tenant org_demo
```

Draft policies use the same file-oriented workflow:

```sh
litemcp policy-create --file policy.json --tenant org_demo
litemcp policy-lint --id policy_draft --tenant org_demo
litemcp policy-activate --id policy_draft --tenant org_demo
```

Create and update commands accept either `--file <path>` or `--input '<json>'`.
Use `server-probe --accept-drift` only after reviewing an intentional upstream
schema change. Session, approval, activation-event, import/export, and emergency
freeze commands are listed by `litemcp help`.

Approve or deny the exact inbox item by echoing its current concurrency fields:

```sh
litemcp approval-decide --id approval_123 --decision approved \
  --reason "Reviewed against ticket FIN-42" --generation 3 \
  --fingerprint 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  --tenant org_demo
```

The API rejects stale generations and mismatched fingerprints, so list the
approval again before retrying a conflict.

Set `LITEMCP_API_URL`, `LITEMCP_TENANT_ID`, `LITEMCP_DEMO_ROLE`, and
`LITEMCP_API_KEY` instead of repeating global flags. Hosted management APIs may
require an authenticated browser session unless the deployment explicitly
enables bearer credentials; tenant and role headers are for explicit demo mode.
