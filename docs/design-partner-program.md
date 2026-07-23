# Design-partner validation program

Status: operating contract for pre-1.0 market validation. This document defines
the evidence LiteMCP Composer must earn; it does not claim product-market fit.

## The decision we are validating

Platform and security teams will adopt LiteMCP Composer when they need to expose
high-risk MCP actions to agents without giving every identity the same catalog,
without trusting a hidden tool name to remain secret, and without retaining tool
arguments or results merely to prove what happened.

The initial product is not a connector marketplace or a general AI gateway. It
is a portable governance boundary between agent clients and MCP servers:

- identity-filtered discovery;
- authorization rechecked at invocation;
- exact-context, one-use approval for sensitive actions;
- upstream and policy provenance in audit evidence;
- payload-free usage analytics by default; and
- the same public product deployable on premises or operated by LiteMCP.

Run `pnpm demo:smoke` before evaluating the claim. The command starts a real
loopback server, exercises the governed path, asserts each security boundary,
prints the evidence it observed, and cleans up. A green demo is product proof,
not customer proof.

## Ideal design partner

A qualified partner has all of the following:

1. a named platform, identity, or security owner;
2. at least two MCP servers or one server with materially different risk levels;
3. at least two user or workload roles that should not discover the same tools;
4. one agent client and one real workflow available for a controlled pilot;
5. a requirement for audit, approvals, self-hosting, or managed operation; and
6. the ability to review outcomes weekly for four weeks.

The best first workflow contains one read action and one consequential action,
such as creating a ticket, changing infrastructure, issuing a refund, or
updating a customer record.

Defer teams seeking only a broad connector catalog, consumer automation,
unattended production rollout, a committed SLA, or a certified compliance
posture. Those needs would produce misleading validation at the current stage.

## Four-week pilot contract

### Before kickoff

Record a baseline without asking for secret payloads:

- MCP servers and clients in scope;
- identities and roles in scope;
- duplicated client/server configuration maintained today;
- sensitive actions currently blocked or exposed too broadly;
- manual approval or audit work per week;
- deployment preference and security review owner; and
- the explicit go/no-go decision the partner will make after the pilot.

Agree on data boundaries, retention, incident contacts, and a rollback path.
Use synthetic or non-production credentials until the partner accepts the
deployment and threat model.

### Week 1: prove the boundary

- Install the self-hosted product or provision an isolated managed environment.
- Register the pilot servers and pin the composition version.
- Map the minimum roles and deny by default.
- Demonstrate that a lower-privilege identity cannot discover a sensitive tool,
  cannot invoke it by guessing its name, and cannot reuse another call's
  approval.
- Confirm that audit and usage evidence excludes arguments and results by
  default.

Exit criterion: the partner's security owner accepts the test record and the
rollback procedure.

### Week 2: run one real workflow

- Connect the chosen client through one LiteMCP endpoint.
- Execute the read path and the approval-gated consequential path.
- Measure time to first successful governed call from a clean environment.
- Capture failures by stage: install, identity, policy, upstream, approval, or
  client compatibility.

Exit criterion: at least two intended identities complete the workflow while a
negative-control identity remains denied.

### Week 3: operate and recover

- Revoke a role or session and verify enforcement.
- Change a policy through review, activation, and rollback.
- Export the evidence needed by the partner's reviewer.
- Exercise the documented backup, upgrade, or service rollback that matches the
  deployment model.

Exit criterion: the named operator can diagnose the injected failure and
restore the accepted state without an engineer changing product code.

### Week 4: force the buying decision

Hold a recorded outcome review with the economic buyer and technical owner.
Ask for one mutually exclusive decision:

- continue as a paid operated-service or support customer;
- continue self-hosting and sponsor a defined enterprise requirement;
- extend once against a named blocker and date; or
- stop, with the primary reason recorded.

An unbounded free pilot is a failed experiment, not pipeline.

## Metrics and evidence

Use organization-level cohorts; never substitute page views or signups for
adoption. A customer must consent before its name, quote, or result is used
outside the pilot team.

| Signal | Definition | Initial learning threshold |
| --- | --- | --- |
| Qualified application | Partner meets all six ICP conditions | 10 interviews from the target role |
| Technical activation | First successful governed tool result after policy and identity enforcement | 70% of started qualified pilots within one working day |
| Boundary proof | Positive workflow plus discovery, guessed-call, and approval negative controls pass | 100% before real credentials |
| Weekly governed use | At least two identities and two successful governed calls in a week | 3 of 4 pilot weeks |
| Independent operation | Partner operator completes one policy or recovery exercise without product-code changes | 80% of activated pilots |
| Retention intent | Partner elects to keep LiteMCP in its path after week four | 5 of the first 8 completed pilots |
| Commercial proof | Signed paid pilot, operated-service agreement, or funded enterprise requirement | 3 independent organizations |

Thresholds are hypotheses for deciding whether to invest further, not public
performance claims. Store denominator, cohort date, deployment model, and loss
reason with every rollup. Do not count internal tests, duplicate organizations,
or pilots still inside their agreed decision window.

## Pricing hypotheses to test

Keep the Apache-2.0 product complete for self-hosting. Charge for operating and
supporting the service, not for making the portable core artificially unusable.

Test three conversations before publishing a fixed catalog:

1. paid managed pilot with a fixed onboarding and operations fee;
2. annual managed subscription based on governed environments and support
   scope, with usage as a transparent capacity guardrail; and
3. enterprise support or LTS for self-hosted deployments.

For each proposal, record the budget owner, buying trigger, alternative being
replaced, requested procurement terms, accepted price range, and the exact
reason for rejection. Do not infer willingness to pay from feature enthusiasm.

## Evidence ledger

Maintain one row per organization in the private operator system. Keep customer
content and contact data out of the public repository. The minimum fields are:

- qualification date and ICP result;
- owner, deployment model, use case, and decision deadline;
- baseline and activation timestamps;
- weekly governed-use result;
- boundary and operator-exercise result;
- open blocker with owner and target date;
- final decision and loss reason;
- commercial document state; and
- permission state for any external reference.

Repository evidence remains separate:

- [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) records what has
  passed locally or in CI;
- [`requirements-traceability.md`](./requirements-traceability.md) maps product
  claims to implementation and acceptance gaps;
- [`known-limitations.md`](./known-limitations.md) prevents unearned security,
  reliability, and commercial claims; and
- [`mcp-native-positioning.md`](./mcp-native-positioning.md) defines the
  category and messaging contract.

## Investment gate

Call the product *pilot-ready* only after the exact release candidate passes CI,
staging migration, authenticated acceptance, rollback, and security review.
Call the company *fundable on early traction* only when the evidence ledger has
independent retention and commercial proof from the target cohort. Until then,
describe LiteMCP Composer as a working, deployable product executing a bounded
design-partner validation program.
