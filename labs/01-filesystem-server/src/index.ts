#!/usr/bin/env node
/**
 * Filesystem MCP Server - Lab Starter
 *
 * Complete the TODOs to build a fully functional filesystem server.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";

// Configuration from environment
const ALLOWED_ROOT = process.env.ALLOWED_ROOT ?? process.cwd();
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_SEARCH_RESULTS = 100;

// Create server
const server = new McpServer({
  name: "filesystem-lab",
  version: "1.0.0",
});

/**
 * Validates that a path is within the allowed root directory.
 * Prevents path traversal attacks.
 */
function validatePath(inputPath: string): string {
  const resolved = path.resolve(ALLOWED_ROOT, inputPath);

  if (!resolved.startsWith(path.resolve(ALLOWED_ROOT))) {
    throw new Error(`Access denied: path outside allowed directory`);
  }

  return resolved;
}

// =============================================================================
// EXERCISE 1: Implement read_file tool
// =============================================================================

server.tool(
  "read_file",
  "Read the contents of a file. Returns the file content as text.",
  {
    path: z.string().describe("Path to the file (relative to allowed root)"),
  },
  async ({ path: filePath }) => {
    // TODO: Implement this tool
    // 1. Validate the path using validatePath()
    // 2. Check if file exists
    // 3. Check file size (reject if > MAX_FILE_SIZE)
    // 4. Read and return file contents
    // 5. Handle errors appropriately

    return {
      content: [{ type: "text", text: "TODO: Implement read_file" }],
      isError: true,
    };
  }
);

// =============================================================================
// EXERCISE 2: Implement write_file tool
// =============================================================================

server.tool(
  "write_file",
  "Write content to a file. Creates the file if it doesn't exist.",
  {
    path: z.string().describe("Path to the file (relative to allowed root)"),
    content: z.string().max(MAX_FILE_SIZE).describe("Content to write"),
  },
  async ({ path: filePath, content }) => {
    // TODO: Implement this tool
    // 1. Validate the path
    // 2. Create parent directories if needed (fs.mkdir with recursive)
    // 3. Write the content
    // 4. Return confirmation

    return {
      content: [{ type: "text", text: "TODO: Implement write_file" }],
      isError: true,
    };
  }
);

// =============================================================================
// EXERCISE 3: Implement search_files tool
// =============================================================================

server.tool(
  "search_files",
  "Search for files matching a glob pattern. Returns list of matching paths.",
  {
    pattern: z.string().describe("Glob pattern, e.g., '**/*.ts'"),
    rootPath: z.string().optional().describe("Subdirectory to search in"),
  },
  async ({ pattern, rootPath }) => {
    // TODO: Implement this tool
    // 1. Validate rootPath if provided
    // 2. Use glob to find matching files
    // 3. Limit results to MAX_SEARCH_RESULTS
    // 4. Return relative paths

    return {
      content: [{ type: "text", text: "TODO: Implement search_files" }],
      isError: true,
    };
  }
);

// =============================================================================
// EXERCISE 4: Implement list_directory tool
// =============================================================================

server.tool(
  "list_directory",
  "List contents of a directory with file metadata.",
  {
    path: z.string().default(".").describe("Directory path"),
  },
  async ({ path: dirPath }) => {
    // TODO: Implement this tool
    // 1. Validate the path
    // 2. Read directory contents with fs.readdir
    // 3. Get stats for each entry (file/directory, size, modified date)
    // 4. Return formatted list

    return {
      content: [{ type: "text", text: "TODO: Implement list_directory" }],
      isError: true,
    };
  }
);

// =============================================================================
// EXERCISE 5: Implement resources
// =============================================================================

// TODO: Add resource handlers
// server.resource(...)
// - URI pattern: "file://{path}"
// - List files in ALLOWED_ROOT as resources
// - Return file contents when read

// =============================================================================
// Server startup
// =============================================================================

async function main() {
  // Verify allowed root exists
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

// Graceful shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down...");
  await server.close();
  process.exit(0);
});
