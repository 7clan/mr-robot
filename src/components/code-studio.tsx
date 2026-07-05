"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder,
  File as FileIcon,
  FileCode,
  FilePlus,
  FolderPlus,
  RefreshCw,
  Save,
  Trash2,
  Terminal as TerminalIcon,
  Play,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  GitBranch,
  GitCommit,
  Square,
  Plus,
  Edit3,
  Replace,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ----- Types -----
interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  extension?: string;
  children?: FileNode[];
}

interface TerminalEntry {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  autoFix?: {
    applied: boolean;
    fixCommand?: string;
    fixDescription?: string;
    pattern?: string;
    learnedFrom?: string;
  };
  timestamp: number;
}

interface Mistake {
  id: string;
  context: string;
  errorOutput: string;
  fixApplied: string;
  fixDescription: string | null;
  occurrenceCount: number;
  successCount: number;
  successRate: number;
  lastSeenAt: string;
}

// ===== Code Studio =====
export function CodeStudio() {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["."]));
  const [newItemName, setNewItemName] = useState("");
  const [showNew, setShowNew] = useState<null | "file" | "dir">(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<FileNode[]>([]);

  const refreshTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/files?action=tree&path=.");
      const data = await res.json();
      if (data.tree) setTree(data.tree);
    } catch (e) {
      toast.error("Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  const openFile = useCallback(async (path: string) => {
    try {
      const res = await fetch(`/api/ai/files?action=read&path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.content !== undefined) {
        setSelectedFile(path);
        setFileContent(data.content);
        setOriginalContent(data.content);
      }
    } catch {
      toast.error("Failed to read file");
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", path: selectedFile, content: fileContent }),
      });
      if (res.ok) {
        setOriginalContent(fileContent);
        toast.success(`Saved ${selectedFile}`);
        refreshTree();
      } else {
        toast.error("Save failed");
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }, [selectedFile, fileContent, refreshTree]);

  const deleteItem = useCallback(async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    try {
      const res = await fetch(`/api/ai/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`Deleted ${path}`);
        if (selectedFile === path) {
          setSelectedFile(null);
          setFileContent("");
        }
        refreshTree();
      }
    } catch {
      toast.error("Delete failed");
    }
  }, [selectedFile, refreshTree]);

  const createItem = useCallback(async (type: "file" | "dir", name: string) => {
    if (!name.trim()) return;
    const action = type === "dir" ? "mkdir" : "write";
    try {
      const res = await fetch("/api/ai/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, path: name, content: type === "file" ? "" : undefined }),
      });
      if (res.ok) {
        toast.success(`Created ${name}`);
        setNewItemName("");
        setShowNew(null);
        refreshTree();
        if (type === "file") openFile(name);
      }
    } catch {
      toast.error("Create failed");
    }
  }, [refreshTree, openFile]);

  const runSearch = useCallback(async () => {
    if (!searchQ.trim()) return;
    try {
      const res = await fetch(`/api/ai/files?action=search&q=${encodeURIComponent(searchQ)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      toast.error("Search failed");
    }
  }, [searchQ]);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isDirty = fileContent !== originalContent;
  const ext = selectedFile ? selectedFile.split(".").pop()?.toLowerCase() : "";

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-[500px] lg:min-h-0 lg:h-[calc(100vh-260px)]">
      {/* File explorer */}
      <Card className="lg:w-64 flex flex-col bg-zinc-900/50 border-zinc-800 overflow-hidden">
        <div className="p-2 border-b border-zinc-800 flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={refreshTree} className="h-7 px-2 text-zinc-400 hover:text-zinc-100">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowNew("file")} className="h-7 px-2 text-zinc-400 hover:text-amber-400" title="New file">
            <FilePlus className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowNew("dir")} className="h-7 px-2 text-zinc-400 hover:text-amber-400" title="New folder">
            <FolderPlus className="w-3.5 h-3.5" />
          </Button>
          <span className="ml-auto text-[10px] text-zinc-600 uppercase tracking-wider">Workspace</span>
        </div>

        {showNew && (
          <div className="p-2 border-b border-zinc-800 flex gap-1">
            <Input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createItem(showNew, newItemName);
                if (e.key === "Escape") { setShowNew(null); setNewItemName(""); }
              }}
              placeholder={showNew === "file" ? "path/to/file.ts" : "folder/name"}
              className="h-7 text-xs bg-zinc-950 border-zinc-800"
              autoFocus
            />
            <Button size="sm" variant="ghost" onClick={() => createItem(showNew, newItemName)} className="h-7 px-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            </Button>
          </div>
        )}

        <div className="px-2 py-1.5 border-b border-zinc-800 flex gap-1">
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search files..."
            className="h-7 text-xs bg-zinc-950 border-zinc-800"
          />
          <Button size="sm" variant="ghost" onClick={runSearch} className="h-7 px-2">
            <Search className="w-3.5 h-3.5" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-1.5 text-xs">
            {searchResults.length > 0 ? (
              <div>
                <div className="text-[10px] text-zinc-500 uppercase mb-1 px-1">{searchResults.length} results</div>
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => openFile(r.relativePath)}
                    className="w-full text-left px-1.5 py-1 rounded hover:bg-zinc-800 flex items-center gap-1.5"
                  >
                    <FileIcon className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="truncate text-zinc-300">{r.relativePath}</span>
                  </button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setSearchResults([])} className="w-full mt-1 h-6 text-[10px] text-zinc-500">
                  Clear results
                </Button>
              </div>
            ) : tree ? (
              <FileTree
                node={tree}
                depth={0}
                expanded={expandedDirs}
                onToggle={toggleDir}
                onOpen={openFile}
                onDelete={deleteItem}
                selected={selectedFile}
              />
            ) : (
              <div className="text-zinc-600 text-center py-4">{loading ? "Loading..." : "Empty workspace"}</div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Editor */}
      <Card className="flex-1 flex flex-col bg-zinc-900/50 border-zinc-800 overflow-hidden">
        <div className="p-2 border-b border-zinc-800 flex items-center gap-2">
          {selectedFile ? (
            <>
              <FileCode className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-mono text-zinc-200 truncate">{selectedFile}</span>
              {isDirty && <span className="text-[10px] text-amber-400">● unsaved</span>}
              <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500 ml-1">
                {ext || "txt"}
              </Badge>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={saveFile}
                  disabled={!isDirty || saving}
                  className="h-7 px-2 text-zinc-400 hover:text-emerald-400"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteItem(selectedFile)}
                  className="h-7 px-2 text-zinc-400 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </>
          ) : (
            <span className="text-xs text-zinc-500">Select a file to edit, or ask the AI in chat to scaffold a project</span>
          )}
        </div>
        {selectedFile ? (
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                saveFile();
              }
              if (e.key === "Tab") {
                e.preventDefault();
                const target = e.currentTarget;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                const newContent = fileContent.slice(0, start) + "  " + fileContent.slice(end);
                setFileContent(newContent);
                requestAnimationFrame(() => {
                  target.selectionStart = target.selectionEnd = start + 2;
                });
              }
            }}
            className="flex-1 bg-zinc-950 text-zinc-100 font-mono text-xs p-3 outline-none resize-none border-0"
            spellCheck={false}
            placeholder="// File contents..."
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
            <div className="text-center max-w-sm">
              <FileCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="mb-2">No file selected</p>
              <p className="text-xs text-zinc-700">
                Try asking the AI in chat:{" "}
                <code className="text-amber-500">scaffold a react project called MyApp</code>
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function FileTree({
  node,
  depth,
  expanded,
  onToggle,
  onOpen,
  onDelete,
  selected,
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  selected: string | null;
}) {
  const isExpanded = expanded.has(node.relativePath);
  const isSelected = selected === node.relativePath;

  if (node.type === "file") {
    return (
      <div
        className={`group flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer hover:bg-zinc-800 ${
          isSelected ? "bg-zinc-800 text-amber-400" : "text-zinc-300"
        }`}
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => onOpen(node.relativePath)}
      >
        <FileIcon className="w-3 h-3 text-zinc-500 shrink-0" />
        <span className="truncate flex-1 text-xs">{node.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node.relativePath); }}
          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer hover:bg-zinc-800 text-zinc-300"
        style={{ paddingLeft: depth * 12 + 6 }}
        onClick={() => onToggle(node.relativePath)}
      >
        {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <Folder className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
        <span className="truncate flex-1 text-xs">{node.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node.relativePath); }}
          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {isExpanded && node.children && node.children.map((child, i) => (
        <FileTree
          key={i}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onOpen={onOpen}
          onDelete={onDelete}
          selected={selected}
        />
      ))}
    </div>
  );
}

// ===== Terminal =====
export function Terminal() {
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [cwd, setCwd] = useState(".");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, running]);

  const runCommand = useCallback(async (cmd?: string) => {
    const command = (cmd ?? input).trim();
    if (!command || running) return;
    setInput("");
    setRunning(true);

    // Handle cd specially in the UI
    if (command.startsWith("cd ")) {
      const target = command.slice(3).trim();
      setCwd(target);
      setHistory((h) => [
        ...h,
        {
          id: `t-${Date.now()}`,
          command,
          stdout: "",
          stderr: "",
          exitCode: 0,
          durationMs: 0,
          timestamp: Date.now(),
        },
      ]);
      setRunning(false);
      return;
    }

    try {
      const res = await fetch("/api/ai/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, cwd, autoFix: true, context: "ui-terminal" }),
      });
      const data = await res.json();
      const entry: TerminalEntry = {
        id: `t-${Date.now()}`,
        command,
        stdout: data.result?.stdout || "",
        stderr: data.result?.stderr || "",
        exitCode: data.result?.exitCode ?? 1,
        durationMs: data.result?.durationMs ?? 0,
        autoFix: data.fix,
        timestamp: Date.now(),
      };
      setHistory((h) => [...h, entry]);
    } catch (e) {
      setHistory((h) => [
        ...h,
        {
          id: `t-${Date.now()}`,
          command,
          stdout: "",
          stderr: `Request failed: ${e instanceof Error ? e.message : "unknown"}`,
          exitCode: 1,
          durationMs: 0,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  }, [input, running, cwd]);

  const clearHistory = useCallback(() => setHistory([]), []);

  const QUICK_COMMANDS = [
    "ls -la",
    "pwd",
    "tree -L 2",
    "npm run lint",
    "npm test",
    "git status",
    "find . -name '*.ts' | head -20",
  ];

  return (
    <Card className="flex-1 flex flex-col bg-zinc-950 border-zinc-800 overflow-hidden min-h-[500px] lg:min-h-0 lg:h-[calc(100vh-260px)]">
      {/* Header */}
      <div className="p-2 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/50">
        <TerminalIcon className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-mono text-zinc-300">terminal</span>
        <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500 font-mono">
          {cwd}
        </Badge>
        <span className="ml-auto text-[10px] text-zinc-600">
          {history.length} command{history.length !== 1 ? "s" : ""}
        </span>
        <Button size="sm" variant="ghost" onClick={clearHistory} className="h-7 px-2 text-zinc-500 hover:text-rose-400">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-3">
        {history.length === 0 && !running && (
          <div className="text-zinc-600 text-center py-8">
            <TerminalIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Terminal ready. Type a command or pick one below.</p>
            <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
              {QUICK_COMMANDS.map((c) => (
                <button
                  key={c}
                  onClick={() => runCommand(c)}
                  className="text-[10px] px-2 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 text-zinc-400 hover:text-zinc-200"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {history.map((entry) => (
          <TerminalEntryView key={entry.id} entry={entry} />
        ))}
        {running && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
            <span>running...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-zinc-800 flex items-center gap-2 bg-zinc-900/50">
        <span className="text-emerald-400 font-mono text-xs shrink-0">$</span>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runCommand();
            if (e.key === "ArrowUp") {
              e.preventDefault();
              const last = history[history.length - 1];
              if (last) setInput(last.command);
            }
          }}
          placeholder="Type a command and press Enter..."
          className="flex-1 bg-transparent border-0 text-zinc-100 font-mono text-xs focus-visible:ring-0 px-0"
          spellCheck={false}
        />
      </div>
    </Card>
  );
}

function TerminalEntryView({ entry }: { entry: TerminalEntry }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-emerald-400">$</span>
        <span className="text-zinc-200">{entry.command}</span>
        <span className="ml-auto text-[10px] text-zinc-600">{entry.durationMs}ms</span>
        {entry.exitCode === 0 ? (
          <CheckCircle className="w-3 h-3 text-emerald-500" />
        ) : (
          <XCircle className="w-3 h-3 text-rose-500" />
        )}
      </div>
      {entry.stdout && (
        <pre className="text-zinc-300 whitespace-pre-wrap break-all">{entry.stdout}</pre>
      )}
      {entry.stderr && (
        <pre className="text-rose-400/80 whitespace-pre-wrap break-all">{entry.stderr}</pre>
      )}
      {entry.autoFix?.applied && (
        <div className="mt-1 p-2 rounded border border-amber-500/30 bg-amber-500/5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <AlertTriangle className="w-3 h-3" />
            AUTO-FIX APPLIED
          </div>
          <div className="text-zinc-300">
            <span className="text-zinc-500">Fix:</span> {entry.autoFix.fixDescription}
          </div>
          <div className="text-zinc-300">
            <span className="text-zinc-500">Ran:</span>{" "}
            <code className="text-amber-400">{entry.autoFix.fixCommand}</code>
          </div>
          {entry.autoFix.learnedFrom && (
            <div className="text-[10px] text-zinc-500 italic">{entry.autoFix.learnedFrom}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== Mistakes (Learning Log) =====
export function MistakesLog() {
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/mistakes");
      const data = await res.json();
      setMistakes(data.mistakes || []);
    } catch {
      toast.error("Failed to load mistakes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    if (!confirm("Clear all learned mistakes?")) return;
    try {
      await fetch("/api/ai/mistakes", { method: "DELETE" });
      toast.success("Mistakes cleared");
      refresh();
    } catch {
      toast.error("Failed to clear");
    }
  }, [refresh]);

  return (
    <Card className="flex-1 flex flex-col bg-zinc-900/50 border-zinc-800 overflow-hidden min-h-[500px] lg:min-h-0 lg:h-[calc(100vh-260px)]">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Learned Mistakes
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {mistakes.length} mistake{mistakes.length !== 1 ? "s" : ""} the AI has encountered and learned from
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={clearAll} className="text-zinc-500 hover:text-rose-400">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-zinc-600">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" />
            </div>
          ) : mistakes.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-sm">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No mistakes learned yet.</p>
              <p className="text-xs mt-1 text-zinc-700">
                When the AI hits errors in the terminal, it learns how to fix them.
              </p>
            </div>
          ) : (
            mistakes.map((m) => (
              <div key={m.id} className="p-3 rounded-lg border border-zinc-800 bg-zinc-950">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-500 mb-0.5">Context</div>
                    <code className="text-xs text-zinc-300 break-all">{m.context}</code>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                      ×{m.occurrenceCount}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        m.successRate > 0.7
                          ? "border-emerald-500/30 text-emerald-400"
                          : m.successRate > 0.4
                          ? "border-amber-500/30 text-amber-400"
                          : "border-rose-500/30 text-rose-400"
                      }`}
                    >
                      {Math.round(m.successRate * 100)}%
                    </Badge>
                  </div>
                </div>
                <Separator className="my-2 bg-zinc-800" />
                <div className="space-y-1.5 text-xs">
                  <div>
                    <div className="text-zinc-500 mb-0.5">Error</div>
                    <pre className="text-rose-400/80 whitespace-pre-wrap break-all max-h-20 overflow-y-auto">
                      {m.errorOutput.slice(0, 300)}
                      {m.errorOutput.length > 300 ? "..." : ""}
                    </pre>
                  </div>
                  <div>
                    <div className="text-zinc-500 mb-0.5">Fix Applied</div>
                    <code className="text-emerald-400 break-all">{m.fixApplied}</code>
                  </div>
                  {m.fixDescription && (
                    <div className="text-zinc-400 italic">{m.fixDescription}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

// ===== Git Panel =====
interface GitStatusInfo {
  initialized: boolean;
  branch: string | null;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  ahead: number;
  behind: number;
}

interface GitCommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export function GitPanel() {
  const [status, setStatus] = useState<GitStatusInfo | null>(null);
  const [log, setLog] = useState<GitCommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [commitMsg, setCommitMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        fetch("/api/ai/git?action=status").then((r) => r.json()),
        fetch("/api/ai/git?action=log").then((r) => r.json()),
      ]);
      setStatus(s.status);
      setLog(l.log || []);
    } catch {
      toast.error("Failed to load git status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doInit = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/ai/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" }),
      });
      toast.success("Git initialized");
      refresh();
    } catch {
      toast.error("Init failed");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const doAddAll = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add" }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Staged all changes");
        refresh();
      } else {
        toast.error(data.message || "Stage failed");
      }
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const doCommit = useCallback(async () => {
    if (!commitMsg.trim()) {
      toast.error("Enter a commit message");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/ai/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", message: commitMsg }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Committed: ${data.hash || ""}`);
        setCommitMsg("");
        refresh();
      } else {
        toast.error(data.message || "Commit failed");
      }
    } finally {
      setBusy(false);
    }
  }, [commitMsg, refresh]);

  if (loading) {
    return (
      <Card className="flex-1 flex items-center justify-center bg-zinc-900/50 border-zinc-800 min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
      </Card>
    );
  }

  if (!status?.initialized) {
    return (
      <Card className="flex-1 flex flex-col items-center justify-center bg-zinc-900/50 border-zinc-800 min-h-[400px] p-6">
        <GitBranch className="w-12 h-12 text-zinc-700 mb-3" />
        <p className="text-zinc-400 mb-4 text-center">Git is not initialized in the workspace</p>
        <Button onClick={doInit} disabled={busy} className="bg-gradient-to-r from-amber-500 to-rose-500 text-white">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <GitBranch className="w-4 h-4 mr-2" />}
          Initialize Git
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-[400px] lg:h-[calc(100vh-260px)]">
      {/* Status + Commit */}
      <Card className="lg:w-1/2 flex flex-col bg-zinc-900/50 border-zinc-800 overflow-hidden">
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">{status.branch || "main"}</span>
          {status.ahead > 0 && (
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
              ↑{status.ahead}
            </Badge>
          )}
          {status.behind > 0 && (
            <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-400">
              ↓{status.behind}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={refresh} className="ml-auto h-7 px-2 text-zinc-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3 text-xs">
            {status.staged.length > 0 && (
              <div>
                <div className="text-[10px] text-emerald-400 uppercase font-semibold mb-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Staged ({status.staged.length})
                </div>
                {status.staged.map((f, i) => (
                  <div key={i} className="px-2 py-0.5 text-zinc-300 font-mono">+ {f}</div>
                ))}
              </div>
            )}
            {status.modified.length > 0 && (
              <div>
                <div className="text-[10px] text-amber-400 uppercase font-semibold mb-1 flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Modified ({status.modified.length})
                </div>
                {status.modified.map((f, i) => (
                  <div key={i} className="px-2 py-0.5 text-zinc-300 font-mono">M {f}</div>
                ))}
              </div>
            )}
            {status.untracked.length > 0 && (
              <div>
                <div className="text-[10px] text-sky-400 uppercase font-semibold mb-1 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Untracked ({status.untracked.length})
                </div>
                {status.untracked.map((f, i) => (
                  <div key={i} className="px-2 py-0.5 text-zinc-400 font-mono">? {f}</div>
                ))}
              </div>
            )}
            {status.deleted.length > 0 && (
              <div>
                <div className="text-[10px] text-rose-400 uppercase font-semibold mb-1 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Deleted ({status.deleted.length})
                </div>
                {status.deleted.map((f, i) => (
                  <div key={i} className="px-2 py-0.5 text-zinc-300 font-mono">- {f}</div>
                ))}
              </div>
            )}
            {status.staged.length === 0 && status.modified.length === 0 && status.untracked.length === 0 && status.deleted.length === 0 && (
              <div className="text-zinc-600 text-center py-4">Working tree clean</div>
            )}
          </div>
        </ScrollArea>

        {/* Commit box */}
        <div className="p-3 border-t border-zinc-800 space-y-2">
          <Input
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Commit message..."
            className="bg-zinc-950 border-zinc-800 text-xs"
            onKeyDown={(e) => e.key === "Enter" && doCommit()}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={doAddAll} disabled={busy} className="flex-1 border-zinc-800 bg-zinc-900 text-xs">
              {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
              Stage All
            </Button>
            <Button size="sm" onClick={doCommit} disabled={busy || !commitMsg.trim()} className="flex-1 bg-gradient-to-r from-amber-500 to-rose-500 text-white text-xs">
              {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <GitCommit className="w-3 h-3 mr-1" />}
              Commit
            </Button>
          </div>
        </div>
      </Card>

      {/* Commit log */}
      <Card className="lg:w-1/2 flex flex-col bg-zinc-900/50 border-zinc-800 overflow-hidden">
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">Commit History</span>
          <span className="text-[10px] text-zinc-600 ml-auto">{log.length} commits</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {log.length === 0 ? (
              <div className="text-zinc-600 text-center py-8 text-xs">No commits yet</div>
            ) : (
              log.map((c, i) => (
                <div key={i} className="p-2 rounded border border-zinc-800 bg-zinc-950 hover:border-zinc-700">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-[10px] text-amber-400 font-mono">{c.hash}</code>
                    <span className="text-[10px] text-zinc-600 ml-auto">{c.date}</span>
                  </div>
                  <div className="text-xs text-zinc-200 truncate">{c.message}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{c.author}</div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ===== Dev Server Panel =====
interface RunningServerInfo {
  id: string;
  name: string;
  cwd: string;
  command: string;
  pid: number;
  startedAt: string;
  status: "running" | "stopped" | "crashed";
  port?: number;
  logs: string[];
}

export function DevServerPanel() {
  const [servers, setServers] = useState<RunningServerInfo[]>([]);
  const [path, setPath] = useState(".");
  const [customCmd, setCustomCmd] = useState("");
  const [detected, setDetected] = useState<{ command: string; port?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/devserver?action=list");
      const data = await res.json();
      setServers(data.servers || []);
      if (!selectedId && data.servers?.length > 0) {
        setSelectedId(data.servers[0].id);
      }
    } catch {
      // ignore
    }
  }, [selectedId]);

  const detectCmd = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/devserver?action=detect&path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setDetected(data.command);
    } catch {
      // ignore
    }
  }, [path]);

  useEffect(() => {
    refresh();
    detectCmd();
    const interval = setInterval(() => {
      refresh();
      if (selectedId) {
        fetchLogs(selectedId);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [refresh, detectCmd, selectedId]);

  const [currentLogs, setCurrentLogs] = useState<string[]>([]);

  const fetchLogs = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/ai/devserver?action=logs&id=${id}`);
      const data = await res.json();
      setCurrentLogs(data.logs || []);
    } catch {
      // ignore
    }
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/devserver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", path, command: customCmd || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        setSelectedId(data.server?.id);
        await refresh();
      } else {
        toast.error(data.message);
      }
    } finally {
      setBusy(false);
    }
  }, [path, customCmd, refresh]);

  const stop = useCallback(async (id: string) => {
    try {
      await fetch("/api/ai/devserver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", id }),
      });
      toast.success("Server stopped");
      setSelectedId(null);
      refresh();
    } catch {
      toast.error("Stop failed");
    }
  }, [refresh]);

  const selectedServer = servers.find((s) => s.id === selectedId);

  return (
    <Card className="flex-1 flex flex-col bg-zinc-950 border-zinc-800 overflow-hidden min-h-[400px] lg:h-[calc(100vh-260px)]">
      <div className="p-3 border-b border-zinc-800">
        <div className="flex items-center gap-2 mb-3">
          <Play className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold">Dev Servers</span>
          <Button variant="ghost" size="sm" onClick={refresh} className="ml-auto h-7 px-2 text-zinc-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Project path</label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onBlur={detectCmd}
              placeholder="my-app"
              className="bg-zinc-900 border-zinc-800 text-xs h-8"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Command {detected && <span className="text-amber-400 normal-case">(detected: {detected.command})</span>}
            </label>
            <Input
              value={customCmd}
              onChange={(e) => setCustomCmd(e.target.value)}
              placeholder={detected?.command || "npm run dev"}
              className="bg-zinc-900 border-zinc-800 text-xs h-8"
            />
          </div>
          <Button size="sm" onClick={start} disabled={busy} className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white h-8">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Start
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Server list */}
        <div className="lg:w-56 border-r border-zinc-800 max-h-32 lg:max-h-none overflow-y-auto">
          {servers.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-600">No running servers</div>
          ) : (
            servers.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  fetchLogs(s.id);
                }}
                className={`w-full text-left p-2 border-b border-zinc-800 hover:bg-zinc-900 ${
                  selectedId === s.id ? "bg-zinc-900 border-l-2 border-l-amber-500" : ""
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    s.status === "running" ? "bg-emerald-500 animate-pulse" :
                    s.status === "crashed" ? "bg-rose-500" : "bg-zinc-600"
                  }`} />
                  <span className="text-xs font-medium truncate flex-1">{s.name}</span>
                  {s.port && <span className="text-[10px] text-zinc-500">:{s.port}</span>}
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5 truncate font-mono">{s.command}</div>
              </button>
            ))
          )}
        </div>

        {/* Logs */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedServer ? (
            <>
              <div className="p-2 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/50">
                <span className={`w-2 h-2 rounded-full ${
                  selectedServer.status === "running" ? "bg-emerald-500 animate-pulse" :
                  selectedServer.status === "crashed" ? "bg-rose-500" : "bg-zinc-600"
                }`} />
                <span className="text-xs font-mono truncate flex-1">{selectedServer.command}</span>
                <span className="text-[10px] text-zinc-600">pid: {selectedServer.pid}</span>
                {selectedServer.port && (
                  <a
                    href={`http://localhost:${selectedServer.port}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    :{selectedServer.port} ↗
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => stop(selectedServer.id)}
                  className="h-7 px-2 text-rose-400 hover:text-rose-300"
                >
                  <Square className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-0.5">
                {(currentLogs.length > 0 ? currentLogs : selectedServer.logs || []).slice(-100).map((line, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap break-all ${
                      line.startsWith("[err]") ? "text-rose-400" :
                      line.startsWith("[sys]") ? "text-amber-400" :
                      "text-zinc-300"
                    }`}
                  >
                    {line}
                  </div>
                ))}
                {(currentLogs.length === 0 && (selectedServer.logs || []).length === 0) && (
                  <div className="text-zinc-600 text-center py-4">No logs yet</div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
              <div className="text-center">
                <Play className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Start a dev server to see live logs</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ===== Rename Dialog =====
export function RenamePanel() {
  const [oldName, setOldName] = useState("");
  const [newName, setNewName] = useState("");
  const [scope, setScope] = useState(".");
  const [preview, setPreview] = useState<{
    result: { filesChanged: number; occurrences: number; changes: Array<{ file: string; count: number }> };
    samples: Array<{ file: string; before: string; after: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);

  const doPreview = useCallback(async () => {
    if (!oldName.trim() || !newName.trim()) return;
    setBusy(true);
    setApplied(false);
    try {
      const res = await fetch("/api/ai/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName, scope, preview: true }),
      });
      const data = await res.json();
      setPreview(data);
    } catch {
      toast.error("Preview failed");
    } finally {
      setBusy(false);
    }
  }, [oldName, newName, scope]);

  const doApply = useCallback(async () => {
    if (!oldName.trim() || !newName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName, scope, apply: true }),
      });
      const data = await res.json();
      if (data.applied !== undefined) {
        toast.success(`Renamed in ${data.applied} files (${data.occurrences} occurrences)`);
        setApplied(true);
      }
    } catch {
      toast.error("Rename failed");
    } finally {
      setBusy(false);
    }
  }, [oldName, newName, scope]);

  return (
    <Card className="flex-1 flex flex-col bg-zinc-900/50 border-zinc-800 overflow-hidden min-h-[400px] lg:h-[calc(100vh-260px)]">
      <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
        <Replace className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold">Rename Symbol Across Files</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Old name</label>
            <Input
              value={oldName}
              onChange={(e) => setOldName(e.target.value)}
              placeholder="oldFunctionName"
              className="bg-zinc-950 border-zinc-800 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider">New name</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="newFunctionName"
              className="bg-zinc-950 border-zinc-800 text-sm font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Scope (directory)</label>
          <Input
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="."
            className="bg-zinc-950 border-zinc-800 text-sm font-mono"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={doPreview}
            disabled={busy || !oldName.trim() || !newName.trim()}
            className="border-zinc-800 bg-zinc-900"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Search className="w-3.5 h-3.5 mr-1" />}
            Preview
          </Button>
          <Button
            size="sm"
            onClick={doApply}
            disabled={busy || !oldName.trim() || !newName.trim() || applied}
            className="bg-gradient-to-r from-amber-500 to-rose-500 text-white"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Replace className="w-3.5 h-3.5 mr-1" />}
            {applied ? "Applied" : "Apply Rename"}
          </Button>
        </div>
      </div>

      {preview && (
        <div className="flex-1 overflow-y-auto border-t border-zinc-800 p-3 space-y-3">
          <div className="text-xs text-zinc-400">
            <span className="text-amber-400 font-semibold">{preview.result.filesChanged}</span> files •{" "}
            <span className="text-emerald-400 font-semibold">{preview.result.occurrences}</span> occurrences
          </div>

          {preview.samples.length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Sample changes</div>
              {preview.samples.map((s, i) => (
                <div key={i} className="mb-2 p-2 rounded border border-zinc-800 bg-zinc-950">
                  <div className="text-[10px] text-zinc-500 mb-1 font-mono">{s.file}</div>
                  <div className="text-xs text-rose-400/80 font-mono line-through">{s.before}</div>
                  <div className="text-xs text-emerald-400 font-mono">{s.after}</div>
                </div>
              ))}
            </div>
          )}

          {preview.result.changes.length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">All affected files</div>
              {preview.result.changes.map((c, i) => (
                <div key={i} className="text-xs flex items-center justify-between py-0.5 px-1">
                  <code className="text-zinc-300">{c.file}</code>
                  <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                    {c.count}x
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {preview.result.filesChanged === 0 && (
            <div className="text-center text-zinc-600 text-sm py-4">
              No occurrences of &quot;{oldName}&quot; found
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ===== Skills Panel =====
interface SkillInfo {
  name: string;
  description: string;
  icon: string;
  category: string;
}

const SKILL_ICONS: Record<string, string> = {
  calculator: "🧮",
  search: "🔍",
  brain: "🧠",
  save: "💾",
  file: "📄",
  folder: "📁",
  terminal: "⚙️",
  clock: "🕐",
  code: "💻",
};

const CATEGORY_COLORS: Record<string, string> = {
  math: "border-amber-500/30 text-amber-400",
  search: "border-sky-500/30 text-sky-400",
  memory: "border-emerald-500/30 text-emerald-400",
  files: "border-violet-500/30 text-violet-400",
  terminal: "border-rose-500/30 text-rose-400",
  code: "border-pink-500/30 text-pink-400",
  utility: "border-zinc-500/30 text-zinc-400",
};

export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [testInput, setTestInput] = useState("");
  const [result, setResult] = useState<{ skill: string; output: string; success: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/skills");
      const data = await res.json();
      setSkills(data.skills || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const testSkill = useCallback(async () => {
    if (!testInput.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: testInput }),
      });
      const data = await res.json();
      setResult({
        skill: data.skill || "none",
        output: data.result?.output || "No output",
        success: data.result?.success || false,
      });
    } catch (e) {
      setResult({
        skill: "error",
        output: `Failed: ${e instanceof Error ? e.message : "unknown"}`,
        success: false,
      });
    } finally {
      setBusy(false);
    }
  }, [testInput]);

  // Group skills by category
  const grouped = skills.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, SkillInfo[]>);

  return (
    <Card className="flex-1 flex flex-col bg-zinc-900/50 border-zinc-800 overflow-hidden min-h-[400px] lg:h-[calc(100vh-260px)]">
      <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold">Mr Robot Skills</span>
        <span className="text-[10px] text-zinc-600 ml-auto">{skills.length} skills available</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Skill tester */}
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Test a skill</div>
          <div className="flex gap-2">
            <Input
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && testSkill()}
              placeholder="Try: calculate 5*3, what time is it, search for python..."
              className="bg-zinc-900 border-zinc-800 text-xs flex-1"
            />
            <Button size="sm" onClick={testSkill} disabled={busy} className="bg-gradient-to-r from-amber-500 to-rose-500 text-white">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Run"}
            </Button>
          </div>
          {result && (
            <div className={`mt-2 p-2 rounded border text-xs ${result.success ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
              <div className="text-zinc-400 mb-1">
                Skill: <span className="text-amber-400 font-mono">{result.skill}</span>
              </div>
              <pre className="text-zinc-300 whitespace-pre-wrap break-words">{result.output}</pre>
            </div>
          )}
        </div>

        {/* Skills grouped by category */}
        {loading ? (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
          </div>
        ) : (
          Object.entries(grouped).map(([category, catSkills]) => (
            <div key={category}>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">{category}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {catSkills.map((s) => (
                  <div
                    key={s.name}
                    className={`p-3 rounded-lg border bg-zinc-950 ${CATEGORY_COLORS[s.category] || "border-zinc-700"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{SKILL_ICONS[s.icon] || "🔧"}</span>
                      <code className="text-xs font-mono font-semibold">{s.name}</code>
                    </div>
                    <p className="text-[11px] text-zinc-400">{s.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
