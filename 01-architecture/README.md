# Module 01: Architecture

> Understanding how MCP messages flow between clients and servers

## Learning Objectives

By the end of this module, you'll understand:
- The connection lifecycle (connect → initialize → ready → shutdown)
- JSON-RPC message format
- Capability negotiation
- How clients discover what servers can do
- Error handling patterns

## The Connection Lifecycle

Every MCP session follows this sequence:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CONNECTION LIFECYCLE                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. SPAWN        Host starts server as subprocess (or connects via HTTP)│
│       │                                                                 │
│       ▼                                                                 │
│  2. INITIALIZE   "Hello, I'm client X, I support these capabilities"   │
│       │          "Hello, I'm server Y, I offer these capabilities"     │
│       ▼                                                                 │
│  3. READY        Normal operation: tool calls, resource reads, etc.    │
│       │                                                                 │
│       ▼                                                                 │
│  4. SHUTDOWN     Graceful termination                                   │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Why Initialization Matters

Initialization isn't just "hello" - it's where both sides negotiate what they can do:

```typescript
// Client says: "I support roots and sampling"
{
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "clientInfo": { "name": "my-app", "version": "1.0" },
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {}
    }
  }
}

// Server responds: "I offer tools and resources"
{
  "result": {
    "protocolVersion": "2025-11-25",
    "serverInfo": { "name": "my-server", "version": "1.0" },
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true }
    }
  }
}
```

**Key insight:** If a server declares `tools: {}`, the client knows it can call `tools/list` and `tools/call`. If not declared, those methods won't work.

## Message Format: JSON-RPC 2.0

All MCP messages use JSON-RPC 2.0. There are three types:

### 1. Requests (expect a response)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": { "path": "/src/index.ts" }
  }
}
```

The `id` field is crucial - it's how you match responses to requests.

### 2. Responses (answer to a request)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "file contents..." }]
  }
}
```

Or if something went wrong:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "File not found: /src/index.ts"
  }
}
```

### 3. Notifications (no response expected)

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

Notice: no `id` field. The server is just informing the client; it doesn't expect a reply.

## The Methods You Need to Know

### For Tools

| Method | Direction | Purpose |
|--------|-----------|---------|
| `tools/list` | Client → Server | "What tools do you have?" |
| `tools/call` | Client → Server | "Run this tool with these arguments" |
| `notifications/tools/list_changed` | Server → Client | "My tools changed, re-fetch the list" |

### For Resources

| Method | Direction | Purpose |
|--------|-----------|---------|
| `resources/list` | Client → Server | "What resources do you have?" |
| `resources/read` | Client → Server | "Give me the content of this resource" |
| `resources/subscribe` | Client → Server | "Notify me when this resource changes" |
| `notifications/resources/updated` | Server → Client | "This resource changed" |

### For Prompts

| Method | Direction | Purpose |
|--------|-----------|---------|
| `prompts/list` | Client → Server | "What prompts do you have?" |
| `prompts/get` | Client → Server | "Give me this prompt with these arguments" |

### Utilities

| Method | Direction | Purpose |
|--------|-----------|---------|
| `ping` | Either | "Are you there?" |
| `notifications/progress` | Either | "Here's progress on that long operation" |
| `notifications/cancelled` | Either | "That operation was cancelled" |

## Capability Negotiation in Practice

Let's trace through a real scenario:

**Scenario:** Claude Desktop connects to a filesystem server

```
1. Desktop starts server:
   $ node /path/to/filesystem-server.js /allowed/directory

2. Desktop sends initialize:
   {
     "capabilities": {
       "roots": { "listChanged": true }
     }
   }

3. Server responds:
   {
     "capabilities": {
       "tools": { "listChanged": true },
       "resources": { "subscribe": true }
     }
   }

4. Desktop now knows:
   - ✅ Can call tools/list, tools/call
   - ✅ Can call resources/list, resources/read, resources/subscribe
   - ❌ Cannot call prompts/list (server didn't declare prompts)

5. Desktop fetches available tools:
   tools/list → ["read_file", "write_file", "search_files"]

6. Desktop tells the LLM:
   "You have these tools available: read_file, write_file, search_files"

7. User asks: "What's in my config file?"

8. LLM decides to use read_file tool

9. Desktop calls:
   tools/call { name: "read_file", arguments: { path: "config.json" }}

10. Server returns file contents

11. LLM formulates response for user
```

## Error Codes

When things go wrong, you'll see these codes:

| Code | Name | Meaning |
|------|------|---------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid request | Not valid JSON-RPC |
| -32601 | Method not found | Server doesn't support this method |
| -32602 | Invalid params | Wrong arguments for the method |
| -32603 | Internal error | Server crashed or had a bug |

**Pro tip:** Always handle errors gracefully. The LLM can often recover if you return a clear error message instead of crashing.

## Common Gotchas

1. **Forgetting to send `initialized` notification** - After receiving the initialize result, clients must send an `initialized` notification. Without it, some servers won't start processing requests.

2. **Not checking capabilities** - Don't call `resources/subscribe` if the server didn't declare `resources: { subscribe: true }`.

3. **Ignoring `listChanged` notifications** - If a server adds new tools at runtime, you'll miss them unless you handle `notifications/tools/list_changed`.

4. **Mismatched IDs** - Every request needs a unique ID. If you reuse IDs, responses get mixed up.

## Exercises

1. **Trace the flow** - Start Claude Desktop with an MCP server, enable debug logging, and trace the initialize handshake.

2. **Handle capabilities** - Write code that checks server capabilities before making calls.

3. **Build a mock** - Create a minimal mock server that responds to `tools/list` and `tools/call`.

## Next Steps

Now that you understand the architecture:

→ **[Building Servers](../02-servers/01-basics.md)** - Create your first MCP server

→ **[Tools Deep Dive](../04-tools-resources/01-tools.md)** - Master tool definitions and validation
