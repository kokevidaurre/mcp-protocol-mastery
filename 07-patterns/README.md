# Module 07: Production Patterns

> Patterns that work, anti-patterns to avoid

## Learning Objectives

By the end of this module, you'll know:
- Patterns that make tools robust and user-friendly
- Common anti-patterns and why they fail
- How to design tools that work well with LLMs
- Error handling that helps rather than confuses

## Pattern 1: Preview Before Destructive Action

**Problem:** The LLM deletes files without the user seeing what's being deleted.

**Solution:** Require a confirmation step that shows what will happen.

```typescript
server.tool(
  "delete_files",
  "Delete files matching a pattern. Shows preview first; set confirm=true to execute.",
  {
    pattern: z.string().describe("Glob pattern like **/*.log"),
    confirm: z.boolean().default(false).describe("Set true after reviewing preview"),
  },
  async ({ pattern, confirm }) => {
    const matches = await glob(pattern);

    // Preview mode: show what would be deleted
    if (!confirm) {
      if (matches.length === 0) {
        return { content: [{ type: "text", text: "No files match this pattern." }] };
      }

      const preview = matches.slice(0, 20);
      const more = matches.length > 20 ? `\n...and ${matches.length - 20} more` : "";

      return {
        content: [{
          type: "text",
          text: `Would delete ${matches.length} files:\n\n${preview.join("\n")}${more}\n\n` +
                `To proceed, call again with confirm: true`,
        }],
      };
    }

    // Execute mode: actually delete
    let deleted = 0;
    for (const file of matches) {
      await fs.unlink(file);
      deleted++;
    }

    return {
      content: [{ type: "text", text: `Deleted ${deleted} files.` }],
    };
  }
);
```

**Why it works:** The LLM sees exactly what will happen. The user can review before Claude proceeds.

## Pattern 2: Graceful Degradation

**Problem:** Tool fails completely on minor issues.

**Solution:** Return partial results with clear error information.

```typescript
server.tool(
  "read_multiple_files",
  "Read multiple files at once",
  {
    paths: z.array(z.string()).min(1).max(20),
  },
  async ({ paths }) => {
    const results: string[] = [];
    const errors: string[] = [];

    for (const filePath of paths) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        results.push(`=== ${filePath} ===\n${content}`);
      } catch (error) {
        errors.push(`${filePath}: ${error.message}`);
      }
    }

    // Return what we got, plus what failed
    let response = results.join("\n\n");

    if (errors.length > 0) {
      response += `\n\n--- Errors (${errors.length}/${paths.length} files) ---\n`;
      response += errors.join("\n");
    }

    return {
      content: [{ type: "text", text: response }],
      isError: errors.length === paths.length,  // Only error if ALL failed
    };
  }
);
```

**Why it works:** Partial success is better than total failure. The LLM can work with what it got.

## Pattern 3: Chunked Results

**Problem:** Tool returns 10,000 lines; context window overflows.

**Solution:** Limit results and indicate there's more.

```typescript
const MAX_RESULTS = 100;

server.tool(
  "search_code",
  "Search codebase for pattern. Returns up to 100 matches.",
  {
    pattern: z.string(),
    offset: z.number().default(0).describe("Skip first N results (for pagination)"),
  },
  async ({ pattern, offset }) => {
    const allMatches = await search(pattern);

    const total = allMatches.length;
    const page = allMatches.slice(offset, offset + MAX_RESULTS);
    const hasMore = offset + MAX_RESULTS < total;

    let result = `Found ${total} matches`;
    if (offset > 0) {
      result += ` (showing ${offset + 1}-${offset + page.length})`;
    }
    result += `:\n\n${page.join("\n")}`;

    if (hasMore) {
      result += `\n\n... ${total - offset - page.length} more results. `;
      result += `Use offset: ${offset + MAX_RESULTS} to see next page.`;
    }

    return { content: [{ type: "text", text: result }] };
  }
);
```

**Why it works:** LLM gets useful results without overwhelming its context.

## Pattern 4: Structured Error Messages

**Problem:** Error says "failed" with no actionable information.

**Solution:** Tell the LLM what happened, why, and what to try next.

```typescript
server.tool(
  "fetch_api",
  "Fetch data from API",
  { endpoint: z.string() },
  async ({ endpoint }) => {
    try {
      const response = await fetch(`https://api.example.com${endpoint}`);

      if (!response.ok) {
        // Actionable error message
        return {
          content: [{
            type: "text",
            text: `API Error: ${response.status} ${response.statusText}

Endpoint: ${endpoint}

Possible causes:
${response.status === 404 ? "- Endpoint doesn't exist. Check the path." : ""}
${response.status === 401 ? "- Authentication required. Is API_KEY set?" : ""}
${response.status === 429 ? "- Rate limited. Wait a moment and retry." : ""}
${response.status >= 500 ? "- Server error. The API may be down." : ""}`,
          }],
          isError: true,
        };
      }

      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Network error: ${error.message}

This usually means:
- No internet connection
- DNS resolution failed
- API host is unreachable

Try checking your network connection.`,
        }],
        isError: true,
      };
    }
  }
);
```

**Why it works:** The LLM can diagnose the issue and try alternatives.

## Pattern 5: Tool Composition

**Problem:** One giant tool that does everything.

**Solution:** Small, focused tools that compose well.

```typescript
// ❌ BAD: One tool does everything
server.tool(
  "manage_files",
  "Read, write, delete, search, copy, move files",
  {
    operation: z.enum(["read", "write", "delete", "search", "copy", "move"]),
    // ... tons of conditional parameters
  },
  async ({ operation, ...params }) => {
    // Giant switch statement
  }
);
```

```typescript
// ✅ GOOD: Separate focused tools
server.tool("read_file", "Read file contents", { path: z.string() }, ...);
server.tool("write_file", "Write to file", { path: z.string(), content: z.string() }, ...);
server.tool("delete_file", "Delete a file", { path: z.string(), confirm: z.boolean() }, ...);
server.tool("search_files", "Find files by pattern", { pattern: z.string() }, ...);
server.tool("copy_file", "Copy file", { source: z.string(), destination: z.string() }, ...);
```

**Why it works:** LLM can understand when to use each tool. Descriptions are clearer. Testing is easier.

## Anti-Pattern 1: Vague Descriptions

```typescript
// ❌ BAD: LLM doesn't know when to use this
server.tool(
  "process",
  "Process data",
  { input: z.string() },
  handler
);

// ✅ GOOD: Clear purpose and usage
server.tool(
  "format_json",
  "Format a JSON string with proper indentation. Use when JSON is minified or hard to read.",
  { json: z.string().describe("JSON string to format") },
  handler
);
```

## Anti-Pattern 2: Swallowing Errors

```typescript
// ❌ BAD: Errors disappear
server.tool("risky_op", {}, async () => {
  try {
    await riskyOperation();
  } catch (error) {
    // Swallowed! LLM thinks it succeeded
  }
  return { content: [{ type: "text", text: "Done" }] };
});

// ✅ GOOD: Errors are visible
server.tool("risky_op", {}, async () => {
  try {
    await riskyOperation();
    return { content: [{ type: "text", text: "Operation succeeded" }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Operation failed: ${error.message}` }],
      isError: true,
    };
  }
});
```

## Anti-Pattern 3: Unbounded Results

```typescript
// ❌ BAD: Could return gigabytes
server.tool("get_logs", {}, async () => {
  const logs = await fs.readFile("/var/log/app.log", "utf-8");
  return { content: [{ type: "text", text: logs }] };
});

// ✅ GOOD: Bounded with options
server.tool(
  "get_logs",
  "Get recent log entries",
  {
    lines: z.number().max(1000).default(100),
    level: z.enum(["all", "error", "warn"]).default("all"),
  },
  async ({ lines, level }) => {
    const logs = await readLastNLines("/var/log/app.log", lines);
    const filtered = level === "all" ? logs : logs.filter(l => l.includes(level.toUpperCase()));
    return { content: [{ type: "text", text: filtered.join("\n") }] };
  }
);
```

## Anti-Pattern 4: No Input Validation

```typescript
// ❌ BAD: Trusts everything
server.tool("query", { sql: z.string() }, async ({ sql }) => {
  const result = await db.raw(sql);  // SQL injection!
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

// ✅ GOOD: Parameterized with constraints
server.tool(
  "find_users",
  "Find users by criteria",
  {
    field: z.enum(["name", "email", "role"]),
    value: z.string().max(100),
    limit: z.number().int().min(1).max(50).default(10),
  },
  async ({ field, value, limit }) => {
    const users = await db.users.findMany({
      where: { [field]: { contains: value } },
      take: limit,
    });
    return { content: [{ type: "text", text: JSON.stringify(users, null, 2) }] };
  }
);
```

## Quick Reference: Pattern Checklist

| Pattern | Use When |
|---------|----------|
| Preview before action | Destructive operations |
| Graceful degradation | Batch operations |
| Chunked results | Large result sets |
| Structured errors | Any error handling |
| Tool composition | Complex domains |

| Anti-Pattern | Problem |
|--------------|---------|
| Vague descriptions | LLM doesn't know when to use tool |
| Swallowed errors | Silent failures confuse LLM |
| Unbounded results | Context overflow |
| No validation | Security vulnerabilities |

## Exercises

1. **Refactor a tool** - Take a giant tool and split it into composable pieces

2. **Add preview mode** - Add confirmation to a destructive tool

3. **Improve errors** - Make error messages actionable

4. **Add pagination** - Implement chunking for a search tool

## You've Completed the Course!

You now know:
- ✅ What MCP is and when to use it
- ✅ How to build servers with tools, resources, and prompts
- ✅ Client implementation and LLM integration
- ✅ Transport options for local and remote deployment
- ✅ Security best practices
- ✅ Production patterns

**Next:** Build something real! Check out the [Lab](../labs/01-filesystem-server/) to practice, or start on your own MCP server.
