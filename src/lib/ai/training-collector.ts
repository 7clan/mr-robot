/**
 * Training Data Collector
 *
 * Collects user feedback on AI responses and stores it for:
 *   1. JSONL export → external LoRA fine-tuning (Hugging Face, axolotl, etc.)
 *   2. In-browser preference learning (Naive Bayes over good vs. bad responses)
 *
 * This is the "train it" part of the user's request. Full training of a
 * multi-billion-parameter LLM in the browser is impractical, so we do:
 *   - Real LLM inference: WebLLM (already implemented)
 *   - Data collection: this module (here)
 *   - External fine-tune: see FINE-TUNING-GUIDE.md (we generate the dataset)
 *   - Re-import: user uploads fine-tuned GGUF, we register it in DB
 */

import { db as prisma } from "@/lib/db";

export interface TrainingExampleInput {
  prompt: string;
  response: string;
  rating: -1 | 0 | 1;
  correction?: string;
  intent?: string;
  sources?: string[]; // URLs cited
  modelName?: string;
}

export interface TrainingExample {
  id: string;
  prompt: string;
  response: string;
  rating: number;
  correction: string | null;
  intent: string | null;
  sources: string | null;
  modelName: string | null;
  createdAt: Date;
}

export async function recordExample(
  input: TrainingExampleInput
): Promise<TrainingExample> {
  return (await prisma.trainingExample.create({
    data: {
      prompt: input.prompt,
      response: input.response,
      rating: input.rating,
      correction: input.correction ?? null,
      intent: input.intent ?? null,
      sources: input.sources ? JSON.stringify(input.sources) : null,
      modelName: input.modelName ?? null,
    },
  })) as TrainingExample;
}

export async function listExamples(limit = 100): Promise<TrainingExample[]> {
  return (await prisma.trainingExample.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  })) as TrainingExample[];
}

export async function deleteExample(id: string): Promise<void> {
  await prisma.trainingExample.delete({ where: { id } });
}

export async function getStats(): Promise<{
  total: number;
  good: number;
  bad: number;
  neutral: number;
  corrected: number;
}> {
  const [total, good, bad, neutral, corrected] = await Promise.all([
    prisma.trainingExample.count(),
    prisma.trainingExample.count({ where: { rating: 1 } }),
    prisma.trainingExample.count({ where: { rating: -1 } }),
    prisma.trainingExample.count({ where: { rating: 0 } }),
    prisma.trainingExample.count({ where: { NOT: { correction: null } } }),
  ]);
  return { total, good, bad, neutral, corrected };
}

/**
 * Export all training examples as JSONL — the standard format for
 * Hugging Face datasets and LoRA fine-tuning scripts.
 *
 * Each line is a JSON object with:
 *   - instruction: the user prompt
 *   - input: "" (empty, since instruction is the prompt)
 *   - output: the (possibly corrected) response
 *   - metadata: rating, sources, model, timestamp
 *
 * For fine-tuning:
 *   - Use only rating >= 0 examples (skip the bad ones)
 *   - If correction exists, use correction as output instead of response
 */
export function exportJSONL(examples: TrainingExample[]): string {
  const lines = examples
    .filter((e) => e.rating >= 0) // skip bad responses
    .map((e) => {
      const output = e.correction?.trim() || e.response;
      const sources = e.sources ? JSON.parse(e.sources) : [];
      return JSON.stringify({
        instruction: e.prompt,
        input: "",
        output,
        metadata: {
          rating: e.rating,
          sources,
          model: e.modelName,
          timestamp: e.createdAt.toISOString(),
        },
      });
    });
  return lines.join("\n");
}

/**
 * Export as Alpaca format (alternative JSONL layout some fine-tuners prefer).
 */
export function exportAlpaca(examples: TrainingExample[]): string {
  const lines = examples
    .filter((e) => e.rating >= 0)
    .map((e) => {
      const output = e.correction?.trim() || e.response;
      return JSON.stringify({
        prompt: `<|im_start|>user\n${e.prompt}<|im_end|>\n<|im_start|>assistant\n${output}<|im_end|>`,
        completion: "",
        meta: {
          rating: e.rating,
          model: e.modelName,
          timestamp: e.createdAt.toISOString(),
        },
      });
    });
  return lines.join("\n");
}

/**
 * Export as ShareGPT format (used by axolotl, llama-factory).
 */
export function exportShareGPT(examples: TrainingExample[]): string {
  const lines = examples
    .filter((e) => e.rating >= 0)
    .map((e) => {
      const output = e.correction?.trim() || e.response;
      return JSON.stringify({
        conversations: [
          { from: "human", value: e.prompt },
          { from: "gpt", value: output },
        ],
        metadata: {
          rating: e.rating,
          model: e.modelName,
          timestamp: e.createdAt.toISOString(),
        },
      });
    });
  return lines.join("\n");
}

/**
 * Build a "preference pairs" dataset for DPO (Direct Preference Optimization).
 * Pairs a good response with a bad response on the same prompt.
 * Returns JSONL of {"prompt", "chosen", "rejected"} triples.
 */
export function exportDPOPairs(examples: TrainingExample[]): string {
  // Group by prompt (exact match)
  const byPrompt = new Map<string, { good?: string; bad?: string }>();
  for (const e of examples) {
    const key = e.prompt.trim().toLowerCase();
    if (!byPrompt.has(key)) byPrompt.set(key, {});
    const entry = byPrompt.get(key)!;
    if (e.rating === 1 && !entry.good) entry.good = e.response;
    if (e.rating === -1 && !entry.bad) entry.bad = e.correction ?? e.response;
  }
  const pairs: string[] = [];
  for (const [, entry] of byPrompt) {
    if (entry.good && entry.bad && entry.good !== entry.bad) {
      pairs.push(
        JSON.stringify({
          prompt: "",
          chosen: entry.good,
          rejected: entry.bad,
        })
      );
    }
  }
  return pairs.join("\n");
}

// ============================================================
// LoRA Adapter registry — for externally fine-tuned models
// ============================================================

export interface LoRAAdapterRecord {
  id: string;
  name: string;
  baseModel: string;
  path: string;
  description: string | null;
  active: boolean;
  createdAt: Date;
}

export async function registerLoRAAdapter(input: {
  name: string;
  baseModel: string;
  path: string;
  description?: string;
}): Promise<LoRAAdapterRecord> {
  // Deactivate others of same base model
  await prisma.lORAAdapter.updateMany({
    where: { baseModel: input.baseModel, active: true },
    data: { active: false },
  });
  return (await prisma.lORAAdapter.create({
    data: { ...input, active: true },
  })) as LoRAAdapterRecord;
}

export async function listLoRAAdapters(): Promise<LoRAAdapterRecord[]> {
  return (await prisma.lORAAdapter.findMany({
    orderBy: { createdAt: "desc" },
  })) as LoRAAdapterRecord[];
}

export async function setActiveLoRA(id: string): Promise<void> {
  const adapter = await prisma.lORAAdapter.findUnique({ where: { id } });
  if (!adapter) throw new Error("LoRA adapter not found");
  await prisma.lORAAdapter.updateMany({
    where: { baseModel: adapter.baseModel, active: true },
    data: { active: false },
  });
  await prisma.lORAAdapter.update({ where: { id }, data: { active: true } });
}

export async function deleteLoRAAdapter(id: string): Promise<void> {
  await prisma.lORAAdapter.delete({ where: { id } });
}
