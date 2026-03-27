# Analytical Workflows

Structured investigation frameworks. Apply the right workflow to the question before jumping to conclusions.

---

## Root Cause Investigation

Use when a metric has changed and you need to understand why.

### Phase 1 — Validate the change
Before investigating causes, confirm the change is real:
1. Is the data pipeline healthy? Check for gaps, duplicates, or late-arriving data
2. Is the metric definition stable? Any recent changes to the calculation?
3. Is the date range appropriate? Avoid day-of-week effects by comparing same-day-of-week or full weeks
4. Is the sample size large enough to distinguish signal from noise?

```sql
-- Check for data gaps (missing days)
WITH date_spine AS (
    SELECT generate_series(
        (SELECT MIN(DATE(created_at)) FROM events),
        CURRENT_DATE, '1 day'::INTERVAL
    )::DATE AS date
)
SELECT ds.date, COUNT(e.event_id) AS event_count
FROM date_spine ds
LEFT JOIN events e ON DATE(e.created_at) = ds.date
GROUP BY ds.date
HAVING COUNT(e.event_id) = 0   -- flag missing days
ORDER BY ds.date;
```

### Phase 2 — Quantify the magnitude
```sql
-- Baseline comparison: same period last week / last month
WITH current_period AS (
    SELECT SUM(amount) AS revenue
    FROM orders
    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      AND status = 'completed'
),
prior_period AS (
    SELECT SUM(amount) AS revenue
    FROM orders
    WHERE created_at >= CURRENT_DATE - INTERVAL '14 days'
      AND created_at < CURRENT_DATE - INTERVAL '7 days'
      AND status = 'completed'
)
SELECT
    c.revenue AS current_revenue,
    p.revenue AS prior_revenue,
    c.revenue - p.revenue AS absolute_change,
    ROUND(100.0 * (c.revenue - p.revenue) / NULLIF(p.revenue, 0), 1) AS pct_change
FROM current_period c, prior_period p;
```

### Phase 3 — Systematic drill-down
Decompose the metric by every available dimension. Look for the dimension where the change is concentrated.

```sql
-- Decompose by segment: find which dimension drives the change
SELECT
    plan_tier,
    SUM(CASE WHEN order_date >= CURRENT_DATE - 7 THEN amount ELSE 0 END)  AS current_7d,
    SUM(CASE WHEN order_date >= CURRENT_DATE - 14
             AND order_date < CURRENT_DATE - 7   THEN amount ELSE 0 END)  AS prior_7d,
    ROUND(100.0 * (
        SUM(CASE WHEN order_date >= CURRENT_DATE - 7 THEN amount ELSE 0 END) -
        SUM(CASE WHEN order_date >= CURRENT_DATE - 14 AND order_date < CURRENT_DATE - 7 THEN amount ELSE 0 END)
    ) / NULLIF(
        SUM(CASE WHEN order_date >= CURRENT_DATE - 14 AND order_date < CURRENT_DATE - 7 THEN amount ELSE 0 END),
        0
    ), 1) AS pct_change
FROM orders o
JOIN customers c USING (customer_id)
WHERE order_date >= CURRENT_DATE - 14
  AND status = 'completed'
GROUP BY plan_tier
ORDER BY pct_change;
```

**Dimensions to check systematically:**
- Geography (country, region)
- Customer segment (plan, tier, cohort)
- Channel (acquisition source, device)
- Product / feature
- Time of day / day of week
- New vs. returning users

### Phase 4 — Hypothesis testing
Form hypotheses in order of likelihood, then test each with SQL evidence:

| Hypothesis | Evidence needed | How to test |
|---|---|---|
| Spike in a single segment | Segment breakdown | Drill-down query above |
| Data pipeline issue | Row count / freshness | Gap detection query |
| External factor (holiday, outage) | Timeline correlation | Overlay event log with metric trend |
| Funnel drop | Step-by-step conversion | Funnel query |
| New user behaviour change | New vs. returning cohort split | Cohort query |

### Phase 5 — Report the finding

Structure: **What changed → Where it changed → Why (most likely cause) → Confidence level → Recommended action**

---

## Cohort Analysis

Use when you want to understand behaviour across user groups over time.

```sql
-- Monthly cohort: D1/D7/D30 retention
WITH cohorts AS (
    SELECT
        user_id,
        DATE_TRUNC('month', created_at)::DATE AS cohort_month,
        created_at                            AS signup_date
    FROM users
),

sessions AS (
    SELECT user_id, occurred_at
    FROM events
    WHERE event_type = 'session_start'
),

cohort_retention AS (
    SELECT
        c.cohort_month,
        c.user_id,
        s.occurred_at,
        (s.occurred_at::DATE - c.signup_date::DATE) AS days_since_signup
    FROM cohorts c
    JOIN sessions s ON c.user_id = s.user_id
)

SELECT
    cohort_month,
    COUNT(DISTINCT user_id)                                                         AS cohort_size,
    COUNT(DISTINCT CASE WHEN days_since_signup = 0 THEN user_id END)               AS day_0,
    COUNT(DISTINCT CASE WHEN days_since_signup BETWEEN 1  AND 1  THEN user_id END) AS day_1,
    COUNT(DISTINCT CASE WHEN days_since_signup BETWEEN 6  AND 8  THEN user_id END) AS day_7,
    COUNT(DISTINCT CASE WHEN days_since_signup BETWEEN 28 AND 32 THEN user_id END) AS day_30,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN days_since_signup BETWEEN 1 AND 1 THEN user_id END)
        / COUNT(DISTINCT user_id), 1) AS d1_retention_pct,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN days_since_signup BETWEEN 6 AND 8 THEN user_id END)
        / COUNT(DISTINCT user_id), 1) AS d7_retention_pct,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN days_since_signup BETWEEN 28 AND 32 THEN user_id END)
        / COUNT(DISTINCT user_id), 1) AS d30_retention_pct
FROM cohort_retention
GROUP BY cohort_month
ORDER BY cohort_month;
```

**Cohort analysis interpretation checklist:**
- Compare same-age cohorts (week 4 of January cohort vs. week 4 of February cohort), not same calendar date
- Recent cohorts will be right-censored — don't read too much into their later periods
- Look for the "floor" — where does retention stabilise? That's your engaged core
- Improving D1 retention is usually more impactful than improving D30 (leaky bucket)

---

## Funnel Analysis

Use when you want to understand conversion through a defined sequence of steps.

**Before querying, define:**
1. The ordered steps (what counts as each step?)
2. The time window (must user complete all steps within X days?)
3. The grain (user-level or session-level?)
4. Whether re-entry is allowed (can a user enter the funnel multiple times?)

```sql
-- Session-level funnel with time window (e.g. checkout flow within one session)
WITH session_funnel AS (
    SELECT
        session_id,
        user_id,
        MAX(CASE WHEN event_type = 'product_viewed'    THEN 1 ELSE 0 END) AS viewed,
        MAX(CASE WHEN event_type = 'add_to_cart'       THEN 1 ELSE 0 END) AS added_to_cart,
        MAX(CASE WHEN event_type = 'checkout_started'  THEN 1 ELSE 0 END) AS started_checkout,
        MAX(CASE WHEN event_type = 'purchase_completed'THEN 1 ELSE 0 END) AS purchased
    FROM events
    WHERE occurred_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY session_id, user_id
)

SELECT
    SUM(viewed)                                                                  AS step_1_view,
    SUM(CASE WHEN viewed = 1 AND added_to_cart = 1       THEN 1 ELSE 0 END)    AS step_2_cart,
    SUM(CASE WHEN added_to_cart = 1 AND started_checkout = 1 THEN 1 ELSE 0 END) AS step_3_checkout,
    SUM(CASE WHEN started_checkout = 1 AND purchased = 1  THEN 1 ELSE 0 END)    AS step_4_purchase,
    ROUND(100.0 * SUM(CASE WHEN viewed=1 AND added_to_cart=1 THEN 1 ELSE 0 END)
        / NULLIF(SUM(viewed), 0), 1)                                             AS view_to_cart_pct,
    ROUND(100.0 * SUM(CASE WHEN started_checkout=1 AND purchased=1 THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN added_to_cart=1 AND started_checkout=1 THEN 1 ELSE 0 END), 0), 1) AS checkout_to_purchase_pct
FROM session_funnel;
```

**Funnel interpretation:**
- The biggest drop-off step is the highest-value optimisation target
- Segment by device, channel, user segment to find where the drop-off is concentrated
- Compare funnel conversion across time periods to detect regressions

---

## Segmentation Analysis

Use when you want to group users or customers by behaviour or characteristics.

### Behavioural segmentation (RFM)
See `sql_patterns.md` → RFM Segmentation Query.

### Need-based / demographic segmentation
```sql
-- Cross-tab: segment by plan tier × geography
SELECT
    c.plan_tier,
    c.country,
    COUNT(DISTINCT c.customer_id)                   AS customers,
    ROUND(AVG(o.total_amount), 2)                   AS avg_order_value,
    ROUND(AVG(o_counts.order_count), 1)             AS avg_orders_per_customer,
    SUM(o.total_amount)                             AS total_revenue
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id AND o.status = 'completed'
LEFT JOIN (
    SELECT customer_id, COUNT(*) AS order_count
    FROM orders WHERE status = 'completed'
    GROUP BY customer_id
) o_counts ON c.customer_id = o_counts.customer_id
GROUP BY c.plan_tier, c.country
ORDER BY total_revenue DESC;
```

**Segmentation principles:**
- Segments must be mutually exclusive and collectively exhaustive (MECE)
- Each segment must be large enough to act on (min. ~100 users for statistical meaning)
- Define the action for each segment before presenting the analysis — otherwise it's just a description

---

## Metric Reconciliation

Use when two sources report different numbers for the same metric.

### Investigation checklist
1. **Grain mismatch** — are both sources counting at the same level? (user vs. session vs. event)
2. **Date/timezone handling** — is one source in UTC and the other in local time?
3. **Filter differences** — different status filters, exclusion of test accounts, bot filtering
4. **Attribution window** — different lookback windows for conversion/revenue attribution
5. **Deduplication logic** — one source deduplicates, the other doesn't
6. **Schema version** — one source uses a newer definition of the metric

```sql
-- Side-by-side reconciliation query
WITH source_a AS (
    SELECT DATE(created_at) AS date, COUNT(*) AS count_a
    FROM orders_source_a
    WHERE status = 'completed'
    GROUP BY 1
),
source_b AS (
    SELECT DATE(order_date) AS date, COUNT(*) AS count_b
    FROM orders_source_b
    WHERE order_status = 'complete'
    GROUP BY 1
)
SELECT
    COALESCE(a.date, b.date) AS date,
    a.count_a,
    b.count_b,
    a.count_a - b.count_b   AS diff,
    ROUND(100.0 * (a.count_a - b.count_b) / NULLIF(b.count_b, 0), 2) AS pct_diff
FROM source_a a
FULL OUTER JOIN source_b b USING (date)
ORDER BY ABS(a.count_a - b.count_b) DESC NULLS LAST;
```
