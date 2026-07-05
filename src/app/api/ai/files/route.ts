import { NextRequest, NextResponse } from "next/server";
import {
  listDirectory,
  getTree,
  readFile,
  writeFile,
  deleteFile,
  createDirectory,
  moveFile,
  searchFiles,
  statFile,
} from "@/lib/ai/file-system";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const action = url.searchParams.get("action") || "tree";
  const path = url.searchParams.get("path") || ".";
  const query = url.searchParams.get("q");

  try {
    if (action === "tree") {
      const tree = await getTree(path);
      return NextResponse.json({ tree });
    }
    if (action === "list") {
      const nodes = await listDirectory(path);
      return NextResponse.json({ nodes });
    }
    if (action === "read") {
      const content = await readFile(path);
      const stat = await statFile(path);
      return NextResponse.json({ content, stat });
    }
    if (action === "search" && query) {
      const results = await searchFiles(query);
      return NextResponse.json({ results });
    }
    if (action === "stat") {
      const stat = await statFile(path);
      return NextResponse.json({ stat });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, path, content, to } = body as {
      action: string;
      path?: string;
      content?: string;
      to?: string;
    };

    if (action === "write" && path !== undefined && content !== undefined) {
      await writeFile(path, content);
      return NextResponse.json({ ok: true, path });
    }
    if (action === "mkdir" && path) {
      await createDirectory(path);
      return NextResponse.json({ ok: true, path });
    }
    if (action === "delete" && path) {
      await deleteFile(path);
      return NextResponse.json({ ok: true, path });
    }
    if (action === "move" && path && to) {
      await moveFile(path, to);
      return NextResponse.json({ ok: true, from: path, to });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path");
    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    await deleteFile(path);
    return NextResponse.json({ ok: true, path });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
