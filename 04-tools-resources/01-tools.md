# Tools Deep Dive

## What Are Tools?

Tools are functions that an LLM can call to perform actions. They're the "hands" of an AI assistant.

```
LLM Decision: "I need to search for files"
     │
     ▼
Tool Call: search_files({ pattern: "*.ts", path: "/src" })
     │
     ▼
Tool Execution: Server runs the search
     │
     ▼
Tool Result: ["index.ts", "utils.ts", "types.ts"]
     │
     ▼
LLM Response: "I found 3 TypeScript files..."
```

## Tool Definition Schema

```typescript
{
  name: string;           // Unique identifier (snake_case recommended)
  description: string;    // What the tool does (LLM reads this!)
  inputSchema: {          // JSON Schema for parameters
    type: "object";
    properties: { ... };
    required: [...];
  };
}
```

## Writing Good Tool Descriptions

The description is critical - it's how the LLM decides when to use your tool.

```typescript
// BAD: Vague, unhelpful
server.tool(
  "do_thing",
  "Does a thing",
  { input: z.string() },
  async ({ input }) => { ... }
);

// GOOD: Specific, actionable
server.tool(
  "search_codebase",
  "Search for code patterns across the project using ripgrep. " +
  "Use for finding function definitions, imports, or text patterns. " +
  "Returns matching file paths and line numbers.",
  {
    pattern: z.string().describe("Regex pattern to search for"),
    fileType: z.string().optional().describe("File extension filter, e.g., 'ts', 'py'"),
    maxResults: z.number().default(50).describe("Maximum results to return"),
  },
  async ({ pattern, fileType, maxResults }) => { ... }
);
```

## Tool Categories

### 1. Query Tools (Read-only)

```typescript
server.tool(
  "get_user",
  "Retrieve user information by ID",
  { userId: z.string().uuid() },
  async ({ userId }) => {
    const user = await db.users.findById(userId);
    return {
      content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
    };
  }
);
```

### 2. Action Tools (Side effects)

```typescript
server.tool(
  "send_email",
  "Send an email to a recipient. Requires user confirmation in most hosts.",
  {
    to: z.string().email(),
    subject: z.string().max(200),
    body: z.string().max(10000),
  },
  async ({ to, subject, body }) => {
    await emailService.send({ to, subject, body });
    return {
      content: [{ type: "text", text: `Email sent to ${to}` }],
    };
  }
);
```

### 3. Computation Tools

```typescript
server.tool(
  "calculate_metrics",
  "Calculate code complexity metrics for a file",
  { filePath: z.string() },
  async ({ filePath }) => {
    const code = await fs.readFile(filePath, "utf-8");
    const metrics = analyzeComplexity(code);
    return {
      content: [{
        type: "text",
        text: `Cyclomatic complexity: ${metrics.cyclomatic}\n` +
              `Lines of code: ${metrics.loc}\n` +
              `Maintainability index: ${metrics.maintainability}`,
      }],
    };
  }
);
```

## Input Validation with Zod

```typescript
import { z } from "zod";

// String with constraints
z.string().min(1).max(100)
z.string().email()
z.string().url()
z.string().regex(/^[a-z]+$/)

// Numbers
z.number().int().positive()
z.number().min(0).max(100)

// Enums
z.enum(["draft", "published", "archived"])

// Arrays
z.array(z.string()).min(1).max(10)

// Objects
z.object({
  name: z.string(),
  age: z.number().optional(),
})

// Union types
z.union([z.string(), z.number()])

// Full example
server.tool(
  "create_issue",
  "Create a GitHub issue",
  {
    title: z.string().min(1).max(256).describe("Issue title"),
    body: z.string().max(65536).optional().describe("Issue body in markdown"),
    labels: z.array(z.string()).max(10).optional().describe("Labels to apply"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  },
  async (args) => { ... }
);
```

## Returning Results

### Text Content

```typescript
return {
  content: [{ type: "text", text: "Operation completed successfully" }],
};
```

### Structured Data (as text)

```typescript
return {
  content: [{
    type: "text",
    text: JSON.stringify(result, null, 2),
  }],
};
```

### Multiple Content Items

```typescript
return {
  content: [
    { type: "text", text: "Found 3 results:" },
    { type: "text", text: JSON.stringify(results[0]) },
    { type: "text", text: JSON.stringify(results[1]) },
    { type: "text", text: JSON.stringify(results[2]) },
  ],
};
```

### Images (base64)

```typescript
return {
  content: [{
    type: "image",
    data: base64EncodedImage,
    mimeType: "image/png",
  }],
};
```

### Errors

```typescript
return {
  content: [{ type: "text", text: `Error: File not found: ${path}` }],
  isError: true,  // Signals this is an error result
};
```

## Long-Running Operations

For tools that take time, report progress:

```typescript
server.tool(
  "build_project",
  "Run project build",
  {},
  async (args, { reportProgress }) => {
    await reportProgress({ progress: 0, total: 100 });

    await runStep1();
    await reportProgress({ progress: 33, total: 100 });

    await runStep2();
    await reportProgress({ progress: 66, total: 100 });

    await runStep3();
    await reportProgress({ progress: 100, total: 100 });

    return { content: [{ type: "text", text: "Build complete" }] };
  }
);
```

## Tool Security Considerations

### 1. Input Sanitization

```typescript
server.tool(
  "run_query",
  "Run a database query",
  { query: z.string() },
  async ({ query }) => {
    // NEVER do this:
    // await db.raw(query);

    // Instead, use parameterized queries or allowlist
    if (!ALLOWED_QUERIES.includes(query)) {
      return {
        content: [{ type: "text", text: "Query not allowed" }],
        isError: true,
      };
    }
    // ...
  }
);
```

### 2. Path Validation

```typescript
import path from "path";

const ALLOWED_ROOT = "/safe/directory";

server.tool(
  "read_file",
  "Read a file",
  { filePath: z.string() },
  async ({ filePath }) => {
    const resolved = path.resolve(ALLOWED_ROOT, filePath);

    // Prevent path traversal
    if (!resolved.startsWith(ALLOWED_ROOT)) {
      return {
        content: [{ type: "text", text: "Access denied: path outside allowed directory" }],
        isError: true,
      };
    }

    const content = await fs.readFile(resolved, "utf-8");
    return { content: [{ type: "text", text: content }] };
  }
);
```

### 3. Rate Limiting

```typescript
const rateLimiter = new Map<string, number>();

server.tool(
  "expensive_operation",
  "Rate-limited operation",
  {},
  async (args, { meta }) => {
    const key = meta?.clientId ?? "default";
    const lastCall = rateLimiter.get(key) ?? 0;
    const now = Date.now();

    if (now - lastCall < 1000) {
      return {
        content: [{ type: "text", text: "Rate limit exceeded. Wait 1 second." }],
        isError: true,
      };
    }

    rateLimiter.set(key, now);
    // ... proceed with operation
  }
);
```

## Dynamic Tool Registration

```typescript
// Add tools at runtime
server.tool("dynamic_tool", "Added later", {}, async () => { ... });

// Notify clients of changes
await server.notification({
  method: "notifications/tools/list_changed",
});
```
