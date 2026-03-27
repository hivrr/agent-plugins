# Production Readiness Checklist

Run this checklist before every production deployment. Each item has a verification query or command.

---

## Authentication & Secrets

- [ ] Service accounts use key pair auth (not password)
- [ ] Private keys stored in secret manager (AWS Secrets Manager, Vault) — not in files or env vars in prod
- [ ] Key rotation procedure documented and tested
- [ ] Network policy applied to production account (restrict by IP if applicable)
- [ ] Connection strings use production account identifier (`orgname-accountname` format)

```sql
-- Verify no service accounts use password auth
SELECT name, has_password, has_rsa_public_key
FROM SNOWFLAKE.ACCOUNT_USAGE.USERS
WHERE name LIKE 'SVC_%' AND disabled = 'false';
-- has_rsa_public_key should be TRUE for all service accounts
```

---

## Warehouse Configuration

- [ ] Production warehouses created with appropriate sizing
- [ ] Auto-suspend configured (60–300s based on workload pattern)
- [ ] Auto-resume enabled on all warehouses
- [ ] Resource monitors with credit quotas and alerts applied
- [ ] Separate warehouses for ETL, analytics, and dashboard workloads

```sql
-- Production warehouse setup
CREATE WAREHOUSE IF NOT EXISTS PROD_ETL_WH
  WAREHOUSE_SIZE = 'LARGE'
  AUTO_SUSPEND = 120
  AUTO_RESUME = TRUE;

CREATE WAREHOUSE IF NOT EXISTS PROD_ANALYTICS_WH
  WAREHOUSE_SIZE = 'MEDIUM'
  MIN_CLUSTER_COUNT = 1
  MAX_CLUSTER_COUNT = 3
  SCALING_POLICY = 'STANDARD'
  AUTO_SUSPEND = 300
  AUTO_RESUME = TRUE;

CREATE WAREHOUSE IF NOT EXISTS PROD_DASHBOARD_WH
  WAREHOUSE_SIZE = 'SMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;

-- Resource monitor
CREATE OR REPLACE RESOURCE MONITOR prod_monitor
  WITH CREDIT_QUOTA = 1000
  FREQUENCY = MONTHLY
  START_TIMESTAMP = IMMEDIATELY
  TRIGGERS
    ON 75  PERCENT DO NOTIFY
    ON 90  PERCENT DO NOTIFY
    ON 100 PERCENT DO SUSPEND
    ON 110 PERCENT DO SUSPEND_IMMEDIATE;

ALTER WAREHOUSE PROD_ETL_WH       SET RESOURCE_MONITOR = prod_monitor;
ALTER WAREHOUSE PROD_ANALYTICS_WH SET RESOURCE_MONITOR = prod_monitor;
ALTER WAREHOUSE PROD_DASHBOARD_WH SET RESOURCE_MONITOR = prod_monitor;

-- Statement timeouts
ALTER WAREHOUSE PROD_ETL_WH       SET STATEMENT_TIMEOUT_IN_SECONDS = 3600;
ALTER WAREHOUSE PROD_ANALYTICS_WH SET STATEMENT_TIMEOUT_IN_SECONDS = 600;
ALTER WAREHOUSE PROD_DASHBOARD_WH SET STATEMENT_TIMEOUT_IN_SECONDS = 300;
```

---

## Data Pipeline Readiness

- [ ] All tasks resumed and running on schedule (`SHOW TASKS`)
- [ ] Streams not stale (`SHOW STREAMS` — stale column = FALSE)
- [ ] Snowpipe SQS notifications configured and verified
- [ ] COPY INTO error handling set (`ON_ERROR = 'CONTINUE'` or `'SKIP_FILE'`)
- [ ] Data retention set appropriately (`DATA_RETENTION_TIME_IN_DAYS >= 14` on critical tables)

```sql
-- Verify tasks are running
SHOW TASKS IN DATABASE PROD_DW;
-- All production tasks should show state = 'started'

-- Check for stale streams
SELECT stream_name, stale, stale_after
FROM INFORMATION_SCHEMA.STREAMS
WHERE stale = TRUE;
-- Zero rows expected

-- Verify data retention on key tables
SELECT table_name, retention_time
FROM INFORMATION_SCHEMA.TABLES
WHERE table_schema IN ('BRONZE', 'SILVER')
  AND retention_time < 14;
-- Zero rows expected for critical tables
```

---

## Query & Performance

- [ ] Critical queries tested at production data volumes
- [ ] Clustering keys set on tables > 1TB
- [ ] Result caching enabled at account level

```sql
-- Enable query result caching (default ON — verify it hasn't been disabled)
ALTER ACCOUNT SET USE_CACHED_RESULT = TRUE;

-- Check clustering on large tables
SELECT table_name, row_count, bytes / 1e9 AS gb, clustering_key
FROM INFORMATION_SCHEMA.TABLES
WHERE bytes > 1e12   -- Tables over 1TB
  AND clustering_key IS NULL;
-- Large tables without clustering keys should be reviewed
```

---

## Access Control

- [ ] RBAC hierarchy follows principle of least privilege
- [ ] No users have ACCOUNTADMIN as default role
- [ ] Service accounts have minimal required privileges
- [ ] Future grants in place for new objects

```sql
-- Verify no one defaults to ACCOUNTADMIN
SELECT name, default_role
FROM SNOWFLAKE.ACCOUNT_USAGE.USERS
WHERE default_role = 'ACCOUNTADMIN'
  AND disabled = 'false';
-- Zero rows expected

-- Verify service account privileges are scoped
SHOW GRANTS TO USER svc_pipeline;
```

---

## Monitoring & Alerting

- [ ] Task failure alert configured and resumed
- [ ] Credit consumption dashboard set up
- [ ] Stale stream alert configured

```sql
-- Task failure alert (fires if any task failed in the last 10 minutes)
CREATE OR REPLACE ALERT PROD_DW.UTILITY.TASK_FAILURE_ALERT
  WAREHOUSE = PROD_ANALYTICS_WH
  SCHEDULE = '5 MINUTE'
  IF (EXISTS (
    SELECT 1
    FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY(
      SCHEDULED_TIME_RANGE_START => DATEADD(minutes, -10, CURRENT_TIMESTAMP())
    ))
    WHERE state = 'FAILED'
  ))
  THEN
    CALL SYSTEM$SEND_EMAIL(
      'prod_notifications',
      'oncall@company.com',
      'Snowflake Task Failure Alert',
      'One or more Snowflake tasks failed in the last 10 minutes. Check TASK_HISTORY.'
    );

ALTER ALERT PROD_DW.UTILITY.TASK_FAILURE_ALERT RESUME;

-- Stale stream alert
CREATE OR REPLACE ALERT PROD_DW.UTILITY.STALE_STREAM_ALERT
  WAREHOUSE = PROD_ANALYTICS_WH
  SCHEDULE = '30 MINUTE'
  IF (EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STREAMS WHERE stale = TRUE
  ))
  THEN
    CALL SYSTEM$SEND_EMAIL(
      'prod_notifications',
      'oncall@company.com',
      'Snowflake Stream Stale Alert',
      'One or more Snowflake streams are stale. Data loss risk. Check INFORMATION_SCHEMA.STREAMS.'
    );

ALTER ALERT PROD_DW.UTILITY.STALE_STREAM_ALERT RESUME;
```

---

## Disaster Recovery

- [ ] Time Travel retention set (14+ days on production tables)
- [ ] Database replication configured for critical databases
- [ ] Failover procedure documented and tested

```sql
-- Set Time Travel on production tables
ALTER TABLE PROD_DW.SILVER.EVENTS  SET DATA_RETENTION_TIME_IN_DAYS = 14;
ALTER TABLE PROD_DW.SILVER.ORDERS  SET DATA_RETENTION_TIME_IN_DAYS = 14;
ALTER TABLE PROD_DW.GOLD.DAILY_METRICS SET DATA_RETENTION_TIME_IN_DAYS = 14;

-- Enable replication (Business Critical or Enterprise edition required)
ALTER DATABASE PROD_DW ENABLE REPLICATION TO ACCOUNTS myorg.secondary_account;
```

---

## Pre/Post Deployment Health Check

Run this before and after any deployment to compare baseline state.

```sql
SELECT 'Warehouses total'         AS check, COUNT(*) AS count FROM TABLE(INFORMATION_SCHEMA.WAREHOUSES())
UNION ALL
SELECT 'Warehouses running',       COUNT_IF(state = 'STARTED') FROM TABLE(INFORMATION_SCHEMA.WAREHOUSES())
UNION ALL
SELECT 'Tasks total',              COUNT(*) FROM TABLE(INFORMATION_SCHEMA.TASKS())
UNION ALL
SELECT 'Tasks running',            COUNT_IF(state = 'started') FROM TABLE(INFORMATION_SCHEMA.TASKS())
UNION ALL
SELECT 'Streams total',            COUNT(*) FROM INFORMATION_SCHEMA.STREAMS
UNION ALL
SELECT 'Stale streams',            COUNT_IF(stale = TRUE) FROM INFORMATION_SCHEMA.STREAMS
UNION ALL
SELECT 'Pipes (auto-ingest)',      COUNT_IF(is_autoingest_enabled = 'true') FROM TABLE(INFORMATION_SCHEMA.PIPES())
UNION ALL
SELECT 'Alerts running',           COUNT_IF(state = 'started') FROM TABLE(INFORMATION_SCHEMA.ALERTS());
```

---

## Rollback Procedure

```sql
-- Step 1: Suspend the problematic task immediately
ALTER TASK PROD_DW.SILVER.TRANSFORM_ORDERS SUSPEND;

-- Step 2: Identify when the data was last known good
SELECT MIN(scheduled_time) AS first_bad_run
FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY())
WHERE name = 'TRANSFORM_ORDERS' AND state = 'FAILED';

-- Step 3: Restore table to a point before the bad run using Time Travel
CREATE OR REPLACE TABLE PROD_DW.SILVER.DIM_ORDERS
  CLONE PROD_DW.SILVER.DIM_ORDERS
  AT (TIMESTAMP => '2026-03-21 12:00:00'::TIMESTAMP_NTZ);

-- Step 4: Verify row counts match expectations
SELECT COUNT(*) FROM PROD_DW.SILVER.DIM_ORDERS;

-- Step 5: Fix the root cause, then resume
ALTER TASK PROD_DW.SILVER.TRANSFORM_ORDERS RESUME;
```

---

## Alert Priority Reference

| Alert | Condition | Severity |
|---|---|---|
| Task failure | `state = 'FAILED'` in TASK_HISTORY | P1 |
| Stream stale | `stale = TRUE` in STREAMS | P1 |
| Credit quota >90% | Resource monitor trigger | P2 |
| Query queue backlog | `avg_queued_load > 0` sustained 5+ min | P2 |
| Login failure spike | >10 failures/hour from same IP | P2 |
