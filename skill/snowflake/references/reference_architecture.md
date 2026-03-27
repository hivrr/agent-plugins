# Snowflake Reference Architecture

---

## Medallion Architecture Overview

```
┌──────────────────────┐
│   Data Sources        │
│ (S3, APIs, DBs, SaaS) │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│   BRONZE (Raw)        │
│   Snowpipe / COPY     │
│   VARIANT columns     │
│   Append-only         │
└──────────┬───────────┘
           │  Streams + Tasks
┌──────────▼───────────┐
│   SILVER (Cleansed)   │
│   Typed columns       │
│   Deduped, validated  │
│   NOT NULL constraints│
└──────────┬───────────┘
           │  Dynamic Tables
┌──────────▼───────────┐
│   GOLD (Business)     │
│   Aggregated          │
│   Analytics-ready     │
│   SLA-backed freshness│
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│   Consumers           │
│   BI tools, APIs,     │
│   Data Sharing        │
└──────────────────────┘
```

**Layer rules:**
- **Bronze** — raw, immutable, append-only. Store as VARIANT for JSON/semi-structured; typed columns for CSV with known schema. Never delete from bronze.
- **Silver** — typed, deduplicated, validated. One row per business entity key. Add `processed_at` and `source_file` metadata.
- **Gold** — business-level aggregations, dimensions, and metrics. Consumed by BI tools and APIs. Freshness guaranteed via Dynamic Tables or scheduled tasks.

---

## Database Layout

One database per environment. Schemas per layer.

```sql
-- Development
CREATE DATABASE DEV_DW;

-- Staging (mirrors prod structure)
CREATE DATABASE STAGING_DW;

-- Production
CREATE DATABASE PROD_DW;

-- One set of schemas per environment
CREATE SCHEMA PROD_DW.BRONZE;    -- Raw ingested data
CREATE SCHEMA PROD_DW.SILVER;    -- Cleansed, typed, deduplicated
CREATE SCHEMA PROD_DW.GOLD;      -- Business aggregations and dims
CREATE SCHEMA PROD_DW.STAGING;   -- Temporary ETL processing tables
CREATE SCHEMA PROD_DW.UTILITY;   -- File formats, stages, stored procs, UDFs
```

---

## Bronze Layer

```sql
-- Store raw semi-structured as VARIANT — schema enforcement at silver
CREATE TABLE PROD_DW.BRONZE.RAW_EVENTS (
    ingestion_time  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    source_file     VARCHAR(500),
    raw_data        VARIANT
);

-- For CSV with known schema, use typed columns even at bronze
CREATE TABLE PROD_DW.BRONZE.RAW_ORDERS (
    ingestion_time  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    source_file     VARCHAR(500),
    raw_line        VARCHAR(10000)  -- Full original line for debugging
);

-- File format for JSON ingestion
CREATE FILE FORMAT PROD_DW.UTILITY.JSON_INGEST
  TYPE = 'JSON'
  STRIP_OUTER_ARRAY = TRUE
  IGNORE_UTF8_ERRORS = TRUE;

-- Stage pointing to S3
CREATE STAGE PROD_DW.UTILITY.S3_EVENTS_STAGE
  STORAGE_INTEGRATION = s3_integration
  URL = 's3://data-lake/events/'
  FILE_FORMAT = PROD_DW.UTILITY.JSON_INGEST;

-- Snowpipe for continuous ingestion
CREATE PIPE PROD_DW.BRONZE.EVENTS_PIPE
  AUTO_INGEST = TRUE
AS
  COPY INTO PROD_DW.BRONZE.RAW_EVENTS (source_file, raw_data)
  FROM (SELECT METADATA$FILENAME, $1 FROM @PROD_DW.UTILITY.S3_EVENTS_STAGE);
```

---

## Silver Layer

```sql
-- Stream on bronze for CDC
CREATE STREAM PROD_DW.BRONZE.EVENTS_STREAM
  ON TABLE PROD_DW.BRONZE.RAW_EVENTS
  APPEND_ONLY = TRUE;

-- Silver table: typed, constrained
CREATE TABLE PROD_DW.SILVER.EVENTS (
    event_id        VARCHAR(36)   NOT NULL,
    event_type      VARCHAR(50)   NOT NULL,
    user_id         INTEGER,
    event_data      VARIANT,
    event_timestamp TIMESTAMP_NTZ NOT NULL,
    processed_at    TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_events PRIMARY KEY (event_id)
);

-- Task: bronze → silver transformation
CREATE TASK PROD_DW.SILVER.TRANSFORM_EVENTS
  WAREHOUSE = ETL_WH
  SCHEDULE = '5 MINUTE'
  WHEN SYSTEM$STREAM_HAS_DATA('PROD_DW.BRONZE.EVENTS_STREAM')
AS
  INSERT INTO PROD_DW.SILVER.EVENTS (event_id, event_type, user_id, event_data, event_timestamp)
  SELECT
    TRY_CAST(raw_data:id::VARCHAR AS VARCHAR)         AS event_id,
    TRY_CAST(raw_data:type::VARCHAR AS VARCHAR)       AS event_type,
    TRY_CAST(raw_data:user_id::VARCHAR AS INTEGER)    AS user_id,
    raw_data:data                                      AS event_data,
    TRY_CAST(raw_data:timestamp::VARCHAR AS TIMESTAMP_NTZ) AS event_timestamp
  FROM PROD_DW.BRONZE.EVENTS_STREAM
  WHERE raw_data:id      IS NOT NULL
    AND raw_data:type    IS NOT NULL
    AND raw_data:timestamp IS NOT NULL;

ALTER TASK PROD_DW.SILVER.TRANSFORM_EVENTS RESUME;
```

---

## Gold Layer

```sql
-- Dynamic table: auto-refreshes to TARGET_LAG freshness
CREATE DYNAMIC TABLE PROD_DW.GOLD.USER_ACTIVITY_SUMMARY
  TARGET_LAG = '30 minutes'
  WAREHOUSE = ANALYTICS_WH
AS
  SELECT
    user_id,
    COUNT(*)                                                         AS total_events,
    COUNT(DISTINCT event_type)                                       AS unique_event_types,
    MIN(event_timestamp)                                             AS first_seen,
    MAX(event_timestamp)                                             AS last_seen,
    COUNT_IF(event_type = 'purchase')                               AS purchase_count,
    SUM(CASE WHEN event_type = 'purchase'
             THEN event_data:amount::DECIMAL(12,2) ELSE 0 END)      AS total_spend
  FROM PROD_DW.SILVER.EVENTS
  GROUP BY user_id;

-- Monitor dynamic table refresh
SELECT name, target_lag, refresh_mode, scheduling_state, last_refresh_completed_time
FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLES())
WHERE schema_name = 'GOLD';
```

---

## Warehouse Strategy

Isolate workloads. Never let ETL and BI share a warehouse.

```sql
-- ETL: large burst jobs, short duration
CREATE WAREHOUSE ETL_WH
  WAREHOUSE_SIZE = 'LARGE'
  AUTO_SUSPEND = 120
  AUTO_RESUME = TRUE
  COMMENT = 'Bronze→Silver→Gold transformations';

-- Analytics: variable concurrency, multi-cluster for scale
CREATE WAREHOUSE ANALYTICS_WH
  WAREHOUSE_SIZE = 'MEDIUM'
  MIN_CLUSTER_COUNT = 1
  MAX_CLUSTER_COUNT = 3
  SCALING_POLICY = 'STANDARD'
  AUTO_SUSPEND = 300
  AUTO_RESUME = TRUE
  COMMENT = 'BI tools and ad-hoc analytics';

-- Dashboards: small, fast, frequent short queries
CREATE WAREHOUSE DASHBOARD_WH
  WAREHOUSE_SIZE = 'SMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  COMMENT = 'Dashboard refresh queries';

-- Dev: minimal cost, fast suspend
CREATE WAREHOUSE DEV_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  COMMENT = 'Development and testing';
```

**Sizing guide:**

| Warehouse | Size | Use case |
|---|---|---|
| ETL | Large–XLarge | Heavy transforms on large tables |
| Analytics | Medium + multi-cluster | Mixed BI + ad-hoc, variable concurrency |
| Dashboards | Small | Repetitive short queries, benefits from result cache |
| Dev | XSmall | Low-volume development and testing |

---

## RBAC Role Hierarchy

```sql
-- Functional roles (never grant directly to users)
CREATE ROLE DATA_ENGINEER;    -- Full access to bronze/silver; write silver/gold
CREATE ROLE DATA_ANALYST;     -- Read silver/gold; write gold
CREATE ROLE BI_VIEWER;        -- Read-only gold layer
CREATE ROLE SVC_ETL;          -- Service account for pipeline execution

-- Connect to SYSADMIN (not ACCOUNTADMIN)
GRANT ROLE DATA_ENGINEER TO ROLE SYSADMIN;
GRANT ROLE DATA_ANALYST  TO ROLE SYSADMIN;
GRANT ROLE BI_VIEWER     TO ROLE DATA_ANALYST;   -- Inherit up hierarchy
GRANT ROLE SVC_ETL       TO ROLE DATA_ENGINEER;

-- Assign users to functional roles
GRANT ROLE DATA_ENGINEER TO USER alice;
GRANT ROLE DATA_ANALYST  TO USER bob;
GRANT ROLE BI_VIEWER     TO USER charlie;
GRANT ROLE SVC_ETL       TO USER svc_pipeline;

-- Warehouse grants
GRANT USAGE ON WAREHOUSE ETL_WH       TO ROLE DATA_ENGINEER;
GRANT USAGE ON WAREHOUSE ANALYTICS_WH TO ROLE DATA_ANALYST;
GRANT USAGE ON WAREHOUSE DASHBOARD_WH TO ROLE BI_VIEWER;
GRANT USAGE ON WAREHOUSE ETL_WH       TO ROLE SVC_ETL;

-- Schema grants
GRANT ALL    ON SCHEMA PROD_DW.BRONZE  TO ROLE DATA_ENGINEER;
GRANT ALL    ON SCHEMA PROD_DW.SILVER  TO ROLE DATA_ENGINEER;
GRANT SELECT ON ALL TABLES IN SCHEMA PROD_DW.SILVER TO ROLE DATA_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA PROD_DW.GOLD   TO ROLE DATA_ANALYST;
GRANT SELECT ON ALL TABLES IN SCHEMA PROD_DW.GOLD   TO ROLE BI_VIEWER;

-- Future grants (apply to new objects automatically)
GRANT SELECT ON FUTURE TABLES IN SCHEMA PROD_DW.SILVER TO ROLE DATA_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA PROD_DW.GOLD   TO ROLE DATA_ANALYST;
GRANT SELECT ON FUTURE TABLES IN SCHEMA PROD_DW.GOLD   TO ROLE BI_VIEWER;
```
