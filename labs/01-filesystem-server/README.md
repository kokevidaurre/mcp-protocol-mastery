# Lab 01: Build a Filesystem MCP Server

## Objective

Build a complete MCP server that provides file system access with:
- Tools: read, write, list, search files
- Resources: expose directory contents as resources
- Security: path validation, size limits

## What You'll Learn

1. Server setup and configuration
2. Tool implementation patterns
3. Resource exposure
4. Security best practices
5. Testing MCP servers

## Prerequisites

- Node.js 18+
- npm or pnpm
- Claude Desktop (for testing)

## Setup

```bash
cd labs/01-filesystem-server
npm install
npm run build
```

## Exercise 1: Basic Server (15 min)

Start with `src/index.ts` and implement the `read_file` tool.

**Requirements:**
- Accept a `path` parameter (string)
- Validate path is within allowed root
- Return file contents as text
- Handle errors gracefully

**Test:**
```bash
npm test -- --grep "read_file"
```

## Exercise 2: Write Tool (15 min)

Add a `write_file` tool.

**Requirements:**
- Accept `path` and `content` parameters
- Create parent directories if needed
- Return confirmation message
- Enforce size limit (1MB)

## Exercise 3: Search Tool (20 min)

Add a `search_files` tool using glob patterns.

**Requirements:**
- Accept `pattern` and optional `rootPath`
- Return matching file paths
- Limit results to 100 files

## Exercise 4: Resources (15 min)

Expose the root directory as a resource.

**Requirements:**
- URI format: `file://{path}`
- Support directory listing as JSON
- Support file content reading

## Exercise 5: Security Hardening (15 min)

Add security controls:

1. Path traversal prevention
2. Symlink resolution check
3. File size limits
4. Rate limiting

## Testing with Claude Desktop

After completing exercises, configure Claude Desktop:

```json
{
  "mcpServers": {
    "filesystem-lab": {
      "command": "node",
      "args": ["/path/to/labs/01-filesystem-server/dist/index.js"],
      "env": {
        "ALLOWED_ROOT": "/path/to/safe/directory"
      }
    }
  }
}
```

Then try:
- "List all TypeScript files in the project"
- "Read the package.json file"
- "Search for files containing 'TODO'"

## Solution

See `src/solution.ts` for reference implementation.

## Scoring

| Exercise | Points |
|----------|--------|
| Basic read_file | 20 |
| Write tool | 20 |
| Search tool | 25 |
| Resources | 20 |
| Security | 15 |
