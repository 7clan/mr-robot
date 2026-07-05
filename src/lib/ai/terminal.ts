/**
 * Terminal Executor - Built from scratch
 *
 * Runs shell commands in the workspace directory.
 * Captures stdout, stderr, and exit code.
 * Has an allowlist mode for safety, plus a full-access mode for trusted use.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import { WORKSPACE_ROOT, ensureWorkspace, resolvePath } from "./file-system";

const execAsync = promisify(exec);

export interface TerminalResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  cwd: string;
  durationMs: number;
  truncated?: boolean;
}

const MAX_OUTPUT = 50000; // 50KB per stream
const DEFAULT_TIMEOUT = 30000; // 30s

// Commands that are blocked for safety
const BLOCKED = [
  /^rm\s+-rf\s+\/(\s|$)/, // rm -rf /
  /^mkfs/, // format filesystem
  /^dd\s+.*of=\/dev\//, // write to device
  /^:\(\)\s*\{.+:\|:&\s*\};:/, // fork bomb
  /^shutdown/,
  /^reboot/,
  /^halt/,
];

// Commands that are always allowed (safe, read-only or workspace-scoped)
const SAFE_COMMANDS = [
  "ls", "pwd", "cat", "head", "tail", "echo", "grep", "find", "wc", "sort",
  "uniq", "diff", "tree", "stat", "file", "which", "whereis", "env", "printenv",
  "whoami", "hostname", "date", "cal", "uptime", "df", "du", "free", "ps",
  "top", "kill", "killall", "history", "man", "help", "true", "false",
  "test", "[", "basename", "dirname", "realpath", "readlink",
  "node", "npm", "npx", "bun", "yarn", "pnpm", "tsc", "eslint", "prettier",
  "python", "python3", "pip", "pip3", "pytest", "pylint", "black", "mypy",
  "go", "cargo", "rustc", "gcc", "g++", "make", "cmake", "java", "javac", "mvn", "gradle",
  "git", "curl", "wget",
  "mkdir", "touch", "cp", "mv", "rm", "ln", "chmod", "chown",
  "tar", "zip", "unzip", "gzip", "gunzip",
  "sed", "awk", "tr", "cut", "paste", "expand", "unexpand",
  "xargs", "tee", "column", "fmt", "fold", "nl", "pr",
  "od", "hexdump", "xxd",
  "json", "jq", "yq",
  "docker", "kubectl",
  "cd",  // handled specially
];

function isBlocked(command: string): boolean {
  return BLOCKED.some((re) => re.test(command));
}

function isAllowed(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  // Extract the binary name
  const match = trimmed.match(/^([a-zA-Z0-9_.-]+)/);
  if (!match) return false;
  const binary = match[1];
  return SAFE_COMMANDS.includes(binary) || binary.startsWith("./") || binary.includes("/");
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  fullAccess?: boolean; // bypass allowlist (use carefully)
  env?: Record<string, string>;
}

/**
 * Execute a command in the workspace.
 */
export async function execute(
  command: string,
  opts: ExecOptions = {}
): Promise<TerminalResult> {
  await ensureWorkspace();
  const start = Date.now();

  // Determine CWD
  let cwd = WORKSPACE_ROOT;
  if (opts.cwd) {
    try {
      cwd = resolvePath(opts.cwd);
    } catch {
      cwd = WORKSPACE_ROOT;
    }
  }

  // Handle `cd` as a no-op (we just return success)
  if (command.trim().startsWith("cd ")) {
    const target = command.trim().slice(3).trim();
    try {
      const newCwd = resolvePath(target);
      const stat = await import("fs/promises").then((m) => m.stat(newCwd));
      if (stat.isDirectory()) {
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          command,
          cwd: path.relative(WORKSPACE_ROOT, newCwd) || ".",
          durationMs: Date.now() - start,
        };
      }
      return {
        stdout: "",
        stderr: `cd: not a directory: ${target}`,
        exitCode: 1,
        command,
        cwd: path.relative(WORKSPACE_ROOT, cwd) || ".",
        durationMs: Date.now() - start,
      };
    } catch {
      return {
        stdout: "",
        stderr: `cd: no such directory: ${target}`,
        exitCode: 1,
        command,
        cwd: path.relative(WORKSPACE_ROOT, cwd) || ".",
        durationMs: Date.now() - start,
      };
    }
  }

  // Safety check
  if (isBlocked(command)) {
    return {
      stdout: "",
      stderr: "Command blocked for safety (destructive system command).",
      exitCode: 126,
      command,
      cwd: path.relative(WORKSPACE_ROOT, cwd) || ".",
      durationMs: Date.now() - start,
    };
  }

  if (!opts.fullAccess && !isAllowed(command)) {
    return {
      stdout: "",
      stderr: `Command not in allowlist. Prefix with 'safe' commands only. Binary not recognized. Use fullAccess mode if needed.`,
      exitCode: 126,
      command,
      cwd: path.relative(WORKSPACE_ROOT, cwd) || ".",
      durationMs: Date.now() - start,
    };
  }

  try {
    const env = { ...process.env, ...opts.env, FORCE_COLOR: "0", NO_COLOR: "1" };
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: opts.timeout || DEFAULT_TIMEOUT,
      maxBuffer: 5 * 1024 * 1024, // 5MB
      env,
    });

    let truncated = false;
    let out = stdout;
    let err = stderr;
    if (out.length > MAX_OUTPUT) {
      out = out.slice(0, MAX_OUTPUT) + "\n... [truncated]";
      truncated = true;
    }
    if (err.length > MAX_OUTPUT) {
      err = err.slice(0, MAX_OUTPUT) + "\n... [truncated]";
      truncated = true;
    }

    return {
      stdout: out,
      stderr: err,
      exitCode: 0,
      command,
      cwd: path.relative(WORKSPACE_ROOT, cwd) || ".",
      durationMs: Date.now() - start,
      truncated,
    };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string };
    let stdout = err.stdout || "";
    let stderr = err.stderr || "";
    if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT) + "\n... [truncated]";
    if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT) + "\n... [truncated]";

    let exitCode = err.code ?? 1;
    if (err.killed || err.signal === "SIGTERM") {
      stderr = `Command timed out after ${opts.timeout || DEFAULT_TIMEOUT}ms\n${stderr}`;
      exitCode = 124;
    }

    return {
      stdout,
      stderr,
      exitCode,
      command,
      cwd: path.relative(WORKSPACE_ROOT, cwd) || ".",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute multiple commands in sequence, stopping on first failure.
 */
export async function executeSequence(
  commands: string[],
  opts: ExecOptions = {}
): Promise<TerminalResult[]> {
  const results: TerminalResult[] = [];
  for (const cmd of commands) {
    const result = await execute(cmd, opts);
    results.push(result);
    if (result.exitCode !== 0) break;
  }
  return results;
}

/**
 * Detect project type in the workspace or a subdirectory.
 */
export async function detectProjectType(relativePath: string = "."): Promise<{
  language: string;
  framework: string | null;
  packageManager: string | null;
  hasTests: boolean;
}> {
  const { resolvePath } = await import("./file-system");
  const fs = await import("fs/promises");
  const dir = resolvePath(relativePath);

  let language = "unknown";
  let framework: string | null = null;
  let packageManager: string | null = null;
  let hasTests = false;

  try {
    // Check for package.json (Node/JS/TS)
    try {
      const pkgRaw = await fs.readFile(`${dir}/package.json`, "utf-8");
      const pkg = JSON.parse(pkgRaw);
      language = "typescript";
      packageManager = "npm";
      if (await fileExists(`${dir}/bun.lock`)) packageManager = "bun";
      if (await fileExists(`${dir}/yarn.lock`)) packageManager = "yarn";
      if (await fileExists(`${dir}/pnpm-lock.yaml`)) packageManager = "pnpm";

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["react"]) {
        language = "typescript";
        if (deps["next"]) framework = "nextjs";
        else if (deps["@angular/core"]) framework = "angular";
        else if (deps["vue"]) framework = "vue";
        else framework = "react";
      } else if (deps["@angular/core"]) {
        language = "typescript";
        framework = "angular";
      } else if (deps["vue"]) {
        language = "typescript";
        framework = "vue";
      } else if (deps["express"]) {
        framework = "express";
      } else if (deps["fastify"]) {
        framework = "fastify";
      } else if (deps["nestjs"]) {
        framework = "nestjs";
      }
      if (deps["jest"] || deps["vitest"] || deps["mocha"] || deps["@playwright/test"]) {
        hasTests = true;
      }
    } catch {
      // no package.json
    }

    // Check for Python
    try {
      await fs.access(`${dir}/requirements.txt`);
      language = "python";
      if (await fileExists(`${dir}/manage.py`)) framework = "django";
      else if (await fileExists(`${dir}/app.py`) || await fileExists(`${dir}/wsgi.py`)) framework = "flask";
      else if (await fileExists(`${dir}/main.py`) && await fileExists(`${dir}/pyproject.toml`)) framework = "fastapi";
    } catch {
      // no requirements.txt
    }

    // Check for Go
    try {
      await fs.access(`${dir}/go.mod`);
      language = "go";
    } catch {
      // no go.mod
    }

    // Check for Rust
    try {
      await fs.access(`${dir}/Cargo.toml`);
      language = "rust";
    } catch {
      // no Cargo.toml
    }

    // Check for Odoo (Python + odoo)
    try {
      const files = await fs.readdir(dir);
      if (files.includes("__manifest__.py") || files.includes("__openerp__.py")) {
        language = "python";
        framework = "odoo";
      }
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }

  return { language, framework, packageManager, hasTests };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await (await import("fs/promises")).access(p);
    return true;
  } catch {
    return false;
  }
}
