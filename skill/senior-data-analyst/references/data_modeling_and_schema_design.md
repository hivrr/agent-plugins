# Data Modeling & Schema Design

---

## OLTP vs. OLAP Design

| Concern | OLTP | OLAP |
|---|---|---|
| Goal | Fast writes, transactional integrity | Fast reads, aggregations |
| Normalisation | 3NF — minimise redundancy | Intentionally denormalised (star/snowflake) |
| Typical queries | Point lookups, short transactions | Full scans, GROUP BY, window functions |
| Indexes | Many, targeted | Few, mostly on partition/cluster keys |
| Example systems | PostgreSQL, MySQL (app DB) | Snowflake, BigQuery, Redshift |

**Rule:** Design the source system for OLTP. Build a separate analytics layer (dbt/warehouse) for OLAP. Don't try to serve both from one schema.

---

## Normalisation Reference

### First Normal Form (1NF)
- Every column holds atomic values (no comma-separated lists, no arrays in relational columns)
- Every row is uniquely identifiable

```sql
-- Bad: storing multiple values in one column
CREATE TABLE orders (
    order_id INT,
    product_ids TEXT  -- "101,102,103"
);

-- Good: junction table
CREATE TABLE order_items (
    order_id   INT REFERENCES orders(order_id),
    product_id INT REFERENCES products(product_id),
    quantity   INT NOT NULL,
    PRIMARY KEY (order_id, product_id)
);
```

### Second Normal Form (2NF)
No partial dependency on a composite key — every non-key column depends on the whole key.

### Third Normal Form (3NF)
No transitive dependency — non-key columns depend only on the primary key, not on other non-key columns.

```sql
-- Bad: city_name depends on zip_code, not on customer_id
CREATE TABLE customers (
    customer_id INT PRIMARY KEY,
    zip_code    VARCHAR(10),
    city_name   VARCHAR(100)  -- transitive dependency
);

-- Good: extract the dependent entity
CREATE TABLE zip_codes (
    zip_code  VARCHAR(10) PRIMARY KEY,
    city_name VARCHAR(100) NOT NULL
);
CREATE TABLE customers (
    customer_id INT PRIMARY KEY,
    zip_code    VARCHAR(10) REFERENCES zip_codes(zip_code)
);
```

---

## Schema Review Checklist

**Primary keys**
- [ ] Surrogate key (INT/UUID) or natural key? Surrogate preferred unless natural key is guaranteed stable and unique
- [ ] UUIDs for distributed systems; serial integers for single-node systems with high write volume

**Mandatory audit columns — on every table, non-negotiable**
```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Nullable fields**
- [ ] Every NULL-able column has a documented reason — NULLs should mean "unknown", not "not applicable" or "zero"
- [ ] Use NOT NULL with a sensible default wherever possible

**Indexes**
- [ ] Every foreign key is indexed
- [ ] Every common `WHERE` clause column is indexed or considered
- [ ] Compound indexes ordered by selectivity (most selective column first)
- [ ] Indexes on columns used in `ORDER BY` on large result sets

**Enums vs. lookup tables**
- Enums: stable, closed lists (status, type) — fewer joins, enforced at DB level
- Lookup tables: lists that change or need labels/metadata (country codes, categories) — flexible, self-documenting

**Calculated values**
- [ ] No storing values that should be derived (e.g. `total_price` when you have `quantity * unit_price`)
- Exception: materialised for performance — document it and keep it in sync

**Soft delete vs. hard delete**
- Soft delete (`deleted_at TIMESTAMPTZ`): preserves history, complicates every query — add a partial index and a view
- Hard delete: simpler queries, requires separate audit/history table if history matters
- Recommendation: soft delete for user-facing entities, hard delete for ephemeral records

---

## SQL DDL Patterns

### Well-structured OLTP table
```sql
CREATE TABLE users (
    user_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL UNIQUE,
    full_name   VARCHAR(255) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ  -- soft delete; NULL = not deleted
);

CREATE INDEX idx_users_email    ON users(email);
CREATE INDEX idx_users_status   ON users(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created  ON users(created_at);
```

### Event / fact table (high-volume, append-only)
```sql
CREATE TABLE events (
    event_id    UUID         NOT NULL DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(user_id),
    event_type  VARCHAR(100) NOT NULL,
    properties  JSONB,
    occurred_at TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
)
PARTITION BY RANGE (occurred_at);  -- partition monthly for large tables

CREATE INDEX idx_events_user       ON events(user_id, occurred_at);
CREATE INDEX idx_events_type_time  ON events(event_type, occurred_at);
```

### Dimension table (OLAP / warehouse)
```sql
-- Star schema dimension: denormalised, wide, stable
CREATE TABLE dim_customers (
    customer_key    INT          PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    customer_id     VARCHAR(50)  NOT NULL,   -- natural key from source
    email           VARCHAR(255),
    plan_name       VARCHAR(100),
    plan_tier       VARCHAR(50),
    country         VARCHAR(100),
    signup_date     DATE,
    -- SCD Type 2 columns
    effective_from  DATE         NOT NULL,
    effective_to    DATE,                    -- NULL = current record
    is_current      BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_dim_customers_id      ON dim_customers(customer_id);
CREATE INDEX idx_dim_customers_current ON dim_customers(customer_id) WHERE is_current;
```

---

## ERD Notation Guide

When describing relationships in prose or diagrams:

```
users ||--o{ orders         : "places"        (one user, zero or many orders)
orders ||--|{ order_items   : "contains"       (one order, one or many items)
order_items }|--|| products : "references"    (many items reference one product)
```

**Cardinality symbols (Crow's Foot):**
- `||` — exactly one
- `|{` or `}|` — one or many
- `o{` or `}o` — zero or many
- `o|` or `|o` — zero or one

---

## Partitioning Strategy

| Table size | Strategy | When |
|---|---|---|
| < 10M rows | No partitioning | Indexes sufficient |
| 10M–1B rows | Range partition by date | Append-heavy, time-filtered queries |
| > 1B rows | Range + hash sub-partitioning | Very high volume |
| Multi-tenant | List partition by tenant_id | Tenant isolation required |

**Rule:** Partition on the column most commonly used in `WHERE` filters. Always include the partition key in queries or you'll scan all partitions.

---

## Schema Documentation Template

For each table, document:

```markdown
## table_name

**Purpose:** One sentence describing what this table represents and why it exists.
**Row grain:** One row per [X] — e.g. "one row per user per day"
**Upstream source:** Where does this data come from?
**Update pattern:** Append-only / SCD2 / upsert / full refresh

| Column | Type | Nullable | Description |
|---|---|---|---|
| user_id | UUID | N | FK to users.user_id |
| ... | | | |

**Key relationships:**
- `user_id` → `users.user_id`

**Known caveats:**
- [Any data quality issues, edge cases, or gotchas]
```
