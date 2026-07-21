---
title: "Illustrative Financial Model"
file: "31-financial-model.md"
audience: "builder-architect"
last_updated_utc: "2026-07-20T13:56Z"
confidence: "low"
sources_count: 3
---

# Illustrative Financial Model

## Reader Promise

The reader can inspect the assumptions behind plausible revenue scenarios without confusing them with a forecast.

## Summary (≤120 words)

The model demonstrates that a mixed PLG and enterprise business can reach low-single-digit millions of ARR if cloud adoption and enterprise conversion work. It does not prove demand. Revenue is modeled from Starter, Growth, Business and Enterprise customers plus usage uplift. The largest unknown is gross margin after connector assurance, OAuth operations and support. All figures are illustrative and should be replaced with observed cohorts and cloud costs.

## What We Found

## Tier assumptions

| Tier | Monthly subscription | Annualized base revenue/customer |
|---|---:|---:|
| Starter | $49 | $588 |
| Growth | $399 | $4,788 |
| Business | $1,499 | $17,988 |
| Enterprise | Scenario-specific | $36K–$60K |

Prices match the proposed packaging in `13-pricing-and-licensing.md`; they are not current market facts.

## Month-24 annualized scenarios `[inference]`

| Scenario | Starter | Growth | Business | Enterprise | Base subscription ARR | Usage/overage uplift | Annualized revenue |
|---|---:|---:|---:|---:|---:|---:|---:|
| Conservative | 350 | 80 | 15 | 5 @ $36K | $1,038,660 | 15% | $1,194,459 |
| Base | 700 | 180 | 40 | 12 @ $45K | $2,532,960 | 15% | $2,912,904 |
| Upside | 1,200 | 350 | 80 | 25 @ $60K | $5,320,440 | 20% | $6,384,528 |

### Calculation

```text
ARR = Σ(customers_tier × monthly_price_tier × 12)
    + enterprise_customers × enterprise_ACV
    + usage_uplift
```

The accompanying `data/revenue-scenarios.csv` contains exact row calculations.

## Illustrative cost model

Variable monthly cost drivers:

| Driver | Unit cost assumption | Rationale |
|---|---:|---|
| Successful execution routing | $0.00003 | Network/compute/telemetry estimate |
| Active managed connection | $0.05 | Vault operations/refresh/metadata estimate |
| Included metadata storage | $0.02 per GB-month effective | Compressed operational records |
| Sandbox compute | Pass-through × 1.25 | Separately metered |
| Support | Tier/contract-specific | Human cost; not safely averaged into calls |
| Connector assurance | Hours per connector | Main uncertainty |

Example Growth customer at full allowance:

- 2,000,000 executions × $0.00003 = $60;
- 500 active connections × $0.05 = $25;
- storage/egress/monitoring allowance = $15 `[assumption]`;
- infrastructure subtotal ≈ $100;
- subscription = $399;
- infrastructure gross margin ≈ 75% before support and connector operations.

This example shows why connector labor must be controlled or priced separately.

## Team and break-even framing

A 12–18 person infrastructure company with security, connectors, support and enterprise sales can plausibly require several million dollars of ARR before full cash break-even `[inference]`. Do not set a precise break-even without compensation, geography, hosting, sales and financing assumptions. A working planning range is $4M–$5M ARR, not a forecast.

## Sensitivities

### 1. Connector labor

At $150 fully loaded hourly cost, one extra hour per verified connector per month across 100 connectors costs $15K/month. At ten hours, it costs $150K/month. Automation and a narrow assured set are decisive.

### 2. Enterprise mix

Twelve $45K contracts contribute $540K ARR in the base scenario—more than 900 Starter customers. Enterprise controls and assurance materially affect viability.

### 3. Usage uplift

Usage contributes 15–20% in these scenarios. If usage is negligible, base subscriptions must cover costs. If usage is dominant, price predictability and abuse protection matter.

### 4. Free-tier load

A generous 20K-call tier is inexpensive at assumed routing cost, but bot abuse, sandbox use and OAuth operations can change the equation. Require rate limits and verified email/organization for managed auth.

### 5. Gross margin

| Blended gross margin | Base scenario gross profit |
|---:|---:|
| 60% | ~$1.75M |
| 70% | ~$2.04M |
| 80% | ~$2.33M |
| 85% | ~$2.48M |

This is before operating expenses.

## Funding milestones

- **Pre-seed / internal:** prove import, secure broker architecture and 3 design partners.
- **Seed readiness:** 10+ paying organizations, 25 verified connectors, >99.9% data-plane SLO, repeatable managed-auth activation, evidence of <$100/month median connector labor.
- **Scale readiness:** >$1M ARR, net expansion, enterprise references, connector gross-margin model and no unresolved high-severity credential findings.

## Accounting cautions

- Separate software subscription from professional services.
- Recognize annual contracts and usage in accordance with applicable accounting policy.
- Treat marketplace fees, support and sandbox pass-through correctly.
- Do not count community self-hosted executions as revenue.
- Do not call the scenarios forecasts in investor or customer material.

## Confidence Notes

Confidence is low because every liteMCP financial input is hypothetical. Competitor pricing validates order-of-magnitude willingness to pay for integrations, not these cohorts or costs. [S-025] [S-048] [S-049]

## Open Threads

Replace assumptions with cloud benchmarks, connector-maintenance time, support tickets and paid pilot conversion after the first 90 days.

## Sources Used

- [S-025]
- [S-048]
- [S-049]
