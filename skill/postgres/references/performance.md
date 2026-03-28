# Performance Optimization

## EXPLAIN ANALYZE Fundamentals

```sql
-- Basic EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT u.id, u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name;

-- Key metrics to watch:
-- Planning Time: Time spent creating query plan
-- Execution Time: Actual query execution time
-- Shared Hit Blocks: Data found in cache (good)
-- Shared Read Blocks: Data read from disk (slow)
-- Rows: Estimated vs actual row counts
```

### Reading EXPLAIN Output

```
Seq Scan on users  (cost=0.00..1234.56 rows=10000 width=32)
                    ^^^^^^^^^^^^^^^^^^^^  ^^^^^^     ^^^^^^^^
                    startup..total cost   estimate   row width

Actual time: 0.123..45.678 rows=9876 loops=1
             ^^^^^^^^^^^^^^^  ^^^^^^^^  ^^^^^^^
             first..last row  actual    iterations
```

Node types (fastest to slowest):

- **Index Only Scan** — Best, data from index only
- **Index Scan** — Good, uses index + heap lookup
- **Bitmap Index Scan** — Good for multiple conditions
- **Seq Scan** — Table scan, OK for small tables
- **Seq Scan on large table** — Problem, needs index

---

## Index Strategies

### B-tree Indexes (Default)

```sql
-- Single column index
CREATE INDEX idx_users_email ON users(email);

-- Multi-column index (order matters!)
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at DESC);
-- Good for: WHERE user_id = X ORDER BY created_at DESC
-- Good for: WHERE user_id = X AND created_at > Y
-- Bad for:  WHERE created_at > Y alone (doesn't use index)

-- Partial index (smaller, faster for filtered queries)
CREATE INDEX idx_active_users ON users(email) WHERE active = true;

-- Expression index
CREATE INDEX idx_users_lower_email ON users(LOWER(email));
-- Enables: WHERE LOWER(email) = 'user@example.com'

-- Covering index (avoids table lookup entirely)
CREATE INDEX idx_orders_covering ON orders(user_id) INCLUDE (total, created_at);
-- Enables Index Only Scan
```

### GIN Indexes (JSONB, arrays, full-text)

```sql
-- JSONB containment
CREATE INDEX idx_data_gin ON documents USING GIN(data);
-- Enables: WHERE data @> '{"status": "active"}'

-- JSONB specific paths
CREATE INDEX idx_data_status ON documents USING GIN((data -> 'status'));

-- Array operations
CREATE INDEX idx_tags_gin ON posts USING GIN(tags);
-- Enables: WHERE tags @> ARRAY['postgresql', 'performance']

-- Full-text search
CREATE INDEX idx_content_fts ON articles USING GIN(to_tsvector('english', content));
-- Enables: WHERE to_tsvector('english', content) @@ to_tsquery('postgresql & performance')
```

### GiST Indexes (Spatial, ranges, nearest neighbor)

```sql
-- PostGIS spatial index
CREATE INDEX idx_locations_geom ON locations USING GIST(geom);
-- Enables: WHERE ST_DWithin(geom, point, 1000)

-- Range types
CREATE INDEX idx_bookings_range ON bookings USING GIST(during);
-- Enables: WHERE during && '[2024-01-01, 2024-01-31]'::daterange

-- Nearest neighbor (KNN)
CREATE INDEX idx_locations_gist ON locations USING GIST(coordinates);
-- Enables: ORDER BY coordinates <-> point('0,0') LIMIT 10
```

### BRIN Indexes (Large, naturally ordered tables)

```sql
-- Time-series data (insert-only, sorted by time)
CREATE INDEX idx_metrics_time_brin ON metrics USING BRIN(timestamp);
-- Very small index, good for WHERE timestamp > NOW() - INTERVAL '1 day'

-- Works well with: log tables, time-series metrics, append-only tables
-- Effective when row order on disk correlates with indexed column
```

---

## Statistics and Planner

```sql
-- Update statistics (do after bulk changes)
ANALYZE users;
ANALYZE;  -- All tables

-- Check statistics freshness
SELECT schemaname, tablename, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public';

-- Increase statistics target for high-cardinality columns
ALTER TABLE users ALTER COLUMN email SET STATISTICS 1000;
-- Default is 100; increase for better selectivity estimates

-- View column statistics
SELECT * FROM pg_stats WHERE tablename = 'users' AND attname = 'email';
```

---

## Query Optimization Patterns

### Problem: Sequential scan on large table

```sql
-- Bad: Full table scan
SELECT * FROM orders WHERE user_id = 123;
-- Solution: Add index
CREATE INDEX idx_orders_user ON orders(user_id);
```

### Problem: Index not used

```sql
-- Bad: Function prevents index usage
SELECT * FROM users WHERE LOWER(email) = 'user@example.com';
-- Solution: Expression index
CREATE INDEX idx_users_email_lower ON users(LOWER(email));

-- Bad: Implicit type conversion
SELECT * FROM users WHERE id = '123';  -- id is integer
-- Solution: Use correct type
SELECT * FROM users WHERE id = 123;
```

### Problem: Large JOIN inefficiency

```sql
-- Bad: Nested loop on large tables
EXPLAIN ANALYZE
SELECT * FROM orders o JOIN users u ON o.user_id = u.id;

-- Solutions:
-- 1. Ensure indexes exist on join columns
CREATE INDEX idx_orders_user ON orders(user_id);
-- 2. Update statistics
ANALYZE orders, users;
-- 3. Increase work_mem if hash join would be better
SET work_mem = '256MB';
```

### Problem: COUNT(*) slow

```sql
-- Bad: Full table scan
SELECT COUNT(*) FROM orders WHERE status = 'pending';

-- Solutions:
-- 1. Partial index
CREATE INDEX idx_orders_pending ON orders(id) WHERE status = 'pending';

-- 2. Approximate count for large tables
SELECT reltuples::bigint FROM pg_class WHERE relname = 'orders';

-- 3. Materialized count for reports
CREATE MATERIALIZED VIEW order_counts AS
SELECT status, COUNT(*) FROM orders GROUP BY status;
CREATE UNIQUE INDEX ON order_counts(status);
REFRESH MATERIALIZED VIEW CONCURRENTLY order_counts;
```

---

## Partitioning

```sql
-- Partition tables with more than 10M rows where queries consistently filter on the partition key

CREATE TABLE events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type  TEXT NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_q1 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE events_2024_q2 PARTITION OF events
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');

-- Index on each partition (inherited automatically in PG 11+)
CREATE INDEX ON events (created_at, event_type);

-- LIST partitioning for discrete values
CREATE TABLE orders (order_id BIGINT, region TEXT, total NUMERIC)
PARTITION BY LIST (region);

CREATE TABLE orders_us PARTITION OF orders FOR VALUES IN ('us-east', 'us-west');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('eu-west', 'eu-central');
```

---

## Connection Pooling

```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Check connections by state
SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY count DESC;
```

```ini
# pgbouncer.ini — use transaction pooling for web applications
[databases]
mydb = host=localhost port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
server_idle_timeout = 300
```

Use transaction-level pooling for web applications. Session-level pooling for apps that use prepared statements or temp tables.

---

## Configuration Tuning

```ini
# Memory settings (for 16GB RAM server)
shared_buffers = 4GB           # 25% of RAM
effective_cache_size = 12GB    # 75% of RAM
work_mem = 64MB                # Per sort operation — set per-session for analytics
maintenance_work_mem = 1GB     # For VACUUM, CREATE INDEX

# Checkpoint tuning
checkpoint_completion_target = 0.9
wal_buffers = 16MB
checkpoint_timeout = 10min

# Query planner
random_page_cost = 1.1         # Lower for SSD (default 4.0)
effective_io_concurrency = 200 # Higher for SSD

# Parallelism (Postgres 10+)
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

**Caution on `work_mem`:** Do not set globally to a large value — it is allocated per sort operation and can cause OOM with concurrent queries. Set per-session for analytical workloads.

---

## Performance Monitoring

```sql
-- Slow queries (requires pg_stat_statements)
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Most time-consuming queries (total impact)
SELECT
  query,
  calls,
  total_exec_time / 1000 AS total_seconds,
  mean_exec_time,
  (total_exec_time / sum(total_exec_time) OVER ()) * 100 AS percentage
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Cache hit ratio (should be > 99%)
SELECT
  sum(blks_hit) * 100.0 / sum(blks_hit + blks_read) AS cache_hit_ratio
FROM pg_stat_database;

-- Index usage — find unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Tables with most sequential scans
SELECT relname, seq_scan, n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_scan DESC;
```

---

## Anti-Patterns

- Creating indexes on every column instead of analyzing actual query patterns
- Using `SELECT *` when only a few columns are needed
- Not using `EXPLAIN ANALYZE` to verify index usage after creation
- Storing large blobs in JSONB when a separate table with proper types is better
- Missing connection pooling (each connection uses ~10MB of server memory)
- Running `VACUUM FULL` during peak hours (locks the entire table)
- Using `NOT IN (subquery)` with nullable columns — produces unexpected results due to three-valued logic; use `NOT EXISTS` instead
- Setting `work_mem` globally to a large value — allocated per sort operation, can cause OOM
