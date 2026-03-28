#!/usr/bin/env node

/**
 * PostgreSQL Query Runner
 *
 * Usage:
 *   node .claude/skills/postgres-query/query.mjs "SELECT * FROM \"User\" LIMIT 5"
 *   node .claude/skills/postgres-query/query.mjs --explain "SELECT * FROM \"User\" WHERE id = 1"
 *   node .claude/skills/postgres-query/query.mjs --writable "UPDATE ..." (requires explicit flag)
 *   node .claude/skills/postgres-query/query.mjs --file query.sql
 *   node .claude/skills/postgres-query/query.mjs --timeout 60 "SELECT ..." (override 30s default)
 *
 * Options:
 *   --explain       Run EXPLAIN ANALYZE on the query
 *   --writable      Use the primary database (DATABASE_URL) instead of replica
 *   --timeout <s>   Query timeout in seconds (default: 30)
 *   --file, -f      Read query from a file
 *   --json          Output results as JSON
 *   --quiet, -q     Only output results, no headers
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env files (skill-specific first, then project root as fallback)
const __dirname = dirname(fileURLToPath(import.meta.url));
const skillDir = __dirname;
const projectRoot = resolve(__dirname, '../../..');

// Simple .env parser (avoid external dependencies)
function loadEnv() {
  const envFiles = [
    resolve(skillDir, '.env'),      // Skill-specific (priority)
    resolve(projectRoot, '.env'),   // Project root (fallback)
  ];

  let loaded = false;
  for (const envPath of envFiles) {
    try {
      const envContent = readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex);
        let value = trimmed.slice(eqIndex + 1);
        // Strip surrounding single or double quotes (standard .env convention)
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      loaded = true;
    } catch (e) {
      // File not found, continue to next
    }
  }

  if (!loaded) {
    console.error('Warning: Could not load any .env file');
  }
}

loadEnv();

const { Client } = pg;

const DEFAULT_TIMEOUT_SECONDS = 30;

// Parse arguments
const args = process.argv.slice(2);
let query = '';
let explain = false;
let writable = false;
let jsonOutput = false;
let quiet = false;
let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--explain') {
    explain = true;
  } else if (arg === '--writable') {
    writable = true;
  } else if (arg === '--json') {
    jsonOutput = true;
  } else if (arg === '--quiet' || arg === '-q') {
    quiet = true;
  } else if (arg === '--timeout' || arg === '-t') {
    const val = args[++i];
    const parsed = parseInt(val, 10);
    if (!val || isNaN(parsed) || parsed < 1) {
      console.error('Error: --timeout requires a positive integer (seconds, minimum 1)');
      process.exit(1);
    }
    timeoutSeconds = parsed;
  } else if (arg === '--file' || arg === '-f') {
    const filePath = args[++i];
    if (!filePath) {
      console.error('Error: --file requires a path argument');
      process.exit(1);
    }
    const safeBase = resolve(process.cwd());
    const resolvedPath = resolve(safeBase, filePath);
    if (!resolvedPath.startsWith(safeBase + '/') && resolvedPath !== safeBase) {
      console.error('Error: --file path must be within the current working directory');
      process.exit(1);
    }
    query = readFileSync(resolvedPath, 'utf-8');
  } else if (!arg.startsWith('-')) {
    query = arg;
  }
}

if (!query) {
  console.error(`Usage: node query.mjs [options] "SQL query"

Options:
  --explain       Run EXPLAIN ANALYZE on the query
  --writable      Use primary database (requires explicit permission)
  --timeout <s>   Query timeout in seconds (default: ${DEFAULT_TIMEOUT_SECONDS})
  --file, -f      Read query from a file
  --json          Output results as JSON
  --quiet, -q     Minimal output

Examples:
  node query.mjs "SELECT id, username FROM \\"User\\" LIMIT 5"
  node query.mjs --explain "SELECT * FROM \\"Model\\" WHERE id = 1"
  node query.mjs --timeout 60 "SELECT ... (long running query)"
  node query.mjs -f my-query.sql`);
  process.exit(1);
}

// Select connection string
const connectionString = writable
  ? process.env.DATABASE_URL
  : (process.env.DATABASE_REPLICA_URL || process.env.DATABASE_URL);

if (!connectionString) {
  console.error('Error: No database connection string found in environment');
  process.exit(1);
}

// Safety check for writable operations
if (!writable) {
  // Strip leading block comments (/* ... */) and line comments (-- ...) before checking
  let strippedQuery = query.trim();
  // Remove leading block comments
  while (strippedQuery.startsWith('/*')) {
    const end = strippedQuery.indexOf('*/');
    if (end === -1) break;
    strippedQuery = strippedQuery.slice(end + 2).trim();
  }
  // Remove leading line comments
  while (strippedQuery.startsWith('--')) {
    const end = strippedQuery.indexOf('\n');
    if (end === -1) { strippedQuery = ''; break; }
    strippedQuery = strippedQuery.slice(end + 1).trim();
  }
  const upperQuery = strippedQuery.toUpperCase();
  // Include WITH to block CTE-wrapped write statements (e.g. WITH x AS (DELETE ...) SELECT ...)
  // Include GRANT/REVOKE (privilege escalation), COPY (OS command risk), DO/CALL (arbitrary execution)
  const writeOps = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE',
    'GRANT', 'REVOKE', 'COPY', 'DO', 'CALL', 'WITH',
  ];
  for (const op of writeOps) {
    if (upperQuery.startsWith(op + ' ') || upperQuery.startsWith(op + '\n') ||
        upperQuery.startsWith(op + '\t') || upperQuery === op) {
      console.error(`Error: Write or privileged operation detected (${op}). Use --writable flag to confirm.`);
      console.error('This requires explicit user permission as it modifies the database.');
      process.exit(1);
    }
  }
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    statement_timeout: timeoutSeconds * 1000,
    query_timeout: timeoutSeconds * 1000,
  });

  try {
    await client.connect();

    if (!quiet) {
      const dbType = writable ? 'PRIMARY (writable)' : 'REPLICA (read-only)';
      console.error(`Connected to ${dbType} (timeout: ${timeoutSeconds}s)\n`);
    }

    const finalQuery = explain ? `EXPLAIN ANALYZE ${query}` : query;
    const start = Date.now();
    const result = await client.query(finalQuery);
    const elapsed = Date.now() - start;

    if (jsonOutput) {
      console.log(JSON.stringify({
        rows: result.rows,
        rowCount: result.rowCount,
        elapsed,
        fields: result.fields?.map(f => f.name)
      }, null, 2));
    } else if (explain) {
      const planKey = result.fields[0].name;
      console.log(result.rows.map(r => r[planKey]).join('\n'));
      if (!quiet) {
        console.error(`\nQuery time: ${elapsed}ms`);
      }
    } else {
      if (!quiet && result.fields) {
        console.log('Columns:', result.fields.map(f => f.name).join(', '));
        console.log('─'.repeat(60));
      }

      if (result.rows.length === 0) {
        console.log('(no rows returned)');
      } else {
        for (const row of result.rows) {
          console.log(row);
        }
      }

      if (!quiet) {
        console.error(`\n${result.rowCount} row(s) in ${elapsed}ms`);
      }
    }
  } catch (err) {
    if (err.message.includes('timeout') || err.message.includes('canceling statement')) {
      console.error(`Error: Query timed out after ${timeoutSeconds} seconds`);
      console.error('Use --timeout <seconds> to increase the limit if needed.');
    } else {
      console.error('Query error:', err.message);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
