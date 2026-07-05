import { NextRequest } from "next/server";
import { generateTextStream } from "@/lib/ai/transformer";

export const runtime = "nodejs";

/**
 * POST /api/ai/stream
 * Streaming text generation using the from-scratch transformer.
 * Returns a stream of tokens (Server-Sent Events format).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, maxTokens, temperature } = body as {
      prompt?: string;
      maxTokens?: number;
      temperature?: number;
    };

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          generateTextStream(
            prompt,
            (text) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            },
            {
              maxTokens: maxTokens || 50,
              temperature: temperature || 0.8,
            }
          );
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : "unknown" })}\n\n`));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
