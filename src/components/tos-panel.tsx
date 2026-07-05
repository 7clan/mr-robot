"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Save,
  RefreshCw,
  Check,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface TosData {
  id: string;
  version: number;
  title: string;
  body: string;
  accepted: boolean;
  acceptedAt: string | null;
  updatedAt: string;
}

export function TosPanel() {
  const [tos, setTos] = useState<TosData | null>(null);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/tos");
      const json = await res.json();
      if (json.ok) {
        setTos(json.tos);
        setBody(json.tos.body);
        setTitle(json.tos.title);
      }
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/tos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", body, title }),
      });
      const json = await res.json();
      if (json.ok) {
        setTos(json.tos);
        toast.success(`Saved as v${json.tos.version}. Users must re-accept.`);
      } else {
        toast.error(json.error ?? "Save failed");
      }
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [body, title]);

  const handleReset = useCallback(async () => {
    if (!confirm("Reset to default terms? Your edits will be lost.")) return;
    try {
      const res = await fetch("/api/ai/tos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const json = await res.json();
      if (json.ok) {
        setTos(json.tos);
        setBody(json.tos.body);
        setTitle(json.tos.title);
        toast.info("Reset to default");
      }
    } catch (e: any) {
      toast.error(`Reset failed: ${e.message}`);
    }
  }, []);

  const handleAccept = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/tos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const json = await res.json();
      if (json.ok) {
        setTos(json.tos);
        toast.success("Terms accepted");
      }
    } catch (e: any) {
      toast.error(`Accept failed: ${e.message}`);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!tos) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800 p-4 text-sm text-rose-400">
        Failed to load terms.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900/50 border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Terms of Service
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              You own Mr Robot. Edit these terms however you like. The text
              you write here is injected into the AI&apos;s system prompt — the
              AI is bound by your rules.
            </p>
          </div>
          <Badge
            className={
              tos.accepted
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
            }
          >
            v{tos.version} {tos.accepted ? "• accepted" : "• pending"}
          </Badge>
        </div>

        {!tos.accepted && (
          <div className="mb-3 flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div className="flex-1">
              You have not accepted the current terms. The AI will refuse
              requests until you do.{" "}
              <button
                onClick={handleAccept}
                className="underline font-medium hover:text-amber-300"
              >
                Accept now
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs text-zinc-500 uppercase tracking-wide">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-zinc-950 border-zinc-800 text-sm"
          />
          <label className="text-xs text-zinc-500 uppercase tracking-wide block">
            Body (Markdown supported)
          </label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            className="bg-zinc-950 border-zinc-800 text-xs font-mono"
            placeholder="Write your terms here..."
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            Save as new version
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            className="border-zinc-700 text-zinc-300"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Reset to default
          </Button>
          {tos.accepted ? (
            <Badge variant="outline" className="text-emerald-400 self-center">
              <Check className="w-3 h-3 mr-1" /> Accepted
            </Badge>
          ) : (
            <Button
              onClick={handleAccept}
              variant="outline"
              className="border-emerald-500/40 text-emerald-400"
            >
              <Check className="w-4 h-4 mr-1.5" />
              Accept current version
            </Button>
          )}
        </div>
      </Card>

      <Card className="bg-zinc-900/30 border-zinc-800/50 p-4">
        <div className="text-xs text-zinc-500 space-y-1.5">
          <p className="font-semibold text-zinc-400 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> How the ToS affects the AI
          </p>
          <p>
            • When the Local LLM is loaded, the current ToS body is converted to
            plain text and prepended to the system prompt.
          </p>
          <p>
            • The LLM is instructed to refuse requests that violate your terms,
            citing the specific clause.
          </p>
          <p>
            • Each save creates a new version (v2, v3, ...) and resets
            acceptance — so existing users must re-accept after you change
            terms.
          </p>
          <p>
            • The Apache 2.0 license on the underlying LLM (Llama/Qwen/Phi)
            allows you to set whatever terms you want on top — including
            commercial use, paid products, etc.
          </p>
        </div>
      </Card>
    </div>
  );
}
