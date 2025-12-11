# Module 06: Security

> Protect your servers from misuse and attack

## Learning Objectives

By the end of this module, you'll understand:
- Why MCP security is different from traditional security
- The most common attack vectors
- How to validate inputs and paths
- Rate limiting and resource protection
- Secure configuration practices

## Why MCP Security is Different

Traditional software security assumes **code is trusted, input is untrusted**.

MCP security must assume **the LLM can be manipulated**. The inputs to your tools come from an AI that could be processing adversarial prompts.

```
USER INPUT ──► LLM ──► TOOL ARGUMENTS ──► YOUR SERVER ──► SYSTEMS
                │
                └── Adversarial prompts can manipulate what the LLM asks for
```

**Key insight:** Treat tool arguments like untrusted user input, even though they come from an AI assistant.

## The Three Most Common Attacks

### 1. Path Traversal

The LLM asks to read `../../../etc/passwd` and your server complies.

```typescript
// ❌ VULNERABLE: No path validation
server.tool("read_file", { path: z.string() }, async ({ path }) => {
  const content = await fs.readFile(path, "utf-8");  // Reads ANYTHING
  return { content: [{ type: "text", text: content }] };
});
```

```typescript
// ✅ SECURE: Validate path is within allowed directory
import path from "path";

const ALLOWED_ROOT = process.env.ALLOWED_ROOT || process.cwd();

function validatePath(userPath: string): string {
  const resolved = path.resolve(ALLOWED_ROOT, userPath);

  // Must be under allowed root
  if (!resolved.startsWith(path.resolve(ALLOWED_ROOT) + path.sep)) {
    throw new Error(`Access denied: path outside ${ALLOWED_ROOT}`);
  }

  return resolved;
}

server.tool("read_file", { path: z.string() }, async ({ path: userPath }) => {
  const safePath = validatePath(userPath);
  const content = await fs.readFile(safePath, "utf-8");
  return { content: [{ type: "text", text: content }] };
});
```

### 2. Resource Exhaustion

The LLM asks to read a 10GB file or run an infinite loop.

```typescript
// ❌ VULNERABLE: No limits
server.tool("search", { pattern: z.string() }, async ({ pattern }) => {
  const results = await glob(pattern);  // Could return millions of files
  return { content: [{ type: "text", text: results.join("\n") }] };
});
```

```typescript
// ✅ SECURE: Enforce limits
const MAX_RESULTS = 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10MB

server.tool("search", { pattern: z.string() }, async ({ pattern }) => {
  const results = await glob(pattern);

  if (results.length > MAX_RESULTS) {
    return {
      content: [{
        type: "text",
        text: `Too many results (${results.length}). Refine your search pattern.`,
      }],
      isError: true,
    };
  }

  return { content: [{ type: "text", text: results.join("\n") }] };
});
```

### 3. Injection Attacks

The LLM passes malicious strings that get executed or interpolated.

```typescript
// ❌ VULNERABLE: Command injection
server.tool("run_script", { name: z.string() }, async ({ name }) => {
  const result = execSync(`./scripts/${name}.sh`);  // Shell injection!
  return { content: [{ type: "text", text: result.toString() }] };
});

// Attack: name = "foo; rm -rf /"
```

```typescript
// ✅ SECURE: Allowlist approach
const ALLOWED_SCRIPTS = ["build", "test", "lint"];

server.tool(
  "run_script",
  { name: z.enum(["build", "test", "lint"]) },  // Only allow specific values
  async ({ name }) => {
    const result = execSync(`./scripts/${name}.sh`);
    return { content: [{ type: "text", text: result.toString() }] };
  }
);
```

## Input Validation Patterns

### Use Zod Effectively

```typescript
// String constraints
z.string().min(1).max(1000)           // Length limits
z.string().regex(/^[a-z0-9_-]+$/)     // Character allowlist
z.string().email()                     // Format validation
z.string().url()                       // URL format

// Number constraints
z.number().int().positive()            // Positive integers only
z.number().min(1).max(100)             // Range

// Enums (best for fixed options)
z.enum(["read", "write", "delete"])    // Only these values

// Arrays with limits
z.array(z.string()).max(10)            // No more than 10 items
```

### Validate at Multiple Levels

```typescript
server.tool(
  "query_users",
  {
    // Level 1: Schema validation
    filter: z.object({
      field: z.enum(["name", "email", "role"]),  // Only allowed fields
      value: z.string().max(100),
    }),
    limit: z.number().int().min(1).max(100).default(10),
  },
  async ({ filter, limit }) => {
    // Level 2: Application validation
    if (filter.field === "email" && !filter.value.includes("@")) {
      return {
        content: [{ type: "text", text: "Invalid email format" }],
        isError: true,
      };
    }

    // Level 3: Use parameterized queries (never string interpolation)
    const users = await db.users.findMany({
      where: { [filter.field]: filter.value },
      take: limit,
    });

    return { content: [{ type: "text", text: JSON.stringify(users) }] };
  }
);
```

## Rate Limiting

Prevent abuse by limiting how often tools can be called:

```typescript
class RateLimiter {
  private calls = new Map<string, number[]>();

  constructor(
    private maxCalls: number,
    private windowMs: number
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get calls within window
    const calls = this.calls.get(key) || [];
    const recentCalls = calls.filter(t => t > windowStart);

    if (recentCalls.length >= this.maxCalls) {
      return false;  // Rate limited
    }

    recentCalls.push(now);
    this.calls.set(key, recentCalls);
    return true;
  }
}

const rateLimiter = new RateLimiter(10, 60000);  // 10 calls per minute

server.tool("expensive_operation", {}, async (args, { meta }) => {
  const clientId = meta?.clientId || "default";

  if (!rateLimiter.check(clientId)) {
    return {
      content: [{ type: "text", text: "Rate limit exceeded. Try again in a minute." }],
      isError: true,
    };
  }

  // Proceed with operation...
});
```

## Secrets Management

Never hardcode secrets. Never log them.

```typescript
// ❌ BAD: Hardcoded secret
const API_KEY = "sk-1234567890";

// ❌ BAD: Secret in logs
console.error(`Connecting with key: ${process.env.API_KEY}`);

// ✅ GOOD: Environment variables, no logging
const config = {
  apiKey: process.env.API_KEY,
  dbUrl: process.env.DATABASE_URL,
};

if (!config.apiKey) {
  console.error("ERROR: API_KEY environment variable required");
  process.exit(1);
}

// Log that we're using a key, not the key itself
console.error("API key configured: ***");
```

### Claude Desktop Config

Secrets go in environment variables:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["server.js"],
      "env": {
        "API_KEY": "sk-your-secret-key",
        "DATABASE_URL": "postgres://..."
      }
    }
  }
}
```

## Secure Remote Servers

For SSE/HTTP servers, add authentication:

```typescript
import express from "express";
import helmet from "helmet";
import cors from "cors";

const app = express();

// Security headers
app.use(helmet());

// CORS (restrict origins)
app.use(cors({
  origin: ["https://your-app.com"],
  credentials: true,
}));

// Authentication
function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  if (!verifyToken(token)) {
    return res.status(403).json({ error: "Invalid token" });
  }

  next();
}

// Protect MCP endpoints
app.use("/mcp", authenticate);
```

## Security Checklist

### Before Deployment

- [ ] All file paths validated against allowed root
- [ ] Symlinks resolved and checked
- [ ] File size limits enforced
- [ ] Result count limits enforced
- [ ] No secrets in code (environment variables only)
- [ ] No secrets in logs
- [ ] SQL queries use parameterization
- [ ] External URLs validated against allowlist
- [ ] Rate limiting implemented

### For Remote Servers

- [ ] HTTPS only (no HTTP)
- [ ] Authentication required
- [ ] CORS configured restrictively
- [ ] Security headers set (helmet)
- [ ] Session timeout implemented

## Common Gotchas

1. **Trusting the LLM** - The LLM can be manipulated; validate everything

2. **Path.join is not validation** - `path.join("/safe", "../etc/passwd")` returns `/etc/passwd`

3. **Forgetting symlinks** - Resolve symlinks with `fs.realpath` before checking paths

4. **Logging secrets** - Even debug logs can leak to observability systems

5. **Blocklists instead of allowlists** - Always specify what's allowed, not what's forbidden

## Exercises

1. **Path Traversal** - Find and fix the vulnerability in a sample server

2. **Rate Limiter** - Implement rate limiting per client

3. **Security Audit** - Review a server for the vulnerabilities covered here

4. **Auth Layer** - Add JWT authentication to an SSE server

## Next Steps

→ **[Patterns](../07-patterns/README.md)** - Production patterns including secure design

→ **[Lab: Filesystem Server](../labs/01-filesystem-server/)** - Practice implementing security
