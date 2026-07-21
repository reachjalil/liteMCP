---
title: "Contradictions and Tensions"
file: "22-contradictions.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 15
---

# Contradictions and Tensions

## Reader Promise

The reader can see unresolved conflicts in source claims and strategy rather than receiving a smoothed consensus.

## Summary (≤120 words)

The most important contradictions are structural: Composio says its gateway avoids vendor lock-in while also stating that auth, scopes and policies live with Composio; LiteLLM's site renders an implausible uptime figure beside strong adoption claims; open-source labels cover materially different product boundaries; and fast release velocity conflicts with enterprise stability. These tensions directly inform liteMCP's product constitution.

## What We Found

| Topic | Source A claim | Source B / tension | Dates | Likely explanation | Resolved? |
|---|---|---|---|---|---|
| Composio lock-in | Tooling is model-vendor agnostic [S-026] | Auth, scopes and policies live with Composio [S-026] | 2026 | It reduces model-provider lock-in but creates integration-plane dependency | Yes, semantically |
| “Open source” | Composio repo is MIT [S-030] | SDK requires API key and defaults to hosted backend [S-031] [S-032] | 2026 | Open SDK, proprietary service | Yes |
| LiteLLM “open source” | Core outside enterprise is MIT [S-006] | Enterprise directory requires commercial production license [S-007] | 2024–2026 | Open core, not all-feature open source | Yes |
| LiteLLM uptime | Landing page renders “80% uptime” [S-002] | Enterprise gateway positioning implies production reliability | 2026-07-20 | Likely a page/rendering/marketing data error; not credible as an SLO | No; do not use |
| Fast delivery vs stability | LiteLLM ships roughly weekly minor lines [S-003] | Only four latest minors supported; no LTS [S-003] | Policy effective 2026-06-29 | Velocity prioritized over long maintenance | Yes, policy explicit |
| Incident exposure window | Snyk reports roughly three hours [S-017] | Vendor/community timelines and early reports varied during response [S-016] | 2026-03-24 | Different endpoints: upload, discovery, quarantine and deletion | Partially |
| Registry availability vs safety | Official registry supports discovery/subregistries [S-038] | Moderation is minimal and vulnerable/buggy servers may remain [S-039] | 2025–2026 | Registry is an index, not a trust certification | Yes |
| Connector quantity | Composio reports 1,000+ apps [S-026] | Other directories publish much larger counts [S-056] | 2026 | Different units: app/tool/server/scraped package; no common validation | No common metric |
| Enterprise boundary clarity | LiteLLM OSS includes guardrails [S-002] | Several built-in guardrail callbacks require enterprise [S-003] | 2026 | Framework open; some integrations paid | Partially clear |
| Name uniqueness | Proposed codename “liteMCP” | PyPI and GitHub already use the name [S-050] [S-051] | 2025–2026 | Independent prior uses | Unresolved for launch |

## Strategic response

- Define “open source” at component level, never as an umbrella adjective.
- Publish an exit test and credential-portability matrix.
- Report availability with real SLOs, not vanity figures.
- Separate rapid and LTS release channels.
- Treat the official registry as intake, then add independent verification.
- Define catalog units: connector, server, tool and passing compatibility target.
- Replace or legally clear the working name before public launch.

## Confidence Notes

Some tensions are fully resolvable through narrower language; others, including exact incident timings and naming rights, require further evidence or legal review.

## Open Threads

Capture archived pages and request vendor clarification on any contradictory pricing, reliability or portability statement used in external publication.

## Sources Used

- [S-002]
- [S-003]
- [S-006]
- [S-007]
- [S-016]
- [S-017]
- [S-026]
- [S-030]
- [S-031]
- [S-032]
- [S-038]
- [S-039]
- [S-050]
- [S-051]
- [S-056]
