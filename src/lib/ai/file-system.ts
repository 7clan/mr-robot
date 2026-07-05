/**
 * File System Manager - Built from scratch
 *
 * Manages a sandboxed workspace at <project>/workspace/
 * The AI can create, read, update, and delete files here.
 * All operations are confined to this workspace (no path traversal).
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as fsSync from "fs";

// Use a workspace folder relative to the project root (works on any OS)
// This resolves to <project_dir>/workspace at runtime
export const WORKSPACE_ROOT = path.resolve(process.cwd(), "workspace");

export interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  size?: number;
  modified?: Date;
  extension?: string;
}

export interface FileTree {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  size?: number;
  modified?: Date;
  extension?: string;
  children?: FileTree[];
}

// Ensure workspace exists
export async function ensureWorkspace(): Promise<void> {
  try {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  } catch {
    // ignore
  }
}

/**
 * Resolve a path inside the workspace, preventing path traversal.
 */
export function resolvePath(relativePath: string): string {
  const clean = relativePath.replace(/^[/\\]+/, "").replace(/\.\./g, "");
  const full = path.resolve(WORKSPACE_ROOT, clean);
  if (!full.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path traversal blocked");
  }
  return full;
}

export async function listDirectory(relativePath: string = "."): Promise<FileNode[]> {
  await ensureWorkspace();
  const full = resolvePath(relativePath);
  try {
    const entries = await fs.readdir(full, { withFileTypes: true });
    const nodes: FileNode[] = [];
    for (const entry of entries) {
      const entryPath = path.join(full, entry.name);
      const rel = path.relative(WORKSPACE_ROOT, entryPath);
      try {
        const stat = await fs.stat(entryPath);
        nodes.push({
          name: entry.name,
          path: entryPath,
          relativePath: rel,
          type: entry.isDirectory() ? "directory" : "file",
          size: stat.size,
          modified: stat.mtime,
          extension: entry.isFile() ? path.extname(entry.name).slice(1) : undefined,
        });
      } catch {
        // skip
      }
    }
    // directories first, then files, alphabetical
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  } catch (e) {
    throw new Error(`Cannot list ${relativePath}: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function getTree(relativePath: string = "."): Promise<FileTree> {
  await ensureWorkspace();
  const full = resolvePath(relativePath);
  const rel = path.relative(WORKSPACE_ROOT, full) || ".";
  const name = path.basename(full) || "workspace";

  try {
    const stat = await fs.stat(full);
    const node: FileTree = {
      name,
      path: full,
      relativePath: rel,
      type: stat.isDirectory() ? "directory" : "file",
      size: stat.size,
      modified: stat.mtime,
      extension: stat.isFile() ? path.extname(name).slice(1) : undefined,
    };

    if (stat.isDirectory()) {
      const entries = await fs.readdir(full, { withFileTypes: true });
      const children: FileTree[] = [];
      for (const entry of entries) {
        // skip node_modules, .git, dist, build
        if (["node_modules", ".git", "dist", "build", ".next", "__pycache__"].includes(entry.name)) {
          continue;
        }
        const childPath = path.join(rel, entry.name);
        try {
          const child = await getTree(childPath);
          children.push(child);
        } catch {
          // skip
        }
      }
      children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children = children;
    }
    return node;
  } catch (e) {
    throw new Error(`Cannot stat ${relativePath}: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function readFile(relativePath: string): Promise<string> {
  const full = resolvePath(relativePath);
  try {
    return await fs.readFile(full, "utf-8");
  } catch (e) {
    throw new Error(`Cannot read ${relativePath}: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function writeFile(relativePath: string, content: string): Promise<void> {
  const full = resolvePath(relativePath);
  try {
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf-8");
  } catch (e) {
    throw new Error(`Cannot write ${relativePath}: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function appendFile(relativePath: string, content: string): Promise<void> {
  const full = resolvePath(relativePath);
  try {
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.appendFile(full, content, "utf-8");
  } catch (e) {
    throw new Error(`Cannot append ${relativePath}: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function deleteFile(relativePath: string): Promise<void> {
  const full = resolvePath(relativePath);
  try {
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      await fs.rm(full, { recursive: true });
    } else {
      await fs.unlink(full);
    }
  } catch (e) {
    throw new Error(`Cannot delete ${relativePath}: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function createDirectory(relativePath: string): Promise<void> {
  const full = resolvePath(relativePath);
  try {
    await fs.mkdir(full, { recursive: true });
  } catch (e) {
    throw new Error(`Cannot create dir ${relativePath}: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function moveFile(from: string, to: string): Promise<void> {
  const fromFull = resolvePath(from);
  const toFull = resolvePath(to);
  try {
    await fs.mkdir(path.dirname(toFull), { recursive: true });
    await fs.rename(fromFull, toFull);
  } catch (e) {
    throw new Error(`Cannot move: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    const full = resolvePath(relativePath);
    await fs.access(full);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a list of file operations atomically (best effort).
 */
export interface FileOp {
  op: "create" | "update" | "delete" | "mkdir";
  path: string;
  content?: string;
}

export async function applyOps(ops: FileOp[]): Promise<{ applied: number; errors: string[] }> {
  let applied = 0;
  const errors: string[] = [];
  // Sort: mkdir first, then create/update, then delete
  const order = { mkdir: 0, create: 1, update: 1, delete: 2 };
  const sorted = [...ops].sort((a, b) => order[a.op] - order[b.op]);
  for (const op of sorted) {
    try {
      if (op.op === "mkdir") {
        await createDirectory(op.path);
      } else if (op.op === "create" || op.op === "update") {
        await writeFile(op.path, op.content || "");
      } else if (op.op === "delete") {
        await deleteFile(op.path);
      }
      applied++;
    } catch (e) {
      errors.push(`${op.op} ${op.path}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  return { applied, errors };
}

/**
 * Get file stats.
 */
export async function statFile(relativePath: string): Promise<FileNode | null> {
  const full = resolvePath(relativePath);
  try {
    const stat = await fs.stat(full);
    const name = path.basename(full);
    return {
      name,
      path: full,
      relativePath: path.relative(WORKSPACE_ROOT, full) || ".",
      type: stat.isDirectory() ? "directory" : "file",
      size: stat.size,
      modified: stat.mtime,
      extension: stat.isFile() ? path.extname(name).slice(1) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Search files in workspace by name or content.
 */
export async function searchFiles(query: string, maxResults = 30): Promise<FileNode[]> {
  await ensureWorkspace();
  const results: FileNode[] = [];
  const q = query.toLowerCase();

  async function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (["node_modules", ".git", "dist", "build", ".next", "__pycache__"].includes(entry.name)) {
        continue;
      }
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else {
        if (entry.name.toLowerCase().includes(q)) {
          const stat = await fs.stat(entryPath);
          results.push({
            name: entry.name,
            path: entryPath,
            relativePath: path.relative(WORKSPACE_ROOT, entryPath),
            type: "file",
            size: stat.size,
            modified: stat.mtime,
            extension: path.extname(entry.name).slice(1),
          });
          continue;
        }
        // Search content for small text files
        try {
          const stat = await fs.stat(entryPath);
          if (stat.size < 50000 && /\.(txt|md|js|ts|tsx|jsx|py|json|html|css|vue|go|rs|java|c|cpp|rb|php|sql|yml|yaml|sh)$/i.test(entry.name)) {
            const content = await fs.readFile(entryPath, "utf-8");
            if (content.toLowerCase().includes(q)) {
              results.push({
                name: entry.name,
                path: entryPath,
                relativePath: path.relative(WORKSPACE_ROOT, entryPath),
                type: "file",
                size: stat.size,
                modified: stat.mtime,
                extension: path.extname(entry.name).slice(1),
              });
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  await walk(WORKSPACE_ROOT);
  return results;
}
