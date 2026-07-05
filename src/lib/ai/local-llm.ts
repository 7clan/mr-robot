/**
 * Local LLM — Real open-source LLM running in the browser via WebLLM
 *
 * This is the "real brain" of Alazantrik. It uses @mlc-ai/web-llm (Apache 2.0)
 * to run actual LLM models (Llama-3.2-1B, Qwen2.5-0.5B, Phi-3.5-mini, Gemma-2-2B)
 * entirely client-side using WebGPU.
 *
 * CRITICAL: This module is browser-only. It must never be imported from a
 * server component. The /api/ai/local-chat route returns a special page that
 * loads this module client-side; the actual generation happens in the browser.
 *
 * Models (all Apache 2.0 / permissive licenses):
 *   - Llama-3.2-1B-Instruct-q4f32_1-MLC    (~1GB download, fast, smart)
 *   - Llama-3.2-3B-Instruct-q4f32_1-MLC    (~2.5GB, smarter, slower)
 *   - Qwen2.5-0.5B-Instruct-q4f16_1-MLC    (~400MB, very fast, smaller)
 *   - Qwen2.5-1.5B-Instruct-q4f16_1-MLC    (~1GB, good balance)
 *   - Phi-3.5-mini-instruct-q4f16_1-MLC    (~2.5GB, very smart)
 *   - SmolLM2-1.7B-Instruct-q4f16_1-MLC    (~1GB, fast)
 *   - TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC (~700MB, tiny)
 *
 * License compliance:
 *   - Llama 3.2: Apache 2.0 (Meta)
 *   - Qwen 2.5: Apache 2.0 (Alibaba)
 *   - Phi 3.5: MIT (Microsoft)
 *   - SmolLM2: Apache 2.0 (HuggingFace)
 *   - TinyLlama: Apache 2.0
 *   All permit commercial use and redistribution. The user can build
 *   their own ToS on top — see terms-of-service.ts.
 */

import type { InitProgressReport, ChatCompletionMessageParam } from "@mlc-ai/web-llm";

export type ModelId =
  | "Llama-3.2-1B-Instruct-q4f32_1-MLC"
  | "Llama-3.2-3B-Instruct-q4f32_1-MLC"
  | "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
  | "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
  | "Phi-3.5-mini-instruct-q4f16_1-MLC"
  | "SmolLM2-1.7B-Instruct-q4f16_1-MLC"
  | "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC"
  | "gemma-2-2b-it-q4f16_1-MLC";

export interface ModelInfo {
  id: ModelId;
  label: string;
  size: string;
  speed: "fast" | "medium" | "slow";
  smart: "basic" | "good" | "excellent";
  license: string;
  recommended?: boolean;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 0.5B",
    size: "~400 MB",
    speed: "fast",
    smart: "basic",
    license: "Apache 2.0",
  },
  {
    id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
    label: "TinyLlama 1.1B",
    size: "~700 MB",
    speed: "fast",
    smart: "basic",
    license: "Apache 2.0",
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "Llama 3.2 1B",
    size: "~1.1 GB",
    speed: "fast",
    smart: "good",
    license: "Apache 2.0",
    recommended: true,
  },
  {
    id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
    label: "SmolLM2 1.7B",
    size: "~1 GB",
    speed: "medium",
    smart: "good",
    license: "Apache 2.0",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B",
    size: "~1 GB",
    speed: "medium",
    smart: "good",
    license: "Apache 2.0",
    recommended: true,
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
    label: "Llama 3.2 3B",
    size: "~2.5 GB",
    speed: "slow",
    smart: "excellent",
    license: "Apache 2.0",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5 mini",
    size: "~2.5 GB",
    speed: "slow",
    smart: "excellent",
    license: "MIT",
  },
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    label: "Gemma 2 2B",
    size: "~1.5 GB",
    speed: "medium",
    smart: "good",
    license: "Gemma (permissive)",
  },
];

export interface LoadProgress {
  progress: number; // 0..1
  text: string;
  timeElapsed?: number;
}

export interface GenerateOptions {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  finishReason: string;
}

/**
 * Browser-side LLM engine. Holds the WebLLM engine instance.
 * Use `getLocalLLM()` to get the singleton.
 */
class LocalLLMEngine {
  private engine: any = null;
  private currentModel: ModelId | null = null;
  private loading: Promise<void> | null = null;
  private onLoadProgress: ((p: LoadProgress) => void) | null = null;

  /** True if WebGPU is available in this browser. */
  static async isWebGPUAvailable(): Promise<boolean> {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  }

  /** Subscribe to load progress events. */
  onProgress(cb: ((p: LoadProgress) => void) | null) {
    this.onLoadProgress = cb;
  }

  /** Load a model. Resolves when ready. Subsequent calls switch models. */
  async load(modelId: ModelId): Promise<void> {
    if (this.currentModel === modelId && this.engine) return;
    if (this.loading) await this.loading;

    const available = await LocalLLMEngine.isWebGPUAvailable();
    if (!available) {
      throw new Error(
        "WebGPU is not available in this browser. Please use Chrome 113+, Edge 113+, or another browser with WebGPU enabled."
      );
    }

    // Dynamically import so this module is safe to import in any context.
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");

    this.loading = (async () => {
      try {
        if (this.engine) {
          this.engine.unload();
          this.engine = null;
          this.currentModel = null;
        }

        this.engine = await CreateMLCEngine(modelId, {
          initProgressCallback: (report: InitProgressReport) => {
            if (this.onLoadProgress) {
              this.onLoadProgress({
                progress: report.progress,
                text: report.text,
                timeElapsed: report.timeElapsed,
              });
            }
          },
        });
        this.currentModel = modelId;
      } finally {
        this.loading = null;
      }
    })();

    return this.loading;
  }

  /** True if a model is loaded and ready. */
  isReady(): boolean {
    return !!this.engine && !!this.currentModel;
  }

  /** Currently loaded model, or null. */
  getModel(): ModelId | null {
    return this.currentModel;
  }

  /** Generate a completion with streaming. */
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    if (!this.engine || !this.currentModel) {
      throw new Error("No model loaded. Call load() first.");
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: opts.systemPrompt },
      ...opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as ChatCompletionMessageParam[],
    ];

    const chunks: any[] = [];
    let fullText = "";
    let usage = { prompt_tokens: 0, completion_tokens: 0 };
    let finishReason = "stop";

    const stream = await this.engine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      top_p: opts.topP ?? 0.9,
    });

    for await (const chunk of stream) {
      if (opts.signal?.aborted) {
        await this.engine.interruptGenerate();
        finishReason = "abort";
        break;
      }
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        opts.onToken?.(delta);
      }
      if (chunk.choices?.[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
      if (chunk.usage) {
        usage = chunk.usage as any;
      }
      chunks.push(chunk);
    }

    return {
      text: fullText,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
      },
      finishReason,
    };
  }

  /** Interrupt current generation. */
  async interrupt(): Promise<void> {
    if (this.engine) {
      await this.engine.interruptGenerate();
    }
  }

  /** Unload model, free VRAM. */
  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
      this.currentModel = null;
    }
  }

  /** Get VRAM/GPU stats. */
  async getStats(): Promise<{ vramUsed?: string; gpuVendor?: string }> {
    if (!this.engine) return {};
    try {
      // web-llm exposes this; wrap in try/catch since it varies by version
      const stats = await (this.engine as any).runtimeStats?.();
      return stats ?? {};
    } catch {
      return {};
    }
  }
}

// Singleton — only one model loaded at a time (VRAM constraint)
let engineInstance: LocalLLMEngine | null = null;

export function getLocalLLM(): LocalLLMEngine {
  if (!engineInstance) {
    engineInstance = new LocalLLMEngine();
  }
  return engineInstance;
}

/**
 * Check WebGPU support without instantiating the engine.
 * Use this on the client to decide whether to show the Local LLM tab.
 */
export async function checkWebGPUSupport(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  if (typeof window === "undefined") {
    return { supported: false, reason: "Server-side render" };
  }
  if (!("gpu" in navigator)) {
    return {
      supported: false,
      reason:
        "WebGPU not available. Use Chrome 113+, Edge 113+, Brave, or Arc. Firefox needs dom.webgpu.enabled. Safari 17+ on macOS 13+.",
    };
  }
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, reason: "No GPU adapter found." };
    }
    return { supported: true };
  } catch (e: any) {
    return { supported: false, reason: e.message ?? "Unknown GPU error" };
  }
}
