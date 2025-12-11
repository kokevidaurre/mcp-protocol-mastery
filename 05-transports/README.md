# MCP Transports

## Overview

Transports handle the low-level communication between MCP clients and servers. MCP is transport-agnostic - the same protocol works over different transport mechanisms.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP PROTOCOL LAYER                            │
│              (JSON-RPC messages, same everywhere)                │
├─────────────────────────────────────────────────────────────────┤
│                    TRANSPORT LAYER                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   stdio     │  │    SSE      │  │   Custom    │              │
│  │  (local)    │  │  (remote)   │  │  (WebSocket)│              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## stdio Transport

**Best for:** Local servers, CLI tools, desktop applications

The most common transport. Client spawns server as subprocess, communicates via stdin/stdout.

```
┌────────────┐          stdin           ┌────────────┐
│   CLIENT   │  ─────────────────────►  │   SERVER   │
│   (host)   │  ◄─────────────────────  │  (process) │
└────────────┘          stdout          └────────────┘
```

### Server (TypeScript)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// IMPORTANT: Use stderr for logs, stdout is for protocol
console.error("Server starting..."); // OK
// console.log("..."); // BAD - interferes with protocol

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Client (TypeScript)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/path/to/server.js"],
  env: {
    ...process.env,
    MY_API_KEY: "secret",
  },
  cwd: "/working/directory",
});

const client = new Client({ name: "my-client", version: "1.0.0" });
await client.connect(transport);
```

### Python Server

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
import sys

server = Server("my-server")

# IMPORTANT: Use stderr for logs
print("Starting server...", file=sys.stderr)

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write)
```

## SSE Transport (Server-Sent Events)

**Best for:** Remote servers, web applications, cloud deployments

HTTP-based transport using SSE for server-to-client streaming.

```
┌────────────┐    HTTP POST (requests)    ┌────────────┐
│   CLIENT   │  ─────────────────────────► │   SERVER   │
│            │  ◄───────────────────────── │   (HTTP)   │
└────────────┘    SSE stream (responses)   └────────────┘
```

### Server (TypeScript)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();
const server = new McpServer({ name: "my-server", version: "1.0.0" });

// Store transports by session
const transports = new Map<string, SSEServerTransport>();

// SSE endpoint for server-to-client messages
app.get("/sse/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const transport = new SSEServerTransport("/messages/" + sessionId, res);
  transports.set(sessionId, transport);
  server.connect(transport);
});

// POST endpoint for client-to-server messages
app.post("/messages/:sessionId", express.json(), (req, res) => {
  const { sessionId } = req.params;
  const transport = transports.get(sessionId);
  if (transport) {
    transport.handleMessage(req.body);
    res.status(200).send();
  } else {
    res.status(404).send("Session not found");
  }
});

app.listen(3000);
```

### Client (TypeScript)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const sessionId = crypto.randomUUID();
const transport = new SSEClientTransport(
  new URL(`http://localhost:3000/sse/${sessionId}`),
  new URL(`http://localhost:3000/messages/${sessionId}`)
);

const client = new Client({ name: "my-client", version: "1.0.0" });
await client.connect(transport);
```

## Custom Transports

Implement the `Transport` interface for custom protocols.

### Transport Interface

```typescript
interface Transport {
  // Start the transport
  start(): Promise<void>;

  // Send a JSON-RPC message
  send(message: JSONRPCMessage): Promise<void>;

  // Close the transport
  close(): Promise<void>;

  // Event handlers
  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}
```

### WebSocket Transport Example

```typescript
import { Transport, JSONRPCMessage } from "@modelcontextprotocol/sdk/shared/transport.js";
import WebSocket from "ws";

class WebSocketTransport implements Transport {
  private ws: WebSocket;

  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(private url: string) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => {
        this.onerror?.(err);
        reject(err);
      });

      this.ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.onmessage?.(message);
        } catch (err) {
          this.onerror?.(err as Error);
        }
      });

      this.ws.on("close", () => this.onclose?.());
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.ws.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    this.ws.close();
  }
}
```

### In-Memory Transport (Testing)

```typescript
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Create linked pair of transports
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

// Connect client and server
await Promise.all([
  client.connect(clientTransport),
  server.connect(serverTransport),
]);

// Messages pass directly between them (no network/process)
```

## Transport Selection Guide

| Use Case | Transport | Reason |
|----------|-----------|--------|
| Claude Desktop | stdio | Local process, secure |
| VS Code extension | stdio | Local process |
| Cloud API | SSE | HTTP-based, scalable |
| Browser app | SSE or WebSocket | Network-based |
| Testing | InMemory | Fast, no IO |
| Microservices | Custom (gRPC) | Performance |

## Security Considerations

### stdio
- Inherently secure (local process)
- Environment variables for secrets
- Filesystem permissions apply

### SSE/HTTP
- Always use HTTPS in production
- Implement authentication
- Validate session tokens
- Rate limiting

```typescript
// SSE with authentication
app.get("/sse/:sessionId", authenticateRequest, (req, res) => {
  // Only authenticated requests get here
});

function authenticateRequest(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!isValidToken(token)) {
    return res.status(401).send("Unauthorized");
  }
  next();
}
```
