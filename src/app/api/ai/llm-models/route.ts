import { NextResponse } from "next/server";
import { AVAILABLE_MODELS } from "@/lib/ai/local-llm";

export const runtime = "nodejs";

// GET /api/ai/llm-models — list available models (metadata only, no engine load)
export async function GET() {
  return NextResponse.json({ ok: true, models: AVAILABLE_MODELS });
}
