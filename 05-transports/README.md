# Module 05: Transports

> Connect locally or remotely—your choice

## Learning Objectives

By the end of this module, you'll understand:
- The difference between stdio and SSE transports
- When to use each transport type
- How to deploy servers remotely
- Building custom transports for special needs

## What's a Transport?

A transport is the communication channel between MCP clients and servers. Think of it like choosing between USB (local) and Wi-Fi (remote).

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP PROTOCOL                                │
│            (Same JSON-RPC messages everywhere)                   │
├─────────────────────────────────────────────────────────────────┤
│                      TRANSPORT LAYER                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │      stdio       │  │       SSE        │  │    Custom     │  │
│  │  (local process) │  │  (HTTP remote)   │  │  (WebSocket)  │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

The protocol stays the same—only the transport changes.

## stdio: Local Servers

**Best for:** Claude Desktop, local development, desktop applications

The host spawns the server as a child process and communicates via stdin/stdout.

```
┌────────────────┐                    ┌────────────────┐
│     HOST       │      stdin         │     SERVER     │
│ (Claude        │  ────────────────► │   (your code)  │
│  Desktop)      │                    │                │
│                │      stdout        │                │
│                │  ◄──────────────── │                │
└────────────────┘                    └────────────────┘
        │                                     │
        └──── Same machine, same process ─────┘
```

### Server Code (TypeScript)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// Add tools...

// KEY: Use StdioServerTransport
const transport = new StdioServerTransport();
await server.connect(transport);

// IMPORTANT: Logs go to stderr, not stdout
console.error("Server started");  // ✅ Good
console.log("Server started");    // ❌ Breaks protocol
```

### Client Code (TypeScript)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",                           // Program to run
  args: ["/path/to/server.js"],              // Arguments
  env: { API_KEY: "secret" },                // Environment variables
  cwd: "/working/directory",                 // Working directory
});

const client = new Client({ name: "my-app", version: "1.0.0" });
await client.connect(transport);
```

### Claude Desktop Config

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/absolute/path/to/server.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

### When to Use stdio

✅ **Use stdio when:**
- Running on the same machine as the host
- Using Claude Desktop
- Building desktop applications
- Secrets can be passed via environment variables

❌ **Don't use stdio when:**
- Server needs to run on a different machine
- Multiple clients need to connect to one server
- Server needs to persist beyond client lifecycle

## SSE: Remote Servers

**Best for:** Cloud deployment, shared servers, web applications

HTTP-based transport using Server-Sent Events for server→client streaming.

```
┌────────────────┐       HTTP POST          ┌────────────────┐
│     CLIENT     │  ─────────────────────►  │     SERVER     │
│                │       (requests)         │     (HTTP)     │
│                │                          │                │
│                │  ◄─────────────────────  │                │
└────────────────┘       SSE stream         └────────────────┘
        │                (responses)               │
        └─────────── Over the network ─────────────┘
```

### Server Code (TypeScript with Express)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();
const server = new McpServer({ name: "remote-server", version: "1.0.0" });

// Add tools...

// Store transports by session
const sessions = new Map<string, SSEServerTransport>();

// SSE endpoint: Server → Client messages
app.get("/sse/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const transport = new SSEServerTransport(`/messages/${sessionId}`, res);
  sessions.set(sessionId, transport);

  server.connect(transport);

  // Cleanup on disconnect
  req.on("close", () => {
    sessions.delete(sessionId);
  });
});

// POST endpoint: Client → Server messages
app.post("/messages/:sessionId", express.json(), (req, res) => {
  const { sessionId } = req.params;
  const transport = sessions.get(sessionId);

  if (!transport) {
    return res.status(404).json({ error: "Session not found" });
  }

  transport.handleMessage(req.body);
  res.status(200).json({ ok: true });
});

app.listen(3000, () => {
  console.log("MCP server running on http://localhost:3000");
});
```

### Client Code (TypeScript)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const sessionId = crypto.randomUUID();

const transport = new SSEClientTransport(
  new URL(`http://localhost:3000/sse/${sessionId}`),      // SSE endpoint
  new URL(`http://localhost:3000/messages/${sessionId}`)  // POST endpoint
);

const client = new Client({ name: "remote-client", version: "1.0.0" });
await client.connect(transport);
```

### When to Use SSE

✅ **Use SSE when:**
- Server runs on a different machine
- Multiple clients need the same server
- Deploying to cloud (AWS, GCP, etc.)
- Building web applications

❌ **Don't use SSE when:**
- Everything runs locally (use stdio instead)
- You need bidirectional streaming (consider WebSocket)
- Firewalls block SSE (rare, but possible)

## Choosing a Transport

| Factor | stdio | SSE |
|--------|-------|-----|
| Deployment | Same machine | Any network |
| Setup complexity | Simple | More code |
| Security | Inherent (local) | Needs auth |
| Multiple clients | No | Yes |
| Firewall friendly | N/A | Usually yes |
| Latency | Minimal | Network dependent |

**Quick decision:**
- Building for Claude Desktop? → **stdio**
- Building a web app or cloud service? → **SSE**

## Custom Transports

Need something different? Implement the `Transport` interface.

### WebSocket Transport Example

```typescript
import { Transport, JSONRPCMessage } from "@modelcontextprotocol/sdk/shared/transport.js";
import WebSocket from "ws";

class WebSocketServerTransport implements Transport {
  private ws: WebSocket;

  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(ws: WebSocket) {
    this.ws = ws;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.onmessage?.(message);
      } catch (err) {
        this.onerror?.(err as Error);
      }
    });

    ws.on("close", () => this.onclose?.());
    ws.on("error", (err) => this.onerror?.(err));
  }

  async start(): Promise<void> {
    // Already connected via constructor
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.ws.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    this.ws.close();
  }
}

// Usage with ws server
const wss = new WebSocket.Server({ port: 3001 });
wss.on("connection", (ws) => {
  const transport = new WebSocketServerTransport(ws);
  server.connect(transport);
});
```

### In-Memory Transport (Testing)

Perfect for unit tests—no network, no processes:

```typescript
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Create linked pair
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

// Connect both sides
await Promise.all([
  client.connect(clientTransport),
  server.connect(serverTransport),
]);

// Messages flow directly between them
const { tools } = await client.listTools();  // Works instantly
```

## Security for Remote Transports

When using SSE or custom network transports, add authentication:

```typescript
// Server-side authentication middleware
function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token || !isValidToken(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

// Apply to MCP endpoints
app.get("/sse/:sessionId", authenticate, sseHandler);
app.post("/messages/:sessionId", authenticate, messageHandler);
```

```typescript
// Client-side: Add auth header
const transport = new SSEClientTransport(sseUrl, postUrl, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

## Common Gotchas

1. **stdout vs stderr in stdio** - Protocol uses stdout; logs must go to stderr

2. **SSE connection drops** - Implement reconnection logic for network issues

3. **Session management** - Clean up SSE sessions when clients disconnect

4. **CORS for SSE** - If client is a browser, configure CORS headers

5. **Timeouts** - SSE connections can timeout; send periodic keep-alive pings

## Exercises

1. **Local Server** - Build a stdio server and connect from Claude Desktop

2. **Remote Server** - Deploy an SSE server and connect from a different machine

3. **Custom Transport** - Implement a WebSocket transport

4. **Resilience** - Add reconnection logic to your SSE client

## Next Steps

→ **[Security](../06-security/README.md)** - Secure your servers (especially for remote deployment)

→ **[Patterns](../07-patterns/README.md)** - Production-ready patterns
