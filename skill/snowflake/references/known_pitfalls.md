# Known Pitfalls & Anti-Patterns

---

## Pitfall 1: Warehouses That Never Suspend (Cost Killer)

```sql
-- Anti-pattern: auto_suspend = 0 (never suspends)
-- An XLARGE warehouse at auto_suspend = 0 costs ~$1,152/day at $3/credit
CREATE WAREHOUSE ALWAYS_ON_WH
  WAREHOUSE_SIZE = 'XLARGE'
  AUTO_SUSPEND = 0;  -- ❌

-- Fix: always set auto_suspend
ALTER WAREHOUSE ALWAYS_ON_WH SET
  AUTO_SUSPEND = 120,
  AUTO_RESUME = TRUE;

-- Audit all warehouses
SELECT name, size, auto_suspend, state
FROM INFORMATION_SCHEMA.WAREHOUSES
WHERE auto_suspend > 600 OR auto_suspend = 0;
```

---

## Pitfall 2: ACCOUNTADMIN as Default Role

```sql
-- Anti-pattern: human users with ACCOUNTADMIN as default role
ALTER USER analyst SET DEFAULT_ROLE = 'ACCOUNTADMIN';  -- ❌
-- One accidental DROP DATABASE in this role = production data loss

-- Fix: use functional roles
ALTER USER analyst SET DEFAULT_ROLE = 'DATA_ANALYST';

-- Audit who has ACCOUNTADMIN as default
SELECT grantee_name, role
FROM SNOWFLAKE.ACCOUNT_USAGE.GRANTS_TO_USERS
WHERE role = 'ACCOUNTADMIN' AND deleted_on IS NULL;
-- Should be ≤3 named admins, never service accounts
```

---

## Pitfall 3: SELECT * on Wide Tables

```sql
-- Anti-pattern: Snowflake stores columnar — unused columns still scan
SELECT * FROM events;  -- ❌ 200 columns, you need 3

-- Fix: select only needed columns
SELECT event_id, event_type, event_timestamp FROM events;  -- ✅

-- Measure the difference
SELECT bytes_scanned
FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY_BY_SESSION())
ORDER BY start_time DESC LIMIT 1;
```

---

## Pitfall 4: Clustering Keys on Small Tables

```sql
-- Anti-pattern: clustering on a 10,000 row table
ALTER TABLE config_settings CLUSTER BY (category);  -- ❌
-- Costs reclustering credits with zero performance benefit

-- Fix: only cluster tables > 1TB with frequent filter queries
SELECT table_name, row_count, bytes / 1e9 AS gb
FROM INFORMATION_SCHEMA.TABLES
WHERE table_name = 'CONFIG_SETTINGS';
-- If < 1 GB, clustering is waste

-- Remove unnecessary clustering
ALTER TABLE config_settings DROP CLUSTERING KEY;
```

---

## Pitfall 5: INSERT Instead of MERGE for Idempotent Loads

```sql
-- Anti-pattern: INSERT creates duplicates on retry
INSERT INTO dim_orders SELECT * FROM staging_orders;  -- ❌
-- Network blip → retry → duplicate rows

-- Fix: MERGE is idempotent — safe to retry any number of times
MERGE INTO dim_orders AS target
USING staging_orders AS source
ON target.order_id = source.order_id
WHEN MATCHED THEN UPDATE SET
  target.amount     = source.amount,
  target.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT
  (order_id, amount, created_at)
  VALUES (source.order_id, source.amount, CURRENT_TIMESTAMP());
```

---

## Pitfall 6: Ignoring Stale Streams (Silent Data Loss)

```sql
-- Anti-pattern: stream goes stale when DATA_RETENTION_TIME_IN_DAYS is exceeded
-- Result: the changes in that window are PERMANENTLY LOST

-- Fix: monitor staleness proactively
SELECT stream_name, stale
FROM INFORMATION_SCHEMA.STREAMS
WHERE stale = TRUE;

-- Increase retention on source tables
ALTER TABLE raw_orders SET DATA_RETENTION_TIME_IN_DAYS = 14;

-- Set up an alert (see production_checklist.md)
```

---

## Pitfall 7: Loading Many Small Files

```
Anti-pattern: 100,000 files under 100KB each
Each file → separate micro-partition → metadata overhead → slow load, slow query
```

```sql
-- Fix: target file sizes of 100–250 MB before staging
-- Use Snowpipe with appropriate file sizing from the source

-- Diagnose if you have this problem
SELECT file_name, file_size, row_count
FROM TABLE(INFORMATION_SCHEMA.COPY_HISTORY(
  TABLE_NAME => 'MY_TABLE',
  START_TIME => DATEADD(hours, -24, CURRENT_TIMESTAMP())
))
WHERE file_size < 100_000  -- Files under 100KB
ORDER BY file_size;
```

---

## Pitfall 8: No Resource Monitors

```sql
-- Anti-pattern: no resource monitors = unlimited credit consumption
-- A runaway query or always-on warehouse can burn thousands of credits overnight

-- Fix: create a resource monitor before go-live
CREATE RESOURCE MONITOR monthly_budget
  WITH CREDIT_QUOTA = 2000
  FREQUENCY = MONTHLY
  START_TIMESTAMP = IMMEDIATELY
  TRIGGERS
    ON 75  PERCENT DO NOTIFY
    ON 100 PERCENT DO SUSPEND
    ON 110 PERCENT DO SUSPEND_IMMEDIATE;

ALTER ACCOUNT SET RESOURCE_MONITOR = monthly_budget;
```

---

## Pitfall 9: Transient Tables for Important Data

```sql
-- Anti-pattern: transient tables have NO Fail-safe (7 days extra recovery)
-- and max 1 day of Time Travel
CREATE TRANSIENT TABLE critical_orders (...);  -- ❌
-- Data loss risk if accidentally dropped after 1 day

-- Fix: use permanent tables for business-critical data
CREATE TABLE critical_orders (...);
ALTER TABLE critical_orders SET DATA_RETENTION_TIME_IN_DAYS = 14;

-- Transient tables are fine for truly temporary data
CREATE TRANSIENT TABLE temp_staging_batch (...);  -- ✅
```

---

## Pitfall 10: Wrong Account Identifier Format

```javascript
// Anti-pattern: using the full URL as the account identifier
const conn = snowflake.createConnection({
  account: 'myaccount.us-east-1.snowflakecomputing.com',  // ❌
});
// Error: "Could not connect to Snowflake backend"

// Fix: use orgname-accountname format
const conn = snowflake.createConnection({
  account: 'myorg-myaccount',  // ✅
});
// Legacy locator format (if your account predates Org): 'xy12345.us-east-1'
```

---

## Monthly Audit Script

Run this monthly to catch common pitfalls before they become incidents.

```sql
SELECT 'Always-on warehouses (auto_suspend = 0 or > 1 hour)' AS check,
       COUNT(*) AS issues
FROM INFORMATION_SCHEMA.WAREHOUSES
WHERE auto_suspend = 0 OR auto_suspend > 3600

UNION ALL

SELECT 'Users with ACCOUNTADMIN as default role',
       COUNT(*)
FROM SNOWFLAKE.ACCOUNT_USAGE.USERS
WHERE default_role = 'ACCOUNTADMIN' AND disabled = 'false'

UNION ALL

SELECT 'Stale streams',
       COUNT(*)
FROM INFORMATION_SCHEMA.STREAMS
WHERE stale = TRUE

UNION ALL

SELECT 'No account-level resource monitor',
       CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM INFORMATION_SCHEMA.RESOURCE_MONITORS

UNION ALL

SELECT 'Large tables (>1TB) without clustering',
       COUNT(*)
FROM INFORMATION_SCHEMA.TABLES
WHERE bytes > 1e12
  AND AUTO_CLUSTERING_ON = 'NO'

UNION ALL

SELECT 'Production tables with < 7 day retention',
       COUNT(*)
FROM INFORMATION_SCHEMA.TABLES
WHERE table_schema IN ('SILVER', 'GOLD')
  AND retention_time < 7;
```

**Target:** every check returns 0 issues.
