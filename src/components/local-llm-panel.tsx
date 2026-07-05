"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Cpu,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Brain,
  Send,
  StopCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getLocalLLM,
  AVAILABLE_MODELS,
  checkWebGPUSupport,
  type ModelId,
  type ModelInfo,
  type LoadProgress,
} from "@/lib/ai/local-llm";

interface LocalLLMPanelProps {
  onModelReady?: (modelId: ModelId) => void;
  onModelUnloaded?: () => void;
}

export function LocalLLMPanel({ onModelReady, onModelUnloaded }: LocalLLMPanelProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportReason, setSupportReason] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<ModelId>(
    "Llama-3.2-1B-Instruct-q4f32_1-MLC"
  );
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [loaded, setLoaded] = useState<ModelId | null>(null);
  const [testInput, setTestInput] = useState("What is 2+2 and why?");
  const [testOutput, setTestOutput] = useState("");
  const [testStreaming, setTestStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Check WebGPU support on mount
  useEffect(() => {
    checkWebGPUSupport().then(({ supported, reason }) => {
      setSupported(supported);
      if (reason) setSupportReason(reason);
    });
    // Check if engine already has a model
    const eng = getLocalLLM();
    if (eng.isReady()) {
      setLoaded(eng.getModel());
    }
    eng.onProgress((p) => setLoadProgress(p));
  }, []);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadProgress({ progress: 0, text: "Starting..." });
    try {
      const eng = getLocalLLM();
      eng.onProgress((p) => setLoadProgress(p));
      await eng.load(selectedModel);
      setLoaded(selectedModel);
      onModelReady?.(selectedModel);
      toast.success(`Model loaded: ${selectedModel}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to load model");
      toast.error(`Load failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedModel, onModelReady]);

  const handleUnload = useCallback(async () => {
    try {
      await getLocalLLM().unload();
      setLoaded(null);
      setLoadProgress(null);
      onModelUnloaded?.();
      toast.info("Model unloaded, VRAM freed");
    } catch (e: any) {
      toast.error(`Unload failed: ${e.message}`);
    }
  }, [onModelUnloaded]);

  const handleTest = useCallback(async () => {
    if (!loaded) {
      toast.error("Load a model first");
      return;
    }
    setTestStreaming(true);
    setTestOutput("");
    abortRef.current = new AbortController();
    try {
      const eng = getLocalLLM();
      await eng.generate({
        systemPrompt:
          "You are a helpful assistant. Be concise but thorough. Show your reasoning.",
        messages: [{ role: "user", content: testInput }],
        maxTokens: 512,
        temperature: 0.7,
        signal: abortRef.current.signal,
        onToken: (t) => setTestOutput((prev) => prev + t),
      });
    } catch (e: any) {
      setTestOutput((prev) => prev + `\n\n[Error: ${e.message}]`);
    } finally {
      setTestStreaming(false);
    }
  }, [loaded, testInput]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    getLocalLLM().interrupt();
    setTestStreaming(false);
  }, []);

  if (supported === null) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm p-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking WebGPU support...
      </div>
    );
  }

  if (!supported) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-semibold text-zinc-100">
              WebGPU not available in this browser
            </h3>
            <p className="text-sm text-zinc-400">{supportReason}</p>
            <p className="text-xs text-zinc-500">
              The Local LLM tab requires WebGPU to run models in-browser. The
              from-scratch AI (Chat tab) still works without WebGPU.
            </p>
            <p className="text-xs text-zinc-500">
              Recommended browsers: Chrome 113+, Edge 113+, Brave, Arc. Safari
              17+ on macOS 13+. Firefox needs <code>dom.webgpu.enabled</code>.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900/50 border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-400" />
              Local LLM (WebLLM)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Real open-source LLM running in your browser via WebGPU. No
              external APIs. You own the model.
            </p>
          </div>
          {loaded ? (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
            </Badge>
          ) : (
            <Badge variant="outline" className="text-zinc-400">
              Not loaded
            </Badge>
          )}
        </div>

        {/* Model picker */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-500 uppercase tracking-wide">
            Choose a model (all Apache 2.0 / permissive)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AVAILABLE_MODELS.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                selected={selectedModel === m.id}
                loaded={loaded === m.id}
                disabled={loading}
                onSelect={() => setSelectedModel(m.id)}
              />
            ))}
          </div>
        </div>

        {/* Load progress */}
        {loading && loadProgress && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">{loadProgress.text}</span>
              <span className="text-zinc-500">
                {Math.round((loadProgress.progress ?? 0) * 100)}%
              </span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all"
                style={{ width: `${(loadProgress.progress ?? 0) * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-2">
            {error}
          </div>
        )}

        {/* Load / Unload buttons */}
        <div className="mt-4 flex gap-2">
          {!loaded ? (
            <Button
              onClick={handleLoad}
              disabled={loading}
              className="bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1.5" />
              )}
              {loading ? "Loading..." : "Load Model"}
            </Button>
          ) : (
            <Button
              onClick={handleUnload}
              variant="outline"
              className="border-zinc-700 text-zinc-300"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Unload (free VRAM)
            </Button>
          )}
        </div>
      </Card>

      {/* Test prompt */}
      {loaded && (
        <Card className="bg-zinc-900/50 border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Brain className="w-4 h-4 text-emerald-400" />
              Test the model
            </h4>
            <Badge variant="outline" className="text-xs text-zinc-400">
              {loaded.replace("-q4f16_1-MLC", "").replace("-q4f32_1-MLC", "")}
            </Badge>
          </div>
          <Textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Ask the model anything..."
            rows={2}
            className="bg-zinc-950 border-zinc-800 text-sm mb-2"
          />
          <div className="flex gap-2 mb-2">
            <Button
              size="sm"
              onClick={handleTest}
              disabled={testStreaming}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {testStreaming ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Send className="w-3 h-3 mr-1" />
              )}
              Generate
            </Button>
            {testStreaming && (
              <Button
                size="sm"
                onClick={handleStop}
                variant="outline"
                className="border-rose-500/40 text-rose-400"
              >
                <StopCircle className="w-3 h-3 mr-1" />
                Stop
              </Button>
            )}
          </div>
          {testOutput && (
            <ScrollArea className="h-64 w-full rounded border border-zinc-800 bg-zinc-950 p-3">
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">
                {testOutput}
              </pre>
            </ScrollArea>
          )}
        </Card>
      )}

      {/* Info */}
      <Card className="bg-zinc-900/30 border-zinc-800/50 p-4">
        <div className="text-xs text-zinc-500 space-y-1.5">
          <p className="font-semibold text-zinc-400">How this works</p>
          <p>
            • The model downloads once from MLC&apos;s CDN (Apache 2.0) and is
            cached by your browser. Subsequent loads take ~3 seconds.
          </p>
          <p>
            • All inference happens on your GPU via WebGPU. No data leaves your
            device — the model never sends your prompts anywhere.
          </p>
          <p>
            • To use this in Chat: open the Chat tab, toggle{" "}
            <Badge variant="outline" className="text-xs">
              Local LLM
            </Badge>{" "}
            mode, then ask anything. Responses are grounded with web search
            results to prevent hallucination.
          </p>
          <p>
            • To fine-tune this model with your own data: collect corrections in
            the Train tab, export as JSONL, follow FINE-TUNING-GUIDE.md.
          </p>
        </div>
      </Card>
    </div>
  );
}

function ModelCard({
  model,
  selected,
  loaded,
  disabled,
  onSelect,
}: {
  model: ModelInfo;
  selected: boolean;
  loaded: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`text-left p-3 rounded-lg border transition-all ${
        selected
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-700"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-zinc-100">{model.label}</span>
        {loaded ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : model.recommended ? (
          <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30 px-1 py-0">
            ★
          </Badge>
        ) : null}
      </div>
      <div className="text-xs text-zinc-500 mt-1 flex gap-2 flex-wrap">
        <span>{model.size}</span>
        <span>•</span>
        <span className="capitalize">{model.speed}</span>
        <span>•</span>
        <span className="capitalize">{model.smart}</span>
      </div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{model.license}</div>
    </button>
  );
}
