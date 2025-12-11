# MCP Protocol Mastery

> Build once, connect everywhere. The complete guide to Model Context Protocol.

## What You'll Learn

This course takes you from "what is MCP?" to building production-ready servers that work with Claude Desktop, VS Code, and any MCP-compatible AI application.

**By the end, you'll be able to:**
- Build MCP servers that expose tools, resources, and prompts
- Connect servers to Claude Desktop and other hosts
- Implement security best practices
- Debug protocol issues
- Deploy servers locally and remotely

## Prerequisites

- TypeScript or Python experience
- Familiarity with async/await
- A text editor and terminal

**Not required:** Prior MCP knowledge, Claude API experience

## Learning Path

### Start Here

| Module | What You'll Learn | Time |
|--------|------------------|------|
| **[What is MCP?](./foundations/01-core-concepts.md)** | The problem MCP solves, hosts/clients/servers, the three primitives | 15 min |
| **[Architecture](./01-architecture/README.md)** | Protocol lifecycle, JSON-RPC messages, capability negotiation | 20 min |

### Building Servers (Core Path)

| Module | What You'll Learn | Time |
|--------|------------------|------|
| **[Server Basics](./02-servers/01-basics.md)** | Your first server, testing with Claude Desktop, error handling | 30 min |
| **[Tools Deep Dive](./04-tools-resources/01-tools.md)** | Parameter validation, security, returning results | 25 min |
| **[Production Patterns](./07-patterns/README.md)** | Error handling, chunking, confirmations, anti-patterns | 20 min |

### Building Clients (If Needed)

| Module | What You'll Learn | Time |
|--------|------------------|------|
| **[Client Basics](./03-clients/README.md)** | When to build a client, managing servers, LLM integration | 25 min |

### Advanced Topics

| Module | What You'll Learn | Time |
|--------|------------------|------|
| **[Transports](./05-transports/README.md)** | stdio, SSE, WebSocket, custom transports | 20 min |
| **[Security](./06-security/README.md)** | Path traversal, input validation, rate limiting | 25 min |

### Hands-On Labs

| Lab | What You'll Build |
|-----|------------------|
| **[Filesystem Server](./labs/01-filesystem-server/)** | Complete server with read, write, search, list tools |

## Quick Start

### Option 1: Use an existing server

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/projects"]
    }
  }
}
```

Restart Claude Desktop. Ask: *"What files are in my projects directory?"*

### Option 2: Build your own (5 minutes)

```typescript
// hello-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "hello", version: "1.0.0" });

server.tool(
  "greet",
  "Say hello to someone",
  { name: z.string() },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }]
  })
);

await server.connect(new StdioServerTransport());
```

→ Full walkthrough in **[Server Basics](./02-servers/01-basics.md)**

## How MCP Works (30-Second Version)

```
┌──────────────────┐                    ┌──────────────────┐
│  CLAUDE DESKTOP  │                    │   YOUR SERVER    │
│                  │                    │                  │
│  "Search for     │  ── tools/call ──► │  search_files()  │
│   .ts files"     │                    │                  │
│                  │  ◄── results ────  │  ["a.ts","b.ts"] │
│  "Found 2 files" │                    │                  │
└──────────────────┘                    └──────────────────┘
        │                                        │
        └─────────── MCP Protocol ───────────────┘
```

1. **You build a server** that exposes tools (functions the AI can call)
2. **Claude Desktop connects** to your server via MCP
3. **When the user asks** for something, Claude decides which tools to use
4. **Your server executes** the tool and returns results
5. **Claude responds** to the user with the information

## Common Questions

**Q: Do I need MCP to use Claude?**
No. MCP extends what Claude can do. Claude works fine without it.

**Q: Is MCP only for Anthropic products?**
No. MCP is an open standard. VS Code extensions, custom apps, and other AI assistants can use it.

**Q: Can I use Python?**
Yes. Both TypeScript and Python SDKs are fully supported.

**Q: Where do MCP servers run?**
Most run locally as subprocesses. You can also deploy them as HTTP services.

## Resources

- **[Official Specification](https://modelcontextprotocol.io/specification)** - The authoritative reference
- **[TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)** - Build servers in TypeScript
- **[Python SDK](https://github.com/modelcontextprotocol/python-sdk)** - Build servers in Python
- **[Server Registry](https://github.com/modelcontextprotocol/servers)** - Community-built servers

## Related Protocols

| Protocol | Purpose | Relationship to MCP |
|----------|---------|---------------------|
| **A2A** | Agent-to-agent communication | Complements MCP (agent interop) |
| **AP2** | Agent payment authorization | Extends MCP/A2A for payments |

---

**Ready to start?** → **[What is MCP?](./foundations/01-core-concepts.md)**
