/**
 * Conversation Memory — Built from scratch
 *
 * Stores all conversation messages with their embeddings (from the from-scratch transformer).
 * Retrieves relevant context using semantic similarity.
 * Provides a context window — summarizes old messages to fit in the model's context.
 *
 * No external LLMs. Uses the from-scratch transformer for embeddings.
 */

import { db } from "@/lib/db";

export interface MemoryEntry {
  id: string;
  role: string;
  content: string;
  intent?: string;
  embedding?: number[];
  timestamp: number;
}

/**
 * Store a message with its embedding (from the from-scratch transformer).
 */
export async function storeMessageWithEmbedding(
  role: string,
  content: string,
  intent?: string
): Promise<void> {
  try {
    // Generate embedding using the from-scratch transformer
    let embedding: number[] = [];
    try {
      const { getTextEmbedding } = await import("./transformer");
      embedding = getTextEmbedding(content.slice(0, 500));
    } catch {}

    const metadata = embedding.length > 0
      ? JSON.stringify({ embedding, hasEmbedding: true })
      : JSON.stringify({ hasEmbedding: false });

    await db.message.create({
      data: { role, content, intent, metadata },
    });
  } catch (e) {
    console.error("Failed to store message:", e);
  }
}

/**
 * Retrieve relevant messages from conversation history.
 * Uses embedding similarity from the from-scratch transformer.
 */
export async function retrieveRelevantContext(
  query: string,
  limit: number = 10
): Promise<MemoryEntry[]> {
  try {
    const messages = await db.message.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (messages.length === 0) return [];

    // Get query embedding
    let queryEmbedding: number[] = [];
  try {
    const { getTextEmbedding } = await import("./transformer");
    queryEmbedding = getTextEmbedding(query.slice(0, 500));
  } catch {}

    const entries: MemoryEntry[] = messages.map((m) => {
      let embedding: number[] | undefined;
      try {
        const meta = JSON.parse(m.metadata || "{}");
        if (meta.hasEmbedding && meta.embedding) {
          embedding = meta.embedding;
        }
      } catch {}
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        intent: m.intent || undefined,
        embedding,
        timestamp: m.createdAt.getTime(),
      };
    });

    // Use semantic similarity if embeddings available
    if (queryEmbedding.length > 0) {
      // Compute similarities using dynamic import
      const { cosineSimilarity } = await import("./transformer");
      const scored = entries
        .filter((e) => e.embedding && e.embedding.length > 0)
        .map((e) => ({
          entry: e,
          similarity: cosineSimilarity(queryEmbedding, e.embedding!),
          recency: 1 / (1 + (Date.now() - e.timestamp) / (1000 * 60 * 60)),
        }))
        .map((s) => ({
          entry: s.entry,
          score: s.similarity * 0.7 + s.recency * 0.3,
        }))
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        return scored.slice(0, limit).map((s) => s.entry);
      }
    }

    // Fall back to recency
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Build a context window for the model.
 * Last 5 messages in full, older messages summarized.
 */
export function buildContextWindow(messages: MemoryEntry[], maxChars: number = 2000): string {
  if (messages.length === 0) return "";

  const parts: string[] = [];
  let totalChars = 0;

  const recent = messages.slice(0, 5);
  for (const m of recent) {
    const text = m.content.slice(0, 300);
    if (totalChars + text.length > maxChars) break;
    parts.push(`${m.role}: ${text}`);
    totalChars += text.length;
  }

  const older = messages.slice(5, 15);
  for (const m of older) {
    const summary = m.content.slice(0, 80);
    if (totalChars + summary.length > maxChars) break;
    parts.push(`[earlier] ${m.role}: ${summary}...`);
    totalChars += summary.length;
  }

  return parts.join("\n");
}

/**
 * Get conversation statistics.
 */
export async function getConversationStats(): Promise<{
  totalMessages: number;
  messagesWithEmbeddings: number;
}> {
  try {
    const total = await db.message.count();
    const messages = await db.message.findMany({ take: 100, orderBy: { createdAt: "desc" } });
    let withEmbeddings = 0;
    for (const m of messages) {
      try {
        const meta = JSON.parse(m.metadata || "{}");
        if (meta.hasEmbedding) withEmbeddings++;
      } catch {}
    }
    return { totalMessages: total, messagesWithEmbeddings: withEmbeddings };
  } catch {
    return { totalMessages: 0, messagesWithEmbeddings: 0 };
  }
}
