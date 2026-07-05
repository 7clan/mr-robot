import { NextRequest, NextResponse } from "next/server";
import { webSearch, summarizeResults } from "@/lib/ai/web-search";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/ai/search?query=<query>&clearCache=1
 * You can test this directly in your browser!
 */
export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("query") || "";
    const clearCache = req.nextUrl.searchParams.get("clearCache");

    if (clearCache) {
      await db.searchResult.deleteMany({});
      return NextResponse.json({ ok: true, message: "Search cache cleared" });
    }

    if (!query) {
      return NextResponse.json({
        error: "Add ?query=something to search, or ?clearCache=1 to clear cache",
        examples: [
          "/api/ai/search?query=javascript",
          "/api/ai/search?query=python%20programming",
          "/api/ai/search?clearCache=1",
        ],
      });
    }

    const results = await webSearch(query);
    const summary = summarizeResults(results, 1500);
    return NextResponse.json({ query, results, summary, count: results.length });
  } catch (e) {
    console.error("Search API GET error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = body as { query?: string };
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing 'query'" }, { status: 400 });
    }
    const results = await webSearch(query);
    const summary = summarizeResults(results, 1500);
    return NextResponse.json({ results, summary });
  } catch (e) {
    console.error("Search API error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
