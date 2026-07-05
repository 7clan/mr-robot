import { NextRequest, NextResponse } from "next/server";
import { extractFact, storeFact, getAllFacts, clearFacts } from "@/lib/ai/knowledge-base";

export const runtime = "nodejs";

export async function GET() {
  try {
    const facts = await getAllFacts();
    return NextResponse.json({ facts });
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
    const { text, action } = body as { text?: string; action?: "clear" };
    if (action === "clear") {
      await clearFacts();
      return NextResponse.json({ ok: true, cleared: true });
    }
    if (!text) {
      return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
    }
    const fact = extractFact(text);
    if (!fact) {
      return NextResponse.json(
        { ok: false, error: "Could not extract a fact. Try 'X is Y' format." },
        { status: 200 }
      );
    }
    await storeFact(fact);
    return NextResponse.json({ ok: true, fact });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
