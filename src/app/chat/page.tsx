"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Brain,
  Search,
  Download,
  Trash2,
  Sparkles,
  Cpu,
  Globe,
  Database,
  Network,
  Loader2,
  Activity,
  BookOpen,
  Github,
  ChevronDown,
  Terminal as TerminalIcon,
  Code,
  AlertTriangle,
  GitBranch,
  Play,
  Replace,
  Stethoscope,
  X,
  Smartphone,
  Sparkle,
  GraduationCap,
  ScrollText,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Zap,
  ZapOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useVoice } from "@/hooks/use-voice";
import { toast } from "sonner";
import { CodeStudio, Terminal, MistakesLog, GitPanel, DevServerPanel, RenamePanel, SkillsPanel } from "@/components/code-studio";
import { LocalLLMPanel } from "@/components/local-llm-panel";
import { TrainingPanel } from "@/components/training-panel";
import { TosPanel } from "@/components/tos-panel";
import { getLocalLLM, type ModelId } from "@/lib/ai/local-llm";

type Role = "user" | "assistant" | "system";
interface Message {
  id: string;
  role: Role;
  content: string;
  intent?: string;
  confidence?: number;
  steps?: Array<{ action: string; description: string; result: string; success: boolean }>;
  webResults?: Array<{ title: string; url: string; snippet: string; source: string }>;
  facts?: Array<{ subject: string; predicate: string; object: string }>;
  codeResult?: {
    files: Array<{ op: string; path: string; content?: string }>;
    explanation: string;
    framework: string;
    language: string;
    nextSteps: string[];
    applied: number;
    warnings?: string[];
  };
  terminalResult?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    command: string;
    durationMs: number;
    autoFix?: {
      applied: boolean;
      fixCommand?: string;
      fixDescription?: string;
      pattern?: string;
      learnedFrom?: string;
    };
  };
  timestamp: number;
}

interface Fact {
  subject: string;
  predicate: string;
  object: string;
  source?: string;
  weight?: number;
}

interface MemoryItem {
  id: string;
  role: string;
  content: string;
  intent?: string;
  createdAt: string;
}

const SUGGESTIONS = [
  { label: "Hello", text: "hello" },
  { label: "Who are you?", text: "who are you" },
  { label: "Search the web", text: "search for quantum computing" },
  { label: "Remember a fact", text: "remember that Paris is the capital of France" },
  { label: "Recall facts", text: "what do you know about Paris" },
  { label: "Do some math", text: "calculate 5 * 3 + 2" },
  { label: "Help", text: "help" },
];

const CODE_SUGGESTIONS = [
  { label: "React app", text: "scaffold a react project called my-app" },
  { label: "Next.js app", text: "scaffold a nextjs project called my-site" },
  { label: "Vue app", text: "scaffold a vue project called vue-app" },
  { label: "Angular app", text: "scaffold an angular project called ng-app" },
  { label: "Express API", text: "scaffold an express project called api-server" },
  { label: "Flask app", text: "scaffold a flask project called web-app" },
  { label: "FastAPI", text: "scaffold a fastapi project called api" },
  { label: "Django", text: "scaffold a django project called webapp" },
  { label: "Odoo module", text: "scaffold an odoo project called custom_module" },
  { label: "React component", text: "create a react component called UserCard" },
  { label: "Next.js API", text: "create a nextjs api called users" },
  { label: "FastAPI model", text: "create a fastapi model called Product" },
  { label: "Run tests", text: "run npm test" },
  { label: "List files", text: "run ls -la" },
  { label: "Install deps", text: "run npm install" },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [activeTab, setActiveTab] = useState("chat");
  const [showBrain, setShowBrain] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [chatMode, setChatMode] = useState<"scratch" | "local">("scratch");
  const [localModelReady, setLocalModelReady] = useState<ModelId | null>(null);
  const [tosPending, setTosPending] = useState<boolean>(false);
  const [tosBody, setTosBody] = useState<string>("");
  const [streamingText, setStreamingText] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const voice = useVoice();

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Load memory + facts on mount
  const refreshMemory = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/memory");
      const data = await res.json();
      if (data.messages) {
        setMemory(data.messages);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshFacts = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/learn");
      const data = await res.json();
      if (data.facts) {
        setFacts(data.facts);
      }
    } catch {
      // ignore
    }
  }, []);

  // Check ToS on mount — show modal if not accepted
  useEffect(() => {
    fetch("/api/ai/tos")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && !d.tos.accepted) {
          setTosPending(true);
          setTosBody(d.tos.body);
        }
      })
      .catch(() => {});
  }, []);

  // Check if Local LLM already loaded (e.g. user navigated away and back)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const eng = getLocalLLM();
      if (eng.isReady()) setLocalModelReady(eng.getModel());
    }
  }, []);

  useEffect(() => {
    refreshMemory();
    refreshFacts();
    // Welcome message
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hi! I'm Mr Robot — an AI built entirely from scratch, no external APIs. I can chat, search the web, remember facts, do math, write code in 19 frameworks, use a terminal, manage git, and learn from my mistakes. Try 'search for javascript' or 'scaffold a react project called my-app'. Toggle voice on and I'll speak.",
        timestamp: Date.now(),
      },
    ]);
  }, [refreshMemory, refreshFacts]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || loading) return;
      setInput("");
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, userMsg]);
      setLoading(true);
      setStreamingText("");

      // ---------- Local LLM mode ----------
      if (chatMode === "local") {
        if (!localModelReady) {
          const errMsg: Message = {
            id: `e-${Date.now()}`,
            role: "assistant",
            content:
              "Local LLM mode is on but no model is loaded. Open the **Local LLM** tab and load a model first (Llama-3.2-1B is recommended — about 1.1 GB download, runs entirely in your browser via WebGPU).",
            timestamp: Date.now(),
          };
          setMessages((m) => [...m, errMsg]);
          setLoading(false);
          return;
        }
        try {
          // 1. Build grounding bundle (server-side: web search + ToS prompt)
          const groundingRes = await fetch("/api/ai/grounding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: content, searchWeb: true, maxSources: 4 }),
          });
          const grounding = await groundingRes.json();
          if (!grounding.ok) throw new Error(grounding.error ?? "grounding failed");

          // 2. Build conversation history from current messages (skip welcome)
          const history = messages
            .filter((m) => m.id !== "welcome" && m.id !== "system-welcome")
            .slice(-10)
            .map((m) => ({
              role: m.role === "user" ? "user" : "assistant",
              content: m.content,
            })) as Array<{ role: "user" | "assistant"; content: string }>;

          // 3. Create streaming AI message placeholder
          const aiMsgId = `a-${Date.now()}`;
          const sources = grounding.bundle.sources ?? [];
          const aiMsg: Message = {
            id: aiMsgId,
            role: "assistant",
            content: "",
            intent: "local-llm",
            confidence: 1,
            webResults: sources.map((s: any, i: number) => ({
              title: s.title,
              url: s.url,
              snippet: s.snippet,
              source: `Source ${i + 1}`,
            })),
            timestamp: Date.now(),
          };
          setMessages((m) => [...m, aiMsg]);

          // 4. Stream tokens from local LLM
          abortRef.current = new AbortController();
          let fullText = "";
          const eng = getLocalLLM();
          await eng.generate({
            systemPrompt: grounding.bundle.systemPrompt,
            messages: [...history, { role: "user", content }],
            maxTokens: 1024,
            temperature: 0.7,
            signal: abortRef.current.signal,
            onToken: (token: string) => {
              fullText += token;
              setStreamingText(fullText);
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === aiMsgId ? { ...msg, content: fullText } : msg
                )
              );
            },
          });

          // 5. Speak if voice is on
          if (voice.voiceEnabled && fullText) {
            voice.speak(fullText);
          }
          refreshMemory();
          setStreamingText("");
        } catch (e: any) {
          const errMsg: Message = {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: `Local LLM error: ${e.message ?? e}. The model may have run out of VRAM — try a smaller model (Qwen2.5-0.5B) or unload and reload.`,
            timestamp: Date.now(),
          };
          setMessages((m) => [...m, errMsg]);
          toast.error("Local LLM failed");
        } finally {
          setLoading(false);
          setStreamingText("");
        }
        return;
      }

      // ---------- From-scratch mode (original) ----------
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, speak: voice.voiceEnabled }),
        });
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }
        const data = await res.json();
        const aiMsg: Message = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.text || "(no response)",
          intent: data.intent,
          confidence: data.confidence,
          steps: data.steps,
          webResults: data.webResults,
          facts: data.facts,
          codeResult: data.codeResult,
          terminalResult: data.terminalResult,
          timestamp: Date.now(),
        };
        setMessages((m) => [...m, aiMsg]);
        if (voice.voiceEnabled) {
          voice.speak(data.text || "");
        }
        refreshMemory();
        refreshFacts();
      } catch (e) {
        const errMsg: Message = {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `Sorry, I hit an error: ${e instanceof Error ? e.message : "Unknown"}. The web search might be blocked in this environment — try asking me something local like "what do you know about X".`,
          timestamp: Date.now(),
        };
        setMessages((m) => [...m, errMsg]);
        toast.error("Request failed");
      } finally {
        setLoading(false);
      }
    },
    [input, loading, voice, refreshMemory, refreshFacts, chatMode, localModelReady, messages]
  );

  const handleMic = useCallback(() => {
    if (!voice.supported.recognition) {
      toast.error("Speech recognition not supported in this browser. Try Chrome.");
      return;
    }
    if (voice.listening) {
      voice.stopListening();
    } else {
      voice.startListening((text) => {
        setInput(text);
        sendMessage(text);
      });
    }
  }, [voice, sendMessage]);

  const handleDownload = useCallback(async () => {
    try {
      toast.info("Downloading Mr Robot for Windows...");
      const res = await fetch("/download?file=mr-robot-v11.zip");
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mr-robot-v11.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Downloaded! Extract the zip, then double-click RUN-ME-FIRST.bat");
    } catch (e) {
      toast.error(`Download failed: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  }, []);

  const handleDownloadAndroid = useCallback(async () => {
    try {
      toast.info("Downloading Mr Robot for Android...");
      const res = await fetch("/download?file=mr-robot-android.html");
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mr-robot-android.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Downloaded! Open this file in Chrome on your Android phone, then tap ⋮ → Add to Home screen");
    } catch (e) {
      toast.error(`Download failed: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  }, []);

  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    setShowDiag(true);
    setDiagResult(null);
    try {
      const res = await fetch("/api/ai/diagnose");
      const data = await res.json();
      setDiagResult(data);
    } catch (e) {
      setDiagResult({
        diagnosis: `Failed to run diagnostics: ${e instanceof Error ? e.message : "unknown"}`,
        results: [],
        summary: { total: 0, ok: 0, fail: 0, slow: 0 },
      });
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const clearSearchCache = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/clear-cache", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || `Cleared ${data.cleared} cached results`);
      } else {
        toast.error(data.error || "Failed to clear cache");
      }
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }, []);

  const handleDownloadBrain = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/download?format=brain");
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai-brain-state.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Brain state downloaded");
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  }, []);

  const clearChat = useCallback(async () => {
    setMessages([
      {
        id: `c-${Date.now()}`,
        role: "assistant",
        content: "Chat cleared. What would you like to talk about?",
        timestamp: Date.now(),
      },
    ]);
    try {
      await fetch("/api/ai/memory", { method: "DELETE" });
      refreshMemory();
    } catch {
      // ignore
    }
  }, [refreshMemory]);

  const clearFacts = useCallback(async () => {
    try {
      await fetch("/api/ai/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      refreshFacts();
      toast.success("Knowledge base cleared");
    } catch {
      toast.error("Failed to clear");
    }
  }, [refreshFacts]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* ToS acceptance modal — first visit */}
      {tosPending && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-amber-400" />
                Terms of Service
              </h2>
              <button
                onClick={() => setTosPending(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-sans">
                {tosBody}
              </pre>
            </div>
            <div className="p-4 border-t border-zinc-800 flex justify-end gap-2">
              <button
                onClick={() => setTosPending(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              >
                Decline (chat still works in from-scratch mode)
              </button>
              <button
                onClick={async () => {
                  try {
                    await fetch("/api/ai/tos", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "accept" }),
                    });
                    setTosPending(false);
                    toast.success("Terms accepted");
                  } catch {
                    setTosPending(false);
                  }
                }}
                className="px-4 py-2 text-sm rounded bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white font-medium"
              >
                Accept &amp; continue
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 via-rose-500 to-pink-500 flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              {voice.speaking && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              )}
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight bg-gradient-to-r from-amber-400 via-rose-400 to-pink-400 bg-clip-text text-transparent">
                Mr Robot
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-500 leading-tight">
                No external APIs · Custom neural net · Voice · Web search · Agent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBrain((s) => !s)}
              className="text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/50"
              title="Show AI architecture"
            >
              <Cpu className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Brain</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={runDiagnostics}
              className="text-zinc-400 hover:text-sky-400 hover:bg-zinc-800/50"
              title="Run network diagnostics — tests if web search can reach Bing, Google, and DuckDuckGo"
            >
              <Stethoscope className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Diagnose</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownloadBrain}
              className="text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50"
              title="Download brain state JSON"
            >
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">State</span>
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              className="bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white"
              title="Download Mr Robot for Windows (zip with installer)"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Windows</span>
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadAndroid}
              className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90 text-white"
              title="Download Mr Robot for Android (installable web app)"
            >
              <Smartphone className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Android</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Brain architecture banner */}
      {showBrain && (
        <div className="border-b border-zinc-800 bg-zinc-900/30">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { icon: Sparkles, name: "Tokenizer", desc: "Word & sentence splitting" },
                { icon: Network, name: "Stemmer", desc: "Porter-style root reducer" },
                { icon: Brain, name: "Naive Bayes", desc: "Intent classifier" },
                { icon: Cpu, name: "Neural Net", desc: "Backprop, sigmoid, MSE" },
                { icon: Database, name: "Knowledge Base", desc: "SPO triple store" },
                { icon: Globe, name: "Web Scraper", desc: "Bing + Google + DDG" },
              ].map((m) => (
                <div
                  key={m.name}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                >
                  <m.icon className="w-4 h-4 text-amber-400 mb-2" />
                  <div className="text-xs font-semibold text-zinc-200">{m.name}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{m.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic panel */}
      {showDiag && (
        <div className="border-b border-zinc-800 bg-zinc-900/50">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-sky-400" />
                Network Diagnostics
              </h3>
              <button
                onClick={() => setShowDiag(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {diagLoading ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>Testing connectivity to Bing, Google, DuckDuckGo, and general internet...</span>
              </div>
            ) : diagResult ? (
              <div className="space-y-2">
                {diagResult.results?.map((r: any, i: number) => (
                  <div
                    key={i}
                    className={`p-2 rounded border text-xs flex items-center gap-2 ${
                      r.status === "ok"
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : r.status === "slow"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-rose-500/30 bg-rose-500/5"
                    }`}
                  >
                    <span className={`shrink-0 ${r.status === "ok" ? "text-emerald-400" : r.status === "slow" ? "text-amber-400" : "text-rose-400"}`}>
                      {r.status === "ok" ? "✓" : r.status === "slow" ? "~" : "✗"}
                    </span>
                    <span className="font-mono text-zinc-300 shrink-0 w-48 truncate">{r.test}</span>
                    <span className="text-zinc-500 truncate">{r.detail}</span>
                  </div>
                ))}
                {diagResult.diagnosis && (
                  <div className="p-3 rounded border border-sky-500/30 bg-sky-500/5 text-xs text-zinc-300 mt-2">
                    <span className="text-sky-400 font-semibold">Diagnosis: </span>
                    {diagResult.diagnosis}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runDiagnostics}
                    className="border-zinc-800 bg-zinc-900 text-xs"
                  >
                    <Stethoscope className="w-3 h-3 mr-1" />
                    Re-run diagnostics
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearSearchCache}
                    className="border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 text-xs"
                    title="Clears cached web search results so the AI tries fresh searches"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Clear Search Cache
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Main layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 flex flex-col lg:flex-row gap-4">
        {/* Chat column */}
        <div className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="bg-zinc-900 border border-zinc-800 mb-3 self-start flex-wrap h-auto">
              <TabsTrigger value="chat" className="data-[state=active]:bg-zinc-800">
                Chat
              </TabsTrigger>
              <TabsTrigger value="code" className="data-[state=active]:bg-zinc-800">
                <Code className="w-3.5 h-3.5 mr-1.5 inline" />
                Code Studio
              </TabsTrigger>
              <TabsTrigger value="terminal" className="data-[state=active]:bg-zinc-800">
                <TerminalIcon className="w-3.5 h-3.5 mr-1.5 inline" />
                Terminal
              </TabsTrigger>
              <TabsTrigger value="devserver" className="data-[state=active]:bg-zinc-800">
                <Play className="w-3.5 h-3.5 mr-1.5 inline" />
                Run
              </TabsTrigger>
              <TabsTrigger value="git" className="data-[state=active]:bg-zinc-800">
                <GitBranch className="w-3.5 h-3.5 mr-1.5 inline" />
                Git
              </TabsTrigger>
              <TabsTrigger value="rename" className="data-[state=active]:bg-zinc-800">
                <Replace className="w-3.5 h-3.5 mr-1.5 inline" />
                Rename
              </TabsTrigger>
              <TabsTrigger value="memory" className="data-[state=active]:bg-zinc-800">
                Memory
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="data-[state=active]:bg-zinc-800">
                Knowledge
              </TabsTrigger>
              <TabsTrigger value="skills" className="data-[state=active]:bg-zinc-800">
                <Sparkles className="w-3.5 h-3.5 mr-1.5 inline" />
                Skills
              </TabsTrigger>
              <TabsTrigger value="mistakes" className="data-[state=active]:bg-zinc-800">
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5 inline" />
                Mistakes
              </TabsTrigger>
              <TabsTrigger value="local-llm" className="data-[state=active]:bg-zinc-800">
                <Sparkle className="w-3.5 h-3.5 mr-1.5 inline" />
                Local LLM
              </TabsTrigger>
              <TabsTrigger value="train" className="data-[state=active]:bg-zinc-800">
                <GraduationCap className="w-3.5 h-3.5 mr-1.5 inline" />
                Train
              </TabsTrigger>
              <TabsTrigger value="terms" className="data-[state=active]:bg-zinc-800">
                <ScrollText className="w-3.5 h-3.5 mr-1.5 inline" />
                Terms
              </TabsTrigger>
            </TabsList>

            {/* Chat Tab */}
            <TabsContent value="chat" className="flex-1 flex flex-col mt-0 data-[state=inactive]:hidden">
              {/* Chat-mode toggle: From-scratch vs Local LLM */}
              <div className="mb-2 flex items-center gap-2 flex-wrap">
                <div className="flex rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden text-xs">
                  <button
                    onClick={() => setChatMode("scratch")}
                    className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                      chatMode === "scratch"
                        ? "bg-amber-500/20 text-amber-400"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                    title="Use the from-scratch neural net (fast, simple, but limited understanding)"
                  >
                    <Brain className="w-3 h-3" />
                    From-scratch
                  </button>
                  <button
                    onClick={() => {
                      setChatMode("local");
                      // If no model is loaded, jump straight to the Local LLM tab
                      // so the user knows they need to load one first.
                      if (!localModelReady) {
                        setActiveTab("local-llm");
                        toast.info(
                          "Local LLM mode requires a model. Loading the Local LLM tab — click 'Load Model' to download Llama-3.2-1B (1.1 GB, runs in your browser via WebGPU)."
                        );
                      }
                    }}
                    className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                      chatMode === "local"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                    title="Use the real LLM in your browser (Llama/Qwen via WebGPU) — requires Chrome and a 1-time model download"
                  >
                    <Sparkle className="w-3 h-3" />
                    Local LLM
                    {localModelReady ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    )}
                  </button>
                </div>
                {chatMode === "local" && !localModelReady && (
                  <button
                    onClick={() => setActiveTab("local-llm")}
                    className="text-xs text-amber-400 hover:underline font-medium"
                  >
                    ⚠ Load a model first →
                  </button>
                )}
                {chatMode === "local" && localModelReady && (
                  <span className="text-xs text-emerald-400">
                    {localModelReady.replace("-q4f16_1-MLC", "").replace("-q4f32_1-MLC", "")} ready
                    • grounded with web search • citations enabled
                  </span>
                )}
                {chatMode === "scratch" && (
                  <span className="text-xs text-zinc-500">
                    Simple mode — for complex questions, switch to{" "}
                    <button
                      onClick={() => {
                        setChatMode("local");
                        if (!localModelReady) setActiveTab("local-llm");
                      }}
                      className="text-emerald-400 hover:underline"
                    >
                      Local LLM
                    </button>
                  </span>
                )}
              </div>
              {/* Local LLM warning banner — shown when in Local LLM mode but no model loaded */}
              {chatMode === "local" && !localModelReady && (
                <div className="mb-2 p-2 rounded border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 flex items-center justify-between gap-2">
                  <span>
                    <strong>Local LLM mode is on, but no model is loaded.</strong>{" "}
                    Open the Local LLM tab to download Llama-3.2-1B (~1.1 GB, one-time). It runs entirely in your browser — no API keys, no server calls.
                  </span>
                  <button
                    onClick={() => setActiveTab("local-llm")}
                    className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 whitespace-nowrap"
                  >
                    Load model →
                  </button>
                </div>
              )}
              {/* WebGPU not available warning — only check when user tries Local LLM mode */}
              {chatMode === "local" && !localModelReady && typeof window !== "undefined" && !("gpu" in navigator) && (
                <div className="mb-2 p-2 rounded border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
                  <strong>WebGPU not available in this browser.</strong> The Local LLM
                  needs WebGPU. Open this page in <strong>Chrome 113+</strong>,{" "}
                  <strong>Edge 113+</strong>, Brave, or Arc. The chat preview iframe
                  you&apos;re using now doesn&apos;t have WebGPU — open the page in a real browser tab.
                </div>
              )}
              {/* Download banner - shown on first visit */}
              {messages.length <= 1 && (
                <div className="mb-3 p-3 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-pink-500/10">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Download className="w-5 h-5 text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">
                        Download Mr Robot
                      </p>
                      <p className="text-xs text-zinc-400">
                        Windows: full AI with code studio, terminal, git. Android: installable web app with chat, voice & search.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleDownload}
                      className="bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white shrink-0"
                    >
                      <Download className="w-4 h-4 mr-1.5" />
                      Windows
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDownloadAndroid}
                      className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90 text-white shrink-0"
                    >
                      <Smartphone className="w-4 h-4 mr-1.5" />
                      Android
                    </Button>
                  </div>
                </div>
              )}
              <Card className="flex-1 flex flex-col bg-zinc-900/50 border-zinc-800 min-h-[400px] lg:min-h-0 lg:max-h-[calc(100vh-260px)]">
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-zinc-500 text-sm pl-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                      <span>AI is thinking...</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Suggestions */}
              {messages.length <= 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => sendMessage(s.text)}
                      className="text-xs px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={
                      voice.listening
                        ? voice.interimText || "Listening..."
                        : "Ask anything — search, remember, calculate, chat..."
                    }
                    className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20 pr-10"
                  />
                  {voice.listening && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      <span className="flex items-end gap-0.5 h-4">
                        <span className="w-0.5 bg-rose-500 animate-pulse" style={{ height: "40%", animationDelay: "0ms" }} />
                        <span className="w-0.5 bg-rose-500 animate-pulse" style={{ height: "80%", animationDelay: "100ms" }} />
                        <span className="w-0.5 bg-rose-500 animate-pulse" style={{ height: "60%", animationDelay: "200ms" }} />
                        <span className="w-0.5 bg-rose-500 animate-pulse" style={{ height: "90%", animationDelay: "300ms" }} />
                      </span>
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleMic}
                  className={`border-zinc-800 ${
                    voice.listening
                      ? "bg-rose-500/20 border-rose-500 text-rose-400"
                      : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                  title={voice.listening ? "Stop listening" : "Speak to me"}
                >
                  {voice.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={voice.toggleVoice}
                  className={`border-zinc-800 ${
                    voice.voiceEnabled
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                      : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                  title={voice.voiceEnabled ? "Mute voice" : "Enable voice"}
                >
                  {voice.voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  className="bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              {/* Voice status */}
              {!voice.supported.synth && (
                <p className="text-xs text-zinc-600 mt-2 text-center">
                  Voice not supported in this browser. Try Chrome for full voice features.
                </p>
              )}
              {voice.voiceEnabled && voice.supported.synth && (
                <p className="text-xs text-emerald-500/70 mt-2 text-center">
                  Voice is on — I'll speak my responses. {voice.speaking && "Speaking now..."}
                </p>
              )}
            </TabsContent>

            {/* Memory Tab */}
            <TabsContent value="memory" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <Card className="bg-zinc-900/50 border-zinc-800 h-full">
                <div className="p-4 flex items-center justify-between border-b border-zinc-800">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-400" />
                      Conversation Memory
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {memory.length} messages stored in SQLite via Prisma
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearChat}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <ScrollArea className="h-[calc(100vh-340px)]">
                  <div className="p-3 space-y-2">
                    {memory.length === 0 ? (
                      <p className="text-sm text-zinc-600 text-center py-8">
                        No conversations yet. Start chatting!
                      </p>
                    ) : (
                      memory.map((m) => (
                        <div
                          key={m.id}
                          className={`p-3 rounded-lg border text-sm ${
                            m.role === "user"
                              ? "bg-amber-500/5 border-amber-500/20"
                              : "bg-zinc-900 border-zinc-800"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge
                              variant="outline"
                              className={
                                m.role === "user"
                                  ? "border-amber-500/30 text-amber-400"
                                  : "border-zinc-700 text-zinc-400"
                              }
                            >
                              {m.role}
                            </Badge>
                            {m.intent && (
                              <span className="text-[10px] text-zinc-600">{m.intent}</span>
                            )}
                          </div>
                          <p className="text-zinc-300 whitespace-pre-wrap">{m.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </Card>
            </TabsContent>

            {/* Knowledge Tab */}
            <TabsContent value="knowledge" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <Card className="bg-zinc-900/50 border-zinc-800 h-full">
                <div className="p-4 flex items-center justify-between border-b border-zinc-800">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                      Knowledge Base
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {facts.length} facts stored as subject-predicate-object triples
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFacts}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <ScrollArea className="h-[calc(100vh-340px)]">
                  <div className="p-3 space-y-2">
                    {facts.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-sm text-zinc-600 mb-3">
                          No facts stored yet. Teach me by saying:
                        </p>
                        <p className="text-xs text-zinc-500 italic">
                          "remember that Paris is the capital of France"
                        </p>
                      </div>
                    ) : (
                      facts.map((f, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg border border-zinc-800 bg-zinc-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-200">
                                <span className="text-amber-400 font-medium">{f.subject}</span>
                                <span className="text-zinc-500"> {f.predicate} </span>
                                <span className="text-emerald-400">{f.object}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {f.source && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-zinc-700 text-zinc-500"
                                >
                                  {f.source}
                                </Badge>
                              )}
                              {f.weight !== undefined && (
                                <span className="text-[10px] text-zinc-600">
                                  ×{f.weight.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </Card>
            </TabsContent>

            {/* Code Studio Tab */}
            <TabsContent value="code" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <div className="flex flex-col gap-3">
                <CodeStudio />
                <div className="flex flex-wrap gap-2">
                  {CODE_SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => {
                        setActiveTab("chat");
                        sendMessage(s.text);
                      }}
                      className="text-xs px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Terminal Tab */}
            <TabsContent value="terminal" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <Terminal />
            </TabsContent>

            {/* Dev Server Tab */}
            <TabsContent value="devserver" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <DevServerPanel />
            </TabsContent>

            {/* Git Tab */}
            <TabsContent value="git" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <GitPanel />
            </TabsContent>

            {/* Rename Tab */}
            <TabsContent value="rename" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <RenamePanel />
            </TabsContent>

            {/* Mistakes Tab */}
            <TabsContent value="mistakes" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <MistakesLog />
            </TabsContent>

            {/* Skills Tab */}
            <TabsContent value="skills" className="flex-1 mt-0 data-[state=inactive]:hidden">
              <SkillsPanel />
            </TabsContent>

            {/* Local LLM Tab — real open-source LLM in browser */}
            <TabsContent value="local-llm" className="flex-1 mt-0 data-[state=inactive]:hidden overflow-auto">
              <LocalLLMPanel
                onModelReady={(id) => setLocalModelReady(id)}
                onModelUnloaded={() => setLocalModelReady(null)}
              />
            </TabsContent>

            {/* Train Tab — collect corrections, export for fine-tuning */}
            <TabsContent value="train" className="flex-1 mt-0 data-[state=inactive]:hidden overflow-auto">
              <TrainingPanel />
            </TabsContent>

            {/* Terms Tab — user-owned ToS */}
            <TabsContent value="terms" className="flex-1 mt-0 data-[state=inactive]:hidden overflow-auto">
              <TosPanel />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right info column — hidden on mobile */}
        <aside className="hidden lg:flex w-72 xl:w-80 flex-col gap-3 shrink-0">
          <Card className="bg-zinc-900/50 border-zinc-800 p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              What makes me "from scratch"
            </h3>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li className="flex gap-2">
                <span className="text-amber-500">→</span>
                <span><b className="text-zinc-200">Tokenizer</b> — regex-based word/sentence splitter, stop word filter</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">→</span>
                <span><b className="text-zinc-200">Porter Stemmer</b> — reduces words to roots (running → run)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">→</span>
                <span><b className="text-zinc-200">Naive Bayes</b> — multinomial classifier w/ Laplace smoothing</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">→</span>
                <span><b className="text-zinc-200">Neural Network</b> — feedforward, sigmoid, backprop, MSE</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">→</span>
                <span><b className="text-zinc-200">Knowledge Base</b> — SPO triples stored in SQLite</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">→</span>
                <span><b className="text-zinc-200">Web Scraper</b> — Bing + Google + DuckDuckGo, no API key</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">→</span>
                <span><b className="text-zinc-200">Voice</b> — Web Speech API (browser-native TTS + STT)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-500">→</span>
                <span><b className="text-zinc-200">Agent Loop</b> — plan → act → observe → respond</span>
              </li>
            </ul>
            <Separator className="my-3 bg-zinc-800" />
            <div className="space-y-2">
              <Button
                size="sm"
                onClick={handleDownload}
                className="w-full bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Download for Windows
              </Button>
              <p className="text-[10px] text-zinc-500 text-center">
                Full AI: chat, code studio, terminal, git, web search. Includes installer (.bat).
              </p>
              <Button
                size="sm"
                onClick={handleDownloadAndroid}
                className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90 text-white"
              >
                <Smartphone className="w-4 h-4 mr-2" />
                Download for Android
              </Button>
              <p className="text-[10px] text-zinc-600 text-center">
                Installable web app — chat, voice, search, math, memory. Add to home screen.
              </p>
            </div>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4 text-rose-400" />
              Try These
            </h3>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setActiveTab("chat");
                    sendMessage(s.text);
                  }}
                  className="w-full text-left text-xs px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <Search className="w-3 h-3 inline mr-2 text-zinc-600" />
                  {s.text}
                </button>
              ))}
            </div>
          </Card>
        </aside>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-zinc-900/30 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-3 text-center text-[11px] text-zinc-600">
          Mr Robot · Built entirely from scratch · No external AI APIs · Voice via Web Speech API · Web search via Bing/Google/DDG ·{" "}
          <span className="text-zinc-500">Source in <code className="text-amber-500">src/lib/ai/</code></span>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [showDetails, setShowDetails] = useState(!!message.codeResult || !!message.terminalResult);
  const hasDetails = (message.steps && message.steps.length > 0) || (message.webResults && message.webResults.length > 0) || (message.facts && message.facts.length > 0) || (message.codeResult && message.codeResult.files.length > 0) || (message.terminalResult && message.terminalResult.autoFix);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
            isUser
              ? "bg-gradient-to-br from-amber-500 to-rose-500 text-white rounded-br-sm"
              : "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-bl-sm"
          }`}
        >
          {message.content}
        </div>

        {/* Intent badge + confidence */}
        {!isUser && message.intent && (
          <div className="flex items-center gap-2 mt-1.5 px-1 flex-wrap">
            <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
              {message.intent}
            </Badge>
            {typeof message.confidence === "number" && (
              <span className="text-[10px] text-zinc-600">
                {(message.confidence * 100).toFixed(0)}% confident
              </span>
            )}
            {hasDetails && (
              <button
                onClick={() => setShowDetails((s) => !s)}
                className="text-[10px] text-zinc-500 hover:text-amber-400 flex items-center gap-0.5"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
                {showDetails ? "Hide" : "Details"}
              </button>
            )}
          </div>
        )}

        {/* Agent activity */}
        {showDetails && hasDetails && (
          <div className="mt-2 w-full space-y-2">
            {message.steps && message.steps.length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5">
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Agent Steps
                </p>
                {message.steps.map((s, i) => (
                  <div key={i} className="text-xs flex items-start gap-2 py-0.5">
                    <span className={s.success ? "text-emerald-500" : "text-rose-500"}>
                      {s.success ? "✓" : "✗"}
                    </span>
                    <span className="text-zinc-400">
                      <span className="text-zinc-300 font-medium">{s.action}</span>: {s.result}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {message.codeResult && message.codeResult.files.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Code className="w-3 h-3" /> Files {message.codeResult.applied} created/modified ({message.codeResult.framework} / {message.codeResult.language})
                </p>
                <div className="space-y-0.5 mb-2">
                  {message.codeResult.files.slice(0, 12).map((f, i) => (
                    <div key={i} className="text-xs font-mono flex items-center gap-1.5">
                      <span className={`text-[10px] ${f.op === "create" ? "text-emerald-400" : f.op === "delete" ? "text-rose-400" : f.op === "mkdir" ? "text-sky-400" : "text-amber-400"}`}>
                        [{f.op}]
                      </span>
                      <span className="text-zinc-300">{f.path}</span>
                    </div>
                  ))}
                  {message.codeResult.files.length > 12 && (
                    <div className="text-[10px] text-zinc-500 italic">
                      + {message.codeResult.files.length - 12} more
                    </div>
                  )}
                </div>
                {message.codeResult.nextSteps.length > 0 && (
                  <div className="text-xs text-zinc-400">
                    <span className="text-zinc-500">Next: </span>
                    <code className="text-emerald-400">{message.codeResult.nextSteps[0]}</code>
                  </div>
                )}
              </div>
            )}
            {message.terminalResult && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <TerminalIcon className="w-3 h-3" /> Terminal Output
                </p>
                {message.terminalResult.autoFix?.applied && (
                  <div className="mb-2 p-1.5 rounded border border-amber-500/30 bg-amber-500/10 text-xs">
                    <div className="text-amber-400 font-semibold mb-0.5">🔧 AUTO-FIX</div>
                    <div className="text-zinc-300">{message.terminalResult.autoFix.fixDescription}</div>
                    <div className="text-zinc-400 text-[11px]">
                      Ran: <code className="text-amber-400">{message.terminalResult.autoFix.fixCommand}</code>
                    </div>
                    {message.terminalResult.autoFix.learnedFrom && (
                      <div className="text-[10px] text-zinc-500 italic mt-0.5">
                        {message.terminalResult.autoFix.learnedFrom}
                      </div>
                    )}
                  </div>
                )}
                {message.terminalResult.stdout && (
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all max-h-32 overflow-y-auto mb-1">
                    {message.terminalResult.stdout.slice(0, 1000)}
                    {message.terminalResult.stdout.length > 1000 ? "\n... [truncated]" : ""}
                  </pre>
                )}
                {message.terminalResult.stderr && (
                  <pre className="text-xs text-rose-400/80 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {message.terminalResult.stderr.slice(0, 500)}
                  </pre>
                )}
              </div>
            )}
            {message.facts && message.facts.length > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Facts Applied
                </p>
                {message.facts.map((f, i) => (
                  <div key={i} className="text-xs text-zinc-400">
                    <span className="text-amber-400">{f.subject}</span>
                    <span className="text-zinc-600"> {f.predicate} </span>
                    <span className="text-emerald-400">{f.object}</span>
                  </div>
                ))}
              </div>
            )}
            {message.webResults && message.webResults.length > 0 && (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5">
                <p className="text-[10px] font-semibold text-sky-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Web Sources
                </p>
                {message.webResults.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs py-1 hover:text-sky-300 group"
                  >
                    <span className="text-zinc-300 group-hover:text-sky-300 font-medium">
                      {r.title}
                    </span>
                    <span className="text-zinc-600 ml-2 text-[10px]">[{r.source}]</span>
                    {r.snippet && (
                      <span className="block text-zinc-500 text-[11px] mt-0.5 line-clamp-2">
                        {r.snippet}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
