/**
 * Dev Server Manager - Built from scratch
 *
 * Starts and manages long-running dev servers in the background.
 * Tracks running processes and lets you stop them.
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { WORKSPACE_ROOT, resolvePath } from "./file-system";
import { detectProjectType } from "./terminal";

export interface RunningServer {
  id: string;
  name: string;
  cwd: string;
  command: string;
  pid: number;
  startedAt: Date;
  status: "running" | "stopped" | "crashed";
  port?: number;
  logs: string[];
  process?: ChildProcess;
}

// In-memory store of running servers (per server process)
const runningServers = new Map<string, RunningServer>();

const MAX_LOGS = 500;

/**
 * Detect the dev command for a project.
 */
export async function detectDevCommand(relativePath: string = "."): Promise<{
  command: string;
  packageManager: string;
  port?: number;
} | null> {
  const info = await detectProjectType(relativePath);
  const pm = info.packageManager || "npm";

  // Check for common dev scripts
  if (info.framework === "nextjs") return { command: `${pm} run dev`, packageManager: pm, port: 3000 };
  if (info.framework === "react") return { command: `${pm} run dev`, packageManager: pm, port: 5173 };
  if (info.framework === "vue") return { command: `${pm} run dev`, packageManager: pm, port: 5173 };
  if (info.framework === "angular") return { command: `${pm} start`, packageManager: pm, port: 4200 };
  if (info.framework === "svelte") return { command: `${pm} run dev`, packageManager: pm, port: 5173 };
  if (info.framework === "remix") return { command: `${pm} run dev`, packageManager: pm, port: 3000 };
  if (info.framework === "astro") return { command: `${pm} run dev`, packageManager: pm, port: 4321 };
  if (info.framework === "solid") return { command: `${pm} run dev`, packageManager: pm, port: 5173 };
  if (info.framework === "express") return { command: `${pm} run dev`, packageManager: pm, port: 3000 };
  if (info.framework === "fastify") return { command: `${pm} run dev`, packageManager: pm, port: 3000 };
  if (info.framework === "nestjs") return { command: `${pm} run start:dev`, packageManager: pm, port: 3000 };
  if (info.framework === "flask") return { command: `python app.py`, packageManager: "pip", port: 5000 };
  if (info.framework === "django") return { command: `python manage.py runserver`, packageManager: "pip", port: 8000 };
  if (info.framework === "fastapi") return { command: `uvicorn app.main:app --reload`, packageManager: "pip", port: 8000 };
  if (info.framework === "electron") return { command: `${pm} run dev`, packageManager: pm };
  if (info.framework === "tauri") return { command: `${pm} run tauri dev`, packageManager: pm };
  if (info.framework === "reactnative") return { command: `${pm} start`, packageManager: pm };
  if (info.framework === "node") return { command: `${pm} run dev`, packageManager: pm };

  // Fallback: check if package.json has a dev script
  try {
    const fs = await import("fs/promises");
    const pkgPath = path.join(resolvePath(relativePath), "package.json");
    const pkgRaw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw);
    if (pkg.scripts?.dev) return { command: `${pm} run dev`, packageManager: pm };
    if (pkg.scripts?.start) return { command: `${pm} start`, packageManager: pm };
  } catch {
    // ignore
  }

  return null;
}

/**
 * Start a dev server in the background.
 */
export async function startServer(
  relativePath: string = ".",
  customCommand?: string
): Promise<{ success: boolean; server?: RunningServer; message: string }> {
  // Stop any existing server in this path
  await stopServerByPath(relativePath);

  const cwd = resolvePath(relativePath);
  const cmd = customCommand || (await detectDevCommand(relativePath));
  if (!cmd) {
    return {
      success: false,
      message: "Could not detect a dev command for this project. Try specifying one.",
    };
  }

  // Parse command into binary + args
  const parts = cmd.command.split(/\s+/);
  const binary = parts[0];
  const args = parts.slice(1);

  const id = `srv-${Date.now()}`;
  const server: RunningServer = {
    id,
    name: path.basename(cwd) || "server",
    cwd: relativePath,
    command: cmd.command,
    pid: 0,
    startedAt: new Date(),
    status: "running",
    port: cmd.port,
    logs: [],
  };

  try {
    const child = spawn(binary, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    server.process = child;
    server.pid = child.pid || 0;

    const pushLog = (data: Buffer, stream: "out" | "err") => {
      const text = data.toString();
      const lines = text.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        server.logs.push(`[${stream}] ${line}`);
        if (server.logs.length > MAX_LOGS) {
          server.logs.shift();
        }
      }
    };

    child.stdout?.on("data", (d) => pushLog(d, "out"));
    child.stderr?.on("data", (d) => pushLog(d, "err"));

    child.on("exit", (code) => {
      server.status = code === 0 ? "stopped" : "crashed";
      server.logs.push(`[sys] Process exited with code ${code}`);
    });

    child.on("error", (err) => {
      server.status = "crashed";
      server.logs.push(`[sys] Error: ${err.message}`);
    });

    runningServers.set(id, server);

    // Wait a moment for startup logs
    await new Promise((r) => setTimeout(r, 1500));

    return {
      success: true,
      server,
      message: `Started: ${cmd.command} (pid: ${server.pid})${cmd.port ? ` on port ${cmd.port}` : ""}`,
    };
  } catch (e) {
    server.status = "crashed";
    return {
      success: false,
      message: `Failed to start: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }
}

/**
 * Stop a running server by ID.
 */
export async function stopServer(id: string): Promise<{ success: boolean; message: string }> {
  const server = runningServers.get(id);
  if (!server) {
    return { success: false, message: "Server not found" };
  }
  if (server.process) {
    try {
      server.process.kill("SIGTERM");
      // Force kill after 3s
      setTimeout(() => {
        if (server.process && !server.process.killed) {
          server.process.kill("SIGKILL");
        }
      }, 3000);
    } catch {
      // ignore
    }
  }
  server.status = "stopped";
  runningServers.delete(id);
  return { success: true, message: `Stopped ${server.name}` };
}

/**
 * Stop a server by its cwd path.
 */
async function stopServerByPath(relativePath: string): Promise<void> {
  for (const [id, server] of runningServers.entries()) {
    if (server.cwd === relativePath) {
      await stopServer(id);
    }
  }
}

/**
 * Get a server by ID.
 */
export function getServer(id: string): RunningServer | undefined {
  return runningServers.get(id);
}

/**
 * List all running servers.
 */
export function listServers(): Array<Omit<RunningServer, "process">> {
  return Array.from(runningServers.values()).map((s) => ({
    id: s.id,
    name: s.name,
    cwd: s.cwd,
    command: s.command,
    pid: s.pid,
    startedAt: s.startedAt,
    status: s.status,
    port: s.port,
    logs: s.logs,
  }));
}

/**
 * Get logs for a server.
 */
export function getServerLogs(id: string, tail = 100): string[] {
  const server = runningServers.get(id);
  if (!server) return [];
  return server.logs.slice(-tail);
}
