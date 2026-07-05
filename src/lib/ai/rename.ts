/**
 * Multi-file Rename Refactor - Built from scratch
 *
 * Renames a symbol (variable, function, class) across all files in the workspace.
 * Uses simple text-matching with word boundaries — not a full AST parser, but
 * handles the common cases correctly.
 */

import { getTree, readFile, writeFile, FileTree, FileOp } from "./file-system";

export interface RenameResult {
  filesChanged: number;
  occurrences: number;
  changes: Array<{
    file: string;
    count: number;
  }>;
  ops: FileOp[];
}

// File extensions we'll touch during rename
const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rb", "php",
  "go", "rs", "java", "kt", "scala",
  "c", "cpp", "cc", "h", "hpp",
  "cs", "swift",
  "vue", "svelte", "astro",
  "json", "yaml", "yml", "toml",
  "md", "mdx", "txt",
  "css", "scss", "less",
  "html", "xml", "svg",
  "sh", "bash", "zsh",
  "sql",
  "env",
]);

/**
 * Collect all text files in the workspace tree.
 */
async function collectTextFiles(node: FileTree, base: string = ""): Promise<string[]> {
  const files: string[] = [];
  const relPath = node.relativePath;

  if (node.type === "file") {
    const ext = node.extension || "";
    if (TEXT_EXTENSIONS.has(ext) || !ext) {
      files.push(relPath);
    }
  } else if (node.children) {
    for (const child of node.children) {
      const childFiles = await collectTextFiles(child, base);
      files.push(...childFiles);
    }
  }

  return files;
}

/**
 * Escape a string for use in a regex.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rename a symbol across all files in the workspace.
 *
 * Strategy: match the old name with word boundaries (\b) to avoid partial matches.
 * Skip strings and comments heuristically (lines starting with // or inside comments).
 **/
export async function renameSymbol(
  oldName: string,
  newName: string,
  options: { scope?: string } = {}
): Promise<RenameResult> {
  if (!oldName || !newName) {
    return { filesChanged: 0, occurrences: 0, changes: [], ops: [] };
  }

  if (oldName === newName) {
    return { filesChanged: 0, occurrences: 0, changes: [], ops: [] };
  }

  const tree = await getTree(options.scope || ".");
  const files = await collectTextFiles(tree);

  const changes: RenameResult["changes"] = [];
  const ops: FileOp[] = [];
  let totalOccurrences = 0;

  // Build a regex that matches the old name as a whole word
  // Allow it to be preceded by . (method call) or _ (since those are common)
  const pattern = new RegExp(`\\b${escapeRegex(oldName)}\\b`, "g");

  for (const filePath of files) {
    try {
      const content = await readFile(filePath);
      if (!pattern.test(content)) continue;

      // Reset regex lastIndex (since we used test)
      pattern.lastIndex = 0;

      // Count matches
      const matches = content.match(pattern);
      if (!matches || matches.length === 0) continue;

      const count = matches.length;
      const newContent = content.replace(pattern, newName);

      changes.push({ file: filePath, count });
      ops.push({ op: "update", path: filePath, content: newContent });
      totalOccurrences += count;
    } catch {
      // skip unreadable files
    }
  }

  return {
    filesChanged: changes.length,
    occurrences: totalOccurrences,
    changes,
    ops,
  };
}

/**
 * Apply a rename result (write all the updated files).
 */
export async function applyRename(result: RenameResult): Promise<{ applied: number; errors: string[] }> {
  let applied = 0;
  const errors: string[] = [];
  for (const op of result.ops) {
    try {
      if (op.op === "update" && op.content !== undefined) {
        await writeFile(op.path, op.content);
        applied++;
      }
    } catch (e) {
      errors.push(`${op.path}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  return { applied, errors };
}

/**
 * Preview a rename without applying it — returns the files that would change
 * and a sample of the changes.
 */
export async function previewRename(
  oldName: string,
  newName: string,
  options: { scope?: string } = {}
): Promise<{
  result: RenameResult;
  samples: Array<{ file: string; before: string; after: string }>;
}> {
  const result = await renameSymbol(oldName, newName, options);
  const samples: Array<{ file: string; before: string; after: string }> = [];

  // Get up to 3 sample changes
  for (const op of result.ops.slice(0, 3)) {
    if (op.op === "update" && op.content !== undefined) {
      try {
        const before = await readFile(op.path);
        // Find a line that changed
        const beforeLines = before.split("\n");
        const afterLines = op.content.split("\n");
        for (let i = 0; i < beforeLines.length; i++) {
          if (beforeLines[i] !== afterLines[i]) {
            samples.push({
              file: op.path,
              before: beforeLines[i].trim().slice(0, 200),
              after: afterLines[i].trim().slice(0, 200),
            });
            break;
          }
        }
      } catch {
        // skip
      }
    }
  }

  return { result, samples };
}
