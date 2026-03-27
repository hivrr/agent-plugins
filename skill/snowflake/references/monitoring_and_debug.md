# Monitoring & Debug

---

## Query Diagnostics

### Find a specific query

```sql
SELECT
    query_id,
    query_text,
    execution_status,
    error_code,
    error_message,
    start_time,
    end_time,
    total_elapsed_time / 1000  AS elapsed_sec,
    bytes_scanned / 1e9        AS gb_scanned,
    partitions_scanned,
    partitions_total,
    compilation_time,
    execution_time,
    warehouse_name,
    warehouse_size,
    user_name,
    role_name
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE query_id = '<paste-query-id>';
```

### Recent failures

```sql
SELECT
    query_id,
    SUBSTR(query_text, 1, 200) AS query_preview,
    error_code,
    error_message,
    start_time,
    user_name,
    role_name,
    warehouse_name
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE execution_status = 'FAIL'
  AND start_time >= DATEADD(hours, -24, CURRENT_TIMESTAMP())
ORDER BY start_time DESC
LIMIT 20;
```

### Slow queries (> 60 seconds)

```sql
SELECT
    query_id,
    SUBSTR(query_text, 1, 200) AS query_preview,
    total_elapsed_time / 1000  AS elapsed_sec,
    bytes_scanned / 1e9        AS gb_scanned,
    partitions_scanned,
    partitions_total,
    ROUND(100 * partitions_scanned / NULLIF(partitions_total, 0), 1) AS partition_pct,
    warehouse_name,
    warehouse_size
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE total_elapsed_time > 60_000
  AND start_time >= DATEADD(hours, -24, CURRENT_TIMESTAMP())
ORDER BY total_elapsed_time DESC
LIMIT 10;
```

### High bytes scanned (expensive queries)

```sql
SELECT
    query_id,
    SUBSTR(query_text, 1, 200) AS query_preview,
    bytes_scanned / 1e9        AS gb_scanned,
    total_elapsed_time / 1000  AS elapsed_sec,
    user_name,
    warehouse_name
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= DATEADD(hours, -24, CURRENT_TIMESTAMP())
  AND bytes_scanned > 1e10   -- More than 10 GB
ORDER BY bytes_scanned DESC
LIMIT 10;
```

---

## Warehouse Diagnostics

### Warehouse load (queued queries = undersized warehouse)

```sql
-- avg_queued_load > 0 means queries are waiting for the warehouse
SELECT
    warehouse_name,
    start_time,
    avg_running,
    avg_queued_load,
    avg_queued_provisioning,
    avg_blocked
FROM TABLE(INFORMATION_SCHEMA.WAREHOUSE_LOAD_HISTORY(
    DATE_RANGE_START => DATEADD(hours, -4, CURRENT_TIMESTAMP())
))
WHERE avg_queued_load > 0
ORDER BY start_time DESC;
```

### Credit consumption by warehouse (last 7 days)

```sql
SELECT
    warehouse_name,
    SUM(credits_used)               AS total_credits,
    SUM(credits_used_compute)       AS compute_credits,
    SUM(credits_used_cloud_services) AS cloud_credits,
    ROUND(SUM(credits_used) * 3, 2) AS est_cost_usd  -- Adjust rate as needed
FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
WHERE start_time >= DATEADD(days, -7, CURRENT_TIMESTAMP())
GROUP BY warehouse_name
ORDER BY total_credits DESC;
```

### Top credit consumers by user (last 7 days)

```sql
SELECT
    user_name,
    COUNT(*)                        AS query_count,
    SUM(credits_used_cloud_services) AS cloud_credits,
    SUM(total_elapsed_time) / 1000  AS total_elapsed_sec
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= DATEADD(days, -7, CURRENT_TIMESTAMP())
  AND execution_status = 'SUCCESS'
GROUP BY user_name
ORDER BY cloud_credits DESC
LIMIT 20;
```

---

## Connection & Session Diagnostics

### Active sessions

```sql
SELECT
    session_id,
    user_name,
    created_on,
    client_application_id,
    client_environment
FROM TABLE(INFORMATION_SCHEMA.SESSIONS())
ORDER BY created_on DESC;
```

### Login failures (last 24 hours)

```sql
SELECT
    event_timestamp,
    user_name,
    client_ip,
    reported_client_type,
    error_code,
    error_message,
    is_success
FROM SNOWFLAKE.ACCOUNT_USAGE.LOGIN_HISTORY
WHERE event_timestamp >= DATEADD(hours, -24, CURRENT_TIMESTAMP())
  AND is_success = 'NO'
ORDER BY event_timestamp DESC;
```

---

## Pipeline Diagnostics

### Task history with duration

```sql
SELECT
    name,
    state,
    error_message,
    scheduled_time,
    completed_time,
    DATEDIFF('second', scheduled_time, completed_time) AS duration_sec
FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY(
    SCHEDULED_TIME_RANGE_START => DATEADD(hours, -24, CURRENT_TIMESTAMP())
))
ORDER BY scheduled_time DESC;
```

### Stream consumption check

```sql
-- View stream contents without consuming (for debugging)
SELECT COUNT(*) FROM orders_stream;         -- How many records are pending?
SHOW STREAMS LIKE '%_STREAM';               -- Check stale status for all streams
```

### Snowpipe load rate

```sql
SELECT
    pipe_name,
    COUNT(*)                   AS files_loaded,
    SUM(row_count)             AS rows_loaded,
    SUM(error_count)           AS errors,
    MIN(first_commit_time)     AS first_load,
    MAX(first_commit_time)     AS last_load
FROM TABLE(INFORMATION_SCHEMA.COPY_HISTORY(
    TABLE_NAME => 'RAW_EVENTS',
    START_TIME => DATEADD(hours, -1, CURRENT_TIMESTAMP())
))
WHERE pipe_catalog_name IS NOT NULL
GROUP BY pipe_name;
```

---

## Debug Bundle Script

Collect diagnostic info for Snowflake support tickets. Redacts all credentials automatically.

```bash
#!/bin/bash
# snowflake-debug-bundle.sh
set -euo pipefail

BUNDLE_DIR="snowflake-debug-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BUNDLE_DIR"

{
  echo "=== Snowflake Debug Bundle ==="
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "--- Environment ---"
  echo "SNOWFLAKE_ACCOUNT:   ${SNOWFLAKE_ACCOUNT:-NOT SET}"
  echo "SNOWFLAKE_USER:      ${SNOWFLAKE_USER:-NOT SET}"
  echo "SNOWFLAKE_WAREHOUSE: ${SNOWFLAKE_WAREHOUSE:-NOT SET}"
  echo "SNOWFLAKE_DATABASE:  ${SNOWFLAKE_DATABASE:-NOT SET}"
  echo ""
  echo "--- Runtime ---"
  node --version 2>&1 || true
  python3 --version 2>&1 || true
  echo ""
  echo "--- Driver Versions ---"
  npm list snowflake-sdk 2>/dev/null | grep snowflake || echo "Node.js driver: not installed"
  pip show snowflake-connector-python 2>/dev/null | grep -E "Name|Version" || echo "Python connector: not installed"
} > "$BUNDLE_DIR/summary.txt"

# Connectivity test
echo "--- Connectivity ---" >> "$BUNDLE_DIR/summary.txt"
curl -s -o /dev/null -w "Status: %{http_code}, Time: %{time_total}s\n" \
  "https://${SNOWFLAKE_ACCOUNT:-unknown}.snowflakecomputing.com/" \
  >> "$BUNDLE_DIR/summary.txt" 2>&1 || echo "Connectivity test failed" >> "$BUNDLE_DIR/summary.txt"

# Redacted app logs
if [ -f "logs/app.log" ]; then
  grep -i "snowflake\|error\|timeout\|connection" logs/app.log 2>/dev/null \
    | tail -200 \
    | sed -E 's/(password|token|key|secret)=[^ &"]*/\1=***REDACTED***/gi' \
    > "$BUNDLE_DIR/app-logs-redacted.txt"
fi

# Redacted config
if [ -f ".env" ]; then
  sed -E 's/=.*/=***REDACTED***/' .env > "$BUNDLE_DIR/config-redacted.txt"
fi

tar -czf "$BUNDLE_DIR.tar.gz" "$BUNDLE_DIR"
rm -rf "$BUNDLE_DIR"
echo "Bundle created: $BUNDLE_DIR.tar.gz"
echo "Review for PII before sending to Snowflake Support."
```

---

## What to Include in a Support Ticket

| Item | Where to find it | Why it helps |
|---|---|---|
| Account identifier | `SELECT CURRENT_ACCOUNT()` | Routes to the right team |
| Query ID | Error message or QUERY_HISTORY | Snowflake can pull the full execution trace |
| Error code | Error message | Narrows the cause category |
| Timestamps (UTC) | Error message | Correlates with backend logs |
| Warehouse name + size | QUERY_HISTORY | Identifies resource context |
| Driver version | `npm list snowflake-sdk` | Rules out known driver bugs |

**Always redact:** passwords, private keys, OAuth tokens, PII, customer data.
**Safe to include:** error codes, query IDs, query text (if no PII), timestamps, warehouse names, schema names.
