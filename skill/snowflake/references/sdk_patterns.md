# Snowflake SDK Patterns

Production-ready patterns for `snowflake-sdk` (Node.js) and `snowflake-connector-python`.

---

## Node.js: Connection Pool

The Snowflake Node.js driver is callback-based. Wrap it in promises and pool connections.

```typescript
// src/snowflake/pool.ts
import snowflake from 'snowflake-sdk';

interface PoolConfig {
  max: number;
  idleTimeoutMs: number;
}

class SnowflakePool {
  private pool: snowflake.Connection[] = [];
  private available: snowflake.Connection[] = [];
  private waiting: ((conn: snowflake.Connection) => void)[] = [];
  private config: PoolConfig;

  constructor(
    private connConfig: snowflake.ConnectionOptions,
    config: Partial<PoolConfig> = {}
  ) {
    this.config = { max: 10, idleTimeoutMs: 60_000, ...config };
  }

  async acquire(): Promise<snowflake.Connection> {
    if (this.available.length > 0) return this.available.pop()!;
    if (this.pool.length < this.config.max) {
      const conn = snowflake.createConnection(this.connConfig);
      await new Promise<void>((resolve, reject) => {
        conn.connect((err) => (err ? reject(err) : resolve()));
      });
      this.pool.push(conn);
      return conn;
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  release(conn: snowflake.Connection): void {
    if (this.waiting.length > 0) {
      this.waiting.shift()!(conn);
    } else {
      this.available.push(conn);
    }
  }

  async withConnection<T>(fn: (conn: snowflake.Connection) => Promise<T>): Promise<T> {
    const conn = await this.acquire();
    try {
      return await fn(conn);
    } finally {
      this.release(conn);
    }
  }

  async destroy(): Promise<void> {
    await Promise.all(
      this.pool.map(
        (conn) => new Promise<void>((resolve) => conn.destroy((err) => resolve()))
      )
    );
    this.pool = [];
    this.available = [];
  }
}

// Singleton — one pool per process
export const pool = new SnowflakePool({
  account:   process.env.SNOWFLAKE_ACCOUNT!,   // orgname-accountname
  username:  process.env.SNOWFLAKE_USER!,
  password:  process.env.SNOWFLAKE_PASSWORD!,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'ANALYTICS_WH',
  database:  process.env.SNOWFLAKE_DATABASE!,
  schema:    process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
});
```

---

## Node.js: Promise-Based Query Helper

```typescript
// src/snowflake/query.ts
import snowflake from 'snowflake-sdk';

interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  statement: snowflake.Statement;
  sqlText: string;
}

export function query<T = Record<string, unknown>>(
  conn: snowflake.Connection,
  sqlText: string,
  binds?: snowflake.Binds
): Promise<QueryResult<T>> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => {
        if (err) reject(Object.assign(err, { sqlText }));
        else resolve({ rows: (rows || []) as T[], statement: stmt, sqlText });
      },
    });
  });
}

// Execute multiple statements sequentially
export async function multiQuery(
  conn: snowflake.Connection,
  statements: string[]
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];
  for (const sql of statements) {
    results.push(await query(conn, sql));
  }
  return results;
}

// Usage
const { rows } = await pool.withConnection((conn) =>
  query<{ USER_ID: number; EMAIL: string }>(
    conn,
    'SELECT user_id, email FROM users WHERE status = ?',
    ['active']
  )
);
```

---

## Node.js: Streaming Large Result Sets

For results > 100K rows, stream instead of loading into memory.

```typescript
// src/snowflake/stream.ts
export async function* streamQuery<T = Record<string, unknown>>(
  conn: snowflake.Connection,
  sqlText: string,
  binds?: snowflake.Binds
): AsyncGenerator<T> {
  const stmt = await new Promise<snowflake.Statement>((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      streamResult: true,
      complete: (err, stmt) => {
        if (err) reject(err);
        else resolve(stmt);
      },
    });
  });

  const stream = stmt.streamRows();
  for await (const row of stream) {
    yield row as T;
  }
}

// Usage — constant memory regardless of result size
async function exportLargeTable(): Promise<void> {
  await pool.withConnection(async (conn) => {
    let count = 0;
    for await (const row of streamQuery(conn, 'SELECT * FROM prod_dw.silver.events')) {
      await writeToFile(row);
      count++;
      if (count % 10_000 === 0) console.log(`Processed ${count} rows`);
    }
  });
}
```

---

## Node.js: Error Handling with Retry

```typescript
// src/snowflake/errors.ts
export class SnowflakeQueryError extends Error {
  constructor(
    message: string,
    public readonly sqlState: string,
    public readonly code: number,
    public readonly sqlText: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'SnowflakeQueryError';
  }
}

// These codes indicate transient failures — safe to retry
const RETRYABLE_CODES = new Set([
  390114, // Connection token expired — reconnect
  390503, // Service temporarily unavailable
]);

export async function safeQuery<T>(
  conn: snowflake.Connection,
  sqlText: string,
  binds?: snowflake.Binds,
  maxRetries = 3
): Promise<T[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { rows } = await query<T>(conn, sqlText, binds);
      return rows;
    } catch (err: any) {
      const retryable = RETRYABLE_CODES.has(err.code);
      if (!retryable || attempt === maxRetries) {
        throw new SnowflakeQueryError(
          err.message, err.sqlState, err.code, sqlText, retryable
        );
      }
      const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.warn(`Snowflake error ${err.code} (attempt ${attempt}). Retrying in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}
```

---

## Python: Context Manager Pool

```python
# src/snowflake_pool.py
import os
import snowflake.connector
from contextlib import contextmanager
from typing import Any, Generator

class SnowflakePool:
    def __init__(self, **conn_params):
        self._params = conn_params

    @contextmanager
    def connection(self) -> Generator[snowflake.connector.SnowflakeConnection, None, None]:
        conn = snowflake.connector.connect(**self._params)
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def cursor(self) -> Generator[snowflake.connector.cursor.SnowflakeCursor, None, None]:
        with self.connection() as conn:
            cur = conn.cursor(snowflake.connector.DictCursor)  # Returns dicts, not tuples
            try:
                yield cur
            finally:
                cur.close()

    def execute(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        with self.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def execute_many(self, sql: str, params_list: list[tuple]) -> int:
        """Batch insert — far faster than individual inserts."""
        with self.cursor() as cur:
            cur.executemany(sql, params_list)
            return cur.rowcount

    def stream(self, sql: str, params: tuple = (), batch_size: int = 10_000):
        """Yield rows in batches — memory-safe for large results."""
        with self.cursor() as cur:
            cur.execute(sql, params)
            while True:
                rows = cur.fetchmany(batch_size)
                if not rows:
                    break
                yield from rows


# Singleton
pool = SnowflakePool(
    account=os.environ['SNOWFLAKE_ACCOUNT'],   # orgname-accountname
    user=os.environ['SNOWFLAKE_USER'],
    password=os.environ['SNOWFLAKE_PASSWORD'],
    warehouse=os.environ.get('SNOWFLAKE_WAREHOUSE', 'ANALYTICS_WH'),
    database=os.environ['SNOWFLAKE_DATABASE'],
    schema=os.environ.get('SNOWFLAKE_SCHEMA', 'PUBLIC'),
)

# Usage
users = pool.execute("SELECT * FROM users WHERE status = %s", ('active',))

# Batch insert
rows = [('user1', 'a@example.com'), ('user2', 'b@example.com')]
pool.execute_many("INSERT INTO users (name, email) VALUES (%s, %s)", rows)

# Stream large table
for row in pool.stream("SELECT * FROM prod_dw.silver.events"):
    process(row)
```

---

## Python: Key Pair Authentication (Recommended for Service Accounts)

Never use password auth for service accounts in production. Use key pair auth.

```python
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
import snowflake.connector

def load_private_key(key_path: str, passphrase: str | None = None) -> bytes:
    with open(key_path, 'rb') as f:
        private_key = serialization.load_pem_private_key(
            f.read(),
            password=passphrase.encode() if passphrase else None,
            backend=default_backend()
        )
    return private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

conn = snowflake.connector.connect(
    account=os.environ['SNOWFLAKE_ACCOUNT'],
    user=os.environ['SNOWFLAKE_USER'],
    private_key=load_private_key('/path/to/rsa_key.p8'),
    warehouse='ETL_WH',
    database='PROD_DW',
    schema='SILVER',
)
```

---

## Connection Configuration Reference

```typescript
// Node.js — full config
const connConfig: snowflake.ConnectionOptions = {
  account:   'myorg-myaccount',          // orgname-accountname format (NOT the full URL)
  username:  'svc_pipeline',
  password:  process.env.SNOWFLAKE_PASSWORD,
  warehouse: 'ETL_WH',
  database:  'PROD_DW',
  schema:    'SILVER',
  role:      'SVC_ETL',
  application: 'my-pipeline-service',    // Visible in QUERY_HISTORY for attribution
  timeout:   60,                         // Connection timeout (seconds)
};
```

```bash
# Environment variables
SNOWFLAKE_ACCOUNT=myorg-myaccount        # NOT the full URL
SNOWFLAKE_USER=svc_pipeline
SNOWFLAKE_PASSWORD=...                   # Or use key pair auth
SNOWFLAKE_WAREHOUSE=ETL_WH
SNOWFLAKE_DATABASE=PROD_DW
SNOWFLAKE_SCHEMA=SILVER
```
