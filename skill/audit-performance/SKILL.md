---
name: audit-performance
description: Scan codebase for performance bottlenecks and optimization opportunities
license: MIT
compatibility: opencode
---

# Performance Audit

Scan the codebase for performance bottlenecks and optimization opportunities through static analysis.

---

## What to Scan

**Quick mode** — prioritize these files:
1. Database query files, repositories, and data access layers (ORM models, SQL patterns)
2. High-traffic React/Vue/Svelte components (pages, layouts)
3. `package.json` and application entry points
4. API route handlers

**Deep mode** — also scan all component files, state management, build config, and asset directories.

If no file index was provided, use Glob to discover relevant files.

---

## What to Look For

### Database Performance
- **N+1 queries**: Database calls inside loops — a `map()` or `forEach()` that `await`s a query on each iteration
- **Missing pagination**: Queries that fetch all records with no `LIMIT` or page size
- **Over-fetching**: `SELECT *` when only a few specific columns are needed, or eager-loading relations that aren't used
- **Missing indexes** (inferred): Frequent `WHERE` or `ORDER BY` on columns that look unindexed based on query patterns

### React Rendering
- **Missing memoization**: Expensive calculations inside render without `useMemo`; components that re-render unnecessarily and could use `React.memo`
- **Inline functions in JSX**: Arrow functions defined directly in `onClick`, `onChange`, or similar props — these create new function references on every render, causing child component re-renders
- **Missing or incorrect dependency arrays**: `useEffect` or `useCallback` with empty `[]` when they depend on values that change, or missing `[]` entirely
- **State updates in loops**: Calling `setState` inside `map` or `forEach`, triggering multiple renders instead of batching

### Bundle Size
- **Heavy libraries imported entirely**: `import _ from 'lodash'` instead of `import { debounce } from 'lodash'`; `moment.js` (suggest `dayjs` or `date-fns`)
- **Missing code splitting**: Large components or entire routes loaded eagerly instead of using `React.lazy` and dynamic imports
- **Overlapping utility libraries**: Multiple packages that do the same thing (e.g., two date libraries, two HTTP clients)

### Assets
- **Images without an optimization pipeline**: Image tags or references with no CDN transforms, no `?w=` sizing params, and no use of optimized image components (`next/image`, etc.)
- **Missing lazy loading**: `<img>` elements without `loading="lazy"` or Intersection Observer when they're not above the fold
- **Uncompressed or unminified assets** (inferred from import patterns — static analysis can't measure actual sizes)

### Caching
- **Repeated expensive computations**: The same heavy calculation done in multiple places with no shared memoization
- **Uncached API calls**: Identical fetch calls in multiple components with no shared cache layer (SWR, React Query, etc.)
- **Missing HTTP cache headers**: API response handlers with no `Cache-Control` configuration

### Blocking Operations
- **Synchronous file I/O**: `fs.readFileSync`, `fs.writeFileSync` used in contexts that should be async
- **Heavy computation on the main thread**: Large array operations in event handlers without chunking or Web Workers
- **Callback patterns where async/await would prevent blocking**

---

## Severity Guide

| Severity | When to use |
|----------|-------------|
| critical | Major user-facing impact — slow list views, unbounded queries on large tables |
| high | Noticeable slowdown or scalability issue — heavy imports, sync I/O in hot paths |
| medium | Moderate impact, optimization opportunity — missing memoization, suboptimal imports |
| low | Minor improvement, best practice — missing lazy loading, small bundle savings |

| Effort | When to use |
|--------|-------------|
| trivial | Change an import, add a single attribute |
| small | Add memoization, swap a library |
| medium | Refactor queries, implement a caching layer |
| large | Architectural change, major refactor |

---

## Output Format

Report findings as a list. For each finding include:
- **File and line number**
- **Title** — a short, specific description of the issue
- **Severity** and **effort**
- **What's wrong** — describe the specific pattern and its performance impact
- **How to fix** — a concrete recommendation

Group by severity (critical first). At the end, report files scanned and issues found.

Note: static analysis can identify patterns and likely bottlenecks, but cannot measure actual runtime performance. Flag findings appropriately as "likely" or "potential" where certainty is lower.

If no performance issues are found, say so. If a file can't be read, skip and note it.
