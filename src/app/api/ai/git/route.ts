import { NextRequest, NextResponse } from "next/server";
import {
  isInitialized,
  init,
  getStatus,
  add,
  commit,
  getLog,
  getDiff,
  getFileDiff,
  createBranch,
  checkout,
  listBranches,
  discard,
} from "@/lib/ai/git";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action") || "status";
  try {
    if (action === "status") {
      const status = await getStatus();
      return NextResponse.json({ status });
    }
    if (action === "log") {
      const log = await getLog(50);
      return NextResponse.json({ log });
    }
    if (action === "diff") {
      const filePath = req.nextUrl.searchParams.get("path");
      if (filePath) {
        const diff = await getFileDiff(filePath);
        return NextResponse.json({ diff });
      }
      const diff = await getDiff();
      return NextResponse.json({ diff });
    }
    if (action === "branches") {
      const branches = await listBranches();
      return NextResponse.json({ branches });
    }
    if (action === "check") {
      const initialized = await isInitialized();
      return NextResponse.json({ initialized });
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

    if (action === "init") {
      const result = await init();
      return NextResponse.json(result);
    }
    if (action === "add") {
      const { files } = body as { files?: string[] };
      const result = await add(files);
      return NextResponse.json(result);
    }
    if (action === "commit") {
      const { message } = body as { message: string };
      if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });
      const result = await commit(message);
      return NextResponse.json(result);
    }
    if (action === "branch") {
      const { name } = body as { name: string };
      if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
      const result = await createBranch(name);
      return NextResponse.json(result);
    }
    if (action === "checkout") {
      const { branch } = body as { branch: string };
      if (!branch) return NextResponse.json({ error: "Missing branch" }, { status: 400 });
      const result = await checkout(branch);
      return NextResponse.json(result);
    }
    if (action === "discard") {
      const { path } = body as { path: string };
      if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });
      const result = await discard(path);
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
