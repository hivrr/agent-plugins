# Common Errors

---

## 002003 (42S02): Object Does Not Exist

```
SQL compilation error: Object 'MY_DB.MY_SCHEMA.USERS' does not exist or not authorized.
```

**Causes:** table doesn't exist, wrong database/schema context, or role lacks privileges.

```sql
-- Check current context
SELECT CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_ROLE();

-- Verify the object exists
SHOW TABLES LIKE 'USERS' IN SCHEMA MY_DB.MY_SCHEMA;

-- Grant access if the object exists but the role can't see it
GRANT SELECT ON TABLE MY_DB.MY_SCHEMA.USERS TO ROLE MY_ROLE;

-- Use fully-qualified names to avoid context issues
SELECT * FROM MY_DB.MY_SCHEMA.USERS;
```

---

## 000606: No Active Warehouse

```
SQL execution error: No active warehouse selected in the current session.
```

```sql
-- Set for the session
USE WAREHOUSE ANALYTICS_WH;

-- Or set in connection config: warehouse: 'ANALYTICS_WH'

-- Check the warehouse exists and auto-resume is on
SHOW WAREHOUSES LIKE 'ANALYTICS_WH';
-- If SUSPENDED + AUTO_RESUME = TRUE, it will start on next query
```

---

## 390100: Incorrect Username or Password

```
Incorrect username or password was specified.
```

```bash
# Verify env vars are set correctly
echo $SNOWFLAKE_ACCOUNT   # Should be 'orgname-accountname' NOT the full URL
echo $SNOWFLAKE_USER

# Test with SnowSQL
snowsql -a $SNOWFLAKE_ACCOUNT -u $SNOWFLAKE_USER

# Common mistake — wrong account format:
# Wrong: myaccount.us-east-1.snowflakecomputing.com
# Right: myorg-myaccount
```

---

## 390144: JWT Token Invalid (Key Pair Auth)

```
JWT token is invalid.
```

```bash
# Verify the public key is assigned to the user
# Run in Snowflake: DESC USER my_user;
# Check RSA_PUBLIC_KEY column is populated

# Regenerate key pair if needed
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub

# Assign public key (strip header/footer and newlines first)
# ALTER USER my_user SET RSA_PUBLIC_KEY='MIIBIjANBgkqhkiG9w...';
```

---

## 001003: SQL Compilation / Syntax Error

```
SQL compilation error: syntax error line X at position Y unexpected 'TOKEN'.
```

**Common causes:**

```sql
-- Reserved word used as identifier — use double quotes
SELECT order FROM orders;         -- ❌  'order' is reserved
SELECT "order" FROM orders;       -- ✅

-- Wrong date part quoting (Snowflake doesn't quote date parts)
DATEADD('day', 1, col)            -- ❌
DATEADD(day, 1, col)              -- ✅

-- Missing semicolons in multi-statement mode
SELECT 1 SELECT 2;                -- ❌
SELECT 1; SELECT 2;               -- ✅
```

---

## 100038: Statement Timeout

```
Statement reached its statement or warehouse timeout of X second(s).
```

```sql
-- Increase timeout for session
ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = 3600;

-- Or per warehouse
ALTER WAREHOUSE ANALYTICS_WH SET STATEMENT_TIMEOUT_IN_SECONDS = 3600;

-- Find slow queries to optimise
SELECT query_id, SUBSTR(query_text, 1, 100) AS query_preview,
       total_elapsed_time / 1000             AS elapsed_sec,
       bytes_scanned / 1e9                   AS gb_scanned,
       partitions_scanned, partitions_total
FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY())
WHERE execution_status = 'FAIL'
  AND error_code = '100038'
ORDER BY start_time DESC LIMIT 10;
```

---

## 100035: Result Too Large / Out of Memory

```
Results exceed the allowed data size.
```

```typescript
// Node.js — use streaming instead of buffering all rows
connection.execute({
  sqlText: 'SELECT * FROM large_table',
  streamResult: true,
  complete: (err, stmt) => {
    const stream = stmt.streamRows();
    stream.on('data', (row) => processRow(row));
    stream.on('end', () => console.log('Done'));
  },
});
```

```python
# Python — use fetchmany() in batches
cursor.execute("SELECT * FROM large_table")
while True:
    rows = cursor.fetchmany(10_000)
    if not rows:
        break
    process_batch(rows)
```

---

## Node.js: Connection Errors

```
Error: connect ECONNREFUSED
Error: getaddrinfo ENOTFOUND
```

```typescript
// Wrong account format — most common cause
const conn = snowflake.createConnection({
  account: 'myaccount.us-east-1.snowflakecomputing.com',  // ❌
  account: 'myorg-myaccount',                              // ✅
});

// Enable debug logging to diagnose
snowflake.configure({ logLevel: 'DEBUG' });
```

Snowflake requires outbound HTTPS (port 443) to `*.snowflakecomputing.com`. Check firewall and proxy rules if in a restricted network.

---

## Python: OperationalError 250001

```python
# snowflake.connector.errors.OperationalError: 250001
# Could not connect to Snowflake backend after retries.

# Test with a minimal connection and short timeout
import snowflake.connector
try:
    conn = snowflake.connector.connect(
        account='myorg-myaccount',
        user=os.environ['SNOWFLAKE_USER'],
        password=os.environ['SNOWFLAKE_PASSWORD'],
        login_timeout=10,
    )
    print("Connected")
except Exception as e:
    print(f"Failed: {e}")
```

---

## Quick Diagnostic Script

```bash
#!/bin/bash
echo "=== Snowflake Connection Diagnostic ==="
echo "Account:   ${SNOWFLAKE_ACCOUNT:-NOT SET}"
echo "User:      ${SNOWFLAKE_USER:-NOT SET}"
echo "Password:  ${SNOWFLAKE_PASSWORD:+SET (hidden)}"
echo "Warehouse: ${SNOWFLAKE_WAREHOUSE:-NOT SET}"
echo "Database:  ${SNOWFLAKE_DATABASE:-NOT SET}"
echo ""

echo "Connectivity test:"
curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" \
  "https://${SNOWFLAKE_ACCOUNT:-unknown}.snowflakecomputing.com/session/v1/login-request"

echo ""
echo "Driver versions:"
npm list snowflake-sdk 2>/dev/null | grep snowflake-sdk || echo "Node.js driver: not installed"
pip show snowflake-connector-python 2>/dev/null | grep Version || echo "Python connector: not installed"
```

---

## Error Code Quick Reference

| Code | Message | Quick fix |
|---|---|---|
| 002003 | Object does not exist or not authorized | Check context (`USE DB/SCHEMA`), grant access |
| 000606 | No active warehouse | `USE WAREHOUSE x;` or set in connection |
| 390100 | Incorrect username or password | Check account format: `orgname-accountname` |
| 390114 | Connection token expired | Reconnect; retryable |
| 390144 | JWT token invalid | Regenerate key pair, re-assign public key |
| 001003 | SQL compilation/syntax error | Check reserved words, date part quoting |
| 100038 | Statement timeout | Increase timeout or optimise query |
| 100035 | Result too large | Use streaming (`streamResult: true`) |
