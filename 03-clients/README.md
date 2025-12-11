# Building MCP Clients

## When to Build a Client

Build an MCP client when you're creating an AI application (host) that needs to connect to MCP servers.

**You need a client if you're building:**
- Custom AI assistant application
- IDE extension with AI features
- Automation tool that uses LLMs
- Agent framework

**You don't need a client if you're:**
- Building an MCP server (servers don't need client code)
- Using Claude Desktop or another host (they have built-in clients)

## Client Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR HOST APP                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                       MCP CLIENT                         │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │
│  │  │ Connection  │  │  Request    │  │ Capability  │      │    │
│  │  │ Manager     │  │  Router     │  │ Tracker     │      │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                   │                   │                │
└─────────┼───────────────────┼───────────────────┼────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │ Server A │       │ Server B │       │ Server C │
    └──────────┘       └──────────┘       └──────────┘
```

## TypeScript Client

### Basic Setup

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function createClient() {
  const client = new Client({
    name: "my-host-app",
    version: "1.0.0",
  }, {
    capabilities: {
      roots: { listChanged: true },
      sampling: {},
    },
  });

  // Connect to server via stdio
  const transport = new StdioClientTransport({
    command: "node",
    args: ["/path/to/mcp-server/dist/index.js"],
    env: {
      API_KEY: process.env.API_KEY,
    },
  });

  await client.connect(transport);

  return client;
}
```

### Listing Capabilities

```typescript
async function discoverCapabilities(client: Client) {
  // List available tools
  const { tools } = await client.listTools();
  console.log("Available tools:", tools.map(t => t.name));

  // List available resources
  const { resources } = await client.listResources();
  console.log("Available resources:", resources.map(r => r.uri));

  // List available prompts
  const { prompts } = await client.listPrompts();
  console.log("Available prompts:", prompts.map(p => p.name));
}
```

### Calling Tools

```typescript
async function callTool(client: Client, name: string, args: object) {
  try {
    const result = await client.callTool({
      name,
      arguments: args,
    });

    if (result.isError) {
      console.error("Tool error:", result.content);
      return null;
    }

    return result.content;
  } catch (error) {
    console.error("Call failed:", error);
    throw error;
  }
}

// Usage
const files = await callTool(client, "search_files", {
  pattern: "**/*.ts",
  path: "/src",
});
```

### Reading Resources

```typescript
async function readResource(client: Client, uri: string) {
  const { contents } = await client.readResource({ uri });

  return contents.map(c => ({
    uri: c.uri,
    mimeType: c.mimeType,
    content: c.text ?? c.blob,
  }));
}

// Usage
const config = await readResource(client, "file:///config.json");
```

### Subscribing to Resource Changes

```typescript
async function watchResource(client: Client, uri: string) {
  // Subscribe
  await client.subscribeResource({ uri });

  // Handle updates
  client.setNotificationHandler(
    "notifications/resources/updated",
    async (notification) => {
      if (notification.params.uri === uri) {
        console.log("Resource updated:", uri);
        const newContent = await readResource(client, uri);
        // Handle update...
      }
    }
  );
}
```

## Python Client

```python
from mcp import ClientSession
from mcp.client.stdio import stdio_client

async def main():
    async with stdio_client(
        command="python",
        args=["/path/to/server.py"]
    ) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize
            await session.initialize()

            # List tools
            tools = await session.list_tools()
            print(f"Available tools: {[t.name for t in tools.tools]}")

            # Call tool
            result = await session.call_tool(
                name="search_files",
                arguments={"pattern": "*.py"}
            )
            print(f"Result: {result}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

## Managing Multiple Servers

```typescript
class MCPManager {
  private clients = new Map<string, Client>();

  async addServer(name: string, config: ServerConfig) {
    const client = new Client({ name: "host", version: "1.0.0" });
    const transport = new StdioClientTransport(config);
    await client.connect(transport);
    this.clients.set(name, client);
  }

  async callTool(serverName: string, tool: string, args: object) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Server not found: ${serverName}`);
    return client.callTool({ name: tool, arguments: args });
  }

  // Aggregate tools from all servers
  async listAllTools() {
    const allTools = [];
    for (const [server, client] of this.clients) {
      const { tools } = await client.listTools();
      allTools.push(...tools.map(t => ({ ...t, server })));
    }
    return allTools;
  }

  async shutdown() {
    for (const client of this.clients.values()) {
      await client.close();
    }
  }
}
```

## Integrating with LLMs

```typescript
async function runAgentLoop(client: Client, llm: LLM) {
  // Get available tools for LLM
  const { tools } = await client.listTools();

  // Format tools for LLM
  const toolSchemas = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));

  // Agent loop
  while (true) {
    const response = await llm.chat({
      messages: conversation,
      tools: toolSchemas,
    });

    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        const result = await client.callTool({
          name: call.name,
          arguments: call.arguments,
        });

        conversation.push({
          role: "tool",
          toolCallId: call.id,
          content: result.content,
        });
      }
    } else {
      // No tool calls, response complete
      break;
    }
  }
}
```

## Error Handling

```typescript
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

async function safeToolCall(client: Client, name: string, args: object) {
  try {
    return await client.callTool({ name, arguments: args });
  } catch (error) {
    if (error instanceof McpError) {
      switch (error.code) {
        case ErrorCode.MethodNotFound:
          console.error(`Tool not found: ${name}`);
          break;
        case ErrorCode.InvalidParams:
          console.error(`Invalid parameters for ${name}`);
          break;
        default:
          console.error(`MCP error: ${error.message}`);
      }
    }
    throw error;
  }
}
```
