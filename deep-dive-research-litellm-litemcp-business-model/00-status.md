---
title: "Research Status"
file: "00-status.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "mixed"
sources_count: 8
---

# Research Status

## Reader Promise

The reader can see exactly what was completed, what was verified, and which evidence-handling limitations remain.

## Summary (≤120 words)

The requested business-model deep dive is complete and packaged. It covers LiteLLM, Composio, MCP standards, direct gateway competitors, pricing analogues, product architecture, licensing, go-to-market, financial scenarios, risks, and a decision recommendation. Public pages, documentation, repository files, issues, status pages, job listings, and research papers were reviewed as of July 20, 2026. Archive submission was not available in this runtime; every source is therefore marked with an archive-failed note and a retrieval timestamp. The financial model is illustrative, not a forecast.

## What We Found


### Phase ledger

| Phase | State | Output |
|---|---|---|
| Audience and intent | Complete | `01`, `03` |
| LiteLLM baseline and monetization | Complete | `05`, `06`, `13` |
| Composio comparison | Complete | `05`, `06`, `15` |
| MCP protocol, auth and trust | Complete | `08`–`11` |
| Competitor and community review | Complete | `15`–`17` |
| Business model, GTM and roadmap | Complete | `29`–`33` |
| Evidence and reproducibility | Complete with exception | `19`, `27`, `raw/` |
| Packaging and validation | Complete | ZIP at research root |

### Research status

- **Completion timestamp:** 2026-07-20T13:56Z.
- **Evidence-ledger rows:** 56.
- **Primary source emphasis:** vendor documentation, standards, licenses, source repositories, official issues and status pages.
- **No private or NDA material:** used.
- **No product signup or live execution:** performed. Developer-experience conclusions are based on public docs, repositories, issue reports and architecture inspection.
- **Archive exception:** automated Wayback/archive.today capture could not be submitted from this environment. Each ledger row records the exception rather than pretending an archive exists. A local capture manifest records retrieval metadata.
- **Naming status:** `liteMCP` is a working codename only; existing PyPI and GitHub uses create a material collision risk. [S-050] [S-051]
- **Financial status:** proposed prices, conversion rates, gross-margin targets and revenue scenarios are `[inference]`, clearly separated from observed market prices.

### What this package does not claim

It does not claim that LiteLLM's self-reported ARR, call volume or team size has been audited; those signals come from company-controlled job listings. [S-011] [S-013] It does not claim that Composio's full backend is open source; the reviewed repository is an MIT SDK monorepo whose default service endpoint points to Composio's hosted backend. [S-029] [S-030] [S-031] [S-032] It does not claim legal clearance for the proposed license or name.


## Confidence Notes

Claims based on official documentation and repository licenses are high confidence. Company metrics in recruiting copy, ecosystem census counts, and preprint conclusions are medium confidence. The lack of live product trials and archived snapshots lowers confidence in onboarding-time and historical-page-change findings.

## Open Threads

Verify the launch name, conduct legal review of the Apache/commercial split, run live onboarding tests against Composio and Obot, and validate pricing through customer interviews.

## Sources Used

- [S-011]
- [S-013]
- [S-029]
- [S-030]
- [S-031]
- [S-032]
- [S-050]
- [S-051]
