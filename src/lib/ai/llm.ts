/**
 * LLM Integration Layer — Built from scratch
 *
 * Connects to Ollama (local LLM) for real language generation.
 * Falls back to the rule-based brain if Ollama is not installed.
 *
 * Supported models (user installs via Ollama):
 *   - llama3.2 (3B params, ~2GB, runs on 4GB RAM)
 *   - phi3:mini (3.8B params, ~2.5GB, runs on 4GB RAM)
 *   - qwen2.5:3b (3B params, ~2GB, good at coding)
 *   - mistral:7b (7B params, ~4.5GB, needs 8GB RAM)
 *
 * Ollama runs at http://localhost:11434 by default.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  tokensGenerated: number;
  durationMs: number;
  fromCache: boolean;
}

export interface LLMStreamChunk {
  text: string;
  done: boolean;
}

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// Cache for Ollama availability check
let ollamaAvailable: boolean | null = null;
let ollamaAvailableChecked = 0;
let availableModels: string[] = [];

/**
 * Check if Ollama is running and available.
 * Caches the result for 30 seconds.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  // Check cache (30 second TTL)
  if (ollamaAvailable !== null && Date.now() - ollamaAvailableChecked < 30000) {
    return ollamaAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      availableModels = (data.models || []).map((m: { name: string }) => m.name);
      ollamaAvailable = availableModels.length > 0;
    } else {
      ollamaAvailable = false;
      availableModels = [];
    }
  } catch {
    ollamaAvailable = false;
    availableModels = [];
  }

  ollamaAvailableChecked = Date.now();
  return ollamaAvailable;
}

/**
 * Get the list of available Ollama models.
 */
export async function getAvailableModels(): Promise<string[]> {
  await isOllamaAvailable();
  return availableModels;
}

/**
 * Get the best available model for the task.
 * Prefers smaller models for speed, larger for coding.
 */
export async function getBestModel(task: "chat" | "code" | "reasoning" = "chat"): Promise<string> {
  await isOllamaAvailable();
  if (availableModels.length === 0) return DEFAULT_MODEL;

  // Preference order by task
  const preferences: Record<string, string[]> = {
    code: ["qwen2.5-coder:7b", "qwen2.5:3b", "codellama:7b", "deepseek-coder:6.7b", "llama3.2", "phi3:mini", "mistral:7b"],
    reasoning: ["mistral:7b", "llama3.2", "phi3:mini", "qwen2.5:3b"],
    chat: ["llama3.2", "phi3:mini", "qwen2.5:3b", "mistral:7b", "gemma2:2b"],
  };

  const preferred = preferences[task] || preferences.chat;
  for (const model of preferred) {
    // Check exact match or prefix match (e.g., "llama3.2:latest")
    if (availableModels.includes(model)) return model;
    const prefixMatch = availableModels.find((m) => m.startsWith(model.split(":")[0]));
    if (prefixMatch) return prefixMatch;
  }

  // Fall back to first available
  return availableModels[0];
}

/**
 * Generate a response using the local LLM.
 * Non-streaming — waits for the full response.
 */
export async function generate(
  messages: LLMMessage[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  } = {}
): Promise<LLMResponse> {
  const start = Date.now();
  const model = options.model || (await getBestModel("chat"));

  // Prepend system prompt if provided
  const fullMessages = options.systemPrompt
    ? [{ role: "system" as const, content: options.systemPrompt }, ...messages]
    : messages;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 1000,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}`);
    }

    const data = await res.json();
    const text = data.message?.content || "";

    return {
      text,
      model,
      tokensGenerated: data.eval_count || 0,
      durationMs: Date.now() - start,
      fromCache: false,
    };
  } catch (e) {
    throw new Error(`LLM generation failed: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

/**
 * Generate a response with streaming (token-by-token).
 * Calls the callback for each chunk.
 */
export async function generateStream(
  messages: LLMMessage[],
  onChunk: (chunk: LLMStreamChunk) => void,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  } = {}
): Promise<LLMResponse> {
  const start = Date.now();
  const model = options.model || (await getBestModel("chat"));

  const fullMessages = options.systemPrompt
    ? [{ role: "system" as const, content: options.systemPrompt }, ...messages]
    : messages;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 1000,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";
    let tokensGenerated = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Ollama sends newline-delimited JSON
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullText += data.message.content;
            tokensGenerated++;
            onChunk({ text: data.message.content, done: false });
          }
          if (data.done) {
            onChunk({ text: "", done: true });
          }
        } catch {
          // Ignore parse errors on partial JSON
        }
      }
    }

    return {
      text: fullText,
      model,
      tokensGenerated,
      durationMs: Date.now() - start,
      fromCache: false,
    };
  } catch (e) {
    throw new Error(`LLM streaming failed: ${e instanceof Error ? e.message : "unknown"}`);
  }
}

/**
 * Generate embeddings for text using Ollama.
 * Used for semantic search and conversation memory.
 */
export async function generateEmbeddings(
  text: string,
  model: string = "nomic-embed-text"
): Promise<number[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!res.ok) throw new Error(`Ollama embeddings returned ${res.status}`);

    const data = await res.json();
    return data.embedding || [];
  } catch {
    return [];
  }
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Get the status of the LLM integration.
 */
export async function getLLMStatus(): Promise<{
  available: boolean;
  models: string[];
  url: string;
  defaultModel: string;
}> {
  const available = await isOllamaAvailable();
  const models = await getAvailableModels();
  return {
    available,
    models,
    url: OLLAMA_URL,
    defaultModel: DEFAULT_MODEL,
  };
}
