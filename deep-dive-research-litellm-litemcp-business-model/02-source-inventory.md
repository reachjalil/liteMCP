---
title: "Source Inventory"
file: "02-source-inventory.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 21
---

# Source Inventory

## Reader Promise

The reader knows where the evidence came from, how it was weighted and where coverage is weak.

## Summary (≤120 words)

The evidence base is strongest on product packaging, licenses, protocol requirements, source repositories and public issue reports. It is weaker on audited company economics, real customer willingness to pay, and hands-on onboarding performance. Vendor pages are treated as authoritative for current offers but not as independent proof of quality. GitHub issues are used as friction signals, not prevalence estimates. Research preprints and ecosystem directories are directional.

## What We Found


### Inventory by evidence role

| Surface | Examples | Use in this report | Weight |
|---|---|---|---|
| First-party product/docs | LiteLLM, Composio, MCP specification | Current packaging and stated behavior | High |
| Licenses and source | LiteLLM enterprise carve-out, Composio SDK | Open/proprietary boundary | High |
| Official issues/status | LiteLLM bugs/security, Composio incidents | Concrete failure modes | High for existence; low for frequency |
| Job listings/company profiles | LiteLLM hiring and self-reported metrics | Sales and operating-model signals | Medium |
| Competitor repositories/docs | Obot, ContextForge, MetaMCP, Docker | Feature overlap and license posture | High |
| Pricing analogues | Composio, Nango, Pipedream | Meter and tier calibration | High for current posted prices |
| Press/security analysis | Snyk, The Register | Incident cross-check | Medium–high |
| Academic/preprint studies | MCP ecosystem and auth studies | Directional ecosystem/security context | Medium |
| Vendor directories/censuses | Glama, MCP Census | Scale signal only | Low–medium |

### Coverage by question

| Question | Coverage | Why |
|---|---|---|
| LiteLLM free/paid boundary | Strong | Official docs plus repository licenses [S-003] [S-006] [S-007] |
| LiteLLM pricing amount | Weak | Quote-based; marketplace is private offer [S-003] [S-009] |
| LiteLLM sales motion | Medium | Recruiting signals, no audited funnel data [S-011] [S-012] |
| Composio usage pricing | Strong but time-sensitive | Public page announces an imminent change [S-025] |
| Composio backend openness | Strong | SDK repository and default hosted endpoint [S-029] [S-032] |
| MCP protocol/auth direction | Strong | Official specification and security guidance [S-034] [S-035] [S-036] [S-037] |
| Gateway competition | Strong | Multiple live OSS repositories/docs [S-040] [S-041] [S-042] [S-043] [S-044] [S-045] [S-046] [S-047] |
| Customer willingness to pay | Weak | No primary interviews in this run |
| Unit economics | Illustrative | Architecture-derived assumptions only |

### Source hygiene

Every ledger entry includes retrieval time and a declared archive failure. Public URLs may mutate. The most consequential current-price and current-feature claims should be rechecked immediately before investment or launch.


## Confidence Notes

Source classification is explicit, but archive coverage and live product trials are absent. Counts on dynamic GitHub pages and vendor directories should not be treated as permanent.

## Open Threads

Add hands-on product trials, customer calls, cloud-bill benchmarks and archived snapshots in the next diligence cycle.

## Sources Used

- [S-003]
- [S-006]
- [S-007]
- [S-009]
- [S-011]
- [S-012]
- [S-025]
- [S-029]
- [S-032]
- [S-034]
- [S-035]
- [S-036]
- [S-037]
- [S-040]
- [S-041]
- [S-042]
- [S-043]
- [S-044]
- [S-045]
- [S-046]
- [S-047]
