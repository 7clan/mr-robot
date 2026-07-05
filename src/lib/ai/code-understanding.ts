/**
 * Code Understanding — Built from scratch
 *
 * Parses code, extracts structure, finds bugs, explains logic.
 * Uses a from-scratch AST-like parser (not a full parser, but good enough for analysis).
 *
 * Also includes the code execution sandbox (#9):
 *   write → run → debug → fix loop
 */

import { readFile, writeFile } from "./file-system";
import { execute as execTerminal } from "./terminal";

export interface CodeAnalysis {
  language: string;
  lines: number;
  functions: Array<{ name: string; params: string[]; line: number }>;
  classes: Array<{ name: string; methods: string[]; line: number }>;
  imports: string[];
  exports: string[];
  issues: Array<{ type: string; line: number; description: string; severity: "error" | "warning" | "info" }>;
  complexity: number;
  summary: string;
}

/**
 * Analyze a code file.
 */
export async function analyzeCode(filePath: string): Promise<CodeAnalysis> {
  let content = "";
  try {
    content = await readFile(filePath);
  } catch {
    return {
      language: "unknown",
      lines: 0,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      issues: [],
      complexity: 0,
      summary: "Could not read file.",
    };
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const language = detectLanguage(ext);
  const lines = content.split("\n");

  return {
    language,
    lines: lines.length,
    functions: extractFunctions(content, language),
    classes: extractClasses(content, language),
    imports: extractImports(content, language),
    exports: extractExports(content, language),
    issues: findIssues(content, language),
    complexity: calculateComplexity(content),
    summary: summarizeCode(content, language),
  };
}

function detectLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    c: "c", cpp: "cpp", cs: "csharp", php: "php", swift: "swift",
    html: "html", css: "css", scss: "scss", json: "json", yml: "yaml",
    sh: "shell", sql: "sql", vue: "vue", svelte: "svelte",
  };
  return map[ext] || "text";
}

function extractFunctions(content: string, lang: string): Array<{ name: string; params: string[]; line: number }> {
  const functions: Array<{ name: string; params: string[]; line: number }> = [];
  const lines = content.split("\n");

  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,      // JS/TS
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g, // Arrow functions
    /def\s+(\w+)\s*\(([^)]*)\)/g,                                        // Python
    /func\s+(\w+)\s*\(([^)]*)\)/g,                                       // Go
    /fn\s+(\w+)\s*\(([^)]*)\)/g,                                         // Rust
    /(public|private|protected)?\s*(?:static\s+)?(\w+)\s*\(([^)]*)\)\s*\{/g, // Java/C#
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(lines[i])) !== null) {
        const name = match[1] || match[2] || "anonymous";
        const params = (match[2] || match[3] || "").split(",").map((p: string) => p.trim()).filter(Boolean);
        functions.push({ name, params, line: i + 1 });
      }
    }
  }

  return functions;
}

function extractClasses(content: string, lang: string): Array<{ name: string; methods: string[]; line: number }> {
  const classes: Array<{ name: string; methods: string[]; line: number }> = [];
  const lines = content.split("\n");

  const patterns = [
    /class\s+(\w+)/g,
    /export\s+class\s+(\w+)/g,
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(lines[i])) !== null) {
        const className = match[1];
        // Find methods within the class (next ~50 lines)
        const methods: string[] = [];
        for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
          const methodMatch = lines[j].match(/(?:public|private|protected)?\s*(\w+)\s*\([^)]*\)\s*\{/);
          if (methodMatch) methods.push(methodMatch[1]);
        }
        classes.push({ name: className, methods, line: i + 1 });
      }
    }
  }

  return classes;
}

function extractImports(content: string, lang: string): string[] {
  const imports: string[] = [];
  const patterns = [
    /import\s+(?:\{[^}]+\}|\w+)\s+from\s+["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /from\s+(\w+)\s+import/g,
    /import\s+(\w+)/g,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, "g");
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!imports.includes(match[1])) imports.push(match[1]);
    }
  }

  return imports;
}

function extractExports(content: string, lang: string): string[] {
  const exports: string[] = [];
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /export\s+class\s+(\w+)/g,
    /export\s+default\s+(\w+)/g,
    /export\s+\{([^}]+)\}/g,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, "g");
    let match;
    while ((match = regex.exec(content)) !== null) {
      const names = match[1].split(",").map((s: string) => s.trim().split(/\s+as\s+/)[0]);
      exports.push(...names);
    }
  }

  return [...new Set(exports)];
}

function findIssues(content: string, lang: string): Array<{ type: string; line: number; description: string; severity: "error" | "warning" | "info" }> {
  const issues: Array<{ type: string; line: number; description: string; severity: "error" | "warning" | "info" }> = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // var usage
    if (/\bvar\s+/.test(line)) {
      issues.push({ type: "var_usage", line: i + 1, description: "Uses 'var' instead of 'let' or 'const'", severity: "warning" });
    }
    // Loose equality
    if (/[!=]==[^=]/.test(line) && !/[!=]===[^=]/.test(line)) {
      issues.push({ type: "loose_equality", line: i + 1, description: "Uses loose equality (== or !=)", severity: "warning" });
    }
    // console.log
    if (/console\.log\s*\(/.test(line)) {
      issues.push({ type: "console_log", line: i + 1, description: "console.log statement", severity: "info" });
    }
    // Empty catch
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
      issues.push({ type: "empty_catch", line: i + 1, description: "Empty catch block silently swallows errors", severity: "warning" });
    }
    // any type
    if (/:\s*any\b/.test(line)) {
      issues.push({ type: "any_type", line: i + 1, description: "Uses 'any' type — loses type safety", severity: "info" });
    }
    // TODO/FIXME
    if (/\/\/\s*(TODO|FIXME|XXX|HACK)/i.test(line)) {
      issues.push({ type: "todo", line: i + 1, description: "Has TODO/FIXME comment", severity: "info" });
    }
    // Hardcoded secrets
    if (/(api[_-]?key|password|secret)\s*[:=]\s*["'][^"']+["']/i.test(lower)) {
      issues.push({ type: "hardcoded_secret", line: i + 1, description: "Possible hardcoded secret/password", severity: "error" });
    }
    // Missing semicolons (JS/TS)
    if (lang === "javascript" || lang === "typescript") {
      if (/^\s*\w+\s*=\s*[^;{}\n]+$/.test(line) && !line.trim().endsWith(";") && !line.trim().endsWith("{") && !line.trim().endsWith(",")) {
        // Skip — too noisy
      }
    }
  }

  return issues;
}

function calculateComplexity(content: string): number {
  let complexity = 1;
  const complexityPatterns = [
    /\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g,
    /\bcase\s+/g, /\bcatch\s*\(/g, /\b&&\b/g, /\b\|\|\b/g, /\?\s*[^:]+:/g,
  ];
  for (const pattern of complexityPatterns) {
    const matches = content.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

function summarizeCode(content: string, lang: string): string {
  const functions = extractFunctions(content, lang);
  const classes = extractClasses(content, lang);
  const imports = extractImports(content, lang);
  const exports = extractExports(content, lang);
  const issues = findIssues(content, lang);
  const complexity = calculateComplexity(content);

  const parts: string[] = [];
  parts.push(`${content.split("\n").length} lines of ${lang}`);
  if (imports.length > 0) parts.push(`${imports.length} imports`);
  if (functions.length > 0) parts.push(`${functions.length} functions (${functions.slice(0, 3).map((f) => f.name).join(", ")}${functions.length > 3 ? "..." : ""})`);
  if (classes.length > 0) parts.push(`${classes.length} classes`);
  if (exports.length > 0) parts.push(`${exports.length} exports`);
  if (issues.length > 0) parts.push(`${issues.length} issues (${issues.filter((i) => i.severity === "error").length} errors)`);
  parts.push(`complexity: ${complexity}`);

  return parts.join(", ");
}

/**
 * Code Execution Sandbox — write → run → debug → fix loop
 */
export async function executeCodeSandbox(
  code: string,
  language: string = "javascript"
): Promise<{
  success: boolean;
  output: string;
  error: string | null;
  iterations: number;
}> {
  let iterations = 0;
  const maxIterations = 3;
  let currentCode = code;
  let lastError = "";

  while (iterations < maxIterations) {
    iterations++;

    // Write code to a temp file
    const ext = language === "python" ? "py" : "js";
    const fileName = `sandbox_${Date.now()}.${ext}`;
    try {
      await writeFile(fileName, currentCode);

      // Run the code
      const cmd = language === "python" ? `python ${fileName}` : `node ${fileName}`;
      const result = await execTerminal(cmd, { timeout: 10000 });

      if (result.exitCode === 0) {
        return {
          success: true,
          output: result.stdout,
          error: null,
          iterations,
        };
      }

      // Code failed — try to fix
      lastError = result.stderr;
      const fixed = autoFixCode(currentCode, lastError, language);
      if (fixed === currentCode) {
        // Couldn't fix — return error
        return {
          success: false,
          output: result.stdout,
          error: lastError,
          iterations,
        };
      }
      currentCode = fixed;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "unknown error";
      return {
        success: false,
        output: "",
        error: lastError,
        iterations,
      };
    }
  }

  return {
    success: false,
    output: "",
    error: `Failed after ${maxIterations} iterations. Last error: ${lastError}`,
    iterations,
  };
}

/**
 * Attempt to automatically fix code errors.
 */
function autoFixCode(code: string, error: string, language: string): string {
  let fixed = code;

  // Fix missing semicolons
  if (error.includes("Unexpected token") || error.includes("SyntaxError")) {
    fixed = fixed.replace(/(\w+)\n/g, "$1;\n");
  }

  // Fix undefined variable (add const)
  const undefMatch = error.match(/(\w+) is not defined/);
  if (undefMatch) {
    fixed = `const ${undefMatch[1]} = undefined; // TODO: define properly\n` + fixed;
  }

  // Fix module not found
  const moduleMatch = error.match(/Cannot find module ['"]([^'"]+)['"]/);
  if (moduleMatch) {
    // Can't auto-install in sandbox, but note it
    fixed = `// TODO: npm install ${moduleMatch[1]}\n` + fixed;
  }

  return fixed;
}
