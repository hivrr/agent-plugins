# Hivrr Claude Plugin

## Web Search MCP (Brave Search)

This plugin includes a Brave Search MCP server (`@modelcontextprotocol/server-brave-search`) that provides web search capabilities via the `brave_web_search` tool.

### Setup

1. Get a free API key from https://brave.com/search/api/ (free tier: 2,000 queries/month)
2. Set the `BRAVE_API_KEY` environment variable before starting Claude Code

If `BRAVE_API_KEY` is not set, the MCP server will fail to start. Claude Code will log a warning and continue without search — this is not a fatal error.

### When to use web search

- Looking up current library API docs during implementation
- Researching CI error messages from unfamiliar tools
- Checking security advisories for dependencies
- Verifying current package versions before adding to lock files

### When NOT to use web search

- Code generation — use the codebase and your training knowledge
- Architecture decisions — these should come from the codebase and team conventions
- Anything that should be derived from the existing code
