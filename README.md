# MCP Protocol Mastery

Technical implementation guide for the Model Context Protocol (MCP) - the open standard for connecting AI assistants to external tools, data sources, and services.

## What is MCP?

MCP is a protocol that standardizes how AI applications (hosts) connect to external capabilities (servers). Think of it as USB-C for AI - a universal connector.

```
┌─────────────────┐         ┌─────────────────┐
│   AI HOST       │         │   MCP SERVER    │
│  (Claude, etc)  │◄───────►│  (Your tools)   │
│                 │   MCP   │                 │
│  - LLM         │         │  - Tools        │
│  - MCP Client  │         │  - Resources    │
│                 │         │  - Prompts      │
└─────────────────┘         └─────────────────┘
```

## Why MCP Matters

| Before MCP | With MCP |
|------------|----------|
| Custom integration per AI app | One server, all compatible hosts |
| Vendor lock-in | Open standard |
| Security varies wildly | Standardized security model |
| No capability discovery | Agent Cards, tool schemas |

## Learning Path

### Foundations
- [Core Concepts](./foundations/01-core-concepts.md) - Hosts, clients, servers, primitives
- [Architecture](./01-architecture/README.md) - Protocol structure, lifecycle, messages

### Building Servers
- [Server Basics](./02-servers/01-basics.md) - Your first MCP server
- [Tools](./04-tools-resources/01-tools.md) - Exposing functions to AI
- [Resources](./04-tools-resources/02-resources.md) - Exposing data to AI
- [Prompts](./02-servers/03-prompts.md) - Reusable prompt templates

### Building Clients
- [Client Basics](./03-clients/01-basics.md) - Connecting to MCP servers
- [Host Integration](./03-clients/02-host-integration.md) - Embedding in AI apps

### Advanced Topics
- [Transports](./05-transports/README.md) - stdio, SSE, custom
- [Security](./06-security/README.md) - Auth, validation, sandboxing
- [Patterns](./07-patterns/README.md) - Production patterns

### Labs
- [Lab 01](./labs/01-filesystem-server/) - Build a filesystem MCP server
- [Lab 02](./labs/02-database-server/) - Build a database MCP server
- [Lab 03](./labs/03-api-wrapper/) - Wrap any REST API as MCP

## Quick Start

### Install an MCP Server (Claude Desktop)

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  }
}
```

### Build Your First Server (TypeScript)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "my-first-server",
  version: "1.0.0"
});

// Add a tool
server.tool("greet", { name: { type: "string" } }, async ({ name }) => ({
  content: [{ type: "text", text: `Hello, ${name}!` }]
}));

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Build Your First Server (Python)

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("my-first-server")

@server.tool()
async def greet(name: str) -> str:
    """Greet someone by name"""
    return f"Hello, {name}!"

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

## Protocol Version

Current: **2025-11-25** (date-based versioning)

## Prerequisites

- TypeScript/Python experience
- Familiarity with JSON-RPC
- Understanding of async/await patterns

## Related Protocols

| Protocol | Purpose | Status |
|----------|---------|--------|
| **MCP** | Tool/resource connectivity | Production |
| **A2A** | Agent-to-agent communication | Production |
| **AP2** | Agent payment authorization | Developer Preview |

## Resources

- [Official Spec](https://modelcontextprotocol.io/specification)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [Server Registry](https://github.com/modelcontextprotocol/servers)
