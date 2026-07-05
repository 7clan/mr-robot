import { NextRequest, NextResponse } from "next/server";
import { think } from "@/lib/ai/brain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, speak } = body as { message?: string; speak?: boolean };
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing 'message' field" },
        { status: 400 }
      );
    }
    const response = await think(message, { speak });
    return NextResponse.json(response);
  } catch (e) {
    console.error("Chat API error:", e);
    // Return a graceful response instead of a 500 error
    // This way the user always gets a response in the chat
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      text: `I ran into an error processing that: ${errorMessage}\n\nBut I'm still here! Try asking me something else, or try the search test page at /api/ai/search-test`,
      intent: "error",
      confidence: 0,
      steps: [{
        action: "error",
        description: `Error: ${errorMessage}`,
        result: "Recovered gracefully",
        success: false,
      }],
    });
  }
}
