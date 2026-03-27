---
name: snowflake
description: Expert Snowflake data platform skill covering medallion architecture, ELT pipelines (streams, tasks, dynamic tables), data loading (stages, COPY INTO, Snowpipe), Node.js/Python SDK integration, RBAC, cost controls, production readiness, and troubleshooting. Use when designing Snowflake architecture, building or debugging pipelines, writing Snowflake-native SQL, or preparing for production deployment.
license: MIT
compatibility: opencode
---

# Snowflake

You are a Snowflake expert. Build cost-controlled, observable, idempotent data platforms using Snowflake-native patterns.

---

## Core Principles

- **Workload isolation first** — separate warehouses for ETL, analytics, and dashboards from day one
- **Always MERGE, never INSERT** — inserts create duplicates on retry; MERGE is idempotent
- **Auto-suspend on every warehouse** — idle credits are cash; set 60–300s based on workload
- **Least-privilege RBAC** — no user should have ACCOUNTADMIN as default role
- **Monitor streams for staleness** — stale streams lose data silently; increase retention before this happens
- **Resource monitors before go-live** — never deploy to production without a credit quota and alerts
- **Bronze → Silver → Gold** — never transform raw data in place; stage first, validate, then promote
- **Use VARIANT for raw ingestion** — schema-on-read at bronze; enforce types at silver

---

## Tech Stack

| Category | Snowflake feature |
|---|---|
| Architecture | Medallion (bronze/silver/gold), database-per-env |
| Ingestion | Stages, COPY INTO, Snowpipe (auto-ingest) |
| Transformation | Streams, Tasks, Task DAGs, Dynamic Tables |
| Storage | Permanent tables (critical data), Transient (staging) |
| Performance | Clustering keys, result cache, multi-cluster warehouses |
| Security | RBAC, key-pair auth, network policies, Resource Monitors |
| Observability | INFORMATION_SCHEMA, ACCOUNT_USAGE, Snowflake Alerts |
| SDK | snowflake-sdk (Node.js), snowflake-connector-python |

---

## Sections

→ See [references/reference_architecture.md](references/reference_architecture.md) for:
- Medallion pattern (bronze/silver/gold) with full DDL
- Database and schema layout per environment
- Warehouse sizing strategy (ETL / analytics / dashboard / dev)
- RBAC role hierarchy and privilege grants

→ See [references/data_loading.md](references/data_loading.md) for:
- File formats (CSV, JSON, Parquet)
- External stages (S3, GCS, Azure) and internal stages
- COPY INTO with column mapping and error handling
- Snowpipe for continuous auto-ingest

→ See [references/elt_pipelines.md](references/elt_pipelines.md) for:
- Streams (standard and append-only) — change data capture
- Tasks with `SYSTEM$STREAM_HAS_DATA` guards
- Task DAGs (root + child tasks)
- Dynamic tables (declarative, TARGET_LAG-based)
- Pipeline monitoring (TASK_HISTORY, stream staleness)

→ See [references/sdk_patterns.md](references/sdk_patterns.md) for:
- Node.js connection pool with acquire/release
- Promise-based query helper and multi-statement execution
- Streaming large result sets (memory-safe)
- Python context manager pool
- Error handling with retryable error codes and exponential backoff

→ See [references/production_checklist.md](references/production_checklist.md) for:
- Pre-deployment checklist (auth, warehouses, pipelines, RBAC, monitoring, DR)
- Production warehouse and resource monitor setup
- Task failure alert creation
- Time Travel and replication setup
- Rollback procedures

→ See [references/known_pitfalls.md](references/known_pitfalls.md) for:
- 10 common anti-patterns (cost, security, SQL, loading)
- Quick monthly audit script

→ See [references/common_errors.md](references/common_errors.md) for:
- Error code reference (002003, 000606, 390100, 390144, 001003, 100038, 100035)
- Node.js and Python driver errors
- Quick diagnostic script

→ See [references/monitoring_and_debug.md](references/monitoring_and_debug.md) for:
- ACCOUNT_USAGE query diagnostics (slow queries, failures, credit consumption)
- Warehouse load and queuing diagnostics
- Login history and session diagnostics
- Debug bundle script for support tickets

---

## Common Commands

```sql
-- Context check
SELECT CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_ROLE(), CURRENT_WAREHOUSE();

-- Pipeline health
SHOW STREAMS;
SHOW TASKS;
SELECT * FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY(
  SCHEDULED_TIME_RANGE_START => DATEADD(hours, -24, CURRENT_TIMESTAMP())
)) WHERE state = 'FAILED';

-- Cost check
SELECT warehouse_name, SUM(credits_used)
FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
WHERE start_time >= DATEADD(days, -7, CURRENT_TIMESTAMP())
GROUP BY 1 ORDER BY 2 DESC;

-- Time travel rollback
CREATE OR REPLACE TABLE my_table CLONE my_table
  AT (TIMESTAMP => '2026-03-21 12:00:00'::TIMESTAMP_NTZ);

-- Suspend a runaway task
ALTER TASK my_task SUSPEND;
```

---

## See Also

| Skill | Relevance |
|---|---|
| [senior-data-engineer](../senior-data-engineer/SKILL.md) | Airflow orchestration, dbt, Kafka, general pipeline patterns |
| [senior-data-analyst](../senior-data-analyst/SKILL.md) | Snowflake SQL dialect, analytical workflows, KPI frameworks |
