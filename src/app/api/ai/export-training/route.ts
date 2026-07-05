import { NextRequest, NextResponse } from "next/server";
import {
  exportJSONL,
  exportAlpaca,
  exportShareGPT,
  exportDPOPairs,
  listExamples,
} from "@/lib/ai/training-collector";

export const runtime = "nodejs";

// GET /api/ai/export-training?format=jsonl|alpaca|sharegpt|dpo
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "jsonl").toLowerCase();
  const limit = parseInt(url.searchParams.get("limit") ?? "10000", 10);

  try {
    const examples = await listExamples(limit);
    let content: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case "jsonl":
        content = exportJSONL(examples);
        contentType = "application/jsonl";
        filename = "mr-robot-training.jsonl";
        break;
      case "alpaca":
        content = exportAlpaca(examples);
        contentType = "application/jsonl";
        filename = "mr-robot-alpaca.jsonl";
        break;
      case "sharegpt":
        content = exportShareGPT(examples);
        contentType = "application/jsonl";
        filename = "mr-robot-sharegpt.jsonl";
        break;
      case "dpo":
        content = exportDPOPairs(examples);
        contentType = "application/jsonl";
        filename = "mr-robot-dpo.jsonl";
        break;
      default:
        return NextResponse.json(
          { ok: false, error: `Unknown format: ${format}` },
          { status: 400 }
        );
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
