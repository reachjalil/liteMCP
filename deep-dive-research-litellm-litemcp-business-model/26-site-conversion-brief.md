---
title: "Site Conversion Brief"
file: "26-site-conversion-brief.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "medium"
sources_count: 0
---

# Site Conversion Brief

## Reader Promise

The implementation team can convert this folder into an accessible Astro research site without losing evidence semantics.

## Summary (≤120 words)

Convert Markdown to an Evidence Atlas, not a marketing microsite. Preserve source keys as first-class data, distinguish observed facts from proposals, and let readers move between executive conclusions, architecture, pricing assumptions and raw evidence. CSVs should drive sortable tables; Mermaid diagrams should be rendered to accessible SVG with text alternatives.

## What We Found

## File-to-route mapping

| Route | Markdown | Structured data |
|---|---|---|
| `/` | `33-decision-memo.md`, `03-audience-and-thesis.md` | revenue summary |
| `/litellm-model` | `05`, `06`, `13` | `pricing-signals.csv` |
| `/opportunity` | `07`, `15`, `29` | `feature-matrix.csv` |
| `/architecture` | `04`, `08`, `09`, `10`, `11` | `api-endpoints.csv`; Mermaid |
| `/pricing` | `13`, `31` | `unit-economics.csv`, `revenue-scenarios.csv` |
| `/compare` | `07`, `15` | `feature-matrix.csv` |
| `/community` | `16`, `17` | `sentiment-samples.csv` |
| `/timeline` | `18` | `timeline.csv` |
| `/risks` | `21`, `22`, `23` | risk table extracted from Markdown |
| `/sources` | `19` | `raw/sources.csv`, capture manifest |
| `/method` | `00`, `01`, `02`, `27`, `28` | none |

## Skim layer

- Decision: conditional go.
- Three findings.
- Three open questions.
- Proposed packaging.
- Closest competitors.
- 90-day gates.
- Illustrative revenue range.
- Major limitations.

## Deep layer

- source-level business-model anatomy;
- credential threat model and portability contract;
- complete API/data/event proposal;
- migration plans;
- pricing mechanics and scenario assumptions;
- contradictions, risks and evidence ledger.

## Components

1. `<EvidenceClaim>` with source keys, type, freshness and confidence.
2. `<Inference>` with rationale and falsification test.
3. `<FeatureMatrix>` loaded from CSV, filterable by open/paid/unknown.
4. `<PricingModel>` with adjustable tier/customer assumptions; never label output a forecast.
5. `<Timeline>` with event/source drilldown.
6. `<ArchitectureToggle>` for OSS, cloud and enterprise.
7. `<ContradictionCard>` showing both claims without forced resolution.
8. `<SourceDrawer>` with URL, archive status and notes.
9. `<FreshnessBadge>` for dynamic pricing, docs and job listings.
10. `<OpenQuestion>` with priority, owner and test.

## Accessibility

- SVG diagrams require meaningful `title`, `desc` and adjacent text representation.
- Tables need semantic headers, captions and mobile card fallbacks.
- Do not encode confidence or product state by color alone.
- Keyboard access for filters/drawers.
- Respect reduced motion.
- Source links expose publisher and date in accessible text.
- Proposed pricing sliders announce changed values to assistive technology.
- Maintain high contrast and readable line lengths.

## Citation behavior

Markdown `[S-NNN]` keys resolve to `/source/S-NNN`. Hover may preview metadata, but the link must work without JavaScript. Display `[archive unavailable]` visibly for this package's archive exception.

## Build notes

- Parse YAML front matter at build time.
- Validate every source key against `raw/sources.csv`.
- Generate JSON from CSVs for client-side filtering.
- Render Mermaid at build time, not in the browser, to reduce CSP/security complexity.
- Create a publication timestamp and a “recheck dynamic claims” report.
- Do not copy entire source pages into the site.

## Confidence Notes

The brief is implementation guidance, not a tested UX. The folder's structured data is sufficient for a first Astro prototype.

## Open Threads

Define the site's publication/legal review process, especially for pricing, security incidents, company metrics and comparative claims.

## Sources Used

- No external sources; proposal/inference only.
