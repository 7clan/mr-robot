/**
 * Knowledge Base - Built from scratch
 * Stores facts in subject-predicate-object triples + a semantic similarity index.
 * All persistence via Prisma (SQLite). No external APIs.
 */

import { db } from "@/lib/db";
import { tokenize, removeStopWords } from "./tokenizer";
import { stem } from "./stemmer";

export interface Fact {
  subject: string;
  predicate: string;
  object: string;
  source?: string;
  weight?: number;
}

export interface MemoryEntry {
  id: string;
  role: string;
  content: string;
  intent?: string;
  createdAt: Date;
}

/**
 * Extract subject-predicate-object from natural language.
 * Very simple pattern-based extractor - we expand it heuristically.
 *
 * Examples:
 *   "Paris is the capital of France"  -> (paris, capital-of, france)
 *   "Cats are mammals"                -> (cats, are, mammals)
 *   "Water boils at 100 degrees"      -> (water, boils-at, 100 degrees)
 */
export function extractFact(text: string): Fact | null {
  const t = text.trim();
  // Pattern 1: "X is/are the Y of Z"
  let m = t.match(/^(.+?)\s+(?:is|are)\s+(?:the\s+)?([\w\s-]+?)\s+of\s+(.+)$/i);
  if (m) {
    return {
      subject: m[1].trim().toLowerCase(),
      predicate: m[2].trim().toLowerCase().replace(/\s+/g, "-"),
      object: m[3].trim().toLowerCase(),
    };
  }
  // Pattern 2: "X is/are Y"
  m = t.match(/^(.+?)\s+(?:is|are|was|were)\s+(.+)$/i);
  if (m) {
    return {
      subject: m[1].trim().toLowerCase(),
      predicate: "is",
      object: m[2].trim().toLowerCase(),
    };
  }
  // Pattern 3: "X has/have Y"
  m = t.match(/^(.+?)\s+(?:has|have|had)\s+(.+)$/i);
  if (m) {
    return {
      subject: m[1].trim().toLowerCase(),
      predicate: "has",
      object: m[2].trim().toLowerCase(),
    };
  }
  // Pattern 4: "X can Y" / "X verb Y"
  m = t.match(/^(.+?)\s+can\s+(.+)$/i);
  if (m) {
    return {
      subject: m[1].trim().toLowerCase(),
      predicate: "can",
      object: m[2].trim().toLowerCase(),
    };
  }
  // Pattern 5: "remember that X" / "note that X"
  m = t.match(/^(?:remember that|note that|save this:?)\s+(.+)$/i);
  if (m) {
    // Store as a general note
    const inner = m[1];
    const innerFact = extractFact(inner);
    if (innerFact) return innerFact;
    return {
      subject: "note",
      predicate: "is",
      object: inner.toLowerCase(),
    };
  }
  return null;
}

export async function storeFact(fact: Fact): Promise<void> {
  const existing = await db.fact.findFirst({
    where: {
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
    },
  });
  if (existing) {
    // Increase weight
    await db.fact.update({
      where: { id: existing.id },
      data: { weight: (existing.weight || 1) + 0.5, updatedAt: new Date() },
    });
    return;
  }
  await db.fact.create({
    data: {
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      source: fact.source || "user",
      weight: fact.weight || 1.0,
    },
  });
}

export async function recallAbout(subject: string): Promise<Fact[]> {
  const results = await db.fact.findMany({
    where: {
      OR: [
        { subject: { contains: subject.toLowerCase() } },
        { object: { contains: subject.toLowerCase() } },
      ],
    },
    orderBy: { weight: "desc" },
    take: 20,
  });
  return results.map((r) => ({
    subject: r.subject,
    predicate: r.predicate,
    object: r.object,
    source: r.source,
    weight: r.weight,
  }));
}

export async function searchKnowledge(query: string): Promise<Fact[]> {
  const tokens = removeStopWords(tokenize(query)).map(stem);
  if (tokens.length === 0) return [];

  // Build OR query for any token in subject or object
  const conditions = tokens.flatMap((t) => [
    { subject: { contains: t } },
    { object: { contains: t } },
  ]);
  const results = await db.fact.findMany({
    where: { OR: conditions },
    orderBy: { weight: "desc" },
    take: 30,
  });
  return results.map((r) => ({
    subject: r.subject,
    predicate: r.predicate,
    object: r.object,
    source: r.source,
    weight: r.weight,
  }));
}

export async function getAllFacts(): Promise<Fact[]> {
  const results = await db.fact.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return results.map((r) => ({
    subject: r.subject,
    predicate: r.predicate,
    object: r.object,
    source: r.source,
    weight: r.weight,
  }));
}

export async function factToText(fact: Fact): Promise<string> {
  if (fact.predicate === "is") {
    return `${cap(fact.subject)} is ${fact.object}.`;
  }
  if (fact.predicate === "has") {
    return `${cap(fact.subject)} has ${fact.object}.`;
  }
  if (fact.predicate === "can") {
    return `${cap(fact.subject)} can ${fact.object}.`;
  }
  // Predicates ending in "-of" indicate a "X is the Y of Z" relationship
  // e.g. subject="paris", predicate="capital", object="france" -> "Paris is the capital of France."
  if (fact.predicate && !["is", "has", "can"].includes(fact.predicate)) {
    const pred = fact.predicate.replace(/-/g, " ");
    return `${cap(fact.subject)} is the ${pred} of ${fact.object}.`;
  }
  // Generic
  return `${cap(fact.subject)} ${fact.predicate.replace(/-/g, " ")} ${fact.object}.`;
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Conversation memory
export async function saveMessage(
  role: string,
  content: string,
  intent?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.message.create({
    data: {
      role,
      content,
      intent,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function getRecentMessages(limit = 10): Promise<MemoryEntry[]> {
  const msgs = await db.message.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return msgs.reverse().map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    intent: m.intent || undefined,
    createdAt: m.createdAt,
  }));
}

export async function clearMessages(): Promise<void> {
  await db.message.deleteMany({});
}

export async function clearFacts(): Promise<void> {
  await db.fact.deleteMany({});
}

// Bag-of-words similarity (cosine)
export function similarity(a: string, b: string): number {
  const ta = new Map<string, number>();
  for (const t of tokenize(a)) {
    ta.set(t, (ta.get(t) || 0) + 1);
  }
  const tb = new Map<string, number>();
  for (const t of tokenize(b)) {
    tb.set(t, (tb.get(t) || 0) + 1);
  }
  let dot = 0;
  for (const [k, v] of ta) {
    if (tb.has(k)) dot += v * (tb.get(k) || 0);
  }
  const magA = Math.sqrt([...ta.values()].reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt([...tb.values()].reduce((s, v) => s + v * v, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}
