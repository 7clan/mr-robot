import { NextRequest, NextResponse } from "next/server";
import {
  startServer,
  stopServer,
  listServers,
  getServer,
  getServerLogs,
  detectDevCommand,
} from "@/lib/ai/dev-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "list";
  try {
    if (action === "list") {
      const servers = listServers();
      return NextResponse.json({ servers });
    }
    if (action === "logs") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const logs = getServerLogs(id, 200);
      const server = getServer(id);
      return NextResponse.json({
        logs,
        status: server?.status || "stopped",
        port: server?.port,
      });
    }
    if (action === "detect") {
      const path = req.nextUrl.searchParams.get("path") || ".";
      const cmd = await detectDevCommand(path);
      return NextResponse.json({ command: cmd });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action: string };

    if (action === "start") {
      const { path, command } = body as { path?: string; command?: string };
      const result = await startServer(path || ".", command);
      return NextResponse.json(result);
    }
    if (action === "stop") {
      const { id } = body as { id: string };
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const result = await stopServer(id);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown" },
      { status: 500 }
    );
  }
}
