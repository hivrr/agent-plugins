# SQL Patterns

Reusable patterns for analytical SQL — correctness, readability, and performance.

---

## CTE Style Guide

Prefer CTEs over nested subqueries. Each CTE should do one thing and have a name that explains what it contains.

```sql
-- Bad: nested subquery hell
SELECT user_id, total
FROM (
    SELECT user_id, SUM(amount) AS total
    FROM (SELECT * FROM orders WHERE status = 'completed') o
    GROUP BY user_id
) t
WHERE total > 1000;

-- Good: named CTEs that read like a story
WITH completed_orders AS (
    SELECT user_id, amount
    FROM orders
    WHERE status = 'completed'
),

user_totals AS (
    SELECT
        user_id,
        SUM(amount)   AS total_revenue,
        COUNT(*)      AS order_count,
        AVG(amount)   AS avg_order_value
    FROM completed_orders
    GROUP BY user_id
)

SELECT *
FROM user_totals
WHERE total_revenue > 1000
ORDER BY total_revenue DESC;
```

---

## Window Functions

```sql
-- ROW_NUMBER: deduplicate, pick latest record per user
WITH ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY created_at DESC
        ) AS rn
    FROM events
)
SELECT * FROM ranked WHERE rn = 1;

-- LAG / LEAD: compare to previous/next period
SELECT
    date,
    revenue,
    LAG(revenue, 1) OVER (ORDER BY date)                          AS prev_day_revenue,
    revenue - LAG(revenue, 1) OVER (ORDER BY date)                AS day_over_day_change,
    ROUND(
        100.0 * (revenue - LAG(revenue, 1) OVER (ORDER BY date))
            / NULLIF(LAG(revenue, 1) OVER (ORDER BY date), 0),
        2
    )                                                              AS pct_change
FROM daily_revenue;

-- Running total
SELECT
    date,
    revenue,
    SUM(revenue) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_revenue
FROM daily_revenue;

-- 7-day rolling average
SELECT
    date,
    revenue,
    AVG(revenue) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7d_avg
FROM daily_revenue;

-- NTILE: bucket users into quartiles
SELECT
    user_id,
    total_spend,
    NTILE(4) OVER (ORDER BY total_spend) AS spend_quartile
FROM user_spend;

-- PERCENT_RANK: percentile within group
SELECT
    user_id,
    session_count,
    ROUND(PERCENT_RANK() OVER (ORDER BY session_count) * 100, 1) AS percentile
FROM user_sessions;
```

---

## Cohort Retention Analysis

```sql
-- Standard weekly cohort retention
WITH cohorts AS (
    -- Assign each user to their signup cohort week
    SELECT
        user_id,
        DATE_TRUNC('week', created_at) AS cohort_week
    FROM users
),

activity AS (
    -- Find all active weeks per user
    SELECT DISTINCT
        user_id,
        DATE_TRUNC('week', occurred_at) AS active_week
    FROM events
    WHERE event_type = 'session_start'
),

cohort_activity AS (
    SELECT
        c.user_id,
        c.cohort_week,
        a.active_week,
        -- Weeks since cohort start
        (EXTRACT(EPOCH FROM (a.active_week - c.cohort_week)) / 604800)::INT AS week_number
    FROM cohorts c
    JOIN activity a ON c.user_id = a.user_id
    WHERE a.active_week >= c.cohort_week
),

cohort_sizes AS (
    SELECT cohort_week, COUNT(DISTINCT user_id) AS cohort_size
    FROM cohorts
    GROUP BY cohort_week
)

SELECT
    ca.cohort_week,
    cs.cohort_size,
    ca.week_number,
    COUNT(DISTINCT ca.user_id)                                    AS retained_users,
    ROUND(
        100.0 * COUNT(DISTINCT ca.user_id) / cs.cohort_size, 1
    )                                                             AS retention_pct
FROM cohort_activity ca
JOIN cohort_sizes cs USING (cohort_week)
GROUP BY ca.cohort_week, cs.cohort_size, ca.week_number
ORDER BY ca.cohort_week, ca.week_number;
```

---

## Funnel Analysis

```sql
-- Ordered funnel: what % reach each step?
WITH funnel_events AS (
    SELECT
        user_id,
        MIN(CASE WHEN event_type = 'signup'         THEN occurred_at END) AS step1_at,
        MIN(CASE WHEN event_type = 'email_verified' THEN occurred_at END) AS step2_at,
        MIN(CASE WHEN event_type = 'profile_completed' THEN occurred_at END) AS step3_at,
        MIN(CASE WHEN event_type = 'first_purchase' THEN occurred_at END) AS step4_at
    FROM events
    GROUP BY user_id
),

ordered_funnel AS (
    -- Only count a step if it occurred AFTER the previous step
    SELECT
        user_id,
        step1_at,
        CASE WHEN step2_at > step1_at                      THEN step2_at END AS step2_at,
        CASE WHEN step3_at > step2_at AND step2_at > step1_at THEN step3_at END AS step3_at,
        CASE WHEN step4_at > step3_at AND step3_at > step2_at THEN step4_at END AS step4_at
    FROM funnel_events
    WHERE step1_at IS NOT NULL
)

SELECT
    COUNT(*)                                                       AS step1_users,
    COUNT(step2_at)                                                AS step2_users,
    COUNT(step3_at)                                                AS step3_users,
    COUNT(step4_at)                                                AS step4_users,
    ROUND(100.0 * COUNT(step2_at) / COUNT(*), 1)                  AS step1_to_2_pct,
    ROUND(100.0 * COUNT(step3_at) / NULLIF(COUNT(step2_at), 0), 1) AS step2_to_3_pct,
    ROUND(100.0 * COUNT(step4_at) / NULLIF(COUNT(step3_at), 0), 1) AS step3_to_4_pct,
    ROUND(100.0 * COUNT(step4_at) / COUNT(*), 1)                  AS overall_conversion_pct
FROM ordered_funnel;
```

---

## Time-Series Aggregation

```sql
-- Fill date gaps (no missing days in the output)
WITH date_spine AS (
    SELECT generate_series(
        '2024-01-01'::DATE,
        CURRENT_DATE,
        '1 day'::INTERVAL
    )::DATE AS date
),

daily_revenue AS (
    SELECT
        DATE(created_at)    AS date,
        SUM(amount)         AS revenue,
        COUNT(*)            AS order_count
    FROM orders
    WHERE status = 'completed'
    GROUP BY DATE(created_at)
)

SELECT
    ds.date,
    COALESCE(dr.revenue, 0)      AS revenue,
    COALESCE(dr.order_count, 0)  AS order_count
FROM date_spine ds
LEFT JOIN daily_revenue dr USING (date)
ORDER BY ds.date;

-- Week-over-week and month-over-month comparison
WITH weekly AS (
    SELECT
        DATE_TRUNC('week', created_at)  AS week,
        SUM(amount)                     AS revenue
    FROM orders
    WHERE status = 'completed'
    GROUP BY 1
)

SELECT
    week,
    revenue,
    LAG(revenue, 1) OVER (ORDER BY week)  AS prev_week_revenue,
    LAG(revenue, 4) OVER (ORDER BY week)  AS revenue_4_weeks_ago,
    ROUND(100.0 * (revenue - LAG(revenue, 1) OVER (ORDER BY week))
        / NULLIF(LAG(revenue, 1) OVER (ORDER BY week), 0), 1) AS wow_pct
FROM weekly
ORDER BY week;
```

---

## Segmentation Query

```sql
-- RFM segmentation (Recency, Frequency, Monetary)
WITH rfm_base AS (
    SELECT
        customer_id,
        MAX(order_date)                             AS last_order_date,
        COUNT(DISTINCT order_id)                    AS order_count,
        SUM(total_amount)                           AS total_spend
    FROM orders
    WHERE status = 'completed'
    GROUP BY customer_id
),

rfm_scores AS (
    SELECT
        customer_id,
        last_order_date,
        order_count,
        total_spend,
        DATEDIFF(day, last_order_date, CURRENT_DATE) AS days_since_last_order,
        NTILE(5) OVER (ORDER BY last_order_date DESC)     AS r_score,  -- 5=most recent
        NTILE(5) OVER (ORDER BY order_count ASC)          AS f_score,
        NTILE(5) OVER (ORDER BY total_spend ASC)          AS m_score
    FROM rfm_base
)

SELECT
    customer_id,
    r_score, f_score, m_score,
    (r_score + f_score + m_score) AS rfm_total,
    CASE
        WHEN r_score >= 4 AND f_score >= 4               THEN 'Champions'
        WHEN r_score >= 3 AND f_score >= 3               THEN 'Loyal'
        WHEN r_score >= 4 AND f_score <= 2               THEN 'New Customers'
        WHEN r_score <= 2 AND f_score >= 3               THEN 'At Risk'
        WHEN r_score <= 2 AND f_score <= 2               THEN 'Churned'
        ELSE 'Potential Loyalists'
    END AS segment
FROM rfm_scores;
```

---

## Query Optimisation Checklist

**Before writing the query**
- [ ] How many rows are in each source table?
- [ ] What indexes exist on the join and filter columns?
- [ ] What's the acceptable latency? (real-time vs. scheduled report)

**Common performance killers**

```sql
-- Bad: function on indexed column defeats the index
WHERE DATE(created_at) = '2024-01-01'
-- Good: range condition lets the index work
WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02'

-- Bad: implicit cast (e.g. numeric ID filtered with a string)
WHERE user_id = '12345'   -- user_id is INT
-- Good
WHERE user_id = 12345

-- Bad: SELECT * in production
SELECT * FROM events

-- Bad: DISTINCT as a band-aid for a fanout join
SELECT DISTINCT o.order_id FROM orders o JOIN order_items oi ON o.order_id = oi.order_id
-- Good: understand why duplicates appear and fix the join

-- Bad: ORDER BY on a large unindexed result
SELECT * FROM events ORDER BY user_id  -- full sort of millions of rows
```

**Reading EXPLAIN ANALYZE (PostgreSQL)**
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ...;

-- Look for:
-- Seq Scan on large tables  → missing index
-- Hash Join with large hash → memory spill, consider batching
-- Sort with large input     → missing index on ORDER BY column
-- Rows estimate vs. actual wildly different → stale statistics, run ANALYZE
```

**Index types to know**
| Index type | Use case |
|---|---|
| B-tree (default) | Equality, range, ORDER BY |
| GIN | JSONB, arrays, full-text search |
| BRIN | Very large append-only tables (timestamps) |
| Partial index | Filtered queries (e.g. `WHERE deleted_at IS NULL`) |
| Covering index | `INCLUDE` non-key columns to avoid table lookup |

---

## Anti-patterns Reference

| Anti-pattern | Problem | Fix |
|---|---|---|
| `SELECT *` in production | Schema changes break downstream; no index-only scans | Explicit column list |
| Correlated subquery in SELECT | Executes once per row | Rewrite as JOIN or window function |
| `NOT IN (subquery)` with NULLs | Returns no rows if subquery has any NULL | Use `NOT EXISTS` |
| `UNION` instead of `UNION ALL` | Implicit deduplication is expensive | Use `UNION ALL` unless dedup is required |
| Filtering after aggregation with HAVING when WHERE applies | GROUP BY runs on full table | Move to WHERE before GROUP BY |
| Storing JSON blobs and querying inside them | Can't index inside unstructured JSON efficiently | Promote frequently-queried fields to columns |
