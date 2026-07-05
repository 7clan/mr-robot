import { NextRequest, NextResponse } from "next/server";
import { getTos, updateTos, acceptTos, resetTos } from "@/lib/ai/terms-of-service";

export const runtime = "nodejs";

// GET /api/ai/tos — fetch current ToS
export async function GET() {
  try {
    const tos = await getTos();
    return NextResponse.json({ ok: true, tos });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST /api/ai/tos — update or accept
// body: { action: "update" | "accept" | "reset", body?: string, title?: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as "update" | "accept" | "reset";

    if (action === "update") {
      if (!body.body || typeof body.body !== "string") {
        return NextResponse.json(
          { ok: false, error: "Missing 'body' for update" },
          { status: 400 }
        );
      }
      const tos = await updateTos(body.body, body.title);
      return NextResponse.json({ ok: true, tos });
    }

    if (action === "accept") {
      const tos = await acceptTos();
      return NextResponse.json({ ok: true, tos });
    }

    if (action === "reset") {
      const tos = await resetTos();
      return NextResponse.json({ ok: true, tos });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
