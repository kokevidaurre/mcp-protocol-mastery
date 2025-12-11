# Module 03: Building Clients

> Connect your AI application to MCP servers

## Learning Objectives

By the end of this module, you'll understand:
- When you need to build an MCP client (vs just using one)
- How to connect to and manage multiple servers
- Integrating MCP tools with your LLM
- Handling server lifecycle and errors

## Do You Need to Build a Client?

Most developers **don't** need to build an MCP client. Here's how to decide:

### You DON'T need a client if:

- ✅ You're building an MCP **server** (servers don't contain clients)
- ✅ You're using Claude Desktop, VS Code, or another existing host
- ✅ You just want to give Claude access to your tools

### You DO need a client if:

- You're building a **custom AI application** (your own "Claude Desktop")
- You're creating an **IDE extension** with AI features
- You're building an **agent framework** that needs tool access
- You want to **embed MCP** in your product

**Still not sure?** If you're reading this to "connect Claude to my database," you want [Building Servers](../02-servers/01-basics.md), not this module.

## The Client's Job

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR AI APPLICATION                          │
│                                                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐        │
│  │    LLM      │ ◄──►│ MCP CLIENT  │ ◄──►│   SERVERS   │        │
│  │  (Claude)   │     │  (you build │     │ (filesystem,│        │
│  │             │     │   this)     │     │  database)  │        │
│  └─────────────┘     └─────────────┘     └─────────────┘        │
│                                                                  │
│  The client:                                                     │
│  1. Connects to servers                                          │
│  2. Discovers their tools                                        │
│  3. Formats tools for the LLM                                    │
│  4. Routes LLM tool calls to the right server                   │
│  5. Returns results to the LLM                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Basic Client Setup

### TypeScript

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function createClient() {
  // 1. Create client instance
  const client = new Client(
    {
      name: "my-ai-app",
      version: "1.0.0",
    },
    {
      capabilities: {
        // What your client supports
        roots: { listChanged: true },  // Can handle workspace roots
        sampling: {},                   // Can do LLM completions for servers
      },
    }
  );

  // 2. Create transport (how to talk to the server)
  const transport = new StdioClientTransport({
    command: "node",
    args: ["/path/to/mcp-server/index.js"],
    env: {
      API_KEY: process.env.API_KEY,  // Pass secrets via env
    },
  });

  // 3. Connect
  await client.connect(transport);

  // 4. Now you can use it
  const { tools } = await client.listTools();
  console.log("Available tools:", tools.map(t => t.name));

  return client;
}
```

### Python

```python
from mcp import ClientSession
from mcp.client.stdio import stdio_client

async def create_client():
    # Connect to server
    async with stdio_client(
        command="python",
        args=["/path/to/server.py"]
    ) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize connection
            await session.initialize()

            # Discover tools
            tools = await session.list_tools()
            print(f"Available: {[t.name for t in tools.tools]}")

            return session
```

## Discovering Server Capabilities

After connecting, find out what the server offers:

```typescript
async function discoverCapabilities(client: Client) {
  // What tools are available?
  const { tools } = await client.listTools();
  console.log("Tools:", tools.map(t => ({
    name: t.name,
    description: t.description,
  })));

  // What resources?
  const { resources } = await client.listResources();
  console.log("Resources:", resources.map(r => r.uri));

  // What prompts?
  const { prompts } = await client.listPrompts();
  console.log("Prompts:", prompts.map(p => p.name));
}
```

## Calling Tools

When your LLM decides to use a tool:

```typescript
async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  try {
    const result = await client.callTool({
      name,
      arguments: args,
    });

    // Check if it's an error result
    if (result.isError) {
      console.error("Tool returned error:", result.content);
      return { success: false, error: result.content };
    }

    return { success: true, content: result.content };
  } catch (error) {
    // Connection or protocol error
    console.error("Tool call failed:", error);
    throw error;
  }
}

// Usage
const result = await callTool(client, "search_files", {
  pattern: "**/*.ts",
  directory: "/src",
});
```

## Managing Multiple Servers

Real applications often connect to multiple servers:

```typescript
class MCPManager {
  private clients = new Map<string, Client>();

  async addServer(name: string, command: string, args: string[]) {
    const client = new Client({ name: "my-app", version: "1.0.0" });
    const transport = new StdioClientTransport({ command, args });

    await client.connect(transport);
    this.clients.set(name, client);

    console.log(`Connected to ${name}`);
  }

  // Get all tools from all servers
  async getAllTools() {
    const allTools = [];

    for (const [serverName, client] of this.clients) {
      const { tools } = await client.listTools();

      // Tag each tool with its server
      for (const tool of tools) {
        allTools.push({
          ...tool,
          _server: serverName,  // So we know where to route calls
        });
      }
    }

    return allTools;
  }

  // Route a tool call to the right server
  async callTool(serverName: string, toolName: string, args: object) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Unknown server: ${serverName}`);
    }

    return client.callTool({ name: toolName, arguments: args });
  }

  // Clean shutdown
  async shutdown() {
    for (const [name, client] of this.clients) {
      console.log(`Disconnecting ${name}...`);
      await client.close();
    }
    this.clients.clear();
  }
}

// Usage
const manager = new MCPManager();
await manager.addServer("files", "node", ["/path/to/filesystem-server.js"]);
await manager.addServer("db", "python", ["/path/to/database-server.py"]);

const tools = await manager.getAllTools();
// Now you have tools from both servers
```

## Integrating with Your LLM

Here's how to wire MCP tools into an LLM conversation:

```typescript
async function runConversation(manager: MCPManager, userMessage: string) {
  // 1. Get all available tools
  const mcpTools = await manager.getAllTools();

  // 2. Format tools for the LLM (Claude format shown)
  const llmTools = mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
    _server: tool._server,  // Keep track of which server
  }));

  // 3. Call the LLM
  const response = await claude.messages.create({
    model: "claude-sonnet-4-20250514",
    messages: [{ role: "user", content: userMessage }],
    tools: llmTools,
  });

  // 4. Handle tool calls
  for (const block of response.content) {
    if (block.type === "tool_use") {
      // Find which server has this tool
      const tool = llmTools.find(t => t.name === block.name);
      if (!tool) continue;

      // Call the tool via MCP
      const result = await manager.callTool(
        tool._server,
        block.name,
        block.input
      );

      // Feed result back to LLM for next turn
      // ... (continue conversation with tool result)
    }
  }
}
```

## Handling Server Lifecycle

Servers can crash, restart, or change their capabilities:

```typescript
// Handle disconnections
client.onclose = () => {
  console.error("Server disconnected!");
  // Attempt reconnection or notify user
};

// Handle errors
client.onerror = (error) => {
  console.error("Server error:", error);
};

// Handle capability changes
client.setNotificationHandler(
  "notifications/tools/list_changed",
  async () => {
    console.log("Server tools changed, refreshing...");
    const { tools } = await client.listTools();
    // Update your tool cache
  }
);
```

## Common Gotchas

1. **Forgetting to initialize** - Call `connect()` before making any requests

2. **Not handling disconnections** - Servers can crash; always have reconnection logic

3. **Ignoring `listChanged` notifications** - If a server adds tools at runtime, you'll miss them

4. **Mixing up servers** - When managing multiple servers, track which tools come from where

5. **Blocking on tool calls** - Tool calls can be slow; consider timeouts and cancellation

6. **Leaking connections** - Always call `close()` when done; servers are processes that need cleanup

## Exercises

1. **Single Server** - Connect to the filesystem server and list its tools

2. **Multi-Server** - Build a manager that connects to 2+ servers simultaneously

3. **LLM Integration** - Wire up tools to Claude and handle a multi-turn conversation

4. **Resilience** - Add reconnection logic that handles server crashes

## Next Steps

Now that you can build clients:

→ **[Transports](../05-transports/README.md)** - Connect to remote servers via HTTP/SSE

→ **[Security](../06-security/README.md)** - Secure your client-server communication
