# Postgres Best Practices

**Version 1.0.0** — Supabase, January 2026

> Rules are prioritized by performance impact.

---

## 1. Query Performance

**Impact: CRITICAL** — Slow queries, missing indexes, inefficient query plans.

### 1.1 Add Indexes on WHERE and JOIN Columns

**Impact: CRITICAL (100-1000x faster queries on large tables)**

Queries filtering or joining on unindexed columns cause full table scans, which become exponentially slower as tables grow.

**Incorrect (sequential scan on large table):**

```sql
-- No index on customer_id causes full table scan
select * from orders where customer_id = 123;
-- EXPLAIN shows: Seq Scan on orders (cost=0.00..25000.00 rows=100 width=85)
```

**Correct (index scan):**

```sql
-- Create index on frequently filtered column
create index orders_customer_id_idx on orders (customer_id);
select * from orders where customer_id = 123;
-- EXPLAIN shows: Index Scan using orders_customer_id_idx (cost=0.42..8.44 rows=100 width=85)

-- For JOIN columns, always index the foreign key side
create index orders_customer_id_idx on orders (customer_id);
select c.name, o.total
from customers c
join orders o on o.customer_id = c.id;
```

Reference: https://supabase.com/docs/guides/database/query-optimization

---

### 1.2 Choose the Right Index Type for Your Data

**Impact: HIGH (10-100x improvement with correct index type)**

Different index types excel at different query patterns. The default B-tree isn't always optimal.

**Incorrect (B-tree for JSONB containment):**

```sql
-- B-tree cannot optimize containment operators
create index products_attrs_idx on products (attributes);
select * from products where attributes @> '{"color": "red"}';
-- Full table scan - B-tree doesn't support @> operator
```

**Correct (GIN for JSONB):**

```sql
-- GIN supports @>, ?, ?&, ?| operators
create index products_attrs_idx on products using gin (attributes);
select * from products where attributes @> '{"color": "red"}';
```

Index type guide:

```sql
-- B-tree (default): =, <, >, BETWEEN, IN, IS NULL
create index users_created_idx on users (created_at);

-- GIN: arrays, JSONB, full-text search
create index posts_tags_idx on posts using gin (tags);

-- BRIN: large time-series tables (10-100x smaller index)
create index events_time_idx on events using brin (created_at);

-- Hash: equality-only (slightly faster than B-tree for =)
create index sessions_token_idx on sessions using hash (token);
```

Reference: https://www.postgresql.org/docs/current/indexes-types.html

---

### 1.3 Create Composite Indexes for Multi-Column Queries

**Impact: HIGH (5-10x faster multi-column queries)**

When queries filter on multiple columns, a composite index is more efficient than separate single-column indexes.

**Incorrect (separate indexes require bitmap scan):**

```sql
create index orders_status_idx on orders (status);
create index orders_created_idx on orders (created_at);

-- Query must combine both indexes (slower)
select * from orders where status = 'pending' and created_at > '2024-01-01';
```

**Correct (composite index):**

```sql
-- Equality columns first, range columns last
create index orders_status_created_idx on orders (status, created_at);

select * from orders where status = 'pending' and created_at > '2024-01-01';
-- Works for: WHERE status = 'pending'
-- Works for: WHERE status = 'pending' AND created_at > '2024-01-01'
-- Does NOT work for: WHERE created_at > '2024-01-01' alone (leftmost prefix rule)
```

Reference: https://www.postgresql.org/docs/current/indexes-multicolumn.html

---

### 1.4 Use Covering Indexes to Avoid Table Lookups

**Impact: MEDIUM-HIGH (2-5x faster queries by eliminating heap fetches)**

Covering indexes include all columns needed by a query, enabling index-only scans that skip the table entirely.

**Incorrect (index scan + heap fetch):**

```sql
create index users_email_idx on users (email);
-- Must fetch name and created_at from table heap
select email, name, created_at from users where email = 'user@example.com';
```

**Correct (index-only scan with INCLUDE):**

```sql
-- Include non-searchable columns in the index
create index users_email_idx on users (email) include (name, created_at);
-- All columns served from index, no table access needed
select email, name, created_at from users where email = 'user@example.com';

-- Searching by status, also need customer_id and total
create index orders_status_idx on orders (status) include (customer_id, total);
select status, customer_id, total from orders where status = 'shipped';
```

Use INCLUDE for columns you SELECT but don't filter on.

Reference: https://www.postgresql.org/docs/current/indexes-index-only-scans.html

---

### 1.5 Use Partial Indexes for Filtered Queries

**Impact: HIGH (5-20x smaller indexes, faster writes and queries)**

Partial indexes only include rows matching a WHERE condition, making them smaller and faster when queries consistently filter on the same condition.

**Incorrect (full index includes irrelevant rows):**

```sql
create index users_email_idx on users (email);
-- Query always filters active users but index includes all rows
select * from users where email = 'user@example.com' and deleted_at is null;
```

**Correct (partial index matches query filter):**

```sql
-- Index only includes active users
create index users_active_email_idx on users (email)
where deleted_at is null;

select * from users where email = 'user@example.com' and deleted_at is null;

-- Only pending orders
create index orders_pending_idx on orders (created_at)
where status = 'pending';

-- Only non-null values
create index products_sku_idx on products (sku)
where sku is not null;
```

Reference: https://www.postgresql.org/docs/current/indexes-partial.html

---

## 2. Connection Management

**Impact: CRITICAL** — Connection pooling, limits, and serverless strategies.

### 2.1 Configure Idle Connection Timeouts

**Impact: HIGH (Reclaim 30-50% of connection slots from idle clients)**

**Correct:**

```ini
-- Terminate connections idle in transaction after 30 seconds
alter system set idle_in_transaction_session_timeout = '30s';

-- Terminate completely idle connections after 10 minutes
alter system set idle_session_timeout = '10min';

select pg_reload_conf();
```

```ini
# pgbouncer.ini
server_idle_timeout = 60
client_idle_timeout = 300
```

Reference: https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-IDLE-IN-TRANSACTION-SESSION-TIMEOUT

---

### 2.2 Set Appropriate Connection Limits

**Impact: CRITICAL (Prevent database crashes and memory exhaustion)**

```sql
-- Formula: each connection uses 1-3MB RAM
-- Recommended for 4GB RAM: 100 connections
alter system set max_connections = 100;

-- work_mem * max_connections should not exceed 25% of RAM
alter system set work_mem = '8MB';  -- 8MB * 100 = 800MB max

-- Monitor usage
select count(*), state from pg_stat_activity group by state;
```

Reference: https://supabase.com/docs/guides/platform/performance#connection-management

---

### 2.3 Use Connection Pooling for All Applications

**Impact: CRITICAL (Handle 10-100x more concurrent users)**

Postgres connections are expensive (1-3MB RAM each). Without pooling, applications exhaust connections under load.

```sql
-- Use PgBouncer between app and database
-- Configure pool_size based on: (CPU cores * 2) + spindle_count
-- Example for 4 cores: pool_size = 10

-- 500 concurrent users share 10 actual connections
select count(*) from pg_stat_activity;  -- 10 connections, not 500
```

Pool modes:
- **Transaction mode**: connection returned after each transaction (best for most apps)
- **Session mode**: connection held for entire session (needed for prepared statements, temp tables)

Reference: https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler

---

### 2.4 Use Prepared Statements Correctly with Pooling

**Impact: HIGH (Avoid prepared statement conflicts in pooled environments)**

Named prepared statements are tied to individual connections. In transaction-mode pooling, connections are shared.

**Incorrect (named prepared statements with transaction pooling):**

```sql
prepare get_user as select * from users where id = $1;
execute get_user(123);
-- ERROR: prepared statement "get_user" does not exist (on next request)
```

**Correct:**

```sql
-- Option 1: Deallocate after use
prepare get_user as select * from users where id = $1;
execute get_user(123);
deallocate get_user;

-- Option 2: Use session mode pooling for sessions that need prepared statements

-- Driver settings to disable prepared statements:
-- Node.js pg: { prepare: false }
-- JDBC: prepareThreshold=0
```

Reference: https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pool-modes

---

## 3. Security & RLS

**Impact: CRITICAL** — Row-Level Security, privilege management, and authentication.

### 3.1 Apply Principle of Least Privilege

**Impact: MEDIUM (Reduced attack surface, better audit trail)**

**Incorrect:**

```sql
grant all privileges on all tables in schema public to app_user;
```

**Correct:**

```sql
create role app_readonly nologin;
grant usage on schema public to app_readonly;
grant select on public.products, public.categories to app_readonly;

create role app_writer nologin;
grant usage on schema public to app_writer;
grant select, insert, update on public.orders to app_writer;
grant usage on sequence orders_id_seq to app_writer;

create role app_user login password 'xxx';
grant app_writer to app_user;

-- Revoke default public access
revoke all on schema public from public;
revoke all on all tables in schema public from public;
```

Reference: https://supabase.com/blog/postgres-roles-and-privileges

---

### 3.2 Enable Row Level Security for Multi-Tenant Data

**Impact: CRITICAL (Database-enforced tenant isolation, prevent data leaks)**

**Incorrect (application-level filtering only):**

```sql
-- Bug or bypass means all data is exposed
select * from orders where user_id = $current_user_id;
```

**Correct (database-enforced RLS):**

```sql
alter table orders enable row level security;

create policy orders_user_policy on orders
  for all
  using (user_id = current_setting('app.current_user_id')::bigint);

alter table orders force row level security;

-- Supabase auth pattern:
create policy orders_user_policy on orders
  for all
  to authenticated
  using (user_id = auth.uid());
```

Reference: https://supabase.com/docs/guides/database/postgres/row-level-security

---

### 3.3 Optimize RLS Policies for Performance

**Impact: HIGH (5-10x faster RLS queries with proper patterns)**

**Incorrect (function called for every row):**

```sql
create policy orders_policy on orders
  using (auth.uid() = user_id);  -- auth.uid() called per row!
```

**Correct (wrap in SELECT to cache):**

```sql
create policy orders_policy on orders
  using ((select auth.uid()) = user_id);  -- Called once, cached

-- For complex checks, use security definer function
create or replace function is_team_member(team_id bigint)
returns boolean language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where team_id = $1 and user_id = (select auth.uid())
  );
$$;

create policy team_orders_policy on orders
  using ((select is_team_member(team_id)));

-- Always index columns used in RLS policies
create index orders_user_id_idx on orders (user_id);
```

Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations

---

## 4. Schema Design

**Impact: HIGH** — Table design, data types, partitioning, and primary keys.

### 4.1 Choose Appropriate Data Types

**Impact: HIGH (50% storage reduction, faster comparisons)**

**Incorrect:**

```sql
create table users (
  id int,                    -- Overflows at 2.1 billion
  email varchar(255),        -- Unnecessary limit
  created_at timestamp,      -- Missing timezone
  is_active varchar(5),      -- String for boolean
  price varchar(20)          -- String for numeric
);
```

**Correct:**

```sql
create table users (
  id bigint generated always as identity primary key,
  email text,
  created_at timestamptz,
  is_active boolean default true,
  price numeric(10,2)
);
-- Rule: bigint not int, text not varchar(n), timestamptz not timestamp,
--       boolean not varchar, numeric not float
```

Reference: https://www.postgresql.org/docs/current/datatype.html

---

### 4.2 Index Foreign Key Columns

**Impact: HIGH (10-100x faster JOINs and CASCADE operations)**

Postgres does NOT automatically index foreign key columns.

**Incorrect:**

```sql
create table orders (
  id bigint generated always as identity primary key,
  customer_id bigint references customers(id) on delete cascade
  -- No index on customer_id!
);
```

**Correct:**

```sql
create table orders (
  id bigint generated always as identity primary key,
  customer_id bigint references customers(id) on delete cascade
);
create index orders_customer_id_idx on orders (customer_id);

-- Find missing FK indexes
select conrelid::regclass as table_name, a.attname as fk_column
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where c.contype = 'f'
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and a.attnum = any(i.indkey)
  );
```

Reference: https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK

---

### 4.3 Partition Large Tables for Better Performance

**Impact: MEDIUM-HIGH (5-20x faster queries and maintenance on large tables)**

**Correct:**

```sql
create table events (
  id bigint generated always as identity,
  created_at timestamptz not null,
  data jsonb
) partition by range (created_at);

create table events_2024_01 partition of events
  for values from ('2024-01-01') to ('2024-02-01');
create table events_2024_02 partition of events
  for values from ('2024-02-01') to ('2024-03-01');

-- Queries only scan relevant partitions
select * from events where created_at > '2024-01-15';

-- Drop old data instantly (vs DELETE taking hours)
drop table events_2023_01;
```

When to partition: tables > 100M rows, time-series with date-based queries, need to efficiently drop old data.

Reference: https://www.postgresql.org/docs/current/ddl-partitioning.html

---

### 4.4 Select Optimal Primary Key Strategy

**Impact: HIGH (Better index locality, reduced fragmentation)**

**Incorrect:**

```sql
-- Random UUIDs (v4) cause index fragmentation
create table orders (
  id uuid default gen_random_uuid() primary key
);
```

**Correct:**

```sql
-- Sequential IDs (best for most cases)
create table users (
  id bigint generated always as identity primary key
);

-- For distributed systems needing UUIDs, use UUIDv7 (time-ordered, no fragmentation)
-- Requires pg_uuidv7 extension
create table orders (
  id uuid default uuid_generate_v7() primary key
);
```

Guidelines: single database → `bigint identity`; distributed/exposed → UUIDv7 or ULID; avoid UUIDv4 as PK on large tables.

---

### 4.5 Use Lowercase Identifiers for Compatibility

**Impact: MEDIUM (Avoid case-sensitivity bugs with tools, ORMs, and AI assistants)**

**Incorrect:**

```sql
CREATE TABLE "Users" (
  "userId" bigint PRIMARY KEY,
  "firstName" text
);
-- Must always quote or queries fail
SELECT "firstName" FROM "Users";
```

**Correct:**

```sql
CREATE TABLE users (
  user_id bigint PRIMARY KEY,
  first_name text
);
-- Works without quotes, recognized by all tools
SELECT first_name FROM users WHERE user_id = 1;
```

Reference: https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS

---

## 5. Concurrency & Locking

**Impact: MEDIUM-HIGH** — Transaction management, deadlock prevention, lock contention.

### 5.1 Keep Transactions Short to Reduce Lock Contention

**Impact: MEDIUM-HIGH (3-5x throughput improvement, fewer deadlocks)**

**Incorrect:**

```sql
begin;
select * from orders where id = 1 for update;  -- Lock acquired
-- Application makes HTTP call (2-5 seconds) — other queries blocked!
update orders set status = 'paid' where id = 1;
commit;
```

**Correct:**

```sql
-- Call APIs outside the transaction
-- Only hold lock for the actual update
begin;
update orders
set status = 'paid', payment_id = $1
where id = $2 and status = 'pending'
returning *;
commit;  -- Lock held for milliseconds

-- Abort runaway queries
set statement_timeout = '30s';
```

Reference: https://www.postgresql.org/docs/current/tutorial-transactions.html

---

### 5.2 Prevent Deadlocks with Consistent Lock Ordering

**Impact: MEDIUM-HIGH (Eliminate deadlock errors)**

**Incorrect:**

```sql
-- Transaction A locks row 1, Transaction B locks row 2
-- A waits for B's row 2, B waits for A's row 1 → DEADLOCK
```

**Correct:**

```sql
-- Acquire locks in consistent order (by ID)
begin;
select * from accounts where id in (1, 2) order by id for update;
update accounts set balance = balance - 100 where id = 1;
update accounts set balance = balance + 100 where id = 2;
commit;

-- Or use a single statement that acquires all locks atomically
begin;
update accounts
set balance = balance + case id when 1 then -100 when 2 then 100 end
where id in (1, 2);
commit;

-- Check for deadlocks
select * from pg_stat_database where deadlocks > 0;
```

---

### 5.3 Use Advisory Locks for Application-Level Locking

**Impact: MEDIUM (Efficient coordination without row-level lock overhead)**

```sql
-- Session-level (released on disconnect or unlock)
select pg_advisory_lock(hashtext('report_generator'));
-- ... do exclusive work ...
select pg_advisory_unlock(hashtext('report_generator'));

-- Transaction-level (released on commit/rollback)
begin;
select pg_advisory_xact_lock(hashtext('daily_report'));
-- ... do work ...
commit;

-- Non-blocking try-lock
select pg_try_advisory_lock(hashtext('resource_name'));
-- Returns true if acquired, false if already locked
```

Reference: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

---

### 5.4 Use SKIP LOCKED for Non-Blocking Queue Processing

**Impact: MEDIUM-HIGH (10x throughput for worker queues)**

**Incorrect:**

```sql
-- Workers block each other waiting for the same row's lock
select * from jobs where status = 'pending' order by created_at limit 1 for update;
```

**Correct:**

```sql
-- Each worker skips locked rows and gets the next available
begin;
select * from jobs
where status = 'pending'
order by created_at
limit 1
for update skip locked;
commit;

-- Atomic claim-and-update
update jobs
set status = 'processing', worker_id = $1, started_at = now()
where id = (
  select id from jobs
  where status = 'pending'
  order by created_at limit 1
  for update skip locked
)
returning *;
```

Reference: https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE

---

## 6. Data Access Patterns

**Impact: MEDIUM** — N+1 elimination, batch operations, pagination.

### 6.1 Batch INSERT Statements for Bulk Data

**Impact: MEDIUM (10-50x faster bulk inserts)**

**Incorrect:**

```sql
insert into events (user_id, action) values (1, 'click');
insert into events (user_id, action) values (1, 'view');
-- 1000 individual inserts = 1000 round trips
```

**Correct:**

```sql
-- Batch up to ~1000 rows per statement
insert into events (user_id, action) values
  (1, 'click'), (1, 'view'), (2, 'click');

-- For large imports, COPY is fastest
copy events (user_id, action, created_at)
from '/path/to/data.csv'
with (format csv, header true);
```

Reference: https://www.postgresql.org/docs/current/sql-copy.html

---

### 6.2 Eliminate N+1 Queries with Batch Loading

**Impact: MEDIUM-HIGH (10-100x fewer database round trips)**

**Incorrect:**

```sql
select id from users where active = true;  -- 100 IDs
-- Then 100 individual queries:
select * from orders where user_id = 1;
select * from orders where user_id = 2;
-- ... 98 more
```

**Correct:**

```sql
-- Single batch query with ANY
select * from orders where user_id = any($1::bigint[]);
-- Application passes: [1, 2, 3, ...]

-- Or JOIN
select u.id, u.name, o.*
from users u
left join orders o on o.user_id = u.id
where u.active = true;
```

---

### 6.3 Use Cursor-Based Pagination Instead of OFFSET

**Impact: MEDIUM-HIGH (Consistent O(1) performance regardless of page depth)**

**Incorrect:**

```sql
select * from products order by id limit 20 offset 199980;
-- Page 10000: scans 200,000 rows to skip them!
```

**Correct:**

```sql
-- Page 1
select * from products order by id limit 20;
-- Store last_id = 20

-- Page 2 (always fast regardless of depth)
select * from products where id > 20 order by id limit 20;

-- Multi-column sorting (include all sort columns in cursor)
select * from products
where (created_at, id) > ('2024-01-15 10:00:00', 12345)
order by created_at, id
limit 20;
```

Reference: https://supabase.com/docs/guides/database/pagination

---

### 6.4 Use UPSERT for Insert-or-Update Operations

**Impact: MEDIUM (Atomic operation, eliminates race conditions)**

**Incorrect:**

```sql
select * from settings where user_id = 123 and key = 'theme';
-- If not found, insert — race condition if two requests run simultaneously
insert into settings (user_id, key, value) values (123, 'theme', 'dark');
```

**Correct:**

```sql
insert into settings (user_id, key, value)
values (123, 'theme', 'dark')
on conflict (user_id, key)
do update set value = excluded.value, updated_at = now()
returning *;

-- Insert-or-ignore
insert into page_views (page_id, user_id) values (1, 123)
on conflict (page_id, user_id) do nothing;
```

Reference: https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT

---

## 7. Monitoring & Diagnostics

**Impact: LOW-MEDIUM** — pg_stat_statements, EXPLAIN ANALYZE, VACUUM.

### 7.1 Enable pg_stat_statements for Query Analysis

```sql
create extension if not exists pg_stat_statements;

-- Slowest queries by total time
select calls,
  round(total_exec_time::numeric, 2) as total_time_ms,
  round(mean_exec_time::numeric, 2) as mean_time_ms,
  query
from pg_stat_statements
order by total_exec_time desc
limit 10;

-- Queries with high mean time (optimization candidates)
select query, mean_exec_time, calls
from pg_stat_statements
where mean_exec_time > 100  -- > 100ms average
order by mean_exec_time desc;

select pg_stat_statements_reset();
```

Reference: https://supabase.com/docs/guides/database/extensions/pg_stat_statements

---

### 7.2 Maintain Table Statistics with VACUUM and ANALYZE

**Impact: MEDIUM (2-10x better query plans with accurate statistics)**

```sql
analyze orders;
analyze orders (status, created_at);  -- Specific columns

-- Check freshness
select relname, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
from pg_stat_user_tables
order by last_analyze nulls first;

-- Tune autovacuum for high-churn tables
alter table orders set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
```

---

### 7.3 Use EXPLAIN ANALYZE to Diagnose Slow Queries

```sql
explain (analyze, buffers, format text)
select * from orders where customer_id = 123 and status = 'pending';
```

Key things to look for:
- **Seq Scan on large tables** → missing index
- **Rows Removed by Filter** → poor selectivity or missing index
- **Buffers: read >> hit** → data not cached, needs more `shared_buffers`
- **Nested Loop with high loops** → consider different join strategy
- **Sort Method: external merge** → `work_mem` too low

Reference: https://supabase.com/docs/guides/database/inspect

---

## 8. Advanced Features

**Impact: LOW** — JSONB, full-text search, advanced Postgres features.

### 8.1 Index JSONB Columns for Efficient Querying

**Impact: MEDIUM (10-100x faster JSONB queries with proper indexing)**

**Incorrect:**

```sql
-- Full table scan for every query
select * from products where attributes @> '{"color": "red"}';
select * from products where attributes->>'brand' = 'Nike';
```

**Correct:**

```sql
-- GIN index for containment operators (@>, ?, ?&, ?|)
create index products_attrs_gin on products using gin (attributes);
select * from products where attributes @> '{"color": "red"}';

-- Expression index for specific key lookups
create index products_brand_idx on products ((attributes->>'brand'));
select * from products where attributes->>'brand' = 'Nike';

-- jsonb_ops (default): all operators, larger index
create index idx1 on products using gin (attributes);

-- jsonb_path_ops: only @>, 2-3x smaller index
create index idx2 on products using gin (attributes jsonb_path_ops);
```

Reference: https://www.postgresql.org/docs/current/datatype-json.html#JSON-INDEXING

---

### 8.2 Use tsvector for Full-Text Search

**Impact: MEDIUM (100x faster than LIKE, with ranking support)**

**Incorrect:**

```sql
-- Cannot use index, scans all rows
select * from articles where content like '%postgresql%';
```

**Correct:**

```sql
-- Generated tsvector column + GIN index
alter table articles add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) stored;

create index articles_search_idx on articles using gin (search_vector);

-- Fast search
select * from articles
where search_vector @@ to_tsquery('english', 'postgresql & performance');

-- With ranking
select *, ts_rank(search_vector, query) as rank
from articles, to_tsquery('english', 'postgresql') query
where search_vector @@ query
order by rank desc;

-- Query operators:
-- AND: to_tsquery('postgresql & performance')
-- OR:  to_tsquery('postgresql | mysql')
-- Prefix: to_tsquery('post:*')
```

Reference: https://supabase.com/docs/guides/database/full-text-search
