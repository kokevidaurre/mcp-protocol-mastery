# What is MCP?

> The universal connector for AI applications

## The Problem MCP Solves

Before MCP, every AI application had to build its own integrations:

```
Claude Desktop ──custom code──► Filesystem
Claude Desktop ──custom code──► Database
Claude Desktop ──custom code──► GitHub API

VS Code AI     ──different code──► Filesystem
VS Code AI     ──different code──► Database
VS Code AI     ──different code──► GitHub API

Your App       ──more custom code──► Filesystem
Your App       ──more custom code──► Database
Your App       ──more custom code──► GitHub API
```

**The result?** Duplicate effort. Inconsistent implementations. Security gaps. Vendor lock-in.

## The MCP Solution

MCP standardizes the connection between AI applications and external capabilities:

```
Claude Desktop ─┐
VS Code AI     ─┼──► MCP Protocol ──► MCP Server (Filesystem)
Your App       ─┘                 ──► MCP Server (Database)
                                  ──► MCP Server (GitHub)
```

**Build once, use everywhere.** An MCP server for GitHub works with Claude Desktop, VS Code, and any other MCP-compatible host.

## The Three Roles

Understanding these roles is essential:

### 1. Host

The AI application that users interact with. Contains an LLM and an MCP client.

**Examples:** Claude Desktop, VS Code with Continue, your custom AI app

**Responsibilities:**
- Presents server capabilities to the LLM ("You have these tools available...")
- Decides when to connect/disconnect servers
- Enforces security policies (permissions, confirmations)
- Manages the user experience

### 2. Client

The MCP implementation inside the host. You rarely build this yourself.

**Responsibilities:**
- Establishes connections to servers
- Sends requests, receives responses
- Handles protocol details (JSON-RPC, transport)

**Think of it as:** The "driver" that lets the host talk to servers

### 3. Server

The external process that exposes capabilities. **This is what you'll build most often.**

**Examples:** Filesystem server, database server, API wrapper

**Responsibilities:**
- Declares what it can do (tools, resources, prompts)
- Executes tool calls
- Provides resource content
- Runs as a separate process from the host

## The Three Primitives

MCP servers expose three types of capabilities:

### Tools - "Actions the AI can take"

Functions the LLM can call to do something.

```typescript
// Example: A tool that searches files
{
  name: "search_files",
  description: "Search for files matching a pattern",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string" }
    }
  }
}
```

**Use tools for:** Creating files, querying databases, calling APIs, running computations

### Resources - "Data the AI can read"

Content identified by URIs that the LLM can access.

```typescript
// Example: A configuration file as a resource
{
  uri: "file:///project/config.json",
  name: "Project Config",
  mimeType: "application/json"
}
```

**Use resources for:** Files, database records, API responses, any readable data

### Prompts - "Reusable templates"

Pre-built prompt templates that servers can offer.

```typescript
// Example: A code review prompt
{
  name: "code_review",
  description: "Review code for issues",
  arguments: [
    { name: "language", required: true }
  ]
}
```

**Use prompts for:** Standardized workflows, guided interactions, complex multi-step tasks

## How It All Fits Together

Here's what happens when you ask Claude to "search for TypeScript files":

```
1. USER: "Search for TypeScript files in /src"
         │
         ▼
2. HOST (Claude Desktop):
   - LLM sees available tool: search_files
   - LLM decides to use it
   - Host sends tool call via MCP client
         │
         ▼
3. CLIENT: Sends JSON-RPC message to server
         │
         ▼
4. SERVER (Filesystem MCP):
   - Receives: { method: "tools/call", params: { name: "search_files", arguments: { pattern: "**/*.ts" }}}
   - Executes the search
   - Returns: ["src/index.ts", "src/utils.ts", "src/types.ts"]
         │
         ▼
5. HOST: Shows results to user
   "I found 3 TypeScript files: index.ts, utils.ts, types.ts"
```

## Why This Matters

| Without MCP | With MCP |
|-------------|----------|
| Build custom integration for each AI app | Build once, works everywhere |
| Inconsistent security models | Standardized permission system |
| Vendor lock-in | Open standard, switch hosts freely |
| No discoverability | Servers declare capabilities |
| Ad-hoc protocols | JSON-RPC, well-defined lifecycle |

## Common Misconceptions

❌ **"MCP is an API"** - No, it's a protocol. APIs are specific implementations; MCP defines how any client and server communicate.

❌ **"I need MCP to use Claude"** - No, Claude works fine without MCP. MCP extends what Claude can do.

❌ **"MCP servers need to be in the cloud"** - Most MCP servers run locally as subprocesses. Cloud deployment is optional.

❌ **"MCP is only for Anthropic products"** - MCP is an open standard. Anyone can build hosts and servers.

## Quick Decision Guide

**Should you build an MCP server?**

✅ Yes, if:
- You want to give AI access to a tool/data source
- You want the integration to work across multiple AI apps
- You're building something others might reuse

❌ No, if:
- You just need a one-off script
- You're building a complete AI application (build a host instead)
- The capability already exists in an MCP server

## Next Steps

Now that you understand what MCP is:

→ **[Architecture](../01-architecture/README.md)** - Learn the protocol details: messages, lifecycle, capabilities

→ **[Building Servers](../02-servers/01-basics.md)** - Start building your first MCP server
