# Module 02: Building Servers

> From zero to your first working MCP server

## Learning Objectives

By the end of this module, you'll be able to:
- Create an MCP server from scratch (TypeScript and Python)
- Add tools that Claude can call
- Test your server with Claude Desktop
- Handle errors properly
- Debug common issues

## Your First Server in 5 Minutes

Let's build something real. We'll create a server that provides a `greet` tool.

### TypeScript Version

```bash
# Setup
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```

```typescript
// src/index.ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create server
const server = new McpServer({
  name: "hello-world",
  version: "1.0.0",
});

// Add a tool
server.tool(
  "greet",                                    // Tool name
  "Greet someone by name",                    // Description (LLM reads this!)
  { name: z.string().describe("Person's name") },  // Parameters
  async ({ name }) => ({                      // Handler
    content: [{ type: "text", text: `Hello, ${name}! 👋` }],
  })
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

```bash
# Build and run
npx tsc
node dist/index.js
```

### Python Version

```bash
# Setup
mkdir my-mcp-server && cd my-mcp-server
python -m venv venv && source venv/bin/activate
pip install mcp
```

```python
# server.py
import asyncio
from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("hello-world")

@server.tool()
async def greet(name: str) -> str:
    """Greet someone by name

    Args:
        name: Person's name
    """
    return f"Hello, {name}! 👋"

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)

if __name__ == "__main__":
    asyncio.run(main())
```

## Testing with Claude Desktop

The fastest way to test your server:

### 1. Edit Claude Desktop config

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

### 2. Restart Claude Desktop

Completely quit and reopen (not just close window).

### 3. Test it

Ask Claude: *"Use the greet tool to say hello to Alice"*

Claude should respond with: *"Hello, Alice! 👋"*

## Understanding the Server Structure

Let's break down what's happening:

```typescript
// 1. Create server with metadata
const server = new McpServer({
  name: "hello-world",   // Shown in Claude's server list
  version: "1.0.0",      // For debugging/compatibility
});

// 2. Register a tool
server.tool(
  "greet",                              // name: how LLM calls it
  "Greet someone by name",              // description: LLM decides when to use based on this
  { name: z.string() },                 // inputSchema: validated parameters
  async ({ name }) => { ... }           // handler: runs when LLM calls the tool
);

// 3. Connect transport (stdio = stdin/stdout communication)
const transport = new StdioServerTransport();
await server.connect(transport);
// Server now listens on stdin, responds on stdout
```

## The Golden Rule of Logging

**stdout is for protocol. stderr is for logs.**

```typescript
// ❌ WRONG - breaks the protocol
console.log("Server starting...");

// ✅ CORRECT - logs to stderr
console.error("Server starting...");

// Or use a proper logging function
function log(message: string) {
  console.error(`[${new Date().toISOString()}] ${message}`);
}
```

Why? MCP uses stdin/stdout for JSON-RPC messages. If you `console.log()`, you're injecting garbage into the protocol stream.

## Adding More Tools

A useful server has multiple tools:

```typescript
// Tool 1: Read files
server.tool(
  "read_file",
  "Read contents of a file",
  { path: z.string().describe("File path to read") },
  async ({ path }) => {
    const content = await fs.readFile(path, "utf-8");
    return { content: [{ type: "text", text: content }] };
  }
);

// Tool 2: List directory
server.tool(
  "list_directory",
  "List files in a directory",
  { path: z.string().describe("Directory path") },
  async ({ path }) => {
    const files = await fs.readdir(path);
    return { content: [{ type: "text", text: files.join("\n") }] };
  }
);

// Tool 3: Search files
server.tool(
  "search_files",
  "Search for files matching a pattern",
  {
    pattern: z.string().describe("Glob pattern like **/*.ts"),
    root: z.string().optional().describe("Directory to search in")
  },
  async ({ pattern, root }) => {
    const matches = await glob(pattern, { cwd: root ?? "." });
    return { content: [{ type: "text", text: matches.join("\n") }] };
  }
);
```

## Error Handling That Helps the LLM

When errors happen, return helpful messages:

```typescript
server.tool(
  "read_file",
  "Read contents of a file",
  { path: z.string() },
  async ({ path }) => {
    try {
      const content = await fs.readFile(path, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch (error) {
      // Return error as content - LLM can see and react to it
      if (error.code === "ENOENT") {
        return {
          content: [{ type: "text", text: `File not found: ${path}` }],
          isError: true,
        };
      }
      if (error.code === "EACCES") {
        return {
          content: [{ type: "text", text: `Permission denied: ${path}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Error reading file: ${error.message}` }],
        isError: true,
      };
    }
  }
);
```

**Why `isError: true`?** It tells the host "this is an error result" so it can style it differently or take recovery actions.

## Configuration via Environment Variables

Don't hardcode secrets or paths:

```typescript
// Read config from environment
const config = {
  allowedRoot: process.env.ALLOWED_ROOT ?? process.cwd(),
  apiKey: process.env.API_KEY,
};

// Validate required config
if (!config.apiKey) {
  console.error("ERROR: API_KEY environment variable required");
  process.exit(1);
}

// Use in tools
server.tool("fetch_data", { query: z.string() }, async ({ query }) => {
  const response = await fetch(`https://api.example.com?q=${query}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  // ...
});
```

Configure in Claude Desktop:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "ALLOWED_ROOT": "/home/user/projects",
        "API_KEY": "sk-..."
      }
    }
  }
}
```

## Common Gotchas

1. **Using `console.log`** - Use `console.error` for all logging

2. **Forgetting async/await** - Tool handlers must be async, and you must await file operations

3. **Not handling errors** - Unhandled exceptions crash the server; Claude loses the connection

4. **Relative paths in config** - Always use absolute paths in `claude_desktop_config.json`

5. **Not restarting Claude Desktop** - Config changes require a full restart (Cmd+Q, not just close window)

6. **TypeScript compilation** - Don't forget to run `tsc` after changes

## Debugging Tips

### Enable MCP debug logs in Claude Desktop

Add to config:
```json
{
  "mcpServers": { ... },
  "debug": true
}
```

### Test server manually

```bash
# Start server
node dist/index.js

# In another terminal, send JSON-RPC manually
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

### Check if server starts

```bash
# Should see server logs on stderr
node dist/index.js 2>&1 | head
```

## Exercises

1. **Hello World** - Build the greet server and test with Claude Desktop

2. **Calculator** - Add tools: `add`, `subtract`, `multiply`, `divide`

3. **Note Taker** - Tools to save and retrieve notes (in-memory is fine)

4. **Weather** - Wrap a weather API as an MCP server

## Next Steps

Now that you can build basic servers:

→ **[Tools Deep Dive](../04-tools-resources/01-tools.md)** - Master parameter validation and security

→ **[Transports](../05-transports/README.md)** - Deploy servers over HTTP, not just local

→ **[Lab: Filesystem Server](../labs/01-filesystem-server/)** - Build a complete, production-ready server
