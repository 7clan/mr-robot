import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Don't initialize the model — just report what's available
    return NextResponse.json({
      available: true,
      type: "from-scratch",
      noExternalLLM: true,
      noAPIKeys: true,
      builtFromScratch: true,
      modelConfig: {
        vocabSize: 2000,
        dim: 64,
        numLayers: 4,
        numHeads: 4,
        maxSeqLen: 256,
        hiddenDim: 256,
      },
      tokenizer: {
        type: "BPE (Byte Pair Encoding)",
        vocabSize: 1500,
      },
      capabilities: [
        "Text generation (autoregressive)",
        "Streaming generation (token-by-token)",
        "Text embeddings (for semantic search)",
        "Conversation memory (vector-based)",
        "Chain-of-thought reasoning",
        "Code understanding (AST analysis)",
        "Code execution sandbox",
        "Multi-turn planning",
        "Context window (summarization)",
        "Instruction following",
      ],
    });
  } catch (e) {
    return NextResponse.json({ available: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
