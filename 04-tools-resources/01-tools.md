# Module 04: Tools Deep Dive

> Master tool design, validation, and security

## Learning Objectives

By the end of this module, you'll be able to:
- Write tool descriptions that help the LLM make good decisions
- Validate inputs with Zod schemas
- Return results in formats the LLM can use effectively
- Avoid common security pitfalls
- Handle long-running operations

## The Tool Description is Everything

The LLM decides which tool to use based on the description. A bad description means the tool never gets called—or gets called at the wrong time.

### Bad vs Good Descriptions

```typescript
// ❌ BAD: Vague, LLM doesn't know when to use it
server.tool(
  "process",
  "Process data",
  { input: z.string() },
  handler
);

// ❌ BAD: Too technical, doesn't explain the use case
server.tool(
  "rg_search",
  "Execute ripgrep with PCRE2 regex",
  { pattern: z.string() },
  handler
);

// ✅ GOOD: Clear purpose, when to use, what it returns
server.tool(
  "search_code",
  "Search for code patterns across the project. Use this to find function " +
  "definitions, imports, or any text pattern. Returns matching file paths " +
  "and line numbers. Supports regex patterns.",
  {
    pattern: z.string().describe("Regex pattern to search for"),
    fileType: z.string().optional().describe("Filter by extension, e.g., 'ts' or 'py'"),
    caseSensitive: z.boolean().default(false).describe("Match case exactly"),
  },
  handler
);
```

### Description Checklist

✅ **What** - What does this tool do?
✅ **When** - When should the LLM use it (vs other tools)?
✅ **Returns** - What will the result look like?
✅ **Limitations** - What doesn't it do?

## Parameter Validation with Zod

Zod schemas validate inputs before your handler runs. This prevents crashes and security issues.

### Basic Types

```typescript
import { z } from "zod";

// Strings
z.string()                          // Any string
z.string().min(1)                   // Non-empty
z.string().max(1000)                // Limited length
z.string().email()                  // Valid email
z.string().url()                    // Valid URL
z.string().regex(/^[a-z0-9-]+$/)    // Custom pattern

// Numbers
z.number()                          // Any number
z.number().int()                    // Integer only
z.number().positive()               // > 0
z.number().min(0).max(100)          // Range

// Booleans
z.boolean()
z.boolean().default(false)          // Default value

// Enums (restrict to specific values)
z.enum(["asc", "desc"])
z.enum(["low", "medium", "high"])

// Optional parameters
z.string().optional()               // Can be undefined
z.string().default("default")       // Has default value
```

### Complex Types

```typescript
// Arrays
z.array(z.string())                 // Array of strings
z.array(z.string()).min(1).max(10)  // 1-10 items

// Objects
z.object({
  name: z.string(),
  age: z.number().optional(),
})

// Union types (either/or)
z.union([z.string(), z.number()])

// Full tool example
server.tool(
  "create_issue",
  "Create a GitHub issue",
  {
    title: z.string().min(1).max(256).describe("Issue title"),
    body: z.string().max(65536).optional().describe("Issue description (markdown)"),
    labels: z.array(z.string()).max(10).default([]).describe("Labels to apply"),
    priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    assignees: z.array(z.string()).optional().describe("GitHub usernames to assign"),
  },
  async (params) => {
    // params is fully typed and validated
    const { title, body, labels, priority, assignees } = params;
    // ...
  }
);
```

## Returning Results

Tool results are how the LLM gets information. Format them for easy consumption.

### Text Results

```typescript
// Simple text
return {
  content: [{ type: "text", text: "File created successfully" }],
};

// Structured data as formatted text
return {
  content: [{
    type: "text",
    text: `Found 3 users:
- alice@example.com (Admin)
- bob@example.com (User)
- carol@example.com (User)`,
  }],
};

// JSON data
return {
  content: [{
    type: "text",
    text: JSON.stringify(data, null, 2),
  }],
};
```

### Error Results

```typescript
// Tell the LLM something went wrong
return {
  content: [{ type: "text", text: "File not found: /path/to/file.txt" }],
  isError: true,  // Marks this as an error
};

// With recovery suggestions
return {
  content: [{
    type: "text",
    text: `Permission denied: /etc/passwd

This file requires root access. Try:
- A file in your home directory
- Using sudo (if available)`,
  }],
  isError: true,
};
```

### Multiple Content Items

```typescript
// Several related pieces of information
return {
  content: [
    { type: "text", text: "Search results (3 matches):" },
    { type: "text", text: "src/index.ts:15 - function main()" },
    { type: "text", text: "src/utils.ts:42 - export function helper()" },
    { type: "text", text: "src/types.ts:8 - interface Config" },
  ],
};
```

### Images

```typescript
import { readFileSync } from "fs";

server.tool("screenshot", "Take a screenshot", {}, async () => {
  const imageBuffer = await takeScreenshot();
  const base64 = imageBuffer.toString("base64");

  return {
    content: [{
      type: "image",
      data: base64,
      mimeType: "image/png",
    }],
  };
});
```

## Security: The Big Three

### 1. Path Traversal Prevention

Never trust paths from the LLM:

```typescript
import path from "path";

const ALLOWED_ROOT = "/safe/directory";

function validatePath(userPath: string): string {
  // Resolve to absolute path
  const resolved = path.resolve(ALLOWED_ROOT, userPath);

  // Check it's still under allowed root
  if (!resolved.startsWith(ALLOWED_ROOT + path.sep)) {
    throw new Error("Access denied: path outside allowed directory");
  }

  return resolved;
}

server.tool("read_file", { path: z.string() }, async ({ path: userPath }) => {
  const safePath = validatePath(userPath);  // Throws if invalid
  const content = await fs.readFile(safePath, "utf-8");
  return { content: [{ type: "text", text: content }] };
});
```

**Attack prevented:** `path: "../../../etc/passwd"` → throws error

### 2. Input Size Limits

Prevent resource exhaustion:

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10MB

server.tool("read_file", { path: z.string() }, async ({ path: filePath }) => {
  const stats = await fs.stat(filePath);

  if (stats.size > MAX_FILE_SIZE) {
    return {
      content: [{ type: "text", text: `File too large: ${stats.size} bytes (max: ${MAX_FILE_SIZE})` }],
      isError: true,
    };
  }

  const content = await fs.readFile(filePath, "utf-8");
  return { content: [{ type: "text", text: content }] };
});
```

### 3. Allowlists Over Blocklists

Specify what's allowed, not what's forbidden:

```typescript
// ❌ BAD: Blocklist (easy to miss something)
const BLOCKED_EXTENSIONS = [".exe", ".sh", ".bat"];
if (BLOCKED_EXTENSIONS.includes(ext)) {
  throw new Error("Blocked");
}

// ✅ GOOD: Allowlist (explicit about what's safe)
const ALLOWED_EXTENSIONS = [".txt", ".md", ".json", ".ts", ".js"];
if (!ALLOWED_EXTENSIONS.includes(ext)) {
  return {
    content: [{ type: "text", text: `File type not allowed: ${ext}` }],
    isError: true,
  };
}
```

## Long-Running Operations

Some tools take time. Report progress:

```typescript
server.tool(
  "build_project",
  "Run the project build",
  {},
  async (args, { reportProgress }) => {
    await reportProgress({ progress: 0, total: 100, status: "Starting..." });

    await runLint();
    await reportProgress({ progress: 25, total: 100, status: "Linting complete" });

    await runTypeCheck();
    await reportProgress({ progress: 50, total: 100, status: "Type check complete" });

    await runTests();
    await reportProgress({ progress: 75, total: 100, status: "Tests complete" });

    await createBundle();
    await reportProgress({ progress: 100, total: 100, status: "Build complete" });

    return { content: [{ type: "text", text: "Build succeeded!" }] };
  }
);
```

## Tool Design Patterns

### Pattern 1: Preview Before Action

For destructive operations, return a preview first:

```typescript
server.tool(
  "delete_files",
  "Delete files matching pattern. Call without confirm to see preview.",
  {
    pattern: z.string().describe("Glob pattern"),
    confirm: z.boolean().default(false).describe("Set true to actually delete"),
  },
  async ({ pattern, confirm }) => {
    const matches = await glob(pattern);

    if (!confirm) {
      return {
        content: [{
          type: "text",
          text: `Would delete ${matches.length} files:\n${matches.slice(0, 20).join("\n")}` +
            (matches.length > 20 ? `\n...and ${matches.length - 20} more` : "") +
            `\n\nCall with confirm: true to proceed.`,
        }],
      };
    }

    await Promise.all(matches.map(f => fs.unlink(f)));
    return { content: [{ type: "text", text: `Deleted ${matches.length} files` }] };
  }
);
```

### Pattern 2: Chunked Results

Don't return huge responses:

```typescript
const MAX_RESULTS = 100;

server.tool("search", { query: z.string() }, async ({ query }) => {
  const allResults = await search(query);

  if (allResults.length > MAX_RESULTS) {
    return {
      content: [{
        type: "text",
        text: `Found ${allResults.length} results (showing first ${MAX_RESULTS}):\n\n` +
          allResults.slice(0, MAX_RESULTS).join("\n") +
          `\n\n... ${allResults.length - MAX_RESULTS} more results not shown`,
      }],
    };
  }

  return { content: [{ type: "text", text: allResults.join("\n") }] };
});
```

## Common Gotchas

1. **Vague descriptions** - The LLM won't know when to use your tool

2. **Missing `.describe()` on params** - The LLM won't know what to pass

3. **Trusting paths** - Always validate against an allowed root

4. **Unbounded results** - Limit array sizes, file sizes, response lengths

5. **Swallowing errors** - Return errors to the LLM; don't just catch and ignore

6. **Not using `isError: true`** - The host needs to know when something failed

## Exercises

1. **Good Descriptions** - Rewrite these tool descriptions to be clear and useful
2. **Validation** - Add Zod schemas to catch invalid inputs
3. **Security Audit** - Find the vulnerabilities in a sample tool
4. **Chunking** - Implement pagination for large result sets

## Next Steps

→ **[Transports](../05-transports/README.md)** - Deploy your server over HTTP

→ **[Security](../06-security/README.md)** - Complete security hardening guide

→ **[Patterns](../07-patterns/README.md)** - Production patterns and anti-patterns
