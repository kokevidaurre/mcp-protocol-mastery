# Building MCP Servers

## Server Lifecycle

```
1. SPAWN      - Host starts server process
2. CONNECT    - Transport connection established
3. INITIALIZE - Capability negotiation
4. READY      - Server handles requests
5. SHUTDOWN   - Graceful termination
```

## TypeScript Server (Recommended)

### Setup

```bash
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

```json
// package.json
{
  "type": "module",
  "bin": {
    "my-mcp-server": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### Basic Server Structure

```typescript
// src/index.ts
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create server instance
const server = new McpServer({
  name: "my-server",
  version: "1.0.0",
});

// Define tools
server.tool(
  "example_tool",
  "Description of what this tool does",
  {
    param1: z.string().describe("First parameter"),
    param2: z.number().optional().describe("Optional number"),
  },
  async ({ param1, param2 }) => {
    // Tool implementation
    const result = `Processed: ${param1}, ${param2 ?? "default"}`;

    return {
      content: [{ type: "text", text: result }],
    };
  }
);

// Define resources
server.resource(
  "config://main",
  "Main Configuration",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ setting: "value" }),
      },
    ],
  })
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Server started"); // stderr for logs, stdout for protocol
}

main().catch(console.error);
```

## Python Server

### Setup

```bash
mkdir my-mcp-server && cd my-mcp-server
python -m venv venv
source venv/bin/activate
pip install mcp
```

### Basic Server Structure

```python
# server.py
import asyncio
import json
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Resource, Tool, TextContent

server = Server("my-server")

# Define tools
@server.tool()
async def example_tool(param1: str, param2: int = 0) -> str:
    """Description of what this tool does

    Args:
        param1: First parameter
        param2: Optional number parameter
    """
    return f"Processed: {param1}, {param2}"

# Define resources
@server.list_resources()
async def list_resources() -> list[Resource]:
    return [
        Resource(
            uri="config://main",
            name="Main Configuration",
            mimeType="application/json"
        )
    ]

@server.read_resource()
async def read_resource(uri: str) -> str:
    if uri == "config://main":
        return json.dumps({"setting": "value"})
    raise ValueError(f"Unknown resource: {uri}")

# Start server
async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
```

## Testing Your Server

### Manual Testing with Claude Desktop

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then ask: "What tools do you have available?"

### Automated Testing

```typescript
// test/server.test.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { server } from "../src/index.js";

describe("MCP Server", () => {
  let client: Client;

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  test("lists tools", async () => {
    const { tools } = await client.listTools();
    expect(tools).toContainEqual(
      expect.objectContaining({ name: "example_tool" })
    );
  });

  test("calls tool successfully", async () => {
    const result = await client.callTool({
      name: "example_tool",
      arguments: { param1: "test" },
    });
    expect(result.content[0].text).toContain("Processed: test");
  });
});
```

## Error Handling

```typescript
server.tool(
  "risky_operation",
  "An operation that might fail",
  { input: z.string() },
  async ({ input }) => {
    try {
      const result = await riskyOperation(input);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      // Return error as content (LLM sees it)
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);
```

## Logging Best Practices

```typescript
// Use stderr for logs - stdout is for protocol messages
function log(level: string, message: string, data?: object) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  }));
}

server.tool("logged_tool", {}, async () => {
  log("info", "Tool invoked", { tool: "logged_tool" });
  // ...
});
```

## Common Patterns

### Configuration via Environment

```typescript
const config = {
  apiKey: process.env.MY_API_KEY,
  baseUrl: process.env.MY_BASE_URL ?? "https://api.example.com",
};

if (!config.apiKey) {
  console.error("MY_API_KEY environment variable required");
  process.exit(1);
}
```

### Graceful Shutdown

```typescript
process.on("SIGINT", async () => {
  console.error("Shutting down...");
  await server.close();
  process.exit(0);
});
```
