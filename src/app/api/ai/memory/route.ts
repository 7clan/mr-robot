import { NextRequest, NextResponse } from "next/server";
import { getRecentMessages, clearMessages } from "@/lib/ai/knowledge-base";

export const runtime = "nodejs";

export async function GET() {
  try {
    const messages = await getRecentMessages(50);
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearMessages();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
