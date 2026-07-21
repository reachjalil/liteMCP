---
title: "Route System Proposal for a Future Deep-Dive Site"
file: "25-route-system-proposal.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 0
---

# Route System Proposal for a Future Deep-Dive Site

## Reader Promise

The site team can map the research files into reader-focused routes with explicit jobs and evidence burdens.

## Summary (≤120 words)

The future site should use an Evidence Atlas structure: a concise decision layer for executives, with expandable technical and source detail for builders. Routes should center the business decision—not mirror file names mechanically. Comparison, pricing, identity, risks and evidence deserve dedicated interactive views.

## What We Found

| Route | Job | Primary audience | Reader promise | Evidence burden | Primary handoff |
|---|---|---|---|---|---|
| `/` | State the decision and thesis | All | Know whether to proceed and why | Highest | `33`, `03` |
| `/litellm-model` | Explain LiteLLM monetization | Strategist/buyer | Understand free, paid, sales and risks | High | `05`, `06`, `13` |
| `/composio-model` | Explain hosted integration economics | Builder/strategist | Understand what SDKs open and backend sells | High | `05`, `06`, `15` |
| `/opportunity` | Define the uncommoditized wedge | Founder/architect | See why routing alone is weak | High | `03`, `07`, `29` |
| `/architecture` | Show data/control/credential planes | Architect/security | Predict system boundaries | High | `04`, `08`, `09`, `10` |
| `/identity` | Explain auth and portability | Security/buyer | Evaluate token custody and exit | Highest | `10`, `14` |
| `/connectors` | Explain assurance and verification | Builder/operator | Evaluate connector quality model | High | `11`, `12`, `29` |
| `/pricing` | Compare observed and proposed prices | Buyer/investor | See meters, tiers and assumptions | Highest | `13`, `31` |
| `/compare` | Compare credible alternatives | Evaluator | Choose build/buy/partner | High | `07`, `15`, `data/feature-matrix.csv` |
| `/migration` | Plan coexistence and exit | Migrator | Sequence a safe rollout | High | `14` |
| `/go-to-market` | Show ICP, wedge and channels | Founder/GT​M | Run design-partner motion | Medium | `30` |
| `/roadmap` | Show milestones and gates | Team/investor | Know what ships and what proves | Medium | `32` |
| `/timeline` | Place market evolution | Strategist | Understand why timing changed | Medium | `18`, `data/timeline.csv` |
| `/community` | Explore practitioner signals | Evaluator | See concrete friction and limits | High | `16`, `data/sentiment-samples.csv` |
| `/risks` | Surface contradictions and kill criteria | Skeptic | Know what could invalidate the plan | Highest | `21`–`23`, `33` |
| `/sources` | Filter evidence ledger | All | Retrace every claim | Highest | `19`, `raw/sources.csv` |
| `/source/:id` | Inspect source metadata | Researcher | Validate one evidence item | Highest | `19` |
| `/glossary` | Normalize terms | All | Avoid vendor-language confusion | Medium | `24` |
| `/method` | Disclose scope, limits and AI assistance | Skeptic | Judge research quality | High | `00`, `01`, `02`, `27`, `28` |

## Interaction model

- Every factual card shows source type, publication date, retrieval date and confidence.
- `[inference]` appears as a visible badge, not only prose.
- Pricing tables have an “observed / proposed” toggle.
- Comparison cells open source evidence and freshness.
- A “what would change our mind?” rail exposes falsification criteria.
- The architecture page can toggle self-hosted, cloud and enterprise deployment.
- The connector page visualizes build → test → sign → canary → repair.
- The risks route orders by severity and evidence rather than probability theater.

## Visual direction

Choose **Evidence Atlas**: editorial typography, dense but navigable evidence cards, maps/matrices and restrained diagrams. Avoid SaaS-gradient marketing. The product thesis depends on credibility and precise boundaries.

## Confidence Notes

This is a proposed information architecture. Route names and interaction depth should be tested with representative readers.

## Open Threads

Decide whether LiteLLM and Composio deserve separate routes or one comparative business-model route after content prototyping.

## Sources Used

- No external sources; proposal/inference only.
