# SQL Dialects & Query Writing

---

## Query Writing Workflow

Use this structured approach when translating a natural-language data need into SQL.

### Step 1 — Parse the request

Identify before writing a single line:

| Element | Questions to answer |
|---|---|
| Output columns | What fields should the result include? |
| Filters | Time ranges, statuses, segments? |
| Aggregations | GROUP BY, COUNT, SUM, AVG? |
| Joins | Multiple tables? What keys? |
| Ordering | How should results be sorted? |
| Limits | Top-N, sample, or full result? |

### Step 2 — Confirm the dialect

If not already known, ask:

| Dialect | Variants |
|---|---|
| PostgreSQL | Aurora, RDS, Supabase, Neon |
| Snowflake | — |
| BigQuery | Google Cloud |
| Redshift | Amazon |
| Databricks SQL | Delta Lake |
| MySQL | Aurora MySQL, PlanetScale |
| SQL Server | Azure SQL, Synapse |
| DuckDB | Local analytics |
| SQLite | Embedded |

### Step 3 — Discover schema (if warehouse is connected)

- Search for relevant tables based on the description
- Check column names, types, and relationships
- Look for partition or clustering keys — these dictate performance strategy
- Check for pre-built views or materialised views that simplify the query

### Step 4 — Write with these rules

**Structure:**
- Use CTEs for any query with more than one logical step
- One CTE per logical transformation (not one per table)
- Name CTEs descriptively: `daily_signups`, `active_users`, `revenue_by_product`

**Performance:**
- Never `SELECT *` in production — specify only needed columns
- Filter early — push `WHERE` clauses as close to base tables as possible
- Use partition or clustering key filters first — they eliminate data before any compute
- Prefer `EXISTS` over `IN` for correlated subqueries on large result sets
- Use `INNER JOIN` when you mean inner join — don't default to `LEFT JOIN`
- Watch for exploding joins — many-to-many joins multiply rows silently

**Readability:**
- Comment the "why" for non-obvious logic, not the "what"
- Meaningful table aliases (`u` for users, `o` for orders) — not `a`, `b`, `c`
- Each major clause on its own line

### Step 5 — Present the query

Always include:
1. The complete query in a SQL code block
2. One-line explanation per CTE
3. Performance note if relevant (partition usage, expected cost)
4. Common variations — how to change time range, granularity, or add a filter

---

## Dialect Reference

---

### PostgreSQL (Aurora, RDS, Supabase, Neon)

**Date / time:**
```sql
CURRENT_DATE
CURRENT_TIMESTAMP
NOW()

date_column + INTERVAL '7 days'
date_column - INTERVAL '1 month'

DATE_TRUNC('month', created_at)

EXTRACT(YEAR FROM created_at)
EXTRACT(DOW FROM created_at)  -- 0 = Sunday

TO_CHAR(created_at, 'YYYY-MM-DD')
```

**Strings:**
```sql
first_name || ' ' || last_name
CONCAT(first_name, ' ', last_name)

column ILIKE '%pattern%'          -- case-insensitive LIKE
column ~ '^regex_pattern$'        -- regex match

LEFT(str, n)
RIGHT(str, n)
SPLIT_PART(str, delimiter, pos)
REGEXP_REPLACE(str, pattern, replacement)
```

**JSON / arrays:**
```sql
data->>'key'                          -- text value
data->'nested'->'key'                 -- json value
data#>>'{path,to,key}'                -- nested text

ARRAY_AGG(column)
ANY(array_column)
array_column @> ARRAY['value']        -- array contains
```

**Performance tips:**
- `EXPLAIN ANALYZE` to profile; look for `Seq Scan` on large tables
- Index frequently filtered and joined columns
- Partial indexes for common filter conditions (`WHERE status = 'active'`)
- `EXISTS` over `IN` for correlated subqueries
- Connection pooling (PgBouncer) for concurrent workloads

---

### Snowflake

**Date / time:**
```sql
CURRENT_DATE()
CURRENT_TIMESTAMP()
SYSDATE()

DATEADD(day, 7, date_column)
DATEDIFF(day, start_date, end_date)

DATE_TRUNC('month', created_at)

YEAR(created_at)
MONTH(created_at)
DAY(created_at)
DAYOFWEEK(created_at)

TO_CHAR(created_at, 'YYYY-MM-DD')
```

**Strings:**
```sql
column ILIKE '%pattern%'
REGEXP_LIKE(column, 'pattern')
```

**Semi-structured (VARIANT):**
```sql
data:customer:name::STRING            -- dot notation
data:items[0]:price::NUMBER

PARSE_JSON('{"key": "value"}')
GET_PATH(variant_col, 'path.to.key')

-- Flatten arrays
SELECT f.value
FROM my_table, LATERAL FLATTEN(input => array_col) f

-- Flatten nested objects into rows
SELECT
    t.id,
    item.value:name::STRING   AS item_name,
    item.value:qty::NUMBER    AS quantity
FROM my_table t,
     LATERAL FLATTEN(input => t.data:items) item
```

**Performance tips:**
- Use clustering keys on large tables — not traditional indexes
- Filter on clustering key columns first for partition pruning
- Right-size your warehouse — scale up for complex queries, scale down after
- `RESULT_SCAN(LAST_QUERY_ID())` to reuse results without re-running
- Transient tables for staging / intermediate data (no Fail-safe cost)

---

### BigQuery (Google Cloud)

**Date / time:**
```sql
CURRENT_DATE()
CURRENT_TIMESTAMP()

DATE_ADD(date_column, INTERVAL 7 DAY)
DATE_SUB(date_column, INTERVAL 1 MONTH)
DATE_DIFF(end_date, start_date, DAY)
TIMESTAMP_DIFF(end_ts, start_ts, HOUR)

DATE_TRUNC(created_at, MONTH)
TIMESTAMP_TRUNC(created_at, HOUR)

EXTRACT(YEAR FROM created_at)
EXTRACT(DAYOFWEEK FROM created_at)    -- 1 = Sunday

FORMAT_DATE('%Y-%m-%d', date_column)
FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', ts_column)
```

**Strings:**
```sql
LOWER(column) LIKE '%pattern%'        -- no ILIKE in BQ
REGEXP_CONTAINS(column, r'pattern')
REGEXP_EXTRACT(column, r'pattern')
```

**Arrays / structs:**
```sql
ARRAY_AGG(column)
UNNEST(array_column)
ARRAY_LENGTH(array_column)
value IN UNNEST(array_column)

struct_column.field_name
```

**Performance tips:**
- Always filter on the partition column (usually a date) — billing is per-byte scanned
- `SELECT *` costs money; always specify columns
- Use clustering on frequently filtered non-partition columns
- `APPROX_COUNT_DISTINCT()` for cardinality estimates on large tables
- Preview estimated bytes with a dry run before running expensive queries
- `DECLARE` / `SET` for parameterised scripts

---

### Redshift (Amazon)

**Date / time:**
```sql
CURRENT_DATE
GETDATE()
SYSDATE

DATEADD(day, 7, date_column)
DATEDIFF(day, start_date, end_date)

DATE_TRUNC('month', created_at)

EXTRACT(YEAR FROM created_at)
DATE_PART('dow', created_at)
```

**Strings:**
```sql
column ILIKE '%pattern%'
REGEXP_INSTR(column, 'pattern') > 0

SPLIT_PART(str, delimiter, pos)
LISTAGG(column, ', ') WITHIN GROUP (ORDER BY column)
```

**Performance tips:**
- `DISTKEY` on the join key for collocated joins — avoids cross-node data movement
- `SORTKEY` on frequently filtered columns
- `EXPLAIN` to check for `DS_BCAST` (broadcast) or `DS_DIST` (redistribute) — both are expensive
- `ANALYZE` after large loads; `VACUUM` after large deletes
- Late-binding views for schema flexibility without recompiling

---

### Databricks SQL (Delta Lake)

**Date / time:**
```sql
CURRENT_DATE()
CURRENT_TIMESTAMP()

DATE_ADD(date_column, 7)
DATEDIFF(end_date, start_date)
ADD_MONTHS(date_column, 1)

DATE_TRUNC('MONTH', created_at)
TRUNC(date_column, 'MM')

YEAR(created_at)
MONTH(created_at)
DAYOFWEEK(created_at)
```

**Delta Lake features:**
```sql
-- Time travel
SELECT * FROM my_table TIMESTAMP AS OF '2024-01-15'
SELECT * FROM my_table VERSION AS OF 42

-- Audit history
DESCRIBE HISTORY my_table

-- Merge / upsert
MERGE INTO target USING source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
```

**Performance tips:**
- `OPTIMIZE` to compact small files; `ZORDER BY` on filter columns within a partition
- Photon engine handles compute-intensive aggregations faster
- `CACHE TABLE` for frequently accessed datasets in a session
- Partition by low-cardinality date columns (not user_id)

---

### MySQL (Aurora MySQL, PlanetScale)

**Key differences from PostgreSQL:**
```sql
-- Date arithmetic
DATE_ADD(date_col, INTERVAL 7 DAY)
DATE_SUB(date_col, INTERVAL 1 MONTH)
DATEDIFF(end_date, start_date)         -- returns days only

-- No ILIKE — use LIKE (case-insensitive by default on most collations)
column LIKE '%pattern%'

-- String aggregation
GROUP_CONCAT(column ORDER BY col SEPARATOR ', ')

-- Window functions available from MySQL 8.0+
-- No FULL OUTER JOIN — simulate with UNION of LEFT and RIGHT joins
```

---

### SQL Server / Azure SQL / Synapse

**Key differences:**
```sql
-- Date arithmetic
DATEADD(day, 7, date_column)
DATEDIFF(day, start_date, end_date)

-- Date truncation (no DATE_TRUNC)
DATEADD(month, DATEDIFF(month, 0, created_at), 0)  -- start of month

-- String: no ILIKE
column LIKE '%pattern%' COLLATE SQL_Latin1_General_CP1_CI_AS

-- Top-N (not LIMIT)
SELECT TOP 100 * FROM my_table ORDER BY created_at DESC

-- String aggregation
STRING_AGG(column, ', ') WITHIN GROUP (ORDER BY column)
```

---

### DuckDB

Best for local analytics on Parquet, CSV, JSON files.

```sql
-- Read files directly
SELECT * FROM 'data/*.parquet'
SELECT * FROM read_csv_auto('data.csv')
SELECT * FROM read_json('data.json')

-- Full PostgreSQL-compatible syntax
-- DATE_TRUNC, INTERVAL arithmetic, window functions all work
-- ASOF JOIN for time-series nearest-match
SELECT * FROM events ASOF JOIN prices USING (symbol, timestamp)

-- Pivot
PIVOT orders ON status USING SUM(amount) GROUP BY month
```

---

## Error Handling & Debugging

| Error | Likely cause | Fix |
|---|---|---|
| Syntax error | Dialect-specific syntax used in wrong engine | Check function names — `ILIKE` not in BigQuery; `SAFE_DIVIDE` only in BigQuery |
| Column not found | Typo, case sensitivity, or wrong alias scope | Qualify with `table.column`; PostgreSQL quoted identifiers are case-sensitive |
| Type mismatch | Comparing `DATE` to `TIMESTAMP` or `TEXT` to `INT` | Cast explicitly: `CAST(col AS DATE)` or `col::DATE` |
| Division by zero | Denominator is 0 or NULL | Wrap with `NULLIF(denominator, 0)` |
| Ambiguous column | Same column name in two joined tables | Always alias: `u.id`, `o.id` |
| GROUP BY error | Non-aggregated column missing from GROUP BY | Add column to GROUP BY, or use a window function instead |
| Exploding row count | Many-to-many join without deduplication | Check join cardinality first; deduplicate one side or use EXISTS |
