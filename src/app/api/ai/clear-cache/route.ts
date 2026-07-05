import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Clears the web search cache so the AI tries fresh searches.
 * POST /api/ai/clear-cache
 */
export async function POST() {
  try {
    const result = await db.searchResult.deleteMany({});
    return NextResponse.json({
      ok: true,
      cleared: result.count,
      message: `Cleared ${result.count} cached search results. Web search will now try fresh requests.`,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
