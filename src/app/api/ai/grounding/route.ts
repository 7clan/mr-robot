import { NextRequest, NextResponse } from "next/server";
import { buildGroundingBundle } from "@/lib/ai/grounded-generation";

export const runtime = "nodejs";

// POST /api/ai/grounding
// body: { query: string, maxSources?: number, searchWeb?: boolean }
// Returns: GroundingBundle (sources + systemPrompt ready for the LLM)
//
// This is the server-side half of grounded generation. The client receives
// this bundle and feeds the systemPrompt + conversation to the in-browser LLM.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = (body.query ?? "").toString();
    if (!query) {
      return NextResponse.json(
        { ok: false, error: "Missing 'query'" },
        { status: 400 }
      );
    }

    const bundle = await buildGroundingBundle(query, {
      maxSources: body.maxSources ?? 4,
      maxCharsPerSource: body.maxCharsPerSource ?? 1200,
      searchWeb: body.searchWeb ?? true,
    });

    return NextResponse.json({ ok: true, bundle });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
