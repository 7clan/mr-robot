/**
 * Git Manager - Built from scratch
 *
 * Provides git operations on the workspace: init, status, add, commit, log, diff, branch.
 * Uses the terminal executor under the hood.
 */

import { execute } from "./terminal";

export interface GitStatus {
  initialized: boolean;
  branch: string | null;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  ahead: number;
  behind: number;
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitDiff {
  files: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
  summary: {
    totalAdditions: number;
    totalDeletions: number;
    filesChanged: number;
  };
}

/**
 * Check if git is initialized in the workspace.
 */
export async function isInitialized(): Promise<boolean> {
  const result = await execute("git rev-parse --is-inside-work-tree", { fullAccess: false });
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

/**
 * Initialize git in the workspace.
 */
export async function init(): Promise<{ success: boolean; message: string }> {
  const result = await execute("git init", { fullAccess: false });
  if (result.exitCode !== 0) {
    return { success: false, message: result.stderr || "git init failed" };
  }
  // Set default user if not set
  await execute('git config user.email "ai@from-scratch.local"', { fullAccess: true });
  await execute('git config user.name "Mr Robot"', { fullAccess: true });
  return { success: true, message: "Git initialized" };
}

/**
 * Get the current git status.
 */
export async function getStatus(): Promise<GitStatus> {
  const initialized = await isInitialized();
  if (!initialized) {
    return {
      initialized: false,
      branch: null,
      staged: [],
      modified: [],
      untracked: [],
      deleted: [],
      ahead: 0,
      behind: 0,
    };
  }

  const branchResult = await execute("git rev-parse --abbrev-ref HEAD", { fullAccess: false });
  const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : "main";

  const statusResult = await execute("git status --porcelain", { fullAccess: false });
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];
  const deleted: string[] = [];

  if (statusResult.exitCode === 0) {
    for (const line of statusResult.stdout.split("\n")) {
      if (!line.trim()) continue;
      const x = line[0];
      const y = line[1];
      const file = line.slice(3).trim().replace(/^"|"$/g, "");
      if (x === "?" && y === "?") untracked.push(file);
      else if (x === "A" || x === "M" || x === "D" || x === "R") staged.push(file);
      else if (y === "M") modified.push(file);
      else if (y === "D") deleted.push(file);
      if (y === "?" && x !== "?") untracked.push(file);
    }
  }

  // Ahead/behind (only works if there's an upstream)
  let ahead = 0;
  let behind = 0;
  const abResult = await execute("git rev-list --left-right --count HEAD...@{upstream}", { fullAccess: false });
  if (abResult.exitCode === 0) {
    const parts = abResult.stdout.trim().split(/\s+/);
    if (parts.length === 2) {
      ahead = parseInt(parts[0], 10) || 0;
      behind = parseInt(parts[1], 10) || 0;
    }
  }

  return {
    initialized: true,
    branch,
    staged,
    modified,
    untracked,
    deleted,
    ahead,
    behind,
  };
}

/**
 * Stage files. If no files specified, stage all.
 */
export async function add(files?: string[]): Promise<{ success: boolean; message: string }> {
  const target = files && files.length > 0 ? files.join(" ") : ".";
  const result = await execute(`git add ${target}`, { fullAccess: false });
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? `Staged ${files ? files.length : "all"} files` : result.stderr,
  };
}

/**
 * Create a commit.
 */
export async function commit(message: string): Promise<{ success: boolean; message: string; hash?: string }> {
  const escaped = message.replace(/"/g, '\\"');
  const result = await execute(`git commit -m "${escaped}"`, { fullAccess: false });
  if (result.exitCode !== 0) {
    return { success: false, message: result.stderr || "commit failed" };
  }
  // Get the commit hash
  const hashResult = await execute("git rev-parse HEAD", { fullAccess: false });
  return {
    success: true,
    message: `Committed: ${message}`,
    hash: hashResult.stdout.trim().slice(0, 7),
  };
}

/**
 * Get commit log.
 */
export async function getLog(limit = 20): Promise<GitCommit[]> {
  const result = await execute(
    `git log --pretty=format:"%h|%an|%ad|%s" --date=short -n ${limit}`,
    { fullAccess: false }
  );
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const [hash, author, date, ...msgParts] = line.split("|");
      return {
        hash: hash.trim(),
        author: author.trim(),
        date: date.trim(),
        message: msgParts.join("|").trim(),
      };
    });
}

/**
 * Get diff summary.
 */
export async function getDiff(): Promise<GitDiff> {
  const result = await execute("git diff --stat", { fullAccess: false });
  const files: GitDiff["files"] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  if (result.exitCode === 0) {
    for (const line of result.stdout.split("\n")) {
      const match = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+([+-]+)/);
      if (match) {
        const [, path, changes, bars] = match;
        const additions = (bars.match(/\+/g) || []).length;
        const deletions = (bars.match(/-/g) || []).length;
        files.push({ path: path.trim(), status: "modified", additions, deletions });
        totalAdditions += additions;
        totalDeletions += deletions;
      }
    }
  }

  return {
    files,
    summary: {
      totalAdditions,
      totalDeletions,
      filesChanged: files.length,
    },
  };
}

/**
 * Get detailed diff for a specific file.
 */
export async function getFileDiff(filePath: string): Promise<string> {
  const result = await execute(`git diff ${filePath}`, { fullAccess: false });
  return result.exitCode === 0 ? result.stdout : "";
}

/**
 * Create a new branch.
 */
export async function createBranch(name: string): Promise<{ success: boolean; message: string }> {
  const result = await execute(`git checkout -b ${name}`, { fullAccess: false });
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? `Created and switched to branch ${name}` : result.stderr,
  };
}

/**
 * Switch to a branch.
 */
export async function checkout(branch: string): Promise<{ success: boolean; message: string }> {
  const result = await execute(`git checkout ${branch}`, { fullAccess: false });
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? `Switched to ${branch}` : result.stderr,
  };
}

/**
 * List all branches.
 */
export async function listBranches(): Promise<Array<{ name: string; current: boolean }>> {
  const result = await execute("git branch", { fullAccess: false });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => ({
      name: line.replace(/^\*?\s+/, "").trim(),
      current: line.startsWith("*"),
    }));
}

/**
 * Discard changes to a file.
 */
export async function discard(filePath: string): Promise<{ success: boolean; message: string }> {
  const result = await execute(`git checkout -- ${filePath}`, { fullAccess: false });
  return {
    success: result.exitCode === 0,
    message: result.exitCode === 0 ? `Discarded changes to ${filePath}` : result.stderr,
  };
}
