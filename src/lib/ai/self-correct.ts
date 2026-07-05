/**
 * Self-Correction System - Built from scratch
 *
 * When the AI runs a command and it fails, it parses the error, looks up
 * common patterns, applies fixes, and learns from the mistake so it
 * doesn't repeat it.
 */

import { db } from "@/lib/db";

export interface ErrorPattern {
  id: string;
  pattern: string; // regex pattern to match in error output
  description: string;
  fixCommand?: string; // shell command to run as fix
  fixDescription: string;
  category: "missing_dependency" | "syntax_error" | "type_error" | "config" | "permission" | "import_error" | "runtime" | "other";
}

// Built-in error patterns — common dev mistakes with known fixes
export const BUILTIN_PATTERNS: ErrorPattern[] = [
  {
    id: "missing_module_npm",
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    description: "Missing Node module",
    fixCommand: "npm install $1",
    fixDescription: "Install the missing module",
    category: "missing_dependency",
  },
  {
    id: "missing_module_bun",
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    description: "Missing Node module (bun)",
    fixCommand: "bun add $1",
    fixDescription: "Install the missing module with bun",
    category: "missing_dependency",
  },
  {
    id: "command_not_found_npx",
    pattern: /(\w+): command not found/i,
    description: "Command not found",
    fixCommand: "npx $1",
    fixDescription: "Try running via npx",
    category: "missing_dependency",
  },
  {
    id: "permission_denied_chmod",
    pattern: /permission denied:\s*([^\s]+)/i,
    description: "Permission denied",
    fixCommand: "chmod +x $1",
    fixDescription: "Make the file executable",
    category: "permission",
  },
  {
    id: "eslint_unused_var",
    pattern: /'(\w+)' is defined but never used/i,
    description: "Unused variable",
    fixDescription: "Remove the unused variable or prefix with _",
    category: "syntax_error",
  },
  {
    id: "ts2322_type_assignable",
    pattern: /Type '([^']+)' is not assignable to type '([^']+)'/i,
    description: "Type mismatch",
    fixDescription: "Check the expected type and cast or convert the value",
    category: "type_error",
  },
  {
    id: "ts2304_not_found",
    pattern: /Cannot find name '(\w+)'/i,
    description: "Undefined name",
    fixDescription: "Import or declare the missing name",
    category: "import_error",
  },
  {
    id: "ts2307_module_not_found",
    pattern: /Cannot find module ['"]([^'"]+)['"] or its corresponding type declarations/i,
    description: "Missing module types",
    fixCommand: "npm install -D @types/$1",
    fixDescription: "Install the missing type definitions",
    category: "missing_dependency",
  },
  {
    id: "port_in_use",
    pattern: /EADDRINUSE.*?(\d+)/i,
    description: "Port in use",
    fixCommand: "kill -9 $(lsof -t -i:$1) 2>/dev/null; echo 'Port $1 freed'",
    fixDescription: "Kill the process using the port",
    category: "runtime",
  },
  {
    id: "python_module_not_found",
    pattern: /ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i,
    description: "Missing Python module",
    fixCommand: "pip install $1",
    fixDescription: "Install the missing Python module",
    category: "missing_dependency",
  },
  {
    id: "python_import_error",
    pattern: /ImportError:\s*(.+)/i,
    description: "Import error",
    fixDescription: "Check the import path and module structure",
    category: "import_error",
  },
  {
    id: "syntax_error_python",
    pattern: /SyntaxError:\s*(.+)/i,
    description: "Python syntax error",
    fixDescription: "Fix the syntax error on the indicated line",
    category: "syntax_error",
  },
  {
    id: "indentation_error",
    pattern: /IndentationError:\s*(.+)/i,
    description: "Python indentation error",
    fixDescription: "Fix the indentation (use 4 spaces consistently)",
    category: "syntax_error",
  },
  {
    id: "git_not_repo",
    pattern: /fatal: not a git repository/i,
    description: "Not a git repo",
    fixCommand: "git init",
    fixDescription: "Initialize a git repository",
    category: "config",
  },
  {
    id: "git_uncommitted",
    pattern: /Your local changes would be overwritten/i,
    description: "Uncommitted changes",
    fixCommand: "git stash",
    fixDescription: "Stash your changes temporarily",
    category: "config",
  },
  {
    id: "package_script_missing",
    pattern: /Missing script:\s*"(\w+)"/i,
    description: "Missing npm script",
    fixDescription: "Add the script to package.json under 'scripts'",
    category: "config",
  },
  {
    id: "nextjs_use_client",
    pattern: /You're importing a component that needs (\w+)/i,
    description: "Missing 'use client' directive",
    fixDescription: "Add 'use client' at the top of the file",
    category: "syntax_error",
  },
  {
    id: "react_hooks_rules",
    pattern: /React Hook "(\w+)" is called conditionally/i,
    description: "Hooks rule violation",
    fixDescription: "Move the hook to the top level of the component",
    category: "syntax_error",
  },
  {
    id: "file_not_found",
    pattern: /no such file or directory,\s*(.+)/i,
    description: "File not found",
    fixDescription: "Check the file path is correct",
    category: "runtime",
  },
  {
    id: "npm_err_missing_script",
    pattern: /npm error Missing script:\s*"(\w+)"/i,
    description: "Missing npm script",
    fixDescription: `Add the missing script to package.json under "scripts"`,
    category: "config",
  },
  {
    id: "npm_err_404",
    pattern: /npm error code E404.*?(\S+)/is,
    description: "Package not found on npm",
    fixDescription: "Check the package name spelling or use a different registry",
    category: "missing_dependency",
  },
  {
    id: "npm_err_eresolve",
    pattern: /npm error ERESOLVE.*?peer dependency/i,
    description: "Peer dependency conflict",
    fixCommand: "npm install --legacy-peer-deps",
    fixDescription: "Install with legacy peer deps resolution",
    category: "missing_dependency",
  },
  {
    id: "pip_err_no_matching_dist",
    pattern: /ERROR: No matching distribution found for\s+([^\s]+)/i,
    description: "Python package not found",
    fixDescription: "Check the package name on PyPI",
    category: "missing_dependency",
  },
  {
    id: "pip_err_could_not_find_version",
    pattern: /ERROR: Could not find a version that satisfies the requirement\s+([^\s]+)/i,
    description: "Python version not found",
    fixDescription: "Check the package version or upgrade pip",
    category: "missing_dependency",
  },
  {
    id: "ts2305_no_exported_member",
    pattern: /Module '"([^"]+)"' has no exported member '(\w+)'/i,
    description: "No exported member",
    fixDescription: "Check the export name or default vs named export",
    category: "import_error",
  },
  {
    id: "ts2694_never_type",
    pattern: /'(\w+)' is of type 'never'/i,
    description: "Variable is never",
    fixDescription: "Add proper type annotation or initialization",
    category: "type_error",
  },
  {
    id: "ts1254_type_only",
    pattern: /A type-only import must specify a default import/i,
    description: "Type-only import error",
    fixDescription: "Use `import type` syntax for type-only imports",
    category: "type_error",
  },
  {
    id: "react_max_update_depth",
    pattern: /Maximum update depth exceeded/i,
    description: "Infinite render loop",
    fixDescription: "Check useEffect dependencies — likely missing dependency or wrong deps array",
    category: "runtime",
  },
  {
    id: "react_invalid_hook",
    pattern: /Invalid hook call/i,
    description: "Invalid hook call",
    fixDescription: "Ensure hooks are called at top level of a React component, not in conditions/loops",
    category: "syntax_error",
  },
  {
    id: "react_key_prop",
    pattern: /Each child in a list should have a unique "key" prop/i,
    description: "Missing key prop",
    fixDescription: "Add a unique `key` prop to list items",
    category: "syntax_error",
  },
  {
    id: "vite_unresolved_import",
    pattern: /Failed to resolve import ["']([^"']+)["']/i,
    description: "Vite unresolved import",
    fixDescription: "Check the import path or install the missing package",
    category: "import_error",
  },
  {
    id: "vite_port_in_use",
    pattern: /Port (\d+) is in use/i,
    description: "Vite port in use",
    fixDescription: "Kill the process on that port or use a different port",
    category: "runtime",
  },
  {
    id: "eslint_no_unused_vars",
    pattern: /no-unused-vars/i,
    description: "ESLint unused vars",
    fixDescription: "Remove the unused variable or prefix with _",
    category: "syntax_error",
  },
  {
    id: "eslint_no_undef",
    pattern: /no-undef/i,
    description: "ESLint undefined variable",
    fixDescription: "Define the variable or import it",
    category: "import_error",
  },
  {
    id: "eslint_parsing_error",
    pattern: /Parsing error:\s*(.+)/i,
    description: "ESLint parsing error",
    fixDescription: "Fix the syntax error in the file",
    category: "syntax_error",
  },
  {
    id: "nextjs_404_route",
    pattern: /404.*?This page could not be found/i,
    description: "Next.js 404 route",
    fixDescription: "Create the route file in app/ directory",
    category: "config",
  },
  {
    id: "nextjs_hydration_mismatch",
    pattern: /Hydration failed/i,
    description: "Next.js hydration mismatch",
    fixDescription: "Ensure server and client render the same content — check for Date.now(), Math.random(), window references",
    category: "runtime",
  },
  {
    id: "go_module_not_found",
    pattern: /cannot find module "([^"]+)"/i,
    description: "Go module not found",
    fixCommand: "go get $1",
    fixDescription: "Install the missing Go module",
    category: "missing_dependency",
  },
  {
    id: "cargo_err_unresolved",
    pattern: /error\[E0432\]: unresolved import/i,
    description: "Rust unresolved import",
    fixDescription: "Check the use path or add the crate to Cargo.toml",
    category: "import_error",
  },
  {
    id: "cargo_err_no_matching",
    pattern: /error: no matching package named/i,
    description: "Rust crate not found",
    fixDescription: "Check the crate name on crates.io",
    category: "missing_dependency",
  },
  {
    id: "docker_daemon_not_running",
    pattern: /Cannot connect to the Docker daemon/i,
    description: "Docker daemon not running",
    fixCommand: "systemctl start docker 2>/dev/null || service docker start 2>/dev/null",
    fixDescription: "Start the Docker daemon",
    category: "runtime",
  },
  {
    id: "git_merge_conflict",
    pattern: /CONFLICT \(content\):\s+Merge conflict in\s+(.+)/i,
    description: "Git merge conflict",
    fixDescription: "Resolve the conflict in $1, then `git add` and `git commit`",
    category: "config",
  },
  {
    id: "git_push_rejected",
    pattern: /Updates were rejected because the remote contains work/i,
    description: "Git push rejected",
    fixCommand: "git pull --rebase",
    fixDescription: "Pull remote changes and rebase",
    category: "config",
  },
  {
    id: "out_of_memory",
    pattern: /JavaScript heap out of memory/i,
    description: "Node out of memory",
    fixCommand: "export NODE_OPTIONS=--max-old-space-size=4096",
    fixDescription: "Increase Node heap size to 4GB",
    category: "runtime",
  },
  {
    id: "eslint_config_not_found",
    pattern: /ESLint couldn't find an eslint\.config/i,
    description: "ESLint config not found",
    fixDescription: "Create an eslint.config.mjs file or run `npm init @eslint/config`",
    category: "config",
  },
  {
    id: "tsconfig_not_found",
    pattern: /error TS5057:\s*Cannot find file\s+'tsconfig\.json'/i,
    description: "tsconfig.json not found",
    fixDescription: "Create a tsconfig.json in the project root",
    category: "config",
  },
  {
    id: "webpack_module_not_found",
    pattern: /Module not found:\s*Error:\s*Can't resolve ['"]([^'"]+)['"]/i,
    description: "Webpack module not found",
    fixCommand: "npm install $1",
    fixDescription: "Install the missing module",
    category: "missing_dependency",
  },
  {
    id: "prisma_client_not_generated",
    pattern: /PrismaClientInitializationError|prisma client is not running/i,
    description: "Prisma client not generated",
    fixCommand: "npx prisma generate",
    fixDescription: "Generate the Prisma client",
    category: "config",
  },
  {
    id: "prisma_db_not_pushed",
    pattern: /The table.*does not exist in the current database/i,
    description: "Prisma schema not pushed to DB",
    fixCommand: "npx prisma db push",
    fixDescription: "Push the Prisma schema to the database",
    category: "config",
  },
  {
    id: "env_var_missing",
    pattern: /Cannot read properties of undefined \(reading '([^']+)'\).*?process\.env/i,
    description: "Missing env var",
    fixDescription: "Add the missing env var to .env.local",
    category: "config",
  },
];

export interface CorrectionResult {
  matched: boolean;
  pattern?: ErrorPattern;
  fixCommand?: string;
  fixDescription?: string;
  extractedVars?: string[];
  learnedFrom?: string;
}

/**
 * Try to match an error output against known patterns.
 * Returns the first match.
 */
export function matchError(stderr: string, stdout: string = ""): CorrectionResult {
  const combined = `${stderr}\n${stdout}`;
  for (const pattern of BUILTIN_PATTERNS) {
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    const match = regex.exec(combined);
    if (match) {
      const vars = match.slice(1);
      let fixCommand = pattern.fixCommand;
      if (fixCommand) {
        vars.forEach((v, i) => {
          fixCommand = fixCommand!.replace(`$${i + 1}`, v);
        });
      }
      return {
        matched: true,
        pattern,
        fixCommand,
        fixDescription: pattern.fixDescription,
        extractedVars: vars,
      };
    }
  }
  return { matched: false };
}

/**
 * Record a mistake + correction in the database for future learning.
 */
export async function recordMistake(params: {
  context: string;
  errorOutput: string;
  fixApplied: string;
  fixDescription?: string;
  success: boolean;
}): Promise<void> {
  try {
    // Check if we've seen this mistake before
    const existing = await db.mistakeLog.findFirst({
      where: {
        errorOutput: params.errorOutput,
      },
    });

    if (existing) {
      // Update occurrence count and success rate
      const newCount = existing.occurrenceCount + 1;
      const newSuccessCount = existing.successCount + (params.success ? 1 : 0);
      await db.mistakeLog.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: newCount,
          successCount: newSuccessCount,
          lastSeenAt: new Date(),
          // Keep the most successful fix
          successRate: newSuccessCount / newCount,
        },
      });
    } else {
      await db.mistakeLog.create({
        data: {
          context: params.context,
          errorOutput: params.errorOutput,
          fixApplied: params.fixApplied,
          fixDescription: params.fixDescription || null,
          success: params.success,
          occurrenceCount: 1,
          successCount: params.success ? 1 : 0,
        },
      });
    }
  } catch (e) {
    console.error("Failed to record mistake:", e);
  }
}

/**
 * Look up similar past mistakes to find a known fix.
 */
export async function lookupMistake(errorOutput: string): Promise<{
  fixApplied: string;
  fixDescription: string | null;
  successRate: number;
  occurrenceCount: number;
} | null> {
  try {
    // Find similar errors (contains search)
    const similar = await db.mistakeLog.findMany({
      where: {
        OR: [
          { errorOutput: { contains: errorOutput.slice(0, 100) } },
          { errorOutput: { contains: errorOutput.slice(0, 50) } },
        ],
      },
      orderBy: { successRate: "desc" },
      take: 5,
    });

    if (similar.length === 0) return null;
    const best = similar[0];
    return {
      fixApplied: best.fixApplied,
      fixDescription: best.fixDescription,
      successRate: best.successRate,
      occurrenceCount: best.occurrenceCount,
    };
  } catch {
    return null;
  }
}

/**
 * Get all learned mistakes (for UI display).
 */
export async function getLearnedMistakes(): Promise<Array<{
  id: string;
  context: string;
  errorOutput: string;
  fixApplied: string;
  fixDescription: string | null;
  occurrenceCount: number;
  successCount: number;
  successRate: number;
  lastSeenAt: Date;
}>> {
  try {
    const all = await db.mistakeLog.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 100,
    });
    return all;
  } catch {
    return [];
  }
}

/**
 * Clear all learned mistakes.
 */
export async function clearMistakes(): Promise<void> {
  await db.mistakeLog.deleteMany({});
}
