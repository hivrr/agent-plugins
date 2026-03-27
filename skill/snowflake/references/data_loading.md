# Data Loading

---

## File Formats

```sql
-- CSV
CREATE OR REPLACE FILE FORMAT PROD_DW.UTILITY.CSV_FORMAT
  TYPE = 'CSV'
  FIELD_DELIMITER = ','
  SKIP_HEADER = 1
  NULL_IF = ('NULL', 'null', '')
  EMPTY_FIELD_AS_NULL = TRUE
  FIELD_OPTIONALLY_ENCLOSED_BY = '"'
  ERROR_ON_COLUMN_COUNT_MISMATCH = FALSE;

-- JSON (semi-structured)
CREATE OR REPLACE FILE FORMAT PROD_DW.UTILITY.JSON_FORMAT
  TYPE = 'JSON'
  STRIP_OUTER_ARRAY = TRUE
  IGNORE_UTF8_ERRORS = TRUE;

-- Parquet
CREATE OR REPLACE FILE FORMAT PROD_DW.UTILITY.PARQUET_FORMAT
  TYPE = 'PARQUET'
  SNAPPY_COMPRESSION = TRUE;
```

---

## Stages

```sql
-- External stage: S3 (requires STORAGE_INTEGRATION)
CREATE OR REPLACE STAGE PROD_DW.UTILITY.S3_DATA_STAGE
  STORAGE_INTEGRATION = s3_integration
  URL = 's3://my-bucket/data/'
  FILE_FORMAT = PROD_DW.UTILITY.CSV_FORMAT;

-- External stage: GCS
CREATE OR REPLACE STAGE PROD_DW.UTILITY.GCS_DATA_STAGE
  STORAGE_INTEGRATION = gcs_integration
  URL = 'gcs://my-bucket/data/'
  FILE_FORMAT = PROD_DW.UTILITY.JSON_FORMAT;

-- Internal stage (Snowflake-managed; good for smaller files or dev)
CREATE OR REPLACE STAGE PROD_DW.UTILITY.INTERNAL_STAGE
  FILE_FORMAT = PROD_DW.UTILITY.CSV_FORMAT;

-- List files in a stage
LIST @PROD_DW.UTILITY.S3_DATA_STAGE;
LIST @PROD_DW.UTILITY.S3_DATA_STAGE PATTERN = '.*users.*';

-- Upload to internal stage (SnowSQL or Python connector)
-- PUT file:///tmp/data/*.csv @PROD_DW.UTILITY.INTERNAL_STAGE AUTO_COMPRESS=TRUE;
```

---

## COPY INTO

```sql
-- Basic load from external stage
COPY INTO PROD_DW.BRONZE.USERS
  FROM @PROD_DW.UTILITY.S3_DATA_STAGE/users/
  FILE_FORMAT = PROD_DW.UTILITY.CSV_FORMAT
  ON_ERROR = 'CONTINUE'   -- Skip bad rows; use ABORT_STATEMENT to halt on first error
  PURGE = TRUE;           -- Delete source files after successful load

-- With explicit column mapping and type casting
COPY INTO PROD_DW.BRONZE.ORDERS (order_id, customer_id, amount, order_date)
  FROM (
    SELECT
      $1,
      $2,
      $3::FLOAT,
      $4::TIMESTAMP_NTZ
    FROM @PROD_DW.UTILITY.S3_DATA_STAGE/orders/
  )
  FILE_FORMAT = PROD_DW.UTILITY.CSV_FORMAT;

-- JSON into VARIANT column
COPY INTO PROD_DW.BRONZE.RAW_EVENTS (source_file, raw_data)
  FROM (
    SELECT METADATA$FILENAME, $1
    FROM @PROD_DW.UTILITY.S3_DATA_STAGE/events/
  )
  FILE_FORMAT = PROD_DW.UTILITY.JSON_FORMAT;

-- Force reload (re-load already-loaded files — use carefully)
COPY INTO PROD_DW.BRONZE.USERS
  FROM @PROD_DW.UTILITY.S3_DATA_STAGE/users/
  FORCE = TRUE;

-- Check load history
SELECT file_name, status, rows_loaded, errors_seen, first_error
FROM TABLE(INFORMATION_SCHEMA.COPY_HISTORY(
  TABLE_NAME => 'USERS',
  START_TIME => DATEADD(hours, -24, CURRENT_TIMESTAMP())
))
ORDER BY last_load_time DESC;
```

**ON_ERROR options:**
| Value | Behaviour |
|---|---|
| `CONTINUE` | Skip bad rows, continue loading |
| `SKIP_FILE` | Skip files with errors |
| `SKIP_FILE_<N>` | Skip file if more than N errors |
| `ABORT_STATEMENT` | Stop on first error (default) |

---

## Snowpipe (Continuous Auto-Ingest)

Snowpipe loads files automatically when they arrive in the stage. Uses SQS notifications (S3) or GCS/Azure equivalents.

```sql
-- Create pipe
CREATE OR REPLACE PIPE PROD_DW.BRONZE.EVENTS_PIPE
  AUTO_INGEST = TRUE
AS
  COPY INTO PROD_DW.BRONZE.RAW_EVENTS (source_file, raw_data)
  FROM (SELECT METADATA$FILENAME, $1 FROM @PROD_DW.UTILITY.S3_DATA_STAGE/events/)
  FILE_FORMAT = PROD_DW.UTILITY.JSON_FORMAT;

-- Get the SQS queue ARN — configure this in your S3 bucket event notifications
SHOW PIPES LIKE 'EVENTS_PIPE';
-- notification_channel column contains the SQS ARN

-- Check pipe status
SELECT SYSTEM$PIPE_STATUS('PROD_DW.BRONZE.EVENTS_PIPE');

-- Snowpipe load history
SELECT file_name, status, rows_loaded, error_count, first_commit_time
FROM TABLE(INFORMATION_SCHEMA.COPY_HISTORY(
  TABLE_NAME => 'RAW_EVENTS',
  START_TIME => DATEADD(hours, -1, CURRENT_TIMESTAMP())
))
WHERE pipe_catalog_name IS NOT NULL
ORDER BY first_commit_time DESC;

-- Manually trigger pipe for files already in stage (catch-up)
ALTER PIPE PROD_DW.BRONZE.EVENTS_PIPE REFRESH;
```

---

## Programmatic Loading (Node.js)

```typescript
import { pool } from './snowflake/pool';
import { query } from './snowflake/query';

async function loadDataFromStage(
  tableName: string,
  stagePath: string,
  fileFormat: string = 'PROD_DW.UTILITY.CSV_FORMAT'
): Promise<{ filesLoaded: number; rowsLoaded: number; errors: number }> {
  return pool.withConnection(async (conn) => {
    const result = await query(conn, `
      COPY INTO ${tableName}
        FROM @${stagePath}
        FILE_FORMAT = ${fileFormat}
        ON_ERROR = 'CONTINUE'
        FORCE = FALSE
    `);

    let filesLoaded = 0, rowsLoaded = 0, errors = 0;
    for (const row of result.rows) {
      filesLoaded++;
      rowsLoaded += row.rows_loaded || 0;
      errors += row.errors_seen || 0;
      if (row.errors_seen > 0) {
        console.warn(`File: ${row.file} — ${row.errors_seen} errors. First: ${row.first_error}`);
      }
    }
    return { filesLoaded, rowsLoaded, errors };
  });
}
```

---

## Programmatic Loading (Python)

```python
# Python connector PUT + COPY
import snowflake.connector
import os

def upload_and_load(
    local_file: str,
    stage_name: str,
    table_name: str,
    conn_params: dict
) -> dict:
    conn = snowflake.connector.connect(**conn_params)
    cur = conn.cursor()
    try:
        # Upload to internal stage
        cur.execute(f"PUT file://{local_file} @{stage_name} AUTO_COMPRESS=TRUE OVERWRITE=TRUE")

        # Load from stage
        cur.execute(f"""
            COPY INTO {table_name}
              FROM @{stage_name}
              FILE_FORMAT = PROD_DW.UTILITY.CSV_FORMAT
              ON_ERROR = 'CONTINUE'
              PURGE = TRUE
        """)
        rows = cur.fetchall()
        return {
            "files": len(rows),
            "rows_loaded": sum(r[3] for r in rows),
            "errors": sum(r[5] for r in rows)
        }
    finally:
        cur.close()
        conn.close()
```

---

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| Insufficient privileges on stage | Role lacks USAGE on stage | `GRANT USAGE ON STAGE x TO ROLE y` |
| File not found | Wrong stage path or pattern | `LIST @stage` to verify files exist |
| Column count mismatch | Schema changed or wrong format | Set `ERROR_ON_COLUMN_COUNT_MISMATCH = FALSE` or fix the file |
| Files already loaded | COPY deduplication (by file name + load time) | Use `FORCE = TRUE` to reload; or purge and re-upload with a new name |
| Pipe not ingesting | Missing S3 event notification | Get SQS ARN from `SHOW PIPES`, configure S3 bucket events |
