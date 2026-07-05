import { NextRequest, NextResponse } from "next/server";
import { getLearnedMistakes, clearMistakes } from "@/lib/ai/self-correct";

export const runtime = "nodejs";

export async function GET() {
  try {
    const mistakes = await getLearnedMistakes();
    return NextResponse.json({ mistakes });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearMistakes();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
