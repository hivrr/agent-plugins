# KPI Frameworks

---

## The Decision-First Rule

Every metric must answer: **"What decision will this metric inform, and who makes it?"**

Metrics without an attached decision are vanity metrics. Before defining any KPI:
1. Name the decision it informs
2. Name the person/team who makes that decision
3. Name the frequency they make it
4. Only then define the metric

---

## KPI Definition Template

| Field | Description |
|---|---|
| **Name** | Clear, unambiguous name |
| **Formula** | Exact calculation — no ambiguity |
| **Data source** | Table(s) and fields used |
| **Update frequency** | Real-time / hourly / daily / weekly |
| **Owner** | Team or role responsible |
| **Target** | What does "good" look like? (absolute or relative) |
| **Alert threshold** | When to escalate |
| **Lagging / Leading / Diagnostic** | See types below |

### Example
| Field | Value |
|---|---|
| Name | Trial-to-Paid Conversion Rate |
| Formula | `paid_conversions_in_period / trial_starts_in_period` |
| Data source | `subscriptions` table, `status` and `plan_start_date` columns |
| Update frequency | Daily |
| Owner | Revenue team |
| Target | ≥ 25% within 14 days of trial start |
| Alert threshold | < 20% for 3 consecutive days |
| Type | Lagging (measures outcome) |

---

## Metric Type Classification

| Type | Definition | Examples | Use |
|---|---|---|---|
| **Lagging** | Measures what already happened | Revenue, churn rate, NPS | Accountability, reporting |
| **Leading** | Predicts future outcomes | Trial signups, feature activation rate | Early warning, forecasting |
| **Diagnostic** | Explains why a lagging metric changed | Error rate by feature, support ticket volume | Root cause analysis |

**Rule:** North star and OKR metrics are usually lagging. Operational dashboards need leading indicators. Diagnostic metrics are for investigation, not regular reporting.

---

## Metric Hierarchy

```
North Star (1–2 metrics)
│   The single most important signal of business health
│   e.g. Weekly Active Users, Annual Recurring Revenue
│
├── Supporting Metrics (5–10)
│   │   Drive or predict the north star
│   │   e.g. New MRR, Expansion MRR, Churn MRR, Trial Conversion Rate
│   │
│   └── Diagnostic Metrics (as needed)
│           Explain changes in supporting metrics
│           e.g. Churn by segment, churn by tenure cohort, churn by plan
```

---

## Vanity Metric Patterns

Flag these — they almost always mislead without normalisation:

| Vanity metric | Why it misleads | Better alternative |
|---|---|---|
| Total registered users | Includes inactive, churned, spam | MAU or DAU |
| Total page views | Doesn't distinguish engagement quality | Pages/session, return visit rate |
| Total revenue | Ignores churn and expansion | Net Revenue Retention (NRR) |
| Raw downloads | Many downloads ≠ active use | Activation rate post-download |
| Total emails sent | Volume without quality | Open rate, click-to-open rate |
| App store rating | Selection bias from vocal users | Tracked NPS via in-product survey |

---

## Business Metrics by Domain

### SaaS / Subscription

```
MRR (Monthly Recurring Revenue)
  = sum of all active subscription monthly fees

ARR = MRR × 12

New MRR = MRR from customers who signed up this month
Expansion MRR = MRR from upsells/upgrades to existing customers
Churned MRR = MRR lost from cancellations
Net New MRR = New MRR + Expansion MRR - Churned MRR

MRR Churn Rate = Churned MRR / MRR at start of period
Customer Churn Rate = churned_customers / customers_at_start_of_period

Net Revenue Retention (NRR) = (Starting MRR + Expansion - Churn - Contraction) / Starting MRR
  Target: > 100% (expansion outpaces churn)

LTV = ARPU / Customer Churn Rate  (simple)
    = ARPU × Gross Margin / Churn Rate  (contribution margin version)

CAC = Total Sales & Marketing Spend / New Customers Acquired

LTV:CAC Ratio  Target: ≥ 3:1
CAC Payback Period = CAC / (ARPU × Gross Margin)  Target: < 12 months

Rule of 40 = YoY Revenue Growth % + EBITDA Margin %  Target: ≥ 40
```

### Product

```
DAU = distinct users with ≥1 qualifying event on a given day
MAU = distinct users with ≥1 qualifying event in a 30-day window

DAU/MAU Ratio = engagement/stickiness signal  Target: varies by product type
  - Consumer social: 50–60%
  - B2B SaaS: 25–40%
  - Utilities: 10–20%

Feature Adoption Rate = users_who_used_feature / total_active_users

D1 Retention = users_active_on_day_1 / users_who_signed_up
D7 Retention = users_active_on_day_7 / users_who_signed_up
D30 Retention = users_active_on_day_30 / users_who_signed_up

Activation Rate = users_who_completed_activation_event / new_signups
  (Activation event = the "aha moment" — first value delivery)

NPS = % Promoters - % Detractors  (surveyed)
```

### E-commerce / Marketplace

```
GMV (Gross Merchandise Value) = total transaction value processed
Revenue = GMV × take_rate  (for marketplaces)

AOV (Average Order Value) = total_revenue / number_of_orders

Conversion Rate = orders / sessions  (or unique visitors)

Cart Abandonment Rate = 1 - (checkouts / add_to_carts)

Repeat Purchase Rate = customers_with_2+_orders / total_customers

LTV = AOV × Purchase_Frequency × Customer_Lifespan
    = AOV × (orders / customer) × avg_months_active

ROAS (Return on Ad Spend) = revenue_from_ads / ad_spend  Target: varies; typically > 3×
```

### Marketing

```
CAC by channel = channel_spend / new_customers_acquired_via_channel

Attribution models:
  - First-touch: 100% credit to first touchpoint
  - Last-touch: 100% credit to last touchpoint
  - Linear: equal credit across all touchpoints
  - Time-decay: more credit to touchpoints closer to conversion

MQL (Marketing Qualified Lead) → SQL (Sales Qualified Lead) conversion rate
Lead velocity rate = MoM growth in qualified leads

Email:
  Open rate = opens / delivered  (benchmark: 20–25% B2B)
  CTR = clicks / delivered
  CTOR (Click-to-Open Rate) = clicks / opens  (quality signal)
```

### Finance / Operations

```
Gross Margin = (Revenue - COGS) / Revenue
EBITDA Margin = EBITDA / Revenue
Burn Rate = monthly cash outflow (for startups)
Runway = cash_on_hand / monthly_burn_rate

Forecast Accuracy = 1 - |Actual - Forecast| / Actual

SLA Compliance = requests_meeting_SLA / total_requests
```

---

## OKR ↔ Metric Alignment

When aligning metrics to OKRs:

```
Objective: Improve customer retention
│
├── KR1: Reduce monthly churn rate from 3% to 2%
│     └── Leading indicators: support ticket volume, low-usage accounts, NPS detractors
│
├── KR2: Increase NRR from 95% to 105%
│     └── Leading indicators: expansion pipeline, upsell-qualified accounts
│
└── KR3: Improve D30 retention from 40% to 50%
      └── Leading indicators: D7 retention, activation rate
```

Diagnostic metrics sit below KRs and are used during investigation, not regular reviews.
