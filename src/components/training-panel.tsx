"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Download,
  Trash2,
  RefreshCw,
  Database,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface TrainingExample {
  id: string;
  prompt: string;
  response: string;
  rating: number;
  correction: string | null;
  intent: string | null;
  sources: string | null;
  modelName: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  good: number;
  bad: number;
  neutral: number;
  corrected: number;
}

export function TrainingPanel() {
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [exRes, statRes] = await Promise.all([
        fetch("/api/ai/train?limit=100"),
        fetch("/api/ai/train?view=stats"),
      ]);
      const exJson = await exRes.json();
      const statJson = await statRes.json();
      if (exJson.ok) setExamples(exJson.examples);
      if (statJson.ok) setStats(statJson.stats);
    } catch (e: any) {
      toast.error(`Failed to load: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`/api/ai/train?id=${id}`, { method: "DELETE" });
      toast.success("Deleted");
      refresh();
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message}`);
    }
  }, [refresh]);

  const handleSaveCorrection = useCallback(async (id: string) => {
    try {
      // Update via DELETE + re-create with correction
      // (Simpler than a PUT endpoint for now)
      const ex = examples.find((e) => e.id === id);
      if (!ex) return;
      await fetch(`/api/ai/train?id=${id}`, { method: "DELETE" });
      await fetch("/api/ai/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: ex.prompt,
          response: ex.response,
          rating: -1,
          correction: editText,
          intent: ex.intent ?? undefined,
          modelName: ex.modelName ?? undefined,
        }),
      });
      toast.success("Correction saved");
      setEditingId(null);
      setEditText("");
      refresh();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    }
  }, [examples, editText, refresh]);

  const handleExport = useCallback(async (format: string) => {
    try {
      const res = await fetch(`/api/ai/export-training?format=${format}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="(.+?)"/);
      a.download = match?.[1] ?? `mr-robot-training.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format}`);
    } catch (e: any) {
      toast.error(`Export failed: ${e.message}`);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <Card className="bg-zinc-900/50 border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              Training Data
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Rate AI responses to build a fine-tuning dataset. Export as JSONL
              to fine-tune with Hugging Face / axolotl.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <StatBox label="Total" value={stats.total} color="text-zinc-200" />
            <StatBox label="Good" value={stats.good} color="text-emerald-400" />
            <StatBox label="Bad" value={stats.bad} color="text-rose-400" />
            <StatBox label="Neutral" value={stats.neutral} color="text-zinc-400" />
            <StatBox
              label="Corrected"
              value={stats.corrected}
              color="text-amber-400"
            />
          </div>
        )}
      </Card>

      {/* Export buttons */}
      <Card className="bg-zinc-900/50 border-zinc-800 p-4">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Download className="w-4 h-4 text-emerald-400" />
          Export for fine-tuning
        </h4>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => handleExport("jsonl")} className="border-zinc-700 text-zinc-300">
            <FileText className="w-3 h-3 mr-1" /> JSONL (HuggingFace)
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleExport("alpaca")} className="border-zinc-700 text-zinc-300">
            <FileText className="w-3 h-3 mr-1" /> Alpaca
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleExport("sharegpt")} className="border-zinc-700 text-zinc-300">
            <FileText className="w-3 h-3 mr-1" /> ShareGPT (axolotl)
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleExport("dpo")} className="border-zinc-700 text-zinc-300">
            <FileText className="w-3 h-3 mr-1" /> DPO pairs
          </Button>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Only rated-good (&ge;0) examples are exported. If a correction exists,
          it replaces the original response. See FINE-TUNING-GUIDE.md for next
          steps.
        </p>
      </Card>

      {/* Examples list */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <div className="p-4 border-b border-zinc-800">
          <h4 className="text-sm font-semibold">Collected Examples</h4>
        </div>
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : examples.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No training data yet. Rate AI responses in the Chat tab (when
              Local LLM mode is on) to collect examples.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {examples.map((ex) => (
                <div key={ex.id} className="p-3 hover:bg-zinc-900/50">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      {ex.rating === 1 && (
                        <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      {ex.rating === -1 && (
                        <ThumbsDown className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      {ex.rating === 0 && (
                        <Badge variant="outline" className="text-[10px] text-zinc-500">
                          neutral
                        </Badge>
                      )}
                      {ex.modelName && (
                        <Badge variant="outline" className="text-[10px] text-zinc-500">
                          {ex.modelName.replace("-q4f16_1-MLC", "").replace("-q4f32_1-MLC", "")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-zinc-500"
                        onClick={() => {
                          setEditingId(ex.id);
                          setEditText(ex.correction ?? ex.response);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-rose-400 hover:text-rose-300"
                        onClick={() => handleDelete(ex.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-300 mb-1">
                    <span className="text-zinc-500">Q:</span> {ex.prompt}
                  </div>
                  <div className="text-xs text-zinc-400">
                    <span className="text-zinc-500">A:</span> {ex.response.slice(0, 200)}
                    {ex.response.length > 200 ? "..." : ""}
                  </div>
                  {ex.correction && (
                    <div className="text-xs text-amber-400 mt-1">
                      <span className="text-amber-500/70">Correction:</span>{" "}
                      {ex.correction.slice(0, 200)}
                      {ex.correction.length > 200 ? "..." : ""}
                    </div>
                  )}
                  {editingId === ex.id && (
                    <div className="mt-2 space-y-1.5">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={4}
                        className="bg-zinc-950 border-zinc-800 text-xs"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveCorrection(ex.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white h-7"
                        >
                          Save correction
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          className="h-7"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
