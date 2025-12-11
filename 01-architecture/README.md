# MCP Architecture

## Protocol Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                          │
│  Tools, Resources, Prompts, Sampling                            │
├─────────────────────────────────────────────────────────────────┤
│                      MESSAGE LAYER                              │
│  JSON-RPC 2.0 Messages                                          │
├─────────────────────────────────────────────────────────────────┤
│                      TRANSPORT LAYER                            │
│  stdio, SSE, Custom                                             │
└─────────────────────────────────────────────────────────────────┘
```

## Message Format

MCP uses JSON-RPC 2.0 for all communication.

### Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "/src/index.ts"
    }
  }
}
```

### Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "file contents here..."
      }
    ]
  }
}
```

### Notification (no response expected)

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

### Error

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": { "details": "..." }
  }
}
```

## Connection Lifecycle

```
┌──────────┐                              ┌──────────┐
│  CLIENT  │                              │  SERVER  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  ──────── initialize ─────────────────► │
     │           {protocolVersion,             │
     │            capabilities,                │
     │            clientInfo}                  │
     │                                         │
     │  ◄─────── initialize result ────────── │
     │           {protocolVersion,             │
     │            capabilities,                │
     │            serverInfo}                  │
     │                                         │
     │  ──────── initialized ────────────────► │
     │           (notification)                │
     │                                         │
     │  ═══════ SESSION ACTIVE ═══════════════ │
     │                                         │
     │  ──────── tools/list ─────────────────► │
     │  ◄─────── tools list ──────────────────│
     │                                         │
     │  ──────── tools/call ─────────────────► │
     │  ◄─────── tool result ─────────────────│
     │                                         │
     │  ──────── shutdown ───────────────────► │
     │  ◄─────── shutdown ack ────────────────│
     │                                         │
```

## Method Reference

### Initialization

| Method | Direction | Description |
|--------|-----------|-------------|
| `initialize` | Client → Server | Start session, negotiate capabilities |
| `initialized` | Client → Server | Confirm initialization complete |

### Tools

| Method | Direction | Description |
|--------|-----------|-------------|
| `tools/list` | Client → Server | List available tools |
| `tools/call` | Client → Server | Invoke a tool |

### Resources

| Method | Direction | Description |
|--------|-----------|-------------|
| `resources/list` | Client → Server | List available resources |
| `resources/read` | Client → Server | Read resource content |
| `resources/subscribe` | Client → Server | Subscribe to resource changes |
| `resources/unsubscribe` | Client → Server | Unsubscribe from resource |

### Prompts

| Method | Direction | Description |
|--------|-----------|-------------|
| `prompts/list` | Client → Server | List available prompts |
| `prompts/get` | Client → Server | Get prompt content |

### Sampling (Server → Client)

| Method | Direction | Description |
|--------|-----------|-------------|
| `sampling/createMessage` | Server → Client | Request LLM completion |

### Utilities

| Method | Direction | Description |
|--------|-----------|-------------|
| `ping` | Either | Health check |
| `logging/setLevel` | Client → Server | Set log verbosity |
| `completion/complete` | Client → Server | Request completions |

### Notifications

| Method | Direction | Description |
|--------|-----------|-------------|
| `notifications/tools/list_changed` | Server → Client | Tools changed |
| `notifications/resources/list_changed` | Server → Client | Resources changed |
| `notifications/resources/updated` | Server → Client | Resource content changed |
| `notifications/prompts/list_changed` | Server → Client | Prompts changed |
| `notifications/progress` | Either | Progress update |
| `notifications/cancelled` | Either | Operation cancelled |

## Capability Negotiation

### Client Capabilities

```typescript
interface ClientCapabilities {
  // Client can handle root changes
  roots?: {
    listChanged?: boolean;
  };

  // Client can perform LLM sampling
  sampling?: {};

  // Experimental features
  experimental?: Record<string, object>;
}
```

### Server Capabilities

```typescript
interface ServerCapabilities {
  // Server provides tools
  tools?: {
    listChanged?: boolean;  // Can notify of changes
  };

  // Server provides resources
  resources?: {
    subscribe?: boolean;    // Supports subscriptions
    listChanged?: boolean;  // Can notify of changes
  };

  // Server provides prompts
  prompts?: {
    listChanged?: boolean;  // Can notify of changes
  };

  // Server supports logging
  logging?: {};

  // Experimental features
  experimental?: Record<string, object>;
}
```

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Not valid JSON-RPC |
| -32601 | Method not found | Unknown method |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Server error |
