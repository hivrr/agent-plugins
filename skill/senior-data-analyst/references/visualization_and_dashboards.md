# Visualization & Dashboards

---

## Chart Type Selection Matrix

**Ask first: what is the primary question this chart answers?**

| Question | Chart type | Notes |
|---|---|---|
| How has X changed over time? | Line chart | Multiple series OK up to ~5; use area for cumulative |
| How do categories compare? | Bar chart (horizontal for long labels) | Sort by value; avoid alphabetical |
| What is X as a share of a whole? | Pie (≤4 segments) or stacked bar | Never use 3D pie; prefer stacked bar for >4 segments |
| How do two variables relate? | Scatter plot | Add trend line; colour by segment if relevant |
| What does the distribution look like? | Histogram or box plot | Box plot for comparing distributions across groups |
| What is a single important number? | KPI card with trend indicator | Include % change vs. prior period |
| How does a metric break down hierarchically? | Treemap or sunburst | Only for part-to-whole with hierarchy |
| Where are things happening geographically? | Choropleth or bubble map | Only when geography is actually meaningful |
| How do many metrics compare across many items? | Heatmap | Good for cohort retention tables |

**Never use:**
- 3D charts — distort perception of area and volume
- Dual Y-axes — almost always mislead; use two separate charts instead
- Pie charts with >5 segments — use a ranked bar chart
- Rainbow colour scales — use sequential (one colour, light→dark) for continuous data

---

## The 5-Second Rule

Every chart should communicate its primary takeaway in 5 seconds to the intended audience. If it can't, it's too complex. Split it or simplify it.

**Add to every chart:**
- A descriptive title that states the conclusion ("Conversion rate fell 3pp in Q4"), not just the metric name ("Conversion Rate")
- A source and date range in the subtitle or footnote
- A clear axis label with units
- A reference line or target line if a target exists

---

## Dashboard Layer Design

### Executive layer
- **Audience:** C-suite, board, senior leadership
- **Frequency:** Weekly or monthly review
- **Contents:** 3–5 north star KPIs, trend direction (up/flat/down), RAG status vs. target
- **Rules:** No tables, no drill-down, no filters. Must load in under 2 seconds. One page.

```
┌──────────────────────────────────────────────┐
│  ARR         MRR Growth   Churn    NRR        │
│  $12.4M ↑    +8% MoM     2.1% ↓   108% ↑    │
│  [sparkline] [sparkline] [sparkline] [sparkline]│
├──────────────────────────────────────────────┤
│  Revenue trend (12 months)                   │
│  [Line chart vs. target]                     │
└──────────────────────────────────────────────┘
```

### Operational layer
- **Audience:** Team leads, managers
- **Frequency:** Daily or weekly
- **Contents:** Current performance vs. target, key breakdowns by segment/channel, anomaly alerts
- **Rules:** Light filtering (date range, segment). Max 2 pages. Flag anything outside tolerance.

### Analytical layer
- **Audience:** Analysts, PMs, data-curious ICs
- **Frequency:** Ad hoc
- **Contents:** Full drill-down, all filters exposed, raw data access option
- **Rules:** Depth over brevity. Document assumptions. Enable export.

---

## Dashboard Anti-Patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Too many metrics on one screen (>10) | Cognitive overload; no clear hierarchy | Apply the 3-layer model; promote only what matters |
| Metrics without targets | No way to know if performance is good | Add target line or RAG threshold to every KPI |
| No data freshness indicator | Viewer doesn't know if data is current | Add "Last updated: [timestamp]" to every dashboard |
| Identical time period for all charts | Context collapse — no way to compare | Use consistent periods with clear labels |
| Sorting alphabetically instead of by value | Hardest to compare, easiest to build | Always sort bar charts by value (descending) |
| Filters that silently change the metric definition | Viewer changes a filter and doesn't realise the numerator changed | Make filter scope explicit in chart titles |
| A table where a chart would work | Tables require active reading; charts are preattentive | Use tables only for lookup; charts for comparison |

---

## Colour Usage Guide

- **One highlight colour** for the key data point or trend; **neutral grey** for context
- **Sequential palette** (single hue, light→dark) for ordered/continuous data
- **Diverging palette** (e.g. red→white→blue) only for data with a meaningful midpoint (e.g. % change vs. 0)
- **Qualitative palette** for categorical series — max 7 colours before it breaks down
- **Never** use red/green as the only encoding — colour-blind users (8% of men) can't distinguish them. Add a shape, label, or pattern as a secondary encoding.

---

## Data Narrative Frameworks

When presenting findings, choose a structure based on the audience situation:

### Situation-Complication-Resolution (SCR)
Best for stakeholder presentations where the audience needs to make a decision.

```
Situation:    "We've been growing revenue at 15% MoM for the past 6 months."
Complication: "This month growth slowed to 4%, driven by a drop in trial conversion."
Resolution:   "We recommend investing in onboarding improvements — our data shows
               users who complete 3+ key actions in week 1 convert at 38% vs. 12%."
```

### Before-After-Bridge
Best for product or marketing analyses showing impact.

```
Before: "Trial users who didn't receive the onboarding email converted at 12%."
After:  "Trial users who received the onboarding email converted at 31%."
Bridge: "Scaling the email programme to all new trials would add ~$180K ARR."
```

### So What / Why / Now What
Best for analytical reports where the audience wants depth.

```
So What:  State the key finding plainly.
Why:      Give the evidence — the data that supports it.
Now What: Give the recommended action and expected impact.
```

---

## Dashboard Specification Template

Before building, write a spec. This prevents rebuilding.

```markdown
## Dashboard: [Name]

**Purpose:** One sentence — what decision does this dashboard inform?
**Audience:** Who reads it and how often?
**Success criterion:** What does this dashboard make easier/faster than before?

### Metrics
| Metric | Formula | Source table | Update freq | Target |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

### Layout
**Section 1 — Hero KPIs:** [list metrics with chart types]
**Section 2 — Trend:** [list charts]
**Section 3 — Breakdown:** [list charts and split dimensions]
**Section 4 — Detail table:** [columns, default sort, max rows]

### Filters
- Date range: default = last 30 days
- Segment: all / plan_tier / country

### Data freshness
- Source: [table name]
- Lag: [expected update delay]
- Staleness alert: flag if data is >N hours old

### Known limitations
- [Any caveats, sampling, or metric definition edge cases]
```

---

## Insight Communication Checklist

Before sharing any analysis:

- [ ] Lead with the finding, not the method ("Conversion dropped 3pp" not "I ran a funnel query and found...")
- [ ] Include magnitude and direction, not just direction ("down 3pp" not just "down")
- [ ] Include a comparison point ("vs. 32% last month" or "vs. 28% industry benchmark")
- [ ] State your confidence ("This is directionally reliable; sample is small for the DE segment")
- [ ] Include a recommended action or next step
- [ ] Flag any data quality caveats up front — don't bury them in footnotes
