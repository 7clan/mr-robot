import { NextRequest, NextResponse } from "next/server";
import {
  recordExample,
  listExamples,
  deleteExample,
  getStats,
  type TrainingExampleInput,
} from "@/lib/ai/training-collector";

export const runtime = "nodejs";

// GET /api/ai/train — list examples + stats
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
  const view = url.searchParams.get("view") ?? "list";

  try {
    if (view === "stats") {
      const stats = await getStats();
      return NextResponse.json({ ok: true, stats });
    }
    const examples = await listExamples(limit);
    return NextResponse.json({ ok: true, examples });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST /api/ai/train — record a new example
// body: TrainingExampleInput
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TrainingExampleInput;
    if (
      typeof body.prompt !== "string" ||
      typeof body.response !== "string" ||
      ![-1, 0, 1].includes(body.rating)
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }
    const ex = await recordExample(body);
    return NextResponse.json({ ok: true, example: ex });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// DELETE /api/ai/train?id=... — delete an example
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing id" },
      { status: 400 }
    );
  }
  try {
    await deleteExample(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
