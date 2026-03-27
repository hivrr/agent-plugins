# ELT Pipelines — Streams, Tasks, and Dynamic Tables

---

## Streams (Change Data Capture)

Streams track DML changes (INSERT, UPDATE, DELETE) on a source table and expose them as a consumable change log.

```sql
-- Standard stream: captures inserts, updates, and deletes
CREATE OR REPLACE STREAM PROD_DW.BRONZE.ORDERS_STREAM
  ON TABLE PROD_DW.BRONZE.RAW_ORDERS
  APPEND_ONLY = FALSE;

-- Append-only stream: lighter weight, inserts only (no update/delete tracking)
-- Use for immutable event logs where only new rows are added
CREATE OR REPLACE STREAM PROD_DW.BRONZE.EVENTS_STREAM
  ON TABLE PROD_DW.BRONZE.RAW_EVENTS
  APPEND_ONLY = TRUE;

-- Preview what's in a stream (does NOT consume it)
SELECT * FROM PROD_DW.BRONZE.ORDERS_STREAM LIMIT 100;
```

**Stream metadata columns:**

| Column | Values | Notes |
|---|---|---|
| `METADATA$ACTION` | `INSERT`, `DELETE` | Updates appear as a DELETE + INSERT pair |
| `METADATA$ISUPDATE` | `TRUE`, `FALSE` | `TRUE` on both rows of an update pair |
| `METADATA$ROW_ID` | string | Unique row identifier across updates |

**A stream is consumed** (offset advances) when a DML statement reads from it in a transaction that commits successfully. If the task fails mid-run, the stream is not consumed and will be re-processed on the next attempt.

**Staleness:** If the source table's `DATA_RETENTION_TIME_IN_DAYS` is exceeded before the stream is consumed, the stream goes stale and the changes are lost. Always set retention to at least 14 days on high-value tables.

```sql
-- Check for stale streams
SELECT stream_name, stale, stale_after
FROM INFORMATION_SCHEMA.STREAMS
WHERE stale = TRUE;

-- Increase retention to prevent staleness
ALTER TABLE PROD_DW.BRONZE.RAW_ORDERS SET DATA_RETENTION_TIME_IN_DAYS = 14;
```

---

## Tasks

Tasks schedule SQL execution. Use `SYSTEM$STREAM_HAS_DATA` to avoid running empty transforms.

```sql
-- Task triggered when stream has data
CREATE OR REPLACE TASK PROD_DW.SILVER.TRANSFORM_ORDERS
  WAREHOUSE = ETL_WH
  SCHEDULE = '5 MINUTE'
  WHEN SYSTEM$STREAM_HAS_DATA('PROD_DW.BRONZE.ORDERS_STREAM')
AS
  MERGE INTO PROD_DW.SILVER.DIM_ORDERS AS target
  USING (
    SELECT
      order_id,
      customer_id,
      amount::DECIMAL(12,2)          AS amount,
      order_date::TIMESTAMP_NTZ      AS order_date,
      CASE
        WHEN amount >= 1000 THEN 'high_value'
        WHEN amount >= 100  THEN 'medium_value'
        ELSE 'standard'
      END                            AS order_tier,
      CURRENT_TIMESTAMP()            AS processed_at
    FROM PROD_DW.BRONZE.ORDERS_STREAM
    WHERE METADATA$ACTION = 'INSERT'
  ) AS source
  ON target.order_id = source.order_id
  WHEN MATCHED THEN UPDATE SET
    target.amount      = source.amount,
    target.order_tier  = source.order_tier,
    target.processed_at = source.processed_at
  WHEN NOT MATCHED THEN INSERT
    (order_id, customer_id, amount, order_date, order_tier, processed_at)
  VALUES
    (source.order_id, source.customer_id, source.amount,
     source.order_date, source.order_tier, source.processed_at);

-- Tasks are created SUSPENDED — must be explicitly resumed
ALTER TASK PROD_DW.SILVER.TRANSFORM_ORDERS RESUME;

-- Suspend when needed
ALTER TASK PROD_DW.SILVER.TRANSFORM_ORDERS SUSPEND;
```

---

## Task DAGs (Directed Acyclic Graph)

Chain tasks with `AFTER` to build multi-step pipelines. Resume children before the root.

```sql
-- Root task: runs on schedule
CREATE OR REPLACE TASK PROD_DW.GOLD.DAILY_METRICS_ROOT
  WAREHOUSE = ETL_WH
  SCHEDULE = 'USING CRON 0 6 * * * America/New_York'
AS
  INSERT INTO PROD_DW.GOLD.DAILY_ORDER_METRICS
  SELECT
    CURRENT_DATE() - 1                  AS metric_date,
    COUNT(*)                            AS total_orders,
    SUM(amount)                         AS total_revenue,
    AVG(amount)                         AS avg_order_value,
    COUNT(DISTINCT customer_id)         AS unique_customers
  FROM PROD_DW.SILVER.DIM_ORDERS
  WHERE order_date >= CURRENT_DATE() - 1
    AND order_date < CURRENT_DATE();

-- Child task: runs after root completes successfully
CREATE OR REPLACE TASK PROD_DW.GOLD.UPDATE_CUSTOMER_SEGMENTS
  WAREHOUSE = ETL_WH
  AFTER PROD_DW.GOLD.DAILY_METRICS_ROOT
AS
  MERGE INTO PROD_DW.GOLD.CUSTOMER_SEGMENTS AS target
  USING (
    SELECT
      customer_id,
      COUNT(*)          AS order_count,
      SUM(amount)       AS lifetime_value,
      CASE
        WHEN SUM(amount) >= 10000 THEN 'platinum'
        WHEN SUM(amount) >= 5000  THEN 'gold'
        WHEN SUM(amount) >= 1000  THEN 'silver'
        ELSE 'bronze'
      END               AS segment
    FROM PROD_DW.SILVER.DIM_ORDERS
    GROUP BY customer_id
  ) AS source
  ON target.customer_id = source.customer_id
  WHEN MATCHED THEN UPDATE SET
    target.order_count    = source.order_count,
    target.lifetime_value = source.lifetime_value,
    target.segment        = source.segment
  WHEN NOT MATCHED THEN INSERT
    (customer_id, order_count, lifetime_value, segment)
  VALUES
    (source.customer_id, source.order_count, source.lifetime_value, source.segment);

-- Resume order: children first, then root
ALTER TASK PROD_DW.GOLD.UPDATE_CUSTOMER_SEGMENTS RESUME;
ALTER TASK PROD_DW.GOLD.DAILY_METRICS_ROOT RESUME;
```

**CRON syntax reference:**
```
'USING CRON 0 6 * * * America/New_York'
           │ │ │ │ │
           │ │ │ │ └── Day of week (0=Sun)
           │ │ │ └──── Month
           │ │ └────── Day of month
           │ └──────── Hour (6 AM ET)
           └────────── Minute
```

---

## Dynamic Tables (Declarative Alternative)

Dynamic tables auto-refresh based on `TARGET_LAG`. No streams or tasks needed — Snowflake manages the refresh schedule.

```sql
-- Customer 360 view — refreshed every 10 minutes
CREATE OR REPLACE DYNAMIC TABLE PROD_DW.GOLD.CUSTOMER_360
  TARGET_LAG = '10 minutes'
  WAREHOUSE = ANALYTICS_WH
AS
  SELECT
    c.customer_id,
    c.name,
    c.email,
    COUNT(o.order_id)                             AS total_orders,
    COALESCE(SUM(o.amount), 0)                    AS lifetime_value,
    MAX(o.order_date)                             AS last_order_date,
    DATEDIFF('day', MAX(o.order_date), CURRENT_DATE()) AS days_since_last_order
  FROM PROD_DW.SILVER.CUSTOMERS c
  LEFT JOIN PROD_DW.SILVER.DIM_ORDERS o ON c.customer_id = o.customer_id
  GROUP BY c.customer_id, c.name, c.email;

-- Alter lag when requirements change
ALTER DYNAMIC TABLE PROD_DW.GOLD.CUSTOMER_360 SET TARGET_LAG = '1 hour';

-- Force immediate refresh
ALTER DYNAMIC TABLE PROD_DW.GOLD.CUSTOMER_360 REFRESH;
```

**Streams + Tasks vs Dynamic Tables:**

| | Streams + Tasks | Dynamic Tables |
|---|---|---|
| Control | Full control over transform logic | Declarative — Snowflake manages refresh |
| Use case | Complex multi-step transforms, MERGE, conditional logic | Aggregations and joins with defined freshness SLA |
| Error handling | Manual (check TASK_HISTORY) | Managed (check DYNAMIC_TABLES()) |
| Best for | Bronze → Silver (with dedup, validation) | Silver → Gold (aggregations, dims) |

---

## Pipeline Monitoring

```sql
-- Task run history — last 24 hours
SELECT name, state, error_message, scheduled_time, completed_time,
       DATEDIFF('second', scheduled_time, completed_time) AS duration_sec
FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY(
  SCHEDULED_TIME_RANGE_START => DATEADD(hours, -24, CURRENT_TIMESTAMP())
))
ORDER BY scheduled_time DESC;

-- Failed tasks only
SELECT name, state, error_message, scheduled_time
FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY())
WHERE state = 'FAILED'
  AND scheduled_time >= DATEADD(hours, -24, CURRENT_TIMESTAMP());

-- Stream staleness check
SHOW STREAMS LIKE '%_STREAM';
-- stale = TRUE means data may be lost — act immediately

-- Dynamic table refresh status
SELECT name, target_lag, refresh_mode, scheduling_state, last_refresh_completed_time
FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLES())
WHERE schema_name = 'GOLD';

-- Pipeline health summary
SELECT 'Tasks running'  AS check, COUNT_IF(state = 'started')  AS count FROM INFORMATION_SCHEMA.TASKS
UNION ALL
SELECT 'Tasks failed (24h)', COUNT(*) FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY())
  WHERE state = 'FAILED' AND scheduled_time >= DATEADD(hours, -24, CURRENT_TIMESTAMP())
UNION ALL
SELECT 'Stale streams', COUNT(*) FROM INFORMATION_SCHEMA.STREAMS WHERE stale = TRUE;
```

---

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| Task is suspended | Not resumed after creation or failed too many times | `ALTER TASK x RESUME` |
| Stream is stale | Source table data retention exceeded | Recreate stream; increase `DATA_RETENTION_TIME_IN_DAYS` on source |
| MERGE: duplicate key rows | Non-unique join key in source | Add dedup CTE before MERGE using `ROW_NUMBER()` |
| Dynamic table refresh failed | Source schema changed | Check upstream DDL changes; update dynamic table definition |
| Task ran but stream not consumed | Task failed mid-execution | Stream offset not advanced on failure — will retry on next run |
