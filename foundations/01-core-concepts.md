# Core Concepts

## The MCP Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          HOST APPLICATION                        │
│  (Claude Desktop, VS Code, Custom App)                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      MCP CLIENT                          │    │
│  │  - Maintains connections to servers                      │    │
│  │  - Routes tool calls from LLM to appropriate server      │    │
│  │  - Aggregates resources/prompts for LLM context          │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │              │              │                          │
└─────────┼──────────────┼──────────────┼──────────────────────────┘
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │  SERVER  │   │  SERVER  │   │  SERVER  │
    │ (files)  │   │  (db)    │   │  (api)   │
    └──────────┘   └──────────┘   └──────────┘
```

## Key Roles

### Host
The AI application that embeds the MCP client. Examples:
- Claude Desktop
- VS Code with Continue/Cody
- Custom AI applications

**Responsibilities:**
- Manages MCP client lifecycle
- Presents server capabilities to LLM
- Enforces security policies
- Handles user consent for tool execution

### Client
The protocol implementation inside the host that communicates with servers.

**Responsibilities:**
- Establishes connections to servers
- Performs capability negotiation
- Routes requests/responses
- Manages server lifecycle

### Server
External process that exposes tools, resources, and prompts.

**Responsibilities:**
- Declares capabilities (tools, resources, prompts)
- Handles tool invocations
- Provides resource content
- Manages its own state

## Core Primitives

### Tools

Functions the LLM can call to perform actions.

```typescript
// Tool definition
{
  name: "search_files",
  description: "Search for files matching a pattern",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern" },
      path: { type: "string", description: "Directory to search" }
    },
    required: ["pattern"]
  }
}

// Tool invocation result
{
  content: [
    { type: "text", text: "Found 3 files:\n- a.ts\n- b.ts\n- c.ts" }
  ]
}
```

**Use tools for:** Actions, mutations, computations, external API calls

### Resources

Data the LLM can read. Resources are identified by URIs.

```typescript
// Resource definition
{
  uri: "file:///project/config.json",
  name: "Project Configuration",
  description: "Main config file for the project",
  mimeType: "application/json"
}

// Resource content
{
  contents: [
    {
      uri: "file:///project/config.json",
      mimeType: "application/json",
      text: "{ \"name\": \"my-project\", \"version\": \"1.0.0\" }"
    }
  ]
}
```

**Use resources for:** Files, database records, API responses, any readable data

### Prompts

Reusable prompt templates that servers can expose.

```typescript
// Prompt definition
{
  name: "code_review",
  description: "Review code for issues and improvements",
  arguments: [
    { name: "language", description: "Programming language", required: true },
    { name: "focus", description: "Review focus (security, performance, style)" }
  ]
}

// Prompt content (when retrieved)
{
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: "Review this {{language}} code focusing on {{focus}}:\n\n{{code}}"
      }
    }
  ]
}
```

**Use prompts for:** Workflows, templates, guided interactions

## Message Flow

### Initialization

```
Client                          Server
   │                               │
   │──── initialize ──────────────►│
   │     (protocol version,        │
   │      client capabilities)     │
   │                               │
   │◄─── initialize result ────────│
   │     (protocol version,        │
   │      server capabilities)     │
   │                               │
   │──── initialized ─────────────►│
   │     (notification)            │
   │                               │
```

### Tool Call

```
Client                          Server
   │                               │
   │──── tools/call ──────────────►│
   │     (name, arguments)         │
   │                               │
   │◄─── result ───────────────────│
   │     (content[])               │
   │                               │
```

### Resource Read

```
Client                          Server
   │                               │
   │──── resources/read ──────────►│
   │     (uri)                     │
   │                               │
   │◄─── result ───────────────────│
   │     (contents[])              │
   │                               │
```

## Capability Negotiation

During initialization, both sides declare what they support:

```typescript
// Client capabilities
{
  roots: { listChanged: true },      // Can handle root changes
  sampling: {}                        // Can perform LLM sampling
}

// Server capabilities
{
  tools: { listChanged: true },      // Has tools, can notify of changes
  resources: { subscribe: true },    // Has resources, supports subscriptions
  prompts: { listChanged: true }     // Has prompts, can notify of changes
}
```

This allows graceful degradation - servers can adapt behavior based on client capabilities.

## Protocol Versioning

MCP uses date-based versions: `YYYY-MM-DD`

Current version: **2025-11-25**

Version negotiation happens at initialization:
1. Client sends supported versions
2. Server picks compatible version
3. Both sides use agreed version for session

## Key Design Principles

1. **Server-centric capabilities** - Servers define what they can do
2. **Client-driven invocation** - Clients decide when to use capabilities
3. **Stateless requests** - Each request is independent
4. **Graceful degradation** - Unknown capabilities are ignored
5. **Security by default** - Explicit capability grants, no implicit access
