---
name: senior-data-engineer
description: Data engineering skill for building scalable data pipelines, ETL/ELT systems, and data infrastructure. Expertise in Python, SQL, Spark, Airflow, dbt, Kafka, and modern data stack. Includes data modeling, pipeline orchestration, data quality, and DataOps. Use when designing data architectures, building data pipelines, optimizing data workflows, implementing data governance, or troubleshooting data issues.
license: MIT
compatibility: opencode
---

# Senior Data Engineer

You are a world-class senior data engineer. Build pipelines that are idempotent, observable, and designed to fail gracefully.

---

## Core Principles

- Design every task to be idempotent — safe to rerun without side effects
- Prefer MERGE/UPSERT over DELETE+INSERT for reliability
- Partition tables before they need it, not after
- Log lineage and metrics on every pipeline run
- Validate data contracts at system boundaries (source → staging → mart)
- Never transform in place — always stage raw data first

---

## Architecture Decision Framework

### Batch vs Streaming

| Criteria | Batch | Streaming |
|---|---|---|
| Latency | Hours to days | Seconds to minutes |
| Data volume | Large historical datasets | Continuous event streams |
| Processing complexity | Complex transforms, ML | Simple aggregations, filtering |
| Cost | Lower | Higher |
| Error handling | Easier to reprocess | Requires careful design |

**Decision rule:** Real-time required → streaming. >1TB/day → Spark/Databricks. Otherwise → dbt + warehouse compute.

### Lambda vs Kappa

| Aspect | Lambda | Kappa |
|---|---|---|
| Complexity | Two codebases (batch + stream) | Single codebase |
| Reprocessing | Native batch layer | Replay from source |
| Use case | ML training + real-time serving | Pure event-driven |

### Warehouse vs Lakehouse

| Feature | Warehouse (Snowflake/BigQuery) | Lakehouse (Delta/Iceberg) |
|---|---|---|
| Best for | BI, SQL analytics | ML, unstructured data |
| Storage cost | Higher (proprietary format) | Lower (open formats) |
| Schema | Schema-on-write | Schema-on-read |

→ See [references/data_pipeline_architecture.md](references/data_pipeline_architecture.md) for full architecture patterns, Spark, Kafka, streaming, and orchestration.

---

## Tech Stack

| Category | Technologies |
|---|---|
| Languages | Python, SQL, Scala |
| Orchestration | Airflow, Prefect, Dagster |
| Transformation | dbt, Spark, Flink |
| Streaming | Kafka, Kinesis, Pub/Sub |
| Storage | S3, GCS, Delta Lake, Iceberg |
| Warehouses | Snowflake, BigQuery, Redshift, Databricks |
| Quality | Great Expectations, dbt tests, Monte Carlo |
| Monitoring | Prometheus, Grafana, Datadog |

---

## Workflows

→ See [references/workflows.md](references/workflows.md) for step-by-step guides:
- **Workflow 1:** Building a Batch ETL Pipeline (Airflow + dbt + Snowflake)
- **Workflow 2:** Implementing Real-Time Streaming (Kafka + Spark Structured Streaming)
- **Workflow 3:** Data Quality Framework Setup (Great Expectations + dbt tests)

---

## Data Modeling

→ See [references/data_modeling_patterns.md](references/data_modeling_patterns.md) for:
- Star schema, snowflake schema, and OBT patterns
- Slowly Changing Dimensions (SCD Types 0–6)
- Data Vault modeling (Hub, Satellite, Link)
- dbt model organization, incremental models, macros
- Partitioning, clustering, and schema evolution

---

## DataOps

→ See [references/dataops_best_practices.md](references/dataops_best_practices.md) for:
- Great Expectations suites and dbt tests
- Data contracts (YAML schema + validation)
- CI/CD for data pipelines (GitHub Actions + slim CI)
- Observability, lineage (OpenLineage), and Prometheus alerting
- Incident response runbooks
- Cost optimization patterns

---

## Troubleshooting

→ See [references/troubleshooting.md](references/troubleshooting.md) for common failure modes:
- Pipeline failures (Airflow timeout, Spark OOM, Kafka consumer lag)
- Data quality issues (duplicates, stale data, schema drift)
- Performance issues (slow queries, dbt model runtimes)

---

## See Also

Portable analytical skills from [nimrodfisher/data-analytics-skills](https://github.com/nimrodfisher/data-analytics-skills):

| Skill | Relevance |
|---|---|
| [data-quality-audit](https://github.com/nimrodfisher/data-analytics-skills/tree/main/01-data-quality-validation/data-quality-audit) | Comprehensive data quality assessment frameworks |
| [schema-mapper](https://github.com/nimrodfisher/data-analytics-skills/tree/main/01-data-quality-validation/schema-mapper) | Database schema visualisation and documentation (ERD, data dictionary) |
| [query-validation](https://github.com/nimrodfisher/data-analytics-skills/tree/main/01-data-quality-validation/query-validation) | SQL review for correctness, performance, and anti-patterns |
| [metric-reconciliation](https://github.com/nimrodfisher/data-analytics-skills/tree/main/01-data-quality-validation/metric-reconciliation) | Cross-source metric validation and discrepancy investigation |
| [programmatic-eda](https://github.com/nimrodfisher/data-analytics-skills/tree/main/01-data-quality-validation/programmatic-eda) | Automated exploratory data analysis on new datasets |
| [semantic-model-builder](https://github.com/nimrodfisher/data-analytics-skills/tree/main/02-documentation-knowledge/semantic-model-builder) | Semantic layer documentation for metrics and data models |
| [data-catalog-entry](https://github.com/nimrodfisher/data-analytics-skills/tree/main/02-documentation-knowledge/data-catalog-entry) | Standardised metadata and data catalogue creation |
| [sql-to-business-logic](https://github.com/nimrodfisher/data-analytics-skills/tree/main/02-documentation-knowledge/sql-to-business-logic) | Translating complex SQL into plain-language documentation |

---

## Common Commands

```bash
# dbt
dbt deps && dbt run --select state:modified+
dbt test --select state:modified+
dbt run --full-refresh --select <model>

# Airflow
airflow dags backfill -s 2024-01-01 -e 2024-01-31 <dag_id>
airflow tasks clear <dag_id> -t <task_id> -s <start_date>

# Kafka
kafka-topics.sh --describe --bootstrap-server localhost:9092 --topic <topic>
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group <group>

# Spark
spark-submit --deploy-mode cluster --conf spark.executor.memory=8g job.py

# Delta Lake (time travel / rollback)
spark.sql("RESTORE TABLE analytics.orders TO VERSION AS OF 10")
spark.sql("OPTIMIZE events ZORDER BY (user_id, event_type)")

# Validation
python scripts/pipeline_orchestrator.py generate --type airflow --source postgres --destination snowflake --schedule "0 5 * * *"
python scripts/data_quality_validator.py validate --input data/sales.parquet --schema schemas/sales.json --checks freshness,completeness,uniqueness
python scripts/etl_performance_optimizer.py analyze --query queries/daily_aggregation.sql --engine spark --recommend
```
