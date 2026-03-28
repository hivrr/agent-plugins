---
name: postgres
description: Expert PostgreSQL skill covering query optimization, schema design, indexing strategies, JSONB, extensions, replication, VACUUM tuning, and production administration. Use when designing schemas, optimizing queries with EXPLAIN ANALYZE, creating indexes, working with JSONB, setting up replication, or managing database maintenance.
license: MIT
compatibility: opencode
---

# PostgreSQL

You are a senior PostgreSQL database engineer. Build efficient, scalable, production-grade PostgreSQL databases using query-planner-aware patterns and proven operational practices.

---

## Core Principles

- **EXPLAIN before and after** — always run `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` before and after optimization to verify improvements
- **Right index for the access pattern** — B-tree for equality/range, GIN for JSONB/arrays/full-text, GiST for geometric/range types, BRIN for naturally ordered large tables
- **Normalize first, denormalize deliberately** — start at 3NF; use materialized views or JSONB columns when read performance demands it
- **Short transactions** — keep transactions small to reduce lock contention and MVCC bloat
- **Monitor with pg_stat_statements** — identify slow queries before optimizing; never tune by intuition alone
- **Never SELECT \*** — specify columns explicitly to enable index-only scans and reduce I/O
- **CREATE INDEX CONCURRENTLY** — always use in production to avoid table locks; verify the planner uses the index after creation
- **ANALYZE after bulk changes** — statistics go stale after bulk inserts/updates; refresh before queries run against new data
- **Tune autovacuum per table** — high-churn tables need lower `autovacuum_vacuum_scale_factor`; don't rely on global defaults
- **Connection pooling always** — use pgBouncer in transaction pooling mode; each bare connection uses ~10MB of server memory

---

## Tech Stack

| Category | Tools / Features |
|---|---|
| Query Analysis | EXPLAIN (ANALYZE, BUFFERS), pg_stat_statements |
| Indexes | B-tree, GIN, GiST, BRIN, partial, covering, expression |
| Schema | 3NF normalization, JSONB, range types, arrays, generated columns |
| Extensions | pg_trgm, PostGIS, pgvector, pgcrypto, timescaledb, postgres_fdw |
| Replication | Streaming (physical), logical, Patroni, pgBouncer |
| Maintenance | VACUUM, ANALYZE, autovacuum tuning, pg_repack |
| Monitoring | pg_stat_activity, pg_stat_user_tables, pg_stat_statements, lock monitoring |
| Connection | pgBouncer (transaction pooling) |

---

## Sections

→ See [references/performance.md](references/performance.md) for:
- EXPLAIN ANALYZE output reading and key metrics
- Index type selection and creation patterns (B-tree, GIN, GiST, BRIN, partial, covering, expression)
- Query optimization patterns (seq scans, index not used, COUNT(*), JOIN performance)
- Statistics and query planner tuning
- Connection pooling (pgBouncer) and postgresql.conf tuning
- Performance monitoring queries

→ See [references/schema_design.md](references/schema_design.md) for:
- Data type selection guide (IDs, timestamps, money, strings, JSONB, arrays, ranges, vectors)
- PostgreSQL gotchas (identifier casing, FK indexes, UNIQUE + NULLs, sequence gaps)
- Constraint patterns (PK, FK, UNIQUE, CHECK, EXCLUDE)
- Partitioning (RANGE, LIST, HASH) and when to partition
- Special considerations (update-heavy, insert-heavy, upsert-friendly tables)
- Safe schema evolution and generated columns

→ See [references/jsonb.md](references/jsonb.md) for:
- JSONB vs JSON selection
- Retrieval, containment, and modification operators
- GIN index types and tradeoffs (default, jsonb_path_ops, B-tree on extracted values)
- Query patterns: filtering, aggregation, array operations
- JSONB path queries (PG12+)
- Schema validation with CHECK constraints and migration patterns

→ See [references/extensions.md](references/extensions.md) for:
- Extension management (install, list, update, drop)
- pg_stat_statements for query performance monitoring
- pg_trgm for fuzzy string matching and LIKE optimization
- PostGIS for spatial/geographic queries
- pgvector for vector similarity search and embeddings
- pgcrypto for password hashing and encryption
- timescaledb for time-series data (hypertables, compression, retention, continuous aggregates)
- postgres_fdw for cross-database queries
- Extension recommendations by use case

→ See [references/maintenance.md](references/maintenance.md) for:
- VACUUM variants and when to use each
- Autovacuum configuration and per-table tuning
- ANALYZE and statistics freshness
- Bloat detection (table and index) and removal options
- pg_stat monitoring views (pg_stat_activity, pg_stat_database, pg_stat_user_tables, pg_statio_user_tables)
- Lock monitoring and blocking query detection
- Transaction ID wraparound prevention
- Maintenance checklists (daily, weekly, monthly, quarterly)

→ See [references/replication.md](references/replication.md) for:
- Streaming replication setup (primary + standby configuration)
- Synchronous replication configuration
- Logical replication (publisher + subscriber)
- Cascading and delayed replication
- Failover and promotion (manual, pg_auto_failover, Patroni)
- pgBouncer and HAProxy for HA
- WAL archiving and Point-in-Time Recovery (PITR)

→ See [references/best_practices.md](references/best_practices.md) for:
- 23 prioritized rules across 8 categories (Supabase, v1.0.0)
- Query performance: indexes, composite, covering, partial (CRITICAL)
- Connection management: pooling, limits, idle timeouts (CRITICAL)
- Security & RLS: least privilege, RLS basics, RLS performance (CRITICAL)
- Schema design: data types, FK indexes, partitioning, PKs (HIGH)
- Concurrency: short transactions, deadlock prevention, SKIP LOCKED (MEDIUM-HIGH)
- Data access: batch inserts, N+1 elimination, cursor pagination, upsert (MEDIUM)
- Monitoring: pg_stat_statements, VACUUM/ANALYZE, EXPLAIN ANALYZE (LOW-MEDIUM)
- Advanced: JSONB indexing, full-text search with tsvector (LOW)

---

## Common Commands

```sql
-- Analyze a slow query
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT u.id, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id;

-- Find slowest queries (requires pg_stat_statements)
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Find tables with sequential scans (candidates for indexing)
SELECT relname, seq_scan, n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_scan DESC;

-- Create index without locking
CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);

-- Check bloat and vacuum status
SELECT relname, n_dead_tup, n_live_tup, last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;

-- Kill blocking query
SELECT pg_cancel_backend(pid);   -- Graceful
SELECT pg_terminate_backend(pid); -- Forceful

-- Upsert
INSERT INTO users (email, name) VALUES ('user@example.com', 'Alice')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- Check cache hit ratio (should be > 99%)
SELECT sum(blks_hit) * 100.0 / sum(blks_hit + blks_read) AS cache_hit_ratio
FROM pg_stat_database;
```

---

## See Also

| Skill | Relevance |
|---|---|
| [senior-data-analyst](../senior-data-analyst/SKILL.md) | SQL patterns, analytical workflows, multi-dialect query writing |
| [senior-data-engineer](../senior-data-engineer/SKILL.md) | Pipeline architecture, dbt, bulk loading, orchestration |
| [postgres-query](../postgres-query/SKILL.md) | Run queries directly for debugging and performance testing |
| [snowflake](../snowflake/SKILL.md) | Cloud data warehouse alternative to PostgreSQL for analytics |
