#!/usr/bin/env node
/**
 * Filesystem MCP Server - Complete Solution
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";

const ALLOWED_ROOT = process.env.ALLOWED_ROOT ?? process.cwd();
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_SEARCH_RESULTS = 100;

const server = new McpServer({
  name: "filesystem-server",
  version: "1.0.0",
});

function validatePath(inputPath: string): string {
  const resolved = path.resolve(ALLOWED_ROOT, inputPath);
  if (!resolved.startsWith(path.resolve(ALLOWED_ROOT))) {
    throw new Error(`Access denied: path outside allowed directory`);
  }
  return resolved;
}

// EXERCISE 1: read_file - SOLUTION
server.tool(
  "read_file",
  "Read the contents of a file. Returns the file content as text.",
  {
    path: z.string().describe("Path to the file (relative to allowed root)"),
  },
  async ({ path: filePath }) => {
    try {
      const resolved = validatePath(filePath);

      // Check if file exists and get stats
      const stats = await fs.stat(resolved);

      if (stats.isDirectory()) {
        return {
          content: [{ type: "text", text: `Error: ${filePath} is a directory, not a file` }],
          isError: true,
        };
      }

      if (stats.size > MAX_FILE_SIZE) {
        return {
          content: [{ type: "text", text: `Error: File too large (${stats.size} bytes, max ${MAX_FILE_SIZE})` }],
          isError: true,
        };
      }

      const content = await fs.readFile(resolved, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error reading file: ${message}` }],
        isError: true,
      };
    }
  }
);

// EXERCISE 2: write_file - SOLUTION
server.tool(
  "write_file",
  "Write content to a file. Creates the file if it doesn't exist.",
  {
    path: z.string().describe("Path to the file (relative to allowed root)"),
    content: z.string().max(MAX_FILE_SIZE).describe("Content to write"),
  },
  async ({ path: filePath, content }) => {
    try {
      const resolved = validatePath(filePath);

      // Create parent directories if needed
      const dir = path.dirname(resolved);
      await fs.mkdir(dir, { recursive: true });

      // Write the file
      await fs.writeFile(resolved, content, "utf-8");

      return {
        content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${filePath}` }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error writing file: ${message}` }],
        isError: true,
      };
    }
  }
);

// EXERCISE 3: search_files - SOLUTION
server.tool(
  "search_files",
  "Search for files matching a glob pattern. Returns list of matching paths.",
  {
    pattern: z.string().describe("Glob pattern, e.g., '**/*.ts'"),
    rootPath: z.string().optional().describe("Subdirectory to search in"),
  },
  async ({ pattern, rootPath }) => {
    try {
      const searchRoot = rootPath ? validatePath(rootPath) : ALLOWED_ROOT;

      const matches = await glob(pattern, {
        cwd: searchRoot,
        nodir: true,
        absolute: false,
        maxDepth: 10,
      });

      const limited = matches.slice(0, MAX_SEARCH_RESULTS);
      const hasMore = matches.length > MAX_SEARCH_RESULTS;

      let result = `Found ${matches.length} file(s)`;
      if (hasMore) {
        result += ` (showing first ${MAX_SEARCH_RESULTS})`;
      }
      result += `:\n\n${limited.join("\n")}`;

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error searching files: ${message}` }],
        isError: true,
      };
    }
  }
);

// EXERCISE 4: list_directory - SOLUTION
server.tool(
  "list_directory",
  "List contents of a directory with file metadata.",
  {
    path: z.string().default(".").describe("Directory path"),
  },
  async ({ path: dirPath }) => {
    try {
      const resolved = validatePath(dirPath);
      const entries = await fs.readdir(resolved, { withFileTypes: true });

      const details = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(resolved, entry.name);
          const stats = await fs.stat(fullPath);

          return {
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        })
      );

      // Sort: directories first, then alphabetically
      details.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const formatted = details
        .map((d) => {
          const sizeStr = d.type === "directory" ? "-" : `${d.size}b`;
          return `${d.type === "directory" ? "📁" : "📄"} ${d.name.padEnd(30)} ${sizeStr.padStart(10)}`;
        })
        .join("\n");

      return {
        content: [{ type: "text", text: `Contents of ${dirPath}:\n\n${formatted}` }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error listing directory: ${message}` }],
        isError: true,
      };
    }
  }
);

// EXERCISE 5: Resources - SOLUTION
server.resource(
  "file://*",
  "File system resource",
  async (uri) => {
    const filePath = uri.pathname;
    const resolved = validatePath(filePath);

    const stats = await fs.stat(resolved);

    if (stats.isDirectory()) {
      const entries = await fs.readdir(resolved);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(entries, null, 2),
        }],
      };
    }

    const content = await fs.readFile(resolved, "utf-8");
    const ext = path.extname(resolved).slice(1);
    const mimeTypes: Record<string, string> = {
      json: "application/json",
      ts: "text/typescript",
      js: "text/javascript",
      md: "text/markdown",
      txt: "text/plain",
    };

    return {
      contents: [{
        uri: uri.href,
        mimeType: mimeTypes[ext] ?? "text/plain",
        text: content,
      }],
    };
  }
);

async function main() {
  try {
    await fs.access(ALLOWED_ROOT);
    console.error(`Filesystem server starting with root: ${ALLOWED_ROOT}`);
  } catch {
    console.error(`Error: ALLOWED_ROOT does not exist: ${ALLOWED_ROOT}`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
