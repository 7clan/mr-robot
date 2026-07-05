import { NextRequest, NextResponse } from "next/server";
import { generateCode } from "@/lib/ai/code-engine";
import { applyOps } from "@/lib/ai/file-system";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instruction, dryRun } = body as { instruction?: string; dryRun?: boolean };
    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json({ error: "Missing 'instruction'" }, { status: 400 });
    }

    const result = await generateCode(instruction);

    if (dryRun) {
      return NextResponse.json({ ...result, applied: false });
    }

    // Apply the file operations
    const applied = await applyOps(result.files);
    return NextResponse.json({
      ...result,
      applied: applied.applied,
      applyErrors: applied.errors,
    });
  } catch (e) {
    console.error("Code API error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
