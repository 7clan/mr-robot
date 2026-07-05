import { NextRequest, NextResponse } from "next/server";
import { renameSymbol, applyRename, previewRename } from "@/lib/ai/rename";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { oldName, newName, scope, apply, preview } = body as {
      oldName?: string;
      newName?: string;
      scope?: string;
      apply?: boolean;
      preview?: boolean;
    };

    if (!oldName || !newName) {
      return NextResponse.json(
        { error: "Missing oldName or newName" },
        { status: 400 }
      );
    }

    if (preview) {
      const result = await previewRename(oldName, newName, { scope });
      return NextResponse.json(result);
    }

    const result = await renameSymbol(oldName, newName, { scope });

    if (apply) {
      const applied = await applyRename(result);
      return NextResponse.json({
        ...result,
        applied: applied.applied,
        applyErrors: applied.errors,
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown" },
      { status: 500 }
    );
  }
}
