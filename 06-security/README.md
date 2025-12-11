# MCP Security

## Threat Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      ATTACK SURFACE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  USER INPUT ──► LLM ──► MCP CLIENT ──► MCP SERVER ──► RESOURCES │
│       │                      │              │             │      │
│       ▼                      ▼              ▼             ▼      │
│  Prompt         Tool call    Server        File system   │      │
│  Injection      hijacking    spoofing      Database      │      │
│                              MITM          APIs          │      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Principles

### 1. Least Privilege

Servers should only have access to what they need.

```typescript
// BAD: Full filesystem access
const server = new FilesystemServer({ root: "/" });

// GOOD: Scoped to specific directory
const server = new FilesystemServer({
  root: "/home/user/project",
  readOnly: true,  // If writes aren't needed
});
```

### 2. Input Validation

Never trust input from the client (LLM-generated arguments).

```typescript
server.tool(
  "query_database",
  {
    table: z.enum(["users", "products", "orders"]),  // Allowlist, not string
    id: z.string().uuid(),  // Strict format
    fields: z.array(z.enum(["id", "name", "email"])).max(10),
  },
  async ({ table, id, fields }) => {
    // Safe: table and fields are from allowlist
    const result = await db.query(
      `SELECT ${fields.join(", ")} FROM ${table} WHERE id = $1`,
      [id]
    );
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
```

### 3. Path Traversal Prevention

Always validate file paths.

```typescript
import path from "path";
import { realpath } from "fs/promises";

const ALLOWED_ROOT = "/safe/directory";

async function validatePath(inputPath: string): Promise<string> {
  // Resolve to absolute path
  const resolved = path.resolve(ALLOWED_ROOT, inputPath);

  // Check it's under allowed root
  if (!resolved.startsWith(ALLOWED_ROOT + path.sep)) {
    throw new Error("Access denied: path outside allowed directory");
  }

  // Resolve symlinks and check again
  try {
    const real = await realpath(resolved);
    if (!real.startsWith(ALLOWED_ROOT + path.sep)) {
      throw new Error("Access denied: symlink points outside allowed directory");
    }
    return real;
  } catch (err) {
    // File doesn't exist yet (for writes), use resolved path
    return resolved;
  }
}
```

### 4. Output Sanitization

Don't leak sensitive information in responses.

```typescript
server.tool("get_config", {}, async () => {
  const config = await loadConfig();

  // Remove sensitive fields before returning
  const sanitized = {
    ...config,
    apiKey: undefined,
    dbPassword: undefined,
    secretToken: undefined,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(sanitized, null, 2) }],
  };
});
```

### 5. Rate Limiting

Prevent resource exhaustion.

```typescript
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(clientId: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimits.get(clientId);

  if (!record || now > record.resetAt) {
    rateLimits.set(clientId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;
  return true;
}

server.tool("expensive_operation", {}, async (args, { meta }) => {
  const clientId = meta?.clientId ?? "default";

  if (!checkRateLimit(clientId, 10, 60000)) {  // 10 per minute
    return {
      content: [{ type: "text", text: "Rate limit exceeded. Try again later." }],
      isError: true,
    };
  }

  // Proceed with operation...
});
```

## Transport Security

### stdio Transport

- Secure by default (local process)
- Don't log sensitive data to stderr
- Use environment variables for secrets

```typescript
// Server receives secrets via environment
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY required");
  process.exit(1);
}

// Client passes secrets via environment
const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
  env: {
    ...process.env,
    API_KEY: secretValue,  // Passed securely
  },
});
```

### SSE/HTTP Transport

- Always use HTTPS
- Implement authentication
- Validate origins (CORS)
- Use secure session tokens

```typescript
import helmet from "helmet";
import cors from "cors";

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: ["https://trusted-app.com"],
  credentials: true,
}));

// Authentication middleware
app.use("/mcp", async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token || !await verifyToken(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});
```

## Tool-Specific Security

### File Operations

```typescript
const FILE_SIZE_LIMIT = 10 * 1024 * 1024;  // 10MB
const ALLOWED_EXTENSIONS = [".txt", ".json", ".md", ".ts", ".js"];

server.tool("read_file", { path: z.string() }, async ({ path: filePath }) => {
  const resolved = await validatePath(filePath);

  // Check extension
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      content: [{ type: "text", text: `File type not allowed: ${ext}` }],
      isError: true,
    };
  }

  // Check size
  const stats = await fs.stat(resolved);
  if (stats.size > FILE_SIZE_LIMIT) {
    return {
      content: [{ type: "text", text: `File too large: ${stats.size} bytes` }],
      isError: true,
    };
  }

  const content = await fs.readFile(resolved, "utf-8");
  return { content: [{ type: "text", text: content }] };
});
```

### Database Operations

```typescript
// NEVER do this
server.tool("raw_query", { sql: z.string() }, async ({ sql }) => {
  return db.raw(sql);  // SQL INJECTION!
});

// DO this instead
server.tool(
  "find_user",
  {
    by: z.enum(["id", "email"]),
    value: z.string(),
  },
  async ({ by, value }) => {
    // Parameterized query
    const user = await db.users.findOne({ [by]: value });
    return { content: [{ type: "text", text: JSON.stringify(user) }] };
  }
);
```

### External API Calls

```typescript
const ALLOWED_DOMAINS = ["api.trusted.com", "data.partner.com"];

server.tool("fetch_url", { url: z.string().url() }, async ({ url }) => {
  const parsed = new URL(url);

  // Check domain allowlist
  if (!ALLOWED_DOMAINS.includes(parsed.hostname)) {
    return {
      content: [{ type: "text", text: `Domain not allowed: ${parsed.hostname}` }],
      isError: true,
    };
  }

  // Prevent SSRF
  if (parsed.hostname === "localhost" || parsed.hostname.startsWith("127.")) {
    return {
      content: [{ type: "text", text: "Local addresses not allowed" }],
      isError: true,
    };
  }

  const response = await fetch(url);
  return { content: [{ type: "text", text: await response.text() }] };
});
```

## Security Checklist

### Server Development
- [ ] All paths validated against allowed root
- [ ] Symlinks resolved and checked
- [ ] Input parameters use strict schemas (enums, formats)
- [ ] File size limits enforced
- [ ] Rate limiting implemented
- [ ] Secrets not in code (use environment)
- [ ] Sensitive data not logged
- [ ] SQL queries parameterized
- [ ] External URLs validated against allowlist

### Deployment
- [ ] HTTPS enabled (for SSE transport)
- [ ] Authentication required
- [ ] CORS configured
- [ ] Security headers set
- [ ] Secrets in secure storage (not env files)
- [ ] Monitoring for anomalies
- [ ] Logging without sensitive data
