/**
 * Skills System - Built from scratch
 *
 * Gives Mr Robot extensible skills (like Claude's tools).
 * Each skill is a module with a name, description, and execute function.
 * The brain can detect which skill to use based on the user's message,
 * and chain multiple skills together.
 *
 * Built-in skills:
 *   - calculator: evaluate math expressions
 *   - web_search: search Wikipedia + DuckDuckGo
 *   - knowledge_recall: look up stored facts
 *   - knowledge_store: save a new fact
 *   - file_read: read a file from the workspace
 *   - file_write: write a file to the workspace
 *   - file_list: list files in a directory
 *   - terminal_run: run a shell command
 *   - git_status: check git status
 *   - time_now: get current date/time
 *   - weather: (placeholder — needs API key for real weather)
 *   - translate: (placeholder — uses simple dictionary)
 *   - code_scaffold: scaffold a project
 *   - code_fix: analyze and fix code
 */

export interface Skill {
  name: string;
  description: string;
  // Returns whether this skill should handle the given input
  matches: (input: string) => boolean;
  // Execute the skill — returns the result text
  execute: (input: string, context?: SkillContext) => Promise<SkillResult>;
  // Extract the argument from the input (e.g. "calculate 5+3" → "5+3")
  extractArgs?: (input: string) => string;
  // Icon name for UI display
  icon: string;
  // Category for grouping
  category: "math" | "search" | "memory" | "files" | "terminal" | "code" | "utility";
}

export interface SkillContext {
  cwd?: string;
}

export interface SkillResult {
  success: boolean;
  output: string;
  data?: unknown;
  // Optional follow-up skill to chain
  nextSkill?: string;
  nextInput?: string;
}

// ============================================================
// BUILT-IN SKILLS
// ============================================================

import { detectMath, evaluateMath } from "./math-evaluator";
import { webSearch, summarizeResults } from "./web-search";
import { recallAbout, searchKnowledge, storeFact, extractFact, factToText } from "./knowledge-base";
import { readFile, writeFile, listDirectory, getTree } from "./file-system";
import { execute as execTerminal } from "./terminal";
import { generateCode } from "./code-engine";

// --- Calculator Skill ---
export const calculatorSkill: Skill = {
  name: "calculator",
  description: "Evaluate math expressions like 5+3, 12*7, sqrt(16)",
  icon: "calculator",
  category: "math",
  matches: (input) => {
    const lower = input.toLowerCase().trim();
    // Pure math expression
    if (/^[\d+\-*/().\s]+$/.test(lower) && /[+\-*/]/.test(lower)) return true;
    // "calculate X" or "what is X" where X is math
    if (/\b(?:calculate|compute|what(?:'s|s)?\s+is)\s+[\d+\-*/().\s]+\??$/i.test(input)) return true;
    return false;
  },
  extractArgs: (input) => {
    const m = input.match(/(?:calculate|compute|what(?:'s|s)?\s+is)\s+([\d+\-*/().\s]+)\??$/i);
    return m ? m[1].trim() : input.trim();
  },
  execute: async (input) => {
    const expr = calculatorSkill.extractArgs?.(input) || input;
    const result = evaluateMath(expr);
    if (result !== null) {
      return {
        success: true,
        output: `${expr} = ${result}`,
        data: { expression: expr, result },
      };
    }
    return {
      success: false,
      output: `I couldn't parse that math expression. Try something like "5 + 3" or "calculate 12 * 7".`,
    };
  },
};

// --- Web Search Skill ---
export const webSearchSkill: Skill = {
  name: "web_search",
  description: "Search the web (Wikipedia + DuckDuckGo) for information",
  icon: "search",
  category: "search",
  matches: (input) => {
    const lower = input.toLowerCase();
    return (
      /\b(search|look up|find|google|who|what|where|when|why|how|tell me about|explain)\b/.test(lower) &&
      !calculatorSkill.matches(input)
    );
  },
  extractArgs: (input) => {
    let q = input.trim();
    // Strip command prefixes
    q = q.replace(
      /^(?:please\s+)?(?:search(?:\s+for)?|look\s+up|find(?:\s+information\s+about)?|google|tell me about|tell me|explain|what is|what's|whats|who is|who's|whos|where is|when is|why is|how do|how does|how is|how are|from the web(?:\s+tell me)?(?:\s+who)?(?:\s+won)?)\s+/i,
      ""
    );
    q = q.replace(/^who\s+won\s+(?:the\s+)?/i, "");
    q = q.replace(/[?!.]+$/g, "").trim();
    q = q.replace(/^(?:the|a|an|is|are|was|were|did|do|does|can|could|would|should|will|about|of|in|on|at)\s+/i, "");
    return q.length > 1 ? q : input.replace(/[?!.]+$/g, "").trim();
  },
  execute: async (input) => {
    const query = webSearchSkill.extractArgs?.(input) || input;
    try {
      const results = await webSearch(query);
      if (results.length === 0) {
        return {
          success: false,
          output: `I searched for "${query}" but couldn't find any results. Try rephrasing or being more specific.`,
        };
      }
      const summary = summarizeResults(results.slice(0, 3), 800);
      const topSnippet = results[0]?.snippet || results[0]?.content || "";
      let output = `Here's what I found about "${query}":\n\n${summary}`;
      if (topSnippet && topSnippet.length > 50) {
        output += `\n\nMost relevant: "${topSnippet.slice(0, 250)}${topSnippet.length > 250 ? "..." : ""}"`;
      }
      return {
        success: true,
        output,
        data: { query, results },
      };
    } catch (e) {
      return {
        success: false,
        output: `Web search failed: ${e instanceof Error ? e.message : "unknown error"}`,
      };
    }
  },
};

// --- Knowledge Recall Skill ---
export const recallSkill: Skill = {
  name: "knowledge_recall",
  description: "Look up facts stored in memory",
  icon: "brain",
  category: "memory",
  matches: (input) => {
    return /\b(?:what do you (?:know|remember)|recall|do you remember)\b/i.test(input);
  },
  extractArgs: (input) => {
    const m = input.match(/(?:what do you (?:know|remember) (?:about|of)|recall(?:\s+about)?)\s+(.+?)\??$/i);
    return m ? m[1].trim() : "";
  },
  execute: async (input) => {
    const subject = recallSkill.extractArgs?.(input) || "";
    if (!subject) {
      return { success: false, output: "What subject would you like me to recall?" };
    }
    try {
      const facts = await recallAbout(subject);
      if (facts.length === 0) {
        return {
          success: false,
          output: `I don't have any stored facts about ${subject} yet. You can teach me by saying "remember that ${subject} is..." or ask me to search the web.`,
          nextSkill: "web_search",
          nextInput: subject,
        };
      }
      const texts = await Promise.all(facts.map(factToText));
      return {
        success: true,
        output: `Here's what I know about ${subject}:\n\n${texts.join("\n")}`,
        data: { subject, facts },
      };
    } catch (e) {
      return { success: false, output: `Recall failed: ${e instanceof Error ? e.message : "unknown"}` };
    }
  },
};

// --- Knowledge Store Skill ---
export const rememberSkill: Skill = {
  name: "knowledge_store",
  description: "Store a new fact in memory",
  icon: "save",
  category: "memory",
  matches: (input) => {
    return /\b(?:remember that|note that|save this|remember)\b/i.test(input);
  },
  extractArgs: (input) => {
    const m = input.match(/(?:remember that|note that|save this:?)\s+(.+)$/i);
    return m ? m[1].trim() : input.replace(/^remember\s+/i, "").trim();
  },
  execute: async (input) => {
    const factText = rememberSkill.extractArgs?.(input) || input;
    const fact = extractFact(factText);
    if (!fact) {
      // Store as a general note
      try {
        await storeFact({ subject: "note", predicate: "is", object: factText.toLowerCase() });
        return { success: true, output: `Okay, I've noted that: ${factText}` };
      } catch (e) {
        return { success: false, output: `I tried to save that but the database failed.` };
      }
    }
    try {
      await storeFact(fact);
      const text = await factToText(fact);
      return {
        success: true,
        output: `Got it! I'll remember that ${text}`,
        data: { fact },
      };
    } catch (e) {
      return { success: false, output: `I extracted the fact but couldn't save it: ${e instanceof Error ? e.message : "unknown"}` };
    }
  },
};

// --- File Read Skill ---
export const fileReadSkill: Skill = {
  name: "file_read",
  description: "Read a file from the workspace",
  icon: "file",
  category: "files",
  matches: (input) => {
    return /\b(?:read|show|open|cat)\s+(?:file\s+)?[\w./-]+\.[a-z]+/i.test(input);
  },
  extractArgs: (input) => {
    const m = input.match(/(?:read|show|open|cat)\s+(?:file\s+)?([\w./-]+\.[a-z]+)/i);
    return m ? m[1] : "";
  },
  execute: async (input) => {
    const filePath = fileReadSkill.extractArgs?.(input) || "";
    if (!filePath) return { success: false, output: "Which file would you like me to read?" };
    try {
      const content = await readFile(filePath);
      const truncated = content.length > 2000 ? content.slice(0, 2000) + "\n\n... [truncated]" : content;
      return {
        success: true,
        output: `Contents of ${filePath}:\n\n${truncated}`,
        data: { path: filePath, content },
      };
    } catch (e) {
      return { success: false, output: `Couldn't read ${filePath}: ${e instanceof Error ? e.message : "unknown"}` };
    }
  },
};

// --- File List Skill ---
export const fileListSkill: Skill = {
  name: "file_list",
  description: "List files in the workspace",
  icon: "folder",
  category: "files",
  matches: (input) => {
    return /\b(?:list|ls|show files|show directory)\b/i.test(input);
  },
  execute: async (_input) => {
    try {
      const nodes = await listDirectory(".");
      if (nodes.length === 0) {
        return { success: true, output: "The workspace is empty." };
      }
      const listing = nodes
        .map((n) => `${n.type === "directory" ? "[DIR] " : "      "} ${n.name}`)
        .join("\n");
      return {
        success: true,
        output: `Files in workspace:\n\n${listing}`,
        data: { nodes },
      };
    } catch (e) {
      return { success: false, output: `Couldn't list files: ${e instanceof Error ? e.message : "unknown"}` };
    }
  },
};

// --- Terminal Run Skill ---
export const terminalSkill: Skill = {
  name: "terminal_run",
  description: "Run a shell command in the workspace",
  icon: "terminal",
  category: "terminal",
  matches: (input) => {
    const lower = input.toLowerCase().trim();
    return /^(run|execute|exec)\s+/i.test(lower) || /^(npm|npx|bun|node|python|pip|git|ls|cat|echo|mkdir|cd|tsc|eslint)\b/i.test(lower);
  },
  extractArgs: (input) => {
    let cmd = input.trim();
    const m = cmd.match(/^(?:run|execute|exec)\s+(.+)/i);
    if (m) cmd = m[1].trim();
    cmd = cmd.replace(/^["'`]|["'`]$/g, "");
    return cmd;
  },
  execute: async (input, context) => {
    const cmd = terminalSkill.extractArgs?.(input) || input;
    try {
      const result = await execTerminal(cmd, { cwd: context?.cwd, timeout: 60000 });
      if (result.exitCode === 0) {
        const out = result.stdout.trim() || "(no output)";
        return {
          success: true,
          output: `✓ Command succeeded: \`${cmd}\`\n\n\`\`\`\n${out.slice(0, 1500)}\n\`\`\``,
          data: result,
        };
      }
      return {
        success: false,
        output: `✗ Command failed: \`${cmd}\` (exit ${result.exitCode})\n\n\`\`\`\n${result.stderr.slice(0, 1000)}\n\`\`\``,
        data: result,
      };
    } catch (e) {
      return { success: false, output: `Command failed: ${e instanceof Error ? e.message : "unknown"}` };
    }
  },
};

// --- Time Skill ---
export const timeSkill: Skill = {
  name: "time_now",
  description: "Get the current date and time",
  icon: "clock",
  category: "utility",
  matches: (input) => {
    return /\b(?:what time|what's the time|whats the time|current time|what day|what's the date|today's date)\b/i.test(input);
  },
  execute: async () => {
    const now = new Date();
    return {
      success: true,
      output: `It's currently ${now.toLocaleString()} (${now.toISOString()}).`,
      data: { iso: now.toISOString() },
    };
  },
};

// --- Code Scaffold Skill ---
export const codeScaffoldSkill: Skill = {
  name: "code_scaffold",
  description: "Scaffold a new project (React, Next.js, Vue, Angular, etc.)",
  icon: "code",
  category: "code",
  matches: (input) => {
    return /\b(?:scaffold|create a (?:react|next|vue|angular|svelte|express|flask|django|fastapi|odoo|electron|tauri|remix|astro|solid))\b/i.test(input);
  },
  execute: async (input) => {
    try {
      const result = await generateCode(input);
      return {
        success: true,
        output: `${result.explanation}\n\n**Files created:** ${result.files.length}\n**Next steps:**\n${result.nextSteps.map((s) => `  $ ${s}`).join("\n")}`,
        data: result,
      };
    } catch (e) {
      return { success: false, output: `Scaffolding failed: ${e instanceof Error ? e.message : "unknown"}` };
    }
  },
};

// ============================================================
// SKILL REGISTRY
// ============================================================

export const ALL_SKILLS: Skill[] = [
  // Order matters — more specific skills first
  calculatorSkill,
  timeSkill,           // check before web_search (so "what time" doesn't trigger search)
  rememberSkill,       // check before web_search (so "remember" doesn't trigger search)
  recallSkill,         // check before web_search (so "what do you know" doesn't trigger search)
  codeScaffoldSkill,   // check before web_search
  terminalSkill,       // check before web_search
  fileReadSkill,       // check before web_search
  fileListSkill,       // check before web_search
  webSearchSkill,      // fallback for questions
];

/**
 * Find the best skill for a given input.
 * Returns the first skill that matches.
 */
export function findSkill(input: string): Skill | null {
  for (const skill of ALL_SKILLS) {
    if (skill.matches(input)) {
      return skill;
    }
  }
  return null;
}

/**
 * List all available skills (for UI display).
 */
export function listSkills(): Array<{
  name: string;
  description: string;
  icon: string;
  category: string;
}> {
  return ALL_SKILLS.map((s) => ({
    name: s.name,
    description: s.description,
    icon: s.icon,
    category: s.category,
  }));
}

/**
 * Execute a skill by name.
 */
export async function executeSkill(
  skillName: string,
  input: string,
  context?: SkillContext
): Promise<SkillResult> {
  const skill = ALL_SKILLS.find((s) => s.name === skillName);
  if (!skill) {
    return { success: false, output: `Unknown skill: ${skillName}` };
  }
  return skill.execute(input, context);
}
