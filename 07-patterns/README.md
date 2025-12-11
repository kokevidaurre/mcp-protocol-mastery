# Production Patterns

## Pattern 1: Graceful Degradation

When a tool fails, provide useful fallback information.

```typescript
server.tool("fetch_data", { url: z.string().url() }, async ({ url }) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        content: [{
          type: "text",
          text: `HTTP ${response.status}: ${response.statusText}\n` +
                `URL: ${url}\n` +
                `Suggestion: Check if the URL is correct and accessible.`,
        }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: await response.text() }] };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Network error: ${error.message}\n` +
              `URL: ${url}\n` +
              `Possible causes: DNS failure, timeout, or network unavailable.`,
      }],
      isError: true,
    };
  }
});
```

## Pattern 2: Structured Tool Results

Return structured data the LLM can reason about.

```typescript
server.tool("analyze_code", { file: z.string() }, async ({ file }) => {
  const analysis = await runAnalysis(file);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        file,
        metrics: {
          lines: analysis.lines,
          complexity: analysis.complexity,
          coverage: analysis.coverage,
        },
        issues: analysis.issues.map(i => ({
          severity: i.severity,
          line: i.line,
          message: i.message,
        })),
        summary: `${analysis.issues.length} issues found, ` +
                 `complexity score: ${analysis.complexity}`,
      }, null, 2),
    }],
  };
});
```

## Pattern 3: Chunked Results for Large Data

Split large results to stay within token limits.

```typescript
const MAX_CHUNK_SIZE = 50000; // chars

server.tool("search_logs", { query: z.string() }, async ({ query }) => {
  const results = await searchLogs(query);
  const text = results.join("\n");

  if (text.length <= MAX_CHUNK_SIZE) {
    return { content: [{ type: "text", text }] };
  }

  // Chunk results
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK_SIZE) {
    chunks.push(text.slice(i, i + MAX_CHUNK_SIZE));
  }

  return {
    content: [
      { type: "text", text: `Results split into ${chunks.length} chunks:` },
      ...chunks.map((chunk, i) => ({
        type: "text" as const,
        text: `--- Chunk ${i + 1}/${chunks.length} ---\n${chunk}`,
      })),
    ],
  };
});
```

## Pattern 4: Tool Composition

Design tools that work well together.

```typescript
// Low-level tools
server.tool("db_query", { sql: z.string() }, async ({ sql }) => {
  // Executes raw SQL
});

server.tool("db_schema", {}, async () => {
  // Returns database schema
});

// High-level tools that compose
server.tool(
  "find_user",
  "Find user by email or ID. Use this instead of raw SQL for user lookups.",
  { identifier: z.string() },
  async ({ identifier }) => {
    const isEmail = identifier.includes("@");
    const column = isEmail ? "email" : "id";
    // Safe, parameterized query
  }
);
```

## Pattern 5: Confirmation for Destructive Actions

Return preview before executing destructive operations.

```typescript
server.tool(
  "delete_files",
  "Delete files matching pattern. Returns preview first, requires confirmation.",
  {
    pattern: z.string(),
    confirm: z.boolean().default(false),
  },
  async ({ pattern, confirm }) => {
    const matches = await glob(pattern);

    if (!confirm) {
      return {
        content: [{
          type: "text",
          text: `This will delete ${matches.length} files:\n` +
                matches.slice(0, 20).join("\n") +
                (matches.length > 20 ? `\n... and ${matches.length - 20} more` : "") +
                `\n\nTo proceed, call with confirm: true`,
        }],
      };
    }

    await Promise.all(matches.map(f => fs.unlink(f)));
    return {
      content: [{ type: "text", text: `Deleted ${matches.length} files.` }],
    };
  }
);
```

## Pattern 6: Stateful Sessions

Track state across multiple tool calls.

```typescript
const sessions = new Map<string, SessionState>();

server.tool(
  "start_session",
  "Start a new working session",
  { name: z.string() },
  async ({ name }, { meta }) => {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { name, startedAt: Date.now(), history: [] });

    return {
      content: [{
        type: "text",
        text: `Session started: ${sessionId}\nUse this ID for subsequent operations.`,
      }],
    };
  }
);

server.tool(
  "session_action",
  "Perform action in session",
  {
    sessionId: z.string().uuid(),
    action: z.string(),
  },
  async ({ sessionId, action }) => {
    const session = sessions.get(sessionId);
    if (!session) {
      return {
        content: [{ type: "text", text: "Session not found" }],
        isError: true,
      };
    }

    session.history.push({ action, timestamp: Date.now() });
    // ... perform action
  }
);
```

## Anti-Patterns

### ❌ Exposing Raw Database Access

```typescript
// BAD: SQL injection risk, no guardrails
server.tool("query", { sql: z.string() }, async ({ sql }) => {
  return db.raw(sql);
});
```

### ❌ Unbounded Results

```typescript
// BAD: Could return gigabytes of data
server.tool("get_logs", {}, async () => {
  return fs.readFile("/var/log/syslog", "utf-8");
});
```

### ❌ Vague Tool Descriptions

```typescript
// BAD: LLM can't decide when to use this
server.tool("do_stuff", "Does stuff", {}, async () => { ... });
```

### ❌ Ignoring Errors

```typescript
// BAD: Silent failures confuse the LLM
server.tool("risky", {}, async () => {
  try {
    await riskyOperation();
  } catch {
    // swallowed!
  }
  return { content: [{ type: "text", text: "Done" }] };
});
```

## Security Checklist

- [ ] All paths validated against allowed root
- [ ] Input size limits enforced
- [ ] Rate limiting implemented
- [ ] Secrets not logged or exposed
- [ ] Destructive actions require confirmation
- [ ] SQL queries parameterized
- [ ] External URLs validated
- [ ] Timeout limits set for long operations
