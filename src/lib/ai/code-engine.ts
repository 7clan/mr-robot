/**
 * Code Engine - Built from scratch
 *
 * Generates code in any language/framework. Detects intent from natural language
 * and produces working code, full projects, or modifications to existing files.
 *
 * All code generation is rules + templates + pattern matching — no external AI APIs.
 * When stuck, it can search the web for documentation.
 */

import { FileOp, writeFile, readFile, fileExists } from "./file-system";

export type Framework =
  | "react"
  | "nextjs"
  | "remix"
  | "astro"
  | "solid"
  | "angular"
  | "vue"
  | "svelte"
  | "express"
  | "fastify"
  | "nestjs"
  | "node"
  | "python"
  | "flask"
  | "django"
  | "fastapi"
  | "odoo"
  | "reactnative"
  | "electron"
  | "tauri"
  | "vanilla"
  | "unknown";

export interface CodeRequest {
  raw: string;
  intent: CodeIntent;
  framework: Framework;
  language: string;
  componentName?: string;
  filePath?: string;
  description: string;
}

export type CodeIntent =
  | "create_component"
  | "create_page"
  | "create_api"
  | "create_hook"
  | "create_utility"
  | "create_test"
  | "create_model"
  | "scaffold_project"
  | "fix_code"
  | "refactor_code"
  | "explain_code"
  | "add_feature"
  | "remove_feature"
  | "unknown";

export interface CodeResult {
  files: FileOp[];
  explanation: string;
  framework: Framework;
  language: string;
  nextSteps: string[];
  warnings?: string[];
}

// ---------- Detection ----------

const FRAMEWORK_KEYWORDS: Record<Framework, string[]> = {
  react: ["react", "jsx", "tsx", "component", "hook", "useEffect", "useState"],
  nextjs: ["next.js", "nextjs", "next js", "app router", "use client", "use server"],
  remix: ["remix", "@remix-run", "loader", "action function"],
  astro: ["astro", "astrojs", ".astro", "astro island"],
  solid: ["solidjs", "solid.js", "solid js", "solid", "createSignal", "createMemo"],
  angular: ["angular", "ng-", "@component", "typescript angular", "service angular"],
  vue: ["vue", "vuejs", "vue js", ".vue", "composition api", "options api"],
  svelte: ["svelte", "sveltekit"],
  express: ["express", "express.js", "express js", "app.get", "app.post"],
  fastify: ["fastify"],
  nestjs: ["nestjs", "nest.js", "@module", "@controller"],
  node: ["node", "nodejs", "node js", "commonjs", "require("],
  python: ["python", "def ", "import "],
  flask: ["flask", "@app.route"],
  django: ["django", "models.model", "views.py"],
  fastapi: ["fastapi", "@app.get", "pydantic"],
  odoo: ["odoo", "models.model", "_inherit", "_name =", "fields."],
  reactnative: ["react native", "react-native", "reactnative", "expo", "react-native-config"],
  electron: ["electron", "electronjs", "electron js", "main process", "browserwindow"],
  tauri: ["tauri", "taurijs", "tauri app", "rust + web"],
  vanilla: ["html", "css", "vanilla js", "vanilla javascript"],
  unknown: [],
};

export function detectFramework(text: string): Framework {
  const lower = text.toLowerCase();
  // Check from most specific to least
  const order: Framework[] = [
    "nextjs", "remix", "astro", "solid", "angular", "vue", "svelte",
    "reactnative", "electron", "tauri", "react",
    "fastapi", "flask", "django", "odoo", "python",
    "nestjs", "fastify", "express", "node",
    "vanilla",
  ];
  for (const fw of order) {
    const keywords = FRAMEWORK_KEYWORDS[fw];
    if (keywords.some((k) => lower.includes(k))) return fw;
  }
  return "unknown";
}

export function detectIntent(text: string): CodeIntent {
  const lower = text.toLowerCase();
  if (/\b(scaffold|create (a |an |new )?(project|app|application))\b/.test(lower)) return "scaffold_project";
  if (/\b(fix|debug|repair|solve)\b/.test(lower)) return "fix_code";
  if (/\b(refactor|clean up|improve|optimize)\b/.test(lower)) return "refactor_code";
  if (/\b(explain|what does|how does)\b/.test(lower)) return "explain_code";
  if (/\b(add|implement|support)\b/.test(lower)) return "add_feature";
  if (/\b(remove|delete|strip)\b/.test(lower)) return "remove_feature";
  if (/\b(test|spec|unit test)\b/.test(lower)) return "create_test";
  if (/\b(model|schema|entity|database table)\b/.test(lower)) return "create_model";
  if (/\b(hook)\b/.test(lower)) return "create_hook";
  if (/\b(api|endpoint|route|controller)\b/.test(lower)) return "create_api";
  if (/\b(page|view|screen)\b/.test(lower)) return "create_page";
  if (/\b(util|helper|library|function)\b/.test(lower)) return "create_utility";
  if (/\b(component|widget|button|card|form|modal|dialog)\b/.test(lower)) return "create_component";
  return "unknown";
}

export function parseCodeRequest(text: string): CodeRequest {
  const framework = detectFramework(text);
  const intent = detectIntent(text);
  const language = inferLanguage(framework, text);

  // Try to extract component name
  let componentName: string | undefined;
  // "called X" / "named X" / "name X" — accept any alphanumeric+dash+underscore name
  const nameMatch = text.match(/(?:called|named|name(?:d)?)\s+["']?([a-zA-Z][a-zA-Z0-9_-]+)/i);
  if (nameMatch) {
    componentName = nameMatch[1];
  } else {
    // Try to extract from "create a X component" — only PascalCase names
    const cm = text.match(/(?:create|make|build|add|generate)\s+(?:a |an |the )?([A-Z][a-zA-Z0-9_]+)/);
    if (cm) componentName = cm[1];
  }

  // Try to extract file path
  let filePath: string | undefined;
  const pathMatch = text.match(/(?:in|to|file|path)\s+([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/);
  if (pathMatch) filePath = pathMatch[1];

  return {
    raw: text,
    intent,
    framework,
    language,
    componentName,
    filePath,
    description: text,
  };
}

function inferLanguage(fw: Framework, text: string): string {
  switch (fw) {
    case "react":
    case "nextjs":
    case "remix":
    case "astro":
    case "solid":
    case "angular":
    case "vue":
    case "svelte":
    case "nestjs":
    case "express":
    case "fastify":
    case "node":
    case "reactnative":
    case "electron":
      return "typescript";
    case "tauri":
      return "rust";
    case "python":
    case "flask":
    case "django":
    case "fastapi":
    case "odoo":
      return "python";
    case "vanilla":
      return /typescript|tsx|ts\b/.test(text.toLowerCase()) ? "typescript" : "javascript";
    default:
      return "typescript";
  }
}

// ---------- Component name helpers ----------

export function toPascalCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

export function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// ---------- Main entry ----------

export async function generateCode(text: string): Promise<CodeResult> {
  const req = parseCodeRequest(text);

  switch (req.intent) {
    case "scaffold_project":
      return scaffoldProject(req);
    case "create_component":
      return createComponent(req);
    case "create_page":
      return createPage(req);
    case "create_api":
      return createApi(req);
    case "create_hook":
      return createHook(req);
    case "create_utility":
      return createUtility(req);
    case "create_test":
      return createTest(req);
    case "create_model":
      return createModel(req);
    case "fix_code":
      return fixCode(req);
    case "refactor_code":
      return refactorCode(req);
    case "explain_code":
      return explainCode(req);
    case "add_feature":
      return addFeature(req);
    case "remove_feature":
      return removeFeature(req);
    default:
      return fallbackResponse(req);
  }
}

// ---------- Scaffolders ----------

async function scaffoldProject(req: CodeRequest): Promise<CodeResult> {
  const name = req.componentName || "my-app";
  const kebab = toKebabCase(name);
  switch (req.framework) {
    case "react":
      return scaffoldReact(kebab, req);
    case "nextjs":
      return scaffoldNextjs(kebab, req);
    case "remix":
      return scaffoldRemix(kebab, req);
    case "astro":
      return scaffoldAstro(kebab, req);
    case "solid":
      return scaffoldSolid(kebab, req);
    case "vue":
      return scaffoldVue(kebab, req);
    case "angular":
      return scaffoldAngular(kebab, req);
    case "svelte":
      return scaffoldSvelte(kebab, req);
    case "express":
      return scaffoldExpress(kebab, req);
    case "fastify":
      return scaffoldFastify(kebab, req);
    case "nestjs":
      return scaffoldNestjs(kebab, req);
    case "flask":
      return scaffoldFlask(kebab, req);
    case "django":
      return scaffoldDjango(kebab, req);
    case "fastapi":
      return scaffoldFastAPI(kebab, req);
    case "odoo":
      return scaffoldOdoo(kebab, req);
    case "reactnative":
      return scaffoldReactNative(kebab, req);
    case "electron":
      return scaffoldElectron(kebab, req);
    case "tauri":
      return scaffoldTauri(kebab, req);
    default:
      return scaffoldNode(kebab, req);
  }
}

function scaffoldReact(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/components` },
    { op: "mkdir", path: `${name}/src/hooks` },
    { op: "mkdir", path: `${name}/src/utils` },
    { op: "mkdir", path: `${name}/public` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
        lint: "eslint .",
        preview: "vite preview",
        test: "vitest",
      },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      },
      devDependencies: {
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.3.4",
        typescript: "^5.7.2",
        vite: "^6.0.3",
        vitest: "^2.1.7",
        "@testing-library/react": "^16.1.0",
        "@testing-library/jest-dom": "^6.6.3",
        eslint: "^9.17.0",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
      },
      include: ["src"],
    }, null, 2) },
    { op: "create", path: `${name}/vite.config.ts`, content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n  test: {\n    globals: true,\n    environment: "jsdom",\n    setupFiles: "./src/test-setup.ts",\n  },\n});\n` },
    { op: "create", path: `${name}/index.html`, content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${pascal}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n` },
    { op: "create", path: `${name}/src/main.tsx`, content: `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n` },
    { op: "create", path: `${name}/src/App.tsx`, content: reactComponentTemplate(pascal, "App") },
    { op: "create", path: `${name}/src/index.css`, content: `:root {\n  font-family: system-ui, sans-serif;\n  --bg: #0a0a0a;\n  --fg: #fafafa;\n}\n\n* { box-sizing: border-box; }\n\nbody {\n  margin: 0;\n  background: var(--bg);\n  color: var(--fg);\n}\n` },
    { op: "create", path: `${name}/src/components/${pascal}Welcome.tsx`, content: reactComponentTemplate(pascal, `${pascal}Welcome`) },
    { op: "create", path: `${name}/src/hooks/useCounter.ts`, content: reactHookTemplate("useCounter") },
    { op: "create", path: `${name}/src/utils/format.ts`, content: `export function formatDate(date: Date): string {\n  return date.toISOString().split("T")[0];\n}\n\nexport function classNames(...classes: (string | false | null | undefined)[]): string {\n  return classes.filter(Boolean).join(" ");\n}\n` },
    { op: "create", path: `${name}/src/test-setup.ts`, content: `import "@testing-library/jest-dom";\n` },
    { op: "create", path: `${name}/src/App.test.tsx`, content: `import { describe, it, expect } from "vitest";\nimport { render, screen } from "@testing-library/react";\nimport App from "./App";\n\ndescribe("App", () => {\n  it("renders without crashing", () => {\n    render(<App />);\n    expect(screen.getByText(/welcome/i)).toBeInTheDocument();\n  });\n});\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n.DS_Store\n*.local\n.env\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nA React + TypeScript app generated by the Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Scripts\n\n- \`npm run dev\` — start dev server\n- \`npm run build\` — build for production\n- \`npm test\` — run tests\n- \`npm run lint\` — lint\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a complete React + TypeScript + Vite project at \`${name}/\`. It includes TypeScript, Vite, Vitest for testing, ESLint, and a starter component + hook + utility.`,
    framework: "react",
    language: "typescript",
    nextSteps: [
      `cd ${name}`,
      "npm install",
      "npm run dev",
    ],
  };
}

function scaffoldNextjs(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/app` },
    { op: "mkdir", path: `${name}/src/components` },
    { op: "mkdir", path: `${name}/src/lib` },
    { op: "mkdir", path: `${name}/public` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      private: true,
      version: "0.0.0",
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint",
      },
      dependencies: {
        next: "^15.1.3",
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        typescript: "^5.7.2",
        "@types/node": "^22.10.2",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "tailwindcss": "^4.0.0",
        "@tailwindcss/postcss": "^4",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./src/*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    }, null, 2) },
    { op: "create", path: `${name}/next.config.ts`, content: `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n` },
    { op: "create", path: `${name}/src/app/layout.tsx`, content: `import type { Metadata } from "next";\nimport "./globals.css";\n\nexport const metadata: Metadata = {\n  title: "${pascal}",\n  description: "Built with Next.js + TypeScript by Mr Robot",\n};\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n` },
    { op: "create", path: `${name}/src/app/page.tsx`, content: nextjsPageTemplate(pascal) },
    { op: "create", path: `${name}/src/app/globals.css`, content: `* { box-sizing: border-box; }\nhtml, body { padding: 0; margin: 0; font-family: system-ui, sans-serif; background: #0a0a0a; color: #fafafa; }\n` },
    { op: "create", path: `${name}/src/app/api/hello/route.ts`, content: `import { NextResponse } from "next/server";\n\nexport async function GET() {\n  return NextResponse.json({ message: "Hello from ${pascal}!" });\n}\n` },
    { op: "create", path: `${name}/src/components/Counter.tsx`, content: `"use client";\n\nimport { useState } from "react";\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n  return (\n    <div style={{ padding: 24 }}>\n      <h2>Counter: {count}</h2>\n      <button onClick={() => setCount(count + 1)}>Increment</button>\n      <button onClick={() => setCount(count - 1)}>Decrement</button>\n    </div>\n  );\n}\n` },
    { op: "create", path: `${name}/src/lib/utils.ts`, content: `export function cn(...classes: (string | false | null | undefined)[]): string {\n  return classes.filter(Boolean).join(" ");\n}\n\nexport function formatDate(date: Date): string {\n  return date.toISOString().split("T")[0];\n}\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\n.next\n.DS_Store\n*.local\n.env*\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nNext.js 15 + TypeScript + Tailwind 4. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nVisit http://localhost:3000\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a complete Next.js 15 + TypeScript + Tailwind CSS 4 project at \`${name}/\`. Includes App Router, a sample API route at /api/hello, a Counter client component, and utility helpers.`,
    framework: "nextjs",
    language: "typescript",
    nextSteps: [
      `cd ${name}`,
      "npm install",
      "npm run dev",
    ],
  };
}

function scaffoldVue(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/components` },
    { op: "mkdir", path: `${name}/src/composables` },
    { op: "mkdir", path: `${name}/src/assets` },
    { op: "mkdir", path: `${name}/public` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vue-tsc -b && vite build",
        preview: "vite preview",
        test: "vitest",
      },
      dependencies: {
        vue: "^3.5.13",
      },
      devDependencies: {
        "@vitejs/plugin-vue": "^5.2.1",
        "vue-tsc": "^2.1.10",
        typescript: "^5.7.2",
        vite: "^6.0.3",
        vitest: "^2.1.7",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        jsx: "preserve",
        isolatedModules: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
    }, null, 2) },
    { op: "create", path: `${name}/vite.config.ts`, content: `import { defineConfig } from "vite";\nimport vue from "@vitejs/plugin-vue";\n\nexport default defineConfig({\n  plugins: [vue()],\n});\n` },
    { op: "create", path: `${name}/index.html`, content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${pascal}</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.ts"></script>\n  </body>\n</html>\n` },
    { op: "create", path: `${name}/src/main.ts`, content: `import { createApp } from "vue";\nimport App from "./App.vue";\nimport "./assets/main.css";\n\ncreateApp(App).mount("#app");\n` },
    { op: "create", path: `${name}/src/App.vue`, content: vueComponentTemplate(pascal, "App") },
    { op: "create", path: `${name}/src/components/HelloWorld.vue`, content: vueComponentTemplate(pascal, "HelloWorld") },
    { op: "create", path: `${name}/src/composables/useCounter.ts`, content: `import { ref } from "vue";\n\nexport function useCounter(initial = 0) {\n  const count = ref(initial);\n  const increment = () => count.value++;\n  const decrement = () => count.value--;\n  const reset = () => (count.value = initial);\n  return { count, increment, decrement, reset };\n}\n` },
    { op: "create", path: `${name}/src/assets/main.css`, content: `:root { font-family: system-ui, sans-serif; }\nbody { margin: 0; background: #0a0a0a; color: #fafafa; }\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n.DS_Store\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nVue 3 + TypeScript + Vite. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a Vue 3 + TypeScript + Vite project at \`${name}/\`. Includes Composition API setup, a sample component, and a useCounter composable.`,
    framework: "vue",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
  };
}

function scaffoldAngular(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/app/components/welcome` },
    { op: "mkdir", path: `${name}/src/app/services` },
    { op: "mkdir", path: `${name}/src/app/models` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      version: "0.0.0",
      scripts: {
        ng: "ng",
        start: "ng serve",
        build: "ng build",
        test: "ng test",
        lint: "ng lint",
      },
      private: true,
      dependencies: {
        "@angular/animations": "^19.0.0",
        "@angular/common": "^19.0.0",
        "@angular/compiler": "^19.0.0",
        "@angular/core": "^19.0.0",
        "@angular/forms": "^19.0.0",
        "@angular/platform-browser": "^19.0.0",
        "@angular/platform-browser-dynamic": "^19.0.0",
        "@angular/router": "^19.0.0",
        rxjs: "~7.8.0",
        tslib: "^2.3.0",
        "zone.js": "~0.15.0",
      },
      devDependencies: {
        "@angular-devkit/build-angular": "^19.0.0",
        "@angular/cli": "^19.0.0",
        "@angular/compiler-cli": "^19.0.0",
        typescript: "~5.6.0",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compileOnSave: false,
      compilerOptions: {
        outDir: "./dist/out-tsc",
        strict: true,
        experimentalDecorators: true,
        moduleResolution: "bundler",
        importHelpers: true,
        target: "ES2022",
        module: "ES2022",
      },
      angularCompilerOptions: { enableI18nLegacyMessageIdFormat: false, strictTemplates: true },
    }, null, 2) },
    { op: "create", path: `${name}/angular.json`, content: JSON.stringify({
      "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
      version: 1,
      projects: {
        [name]: {
          projectType: "application",
          root: "",
          sourceRoot: "src",
          architect: {
            build: {
              builder: "@angular-devkit/build-angular:application",
              options: {
                outputPath: "dist",
                index: "src/index.html",
                browser: "src/main.ts",
                tsConfig: "tsconfig.json",
                assets: [{ glob: "**/*", input: "public" }],
                styles: ["src/styles.css"],
                scripts: [],
              },
            },
            serve: { builder: "@angular-devkit/build-angular:dev-server", options: { buildTarget: `${name}:build` } },
          },
        },
      },
    }, null, 2) },
    { op: "create", path: `${name}/src/main.ts`, content: `import { bootstrapApplication } from "@angular/platform-browser";\nimport { AppComponent } from "./app/app.component";\n\nbootstrapApplication(AppComponent).catch((err) => console.error(err));\n` },
    { op: "create", path: `${name}/src/index.html`, content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <title>${pascal}</title>\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n</head>\n<body>\n  <app-root></app-root>\n</body>\n</html>\n` },
    { op: "create", path: `${name}/src/styles.css`, content: `body { margin: 0; font-family: system-ui, sans-serif; background: #0a0a0a; color: #fafafa; }\n` },
    { op: "create", path: `${name}/src/app/app.component.ts`, content: angularComponentTemplate(pascal, "App") },
    { op: "create", path: `${name}/src/app/components/welcome/welcome.component.ts`, content: angularComponentTemplate(pascal, "Welcome") },
    { op: "create", path: `${name}/src/app/services/counter.service.ts`, content: `import { Injectable, signal } from "@angular/core";\n\n@Injectable({ providedIn: "root" })\nexport class CounterService {\n  private _count = signal(0);\n  readonly count = this._count.asReadonly();\n\n  increment() { this._count.update((c) => c + 1); }\n  decrement() { this._count.update((c) => c - 1); }\n  reset() { this._count.set(0); }\n}\n` },
    { op: "create", path: `${name}/src/app/models/user.model.ts`, content: `export interface User {\n  id: string;\n  name: string;\n  email: string;\n  createdAt: Date;\n}\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n.angular\n.DS_Store\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nAngular 19 standalone components + TypeScript. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded an Angular 19 project at \`${name}/\` with standalone components, signals-based state management, and a sample service. Uses modern Angular without NgModules.`,
    framework: "angular",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm start"],
  };
}

function scaffoldSvelte(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/lib` },
    { op: "mkdir", path: `${name}/src/routes` },
    { op: "mkdir", path: `${name}/static` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      version: "0.0.0",
      private: true,
      scripts: {
        dev: "vite dev",
        build: "vite build",
        preview: "vite preview",
      },
      devDependencies: {
        "@sveltejs/adapter-auto": "^3.3.1",
        "@sveltejs/kit": "^2.8.0",
        "@sveltejs/vite-plugin-svelte": "^4.0.0",
        svelte: "^5.0.0",
        "vite": "^6.0.0",
        typescript: "^5.7.2",
      },
      type: "module",
    }, null, 2) },
    { op: "create", path: `${name}/svelte.config.js`, content: `import adapter from "@sveltejs/adapter-auto";\nimport { vitePreprocess } from "@sveltejs/vite-plugin-svelte";\n\nconst config = {\n  preprocess: vitePreprocess(),\n  kit: { adapter: adapter() },\n};\n\nexport default config;\n` },
    { op: "create", path: `${name}/vite.config.ts`, content: `import { sveltekit } from "@sveltejs/kit/vite";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [sveltekit()],\n});\n` },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      extends: "./.svelte-kit/tsconfig.json",
      compilerOptions: { allowJs: true, checkJs: true, esModuleInterop: true, forceConsistentCasingInFileNames: true, resolveJsonModule: true, skipLibCheck: true, sourceMap: true, strict: true, moduleResolution: "bundler" },
    }, null, 2) },
    { op: "create", path: `${name}/src/app.html`, content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>${pascal}</title>\n    %sveltekit.head%\n  </head>\n  <body data-sveltekit-preload-data="hover">\n    <div style="display: contents">%sveltekit.body%</div>\n  </body>\n</html>\n` },
    { op: "create", path: `${name}/src/routes/+page.svelte`, content: svelteComponentTemplate(pascal) },
    { op: "create", path: `${name}/src/lib/Counter.svelte`, content: `<script lang="ts">\n  let count = $state(0);\n</script>\n\n<div>\n  <h2>Count: {count}</h2>\n  <button onclick={() => count++}>+</button>\n  <button onclick={() => count--}>-</button>\n</div>\n` },
    { op: "create", path: `${name}/static/favicon.svg`, content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff3e00"/></svg>\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\n.svelte-kit\nbuild\n.DS_Store\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nSvelteKit + TypeScript. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a SvelteKit project at \`${name}/\` with Svelte 5 runes, a sample Counter component, and TypeScript.`,
    framework: "svelte",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
  };
}

function scaffoldExpress(name: string, _req: CodeRequest): CodeResult {
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/routes` },
    { op: "mkdir", path: `${name}/src/middleware` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      version: "1.0.0",
      main: "src/index.ts",
      scripts: {
        dev: "tsx watch src/index.ts",
        build: "tsc",
        start: "node dist/index.js",
        test: "vitest",
      },
      dependencies: {
        express: "^4.21.2",
        cors: "^2.8.5",
        "body-parser": "^1.20.3",
      },
      devDependencies: {
        "@types/express": "^5.0.0",
        "@types/cors": "^2.8.17",
        "@types/node": "^22.10.2",
        tsx: "^4.19.2",
        typescript: "^5.7.2",
        vitest: "^2.1.7",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "./dist",
        rootDir: "./src",
      },
      include: ["src/**/*"],
    }, null, 2) },
    { op: "create", path: `${name}/src/index.ts`, content: expressServerTemplate(name) },
    { op: "create", path: `${name}/src/routes/users.ts`, content: expressRouteTemplate() },
    { op: "create", path: `${name}/src/middleware/logger.ts`, content: `import { Request, Response, NextFunction } from "express";\n\nexport function logger(req: Request, _res: Response, next: NextFunction) {\n  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.path}\`);\n  next();\n}\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n.env\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${name}\n\nExpress + TypeScript API. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nVisit http://localhost:3000/api/users\n` },
  ];
  return {
    files,
    explanation: `I scaffolded an Express.js + TypeScript API at \`${name}/\` with a sample users route, logger middleware, and CORS enabled.`,
    framework: "express",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
  };
}

function scaffoldFastify(name: string, _req: CodeRequest): CodeResult {
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/routes` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      version: "1.0.0",
      main: "src/index.ts",
      type: "module",
      scripts: { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" },
      dependencies: { fastify: "^5.2.1", "@fastify/cors": "^10.0.1" },
      devDependencies: { "@types/node": "^22.10.2", tsx: "^4.19.2", typescript: "^5.7.2" },
    }, null, 2) },
    { op: "create", path: `${name}/src/index.ts`, content: fastifyServerTemplate(name) },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${name}\n\nFastify + TypeScript API. Built by Mr Robot.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a Fastify + TypeScript API at \`${name}/\`.`,
    framework: "fastify",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
  };
}

function scaffoldNestjs(name: string, _req: CodeRequest): CodeResult {
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/modules` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      version: "0.0.1",
      scripts: {
        build: "nest build",
        start: "nest start",
        "start:dev": "nest start --watch",
        "start:prod": "node dist/main",
      },
      dependencies: {
        "@nestjs/common": "^10.4.15",
        "@nestjs/core": "^10.4.15",
        "@nestjs/platform-express": "^10.4.15",
        "reflect-metadata": "^0.2.2",
        "rxjs": "^7.8.1",
      },
      devDependencies: {
        "@nestjs/cli": "^10.4.9",
        "@types/node": "^22.10.2",
        "ts-node": "^10.9.2",
        typescript: "^5.7.2",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: {
        module: "commonjs",
        target: "ES2022",
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        strict: true,
        outDir: "./dist",
      },
    }, null, 2) },
    { op: "create", path: `${name}/src/main.ts`, content: `import { NestFactory } from "@nestjs/core";\nimport { AppModule } from "./app.module";\n\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(3000);\n  console.log("Nest app listening on http://localhost:3000");\n}\nbootstrap();\n` },
    { op: "create", path: `${name}/src/app.module.ts`, content: `import { Module } from "@nestjs/common";\nimport { AppController } from "./app.controller";\nimport { AppService } from "./app.service";\n\n@Module({\n  imports: [],\n  controllers: [AppController],\n  providers: [AppService],\n})\nexport class AppModule {}\n` },
    { op: "create", path: `${name}/src/app.controller.ts`, content: `import { Controller, Get } from "@nestjs/common";\nimport { AppService } from "./app.service";\n\n@Controller()\nexport class AppController {\n  constructor(private readonly appService: AppService) {}\n\n  @Get()\n  getHello(): string {\n    return this.appService.getHello();\n  }\n}\n` },
    { op: "create", path: `${name}/src/app.service.ts`, content: `import { Injectable } from "@nestjs/common";\n\n@Injectable()\nexport class AppService {\n  getHello(): string {\n    return "Hello from ${name}!";\n  }\n}\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${name}\n\nNestJS + TypeScript. Built by Mr Robot.\n\n\`\`\`bash\nnpm install\nnpm run start:dev\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a NestJS project at \`${name}/\` with module/controller/service architecture.`,
    framework: "nestjs",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run start:dev"],
  };
}

function scaffoldNode(name: string, _req: CodeRequest): CodeResult {
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      version: "1.0.0",
      main: "src/index.ts",
      type: "module",
      scripts: { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" },
      devDependencies: { "@types/node": "^22.10.2", tsx: "^4.19.2", typescript: "^5.7.2" },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, outDir: "./dist", rootDir: "./src" },
      include: ["src/**/*"],
    }, null, 2) },
    { op: "create", path: `${name}/src/index.ts`, content: `console.log("Hello from ${name}!");\n\n// Your code starts here\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${name}\n\nNode.js + TypeScript. Built by Mr Robot.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a Node.js + TypeScript project at \`${name}/\`.`,
    framework: "node",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
  };
}

function scaffoldRemix(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/app/components` },
    { op: "mkdir", path: `${name}/app/routes` },
    { op: "mkdir", path: `${name}/public` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      private: true,
      sideEffects: false,
      type: "module",
      scripts: {
        build: "remix vite:build",
        dev: "remix vite:dev",
        lint: "eslint --cache --cache-location ./node_modules/.cache/eslint .",
        start: "remix-serve ./build/server/index.js",
        typecheck: "tsc",
      },
      dependencies: {
        "@remix-run/node": "^2.15.0",
        "@remix-run/react": "^2.15.0",
        "@remix-run/serve": "^2.15.0",
        "isbot": "^4.4.0",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      },
      devDependencies: {
        "@remix-run/dev": "^2.15.0",
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        typescript: "^5.7.2",
        vite: "^6.0.3",
        "vite-tsconfig-paths": "^5.1.4",
      },
      engines: { node: ">=20.0.0" },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      include: ["**/*.ts", "**/*.tsx", "**/.server/**/*.ts", "**/.client/**/*.ts"],
      compilerOptions: {
        "lib": ["DOM", "DOM.Iterable", "ES2022"],
        "types": ["@remix-run/node", "vite/client"],
        "isolatedModules": true,
        "esModuleInterop": true,
        "jsx": "react-jsx",
        "module": "ESNext",
        "moduleResolution": "Bundler",
        "resolveJsonModule": true,
        "target": "ES2022",
        "strict": true,
        "allowJs": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "baseUrl": ".",
        "paths": { "~/*": ["./app/*"] },
        "noEmit": true,
      },
    }, null, 2) },
    { op: "create", path: `${name}/vite.config.ts`, content: `import { vitePlugin as remix } from "@remix-run/dev";\nimport { defineConfig } from "vite";\nimport tsconfigPaths from "vite-tsconfig-paths";\n\ndeclare module "@remix-run/node" {\n  interface Future {\n    v3_singleFetch: true;\n  }\n}\n\nexport default defineConfig({\n  plugins: [\n    remix({\n      future: {\n        v3_fetcherPersist: true,\n        v3_relativeSplatPath: true,\n        v3_throwAbortReason: true,\n        v3_singleFetch: true,\n        v3_lazyRouteDiscovery: true,\n      },\n    }),\n    tsconfigPaths(),\n  ],\n});\n` },
    { op: "create", path: `${name}/app/root.tsx`, content: `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "@remix-run/react";\n\nexport function Layout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <head>\n        <meta charSet="utf-8" />\n        <meta name="viewport" content="width=device-width, initial-scale=1" />\n        <Meta />\n        <Links />\n      </head>\n      <body>\n        {children}\n        <ScrollRestoration />\n        <Scripts />\n      </body>\n    </html>\n  );\n}\n\nexport default function App() {\n  return <Outlet />;\n}\n` },
    { op: "create", path: `${name}/app/routes/_index.tsx`, content: `import type { MetaFunction } from "@remix-run/node";\n\nexport const meta: MetaFunction = () => [\n  { title: "${pascal}" },\n  { name: "description", content: "Built with Remix + Vite by Mr Robot" },\n];\n\nexport default function Index() {\n  return (\n    <main style={{\n      padding: 24,\n      fontFamily: "system-ui, sans-serif",\n      background: "linear-gradient(135deg, #f59e0b, #ef4444, #ec4899)",\n      color: "white",\n      minHeight: "100vh",\n    }}>\n      <h1 style={{ fontSize: 32, margin: 0 }}>Welcome to ${pascal}</h1>\n      <p style={{ opacity: 0.9 }}>Built with Remix + Vite + TypeScript. Edit <code>app/routes/_index.tsx</code> to get started.</p>\n    </main>\n  );\n}\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\n/.cache\nbuild\n.env\n.DS_Store\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nRemix + Vite + TypeScript. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a Remix + Vite + TypeScript project at \`${name}/\`. Includes file-based routing in app/routes/, a root layout, and the Vite plugin configured with all v3 future flags enabled.`,
    framework: "remix",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
  };
}

function scaffoldAstro(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/components` },
    { op: "mkdir", path: `${name}/src/layouts` },
    { op: "mkdir", path: `${name}/src/pages` },
    { op: "mkdir", path: `${name}/public` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      type: "module",
      version: "0.0.1",
      scripts: {
        dev: "astro dev",
        build: "astro build",
        preview: "astro preview",
        astro: "astro",
      },
      dependencies: { astro: "^5.1.1" },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      extends: "astro/tsconfigs/strict",
      include: [".astro/types.d.ts", "**/*"],
      exclude: ["dist"],
    }, null, 2) },
    { op: "create", path: `${name}/astro.config.mjs`, content: `import { defineConfig } from "astro/config";\n\nexport default defineConfig({\n  // site: "https://example.com",\n});\n` },
    { op: "create", path: `${name}/src/layouts/Layout.astro`, content: `---\ninterface Props {\n  title: string;\n}\n\nconst { title } = Astro.props;\n---\n\n<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>{title}</title>\n  </head>\n  <body>\n    <slot />\n  </body>\n</html>\n\n<style>\n  body {\n    margin: 0;\n    font-family: system-ui, sans-serif;\n    background: #0a0a0a;\n    color: #fafafa;\n  }\n</style>\n` },
    { op: "create", path: `${name}/src/pages/index.astro`, content: `---\nimport Layout from "../layouts/Layout.astro";\n---\n\n<Layout title="${pascal}">\n  <main style="padding: 24px; min-height: 100vh; background: linear-gradient(135deg, #f59e0b, #ef4444, #ec4899); color: white;">\n    <h1 style="font-size: 32px; margin: 0;">Welcome to ${pascal}</h1>\n    <p style="opacity: 0.9;">Built with Astro + TypeScript. Edit <code>src/pages/index.astro</code> to get started.</p>\n  </main>\n</Layout>\n` },
    { op: "create", path: `${name}/src/components/Welcome.astro`, content: `---\ninterface Props {\n  message?: string;\n}\n\nconst { message = "Hello from Astro" } = Astro.props;\n---\n\n<div class="welcome">\n  <h2>{message}</h2>\n  <slot />\n</div>\n\n<style>\n  .welcome {\n    padding: 16px;\n    border-radius: 8px;\n    background: rgba(255, 255, 255, 0.1);\n  }\n</style>\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n.astro\n.DS_Store\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nAstro + TypeScript. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded an Astro 5 + TypeScript project at \`${name}/\`. Includes a Layout component, an index page, and the strict TypeScript preset.`,
    framework: "astro",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
  };
}

function scaffoldSolid(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/components` },
    { op: "mkdir", path: `${name}/public` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      type: "module",
      version: "0.0.1",
      scripts: {
        dev: "vite",
        build: "vite build",
        serve: "vite preview",
      },
      dependencies: {
        solid_js: "^1.9.3",
      },
      devDependencies: {
        typescript: "^5.7.2",
        vite: "^6.0.3",
        "vite-plugin-solid": "^2.11.0",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        jsx: "preserve",
        jsxImportSource: "solid-js",
        types: ["vite/client"],
        noEmit: true,
        isolatedModules: true,
        skipLibCheck: true,
      },
    }, null, 2) },
    { op: "create", path: `${name}/vite.config.ts`, content: `import { defineConfig } from "vite";\nimport solid from "vite-plugin-solid";\n\nexport default defineConfig({\n  plugins: [solid()],\n});\n` },
    { op: "create", path: `${name}/index.html`, content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${pascal}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script src="/src/index.tsx" type="module"></script>\n  </body>\n</html>\n` },
    { op: "create", path: `${name}/src/index.tsx`, content: `import { render } from "solid-js/web";\nimport App from "./App";\nimport "./index.css";\n\nconst root = document.getElementById("root");\n\nif (root) {\n  render(() => <App />, root);\n}\n` },
    { op: "create", path: `${name}/src/App.tsx`, content: `import { createSignal } from "solid-js";\n\nfunction App() {\n  const [count, setCount] = createSignal(0);\n\n  return (\n    <main\n      style={{\n        padding: "24px",\n        "min-height": "100vh",\n        background: "linear-gradient(135deg, #f59e0b, #ef4444, #ec4899)",\n        color: "white",\n        "font-family": "system-ui, sans-serif",\n      }}\n    >\n      <h1 style={{ "font-size": "32px", margin: 0 }}>Welcome to ${pascal}</h1>\n      <p style={{ opacity: 0.9 }}>\n        Built with SolidJS + Vite + TypeScript. Edit <code>src/App.tsx</code> to get started.\n      </p>\n      <button\n        onClick={() => setCount((c) => c + 1)}\n        style={{\n          padding: "8px 16px",\n          border: "none",\n          "border-radius": "8px",\n          background: "rgba(255,255,255,0.2)",\n          color: "white",\n          cursor: "pointer",\n        }}\n      >\n        Count: {count()}\n      </button>\n    </main>\n  );\n}\n\nexport default App;\n` },
    { op: "create", path: `${name}/src/index.css`, content: `* { box-sizing: border-box; }\nbody { margin: 0; }\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\n.DS_Store\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nSolidJS + Vite + TypeScript. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a SolidJS + Vite + TypeScript project at \`${name}/\`. Uses Solid's fine-grained reactivity (createSignal) and JSX with the solid-js jsxImportSource.`,
    framework: "solid",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
  };
}

function scaffoldReactNative(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/screens` },
    { op: "mkdir", path: `${name}/src/components` },
    { op: "mkdir", path: `${name}/src/navigation` },
    { op: "mkdir", path: `${name}/assets` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      version: "1.0.0",
      main: "index.ts",
      scripts: {
        start: "expo start",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web",
      },
      dependencies: {
        expo: "~52.0.0",
        "expo-status-bar": "~2.0.0",
        react: "18.3.1",
        "react-native": "0.76.5",
        "@react-navigation/native": "^7.0.14",
        "@react-navigation/native-stack": "^7.2.0",
        "react-native-screens": "~4.4.0",
        "react-native-safe-area-context": "4.12.0",
      },
      devDependencies: {
        "@babel/core": "^7.25.2",
        "@types/react": "~18.3.12",
        typescript: "^5.3.3",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      extends: "expo/tsconfig.base",
      compilerOptions: {
        strict: true,
        jsx: "react-jsx",
        paths: { "@/*": ["./src/*"] },
      },
      include: ["**/*.ts", "**/*.tsx", "expo-env.d.ts"],
    }, null, 2) },
    { op: "create", path: `${name}/app.json`, content: JSON.stringify({
      expo: {
        name: pascal,
        slug: name,
        version: "1.0.0",
        orientation: "portrait",
        userInterfaceStyle: "automatic",
        splash: { backgroundColor: "#0a0a0a" },
        ios: { supportsTablet: true, bundleIdentifier: `com.example.${name}` },
        android: { package: `com.example.${name}` },
        web: { bundler: "metro" },
      },
    }, null, 2) },
    { op: "create", path: `${name}/babel.config.js`, content: `module.exports = function (api) {\n  api.cache(true);\n  return {\n    presets: ["babel-preset-expo"],\n  };\n};\n` },
    { op: "create", path: `${name}/index.ts`, content: `import { registerRootComponent } from "expo";\nimport App from "./App";\n\nregisterRootComponent(App);\n` },
    { op: "create", path: `${name}/App.tsx`, content: `import { StatusBar } from "expo-status-bar";\nimport { StyleSheet, Text, View } from "react-native";\n\nexport default function App() {\n  return (\n    <View style={styles.container}>\n      <Text style={styles.title}>Welcome to ${pascal}</Text>\n      <Text style={styles.subtitle}>Built with Expo + React Native + TypeScript</Text>\n      <Text style={styles.hint}>Edit App.tsx to get started</Text>\n      <StatusBar style="light" />\n    </View>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: {\n    flex: 1,\n    backgroundColor: "#0a0a0a",\n    alignItems: "center",\n    justifyContent: "center",\n    padding: 24,\n  },\n  title: {\n    fontSize: 28,\n    fontWeight: "bold",\n    color: "#f59e0b",\n    marginBottom: 8,\n  },\n  subtitle: {\n    fontSize: 14,\n    color: "#fafafa",\n    marginBottom: 4,\n  },\n  hint: {\n    fontSize: 12,\n    color: "#a1a1aa",\n  },\n});\n` },
    { op: "create", path: `${name}/src/components/Button.tsx`, content: `import { Pressable, Text, StyleSheet } from "react-native";\n\ninterface ButtonProps {\n  title: string;\n  onPress: () => void;\n  color?: string;\n}\n\nexport function Button({ title, onPress, color = "#f59e0b" }: ButtonProps) {\n  return (\n    <Pressable\n      onPress={onPress}\n      style={({ pressed }) => [\n        styles.button,\n        { backgroundColor: color, opacity: pressed ? 0.8 : 1 },\n      ]}\n    >\n      <Text style={styles.text}>{title}</Text>\n    </Pressable>\n  );\n}\n\nconst styles = StyleSheet.create({\n  button: {\n    paddingVertical: 12,\n    paddingHorizontal: 24,\n    borderRadius: 8,\n  },\n  text: {\n    color: "white",\n    fontWeight: "600",\n    fontSize: 16,\n  },\n});\n` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\n.expo\ndist\nweb-build\n.DS_Store\n*.local\n.env\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nReact Native (Expo) + TypeScript. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpx expo start\n\`\`\`\n\nThen press:\n- \`i\` to open in iOS simulator\n- \`a\` to open in Android emulator\n- \`w\` to open in web browser\n\n## Build for production\n\n\`\`\`bash\nnpx expo prebuild\neas build\n\`\`\`\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a React Native (Expo) + TypeScript project at \`${name}/\`. Includes Expo SDK 52, React Navigation setup, a sample Button component, and configuration for iOS/Android/Web.`,
    framework: "reactnative",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npx expo start"],
    warnings: [
      "Requires Expo CLI: npm install -g expo-cli",
      "For iOS: Xcode + CocoaPods required",
      "For Android: Android Studio + SDK required",
    ],
  };
}

function scaffoldElectron(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src/main` },
    { op: "mkdir", path: `${name}/src/renderer` },
    { op: "mkdir", path: `${name}/src/renderer/components` },
    { op: "mkdir", path: `${name}/build` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      version: "1.0.0",
      description: `${pascal} - Electron app built by Mr Robot`,
      main: "dist/main/main.js",
      scripts: {
        dev: 'concurrently "npm:dev:*"',
        "dev:main": "tsc -w -p tsconfig.main.json",
        "dev:renderer": "vite",
        "dev:electron": "wait-on tcp:5173 && cross-env NODE_ENV=development electron .",
        build: "tsc -p tsconfig.main.json && vite build",
        package: "npm run build && electron-builder",
        "package:mac": "npm run build && electron-builder --mac",
        "package:win": "npm run build && electron-builder --win",
        "package:linux": "npm run build && electron-builder --linux",
      },
      dependencies: {
        electron: "^33.2.0",
      },
      devDependencies: {
        "@types/node": "^22.10.2",
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.3.4",
        "concurrently": "^9.1.0",
        "cross-env": "^7.0.3",
        "electron-builder": "^25.1.8",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        typescript: "^5.7.2",
        "vite": "^6.0.3",
        "wait-on": "^8.0.1",
      },
      build: {
        appId: `com.example.${name}`,
        productName: pascal,
        files: ["dist/**/*", "build/**/*"],
        directories: { output: "release" },
        mac: { category: "public.app-category.utilities", target: ["dmg", "zip"] },
        win: { target: ["nsis"] },
        linux: { target: ["AppImage", "deb"], category: "Utility" },
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        paths: { "@/*": ["./src/renderer/*"] },
      },
      include: ["src/renderer"],
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.main.json`, content: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        moduleResolution: "node",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "./dist/main",
        rootDir: "./src/main",
      },
      include: ["src/main/**/*"],
    }, null, 2) },
    { op: "create", path: `${name}/vite.config.ts`, content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nimport { resolve } from "path";\n\nexport default defineConfig({\n  plugins: [react()],\n  base: "./",\n  build: {\n    outDir: "dist/renderer",\n  },\n  resolve: {\n    alias: {\n      "@": resolve(__dirname, "src/renderer"),\n    },\n  },\n  server: {\n    port: 5173,\n  },\n});\n` },
    { op: "create", path: `${name}/src/main/main.ts`, content: `import { app, BrowserWindow } from "electron";\nimport * as path from "path";\n\nconst isDev = process.env.NODE_ENV === "development";\n\nfunction createWindow() {\n  const win = new BrowserWindow({\n    width: 1200,\n    height: 800,\n    minWidth: 800,\n    minHeight: 600,\n    backgroundColor: "#0a0a0a",\n    titleBarStyle: "hiddenInset",\n    webPreferences: {\n      preload: path.join(__dirname, "preload.js"),\n      contextIsolation: true,\n      nodeIntegration: false,\n    },\n  });\n\n  if (isDev) {\n    win.loadURL("http://localhost:5173");\n    win.webContents.openDevTools();\n  } else {\n    win.loadFile(path.join(__dirname, "../renderer/index.html"));\n  }\n}\n\napp.whenReady().then(() => {\n  createWindow();\n\n  app.on("activate", () => {\n    if (BrowserWindow.getAllWindows().length === 0) createWindow();\n  });\n});\n\napp.on("window-all-closed", () => {\n  if (process.platform !== "darwin") app.quit();\n});\n` },
    { op: "create", path: `${name}/src/main/preload.ts`, content: `import { contextBridge } from "electron";\n\ncontextBridge.exposeInMainWorld("api", {\n  version: process.versions.electron,\n  platform: process.platform,\n});\n` },
    { op: "create", path: `${name}/src/renderer/index.html`, content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${pascal}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="./main.tsx"></script>\n  </body>\n</html>\n` },
    { op: "create", path: `${name}/src/renderer/main.tsx`, content: `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\n\nconst root = createRoot(document.getElementById("root")!);\nroot.render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n` },
    { op: "create", path: `${name}/src/renderer/App.tsx`, content: [
      'import { useState } from "react";',
      '',
      'export default function App() {',
      '  const [count, setCount] = useState(0);',
      '  const api = (window as any).api;',
      '',
      '  return (',
      '    <main',
      '      style={{',
      '        padding: 24,',
      '        minHeight: "100vh",',
      '        background: "linear-gradient(135deg, #f59e0b, #ef4444, #ec4899)",',
      '        color: "white",',
      '        fontFamily: "system-ui, sans-serif",',
      '      }}',
      '    >',
      `      <h1 style={{ fontSize: 32, margin: 0 }}>Welcome to ${pascal}</h1>`,
      '      <p style={{ opacity: 0.9 }}>',
      '        Built with Electron + React + Vite + TypeScript.',
      '        {api && ` Running on Electron v${api.version} (${api.platform})`}',
      '      </p>',
      '      <button',
      '        onClick={() => setCount((c) => c + 1)}',
      '        style={{',
      '          padding: "8px 16px",',
      '          borderRadius: 8,',
      '          border: "none",',
      '          background: "rgba(255,255,255,0.2)",',
      '          color: "white",',
      '          cursor: "pointer",',
      '        }}',
      '      >',
      '        Count: {count}',
      '      </button>',
      '    </main>',
      '  );',
      '}',
      '',
    ].join("\n") },
    { op: "create", path: `${name}/src/renderer/index.css`, content: `* { box-sizing: border-box; }\nbody { margin: 0; }\n` },
    { op: "create", path: `${name}/build/icon.png`, content: `` },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\nrelease\n.DS_Store\n*.local\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nElectron + React + Vite + TypeScript. Built by Mr Robot.\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Build installers\n\n\`\`\`bash\nnpm run package        # current platform\nnpm run package:mac    # macOS dmg + zip\nnpm run package:win    # Windows nsis installer\nnpm run package:linux  # Linux AppImage + deb\n\`\`\`\n\n## Architecture\n\n- \`src/main/\` — Electron main process (Node.js)\n- \`src/main/preload.ts\` — Preload script (contextBridge)\n- \`src/renderer/\` — React UI (Vite)\n- \`build/\` — Icons and resources\n` },
  ];
  return {
    files,
    explanation: `I scaffolded an Electron + React + Vite + TypeScript desktop app at \`${name}/\`. Includes main process, preload script with contextBridge, React renderer, and electron-builder config for macOS/Windows/Linux installers.`,
    framework: "electron",
    language: "typescript",
    nextSteps: [`cd ${name}`, "npm install", "npm run dev"],
    warnings: [
      "Replace build/icon.png with a 512x512 PNG before packaging",
      "Code signing certificates required for distribution outside dev",
    ],
  };
}

function scaffoldTauri(name: string, _req: CodeRequest): CodeResult {
  const pascal = toPascalCase(name);
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/src` },
    { op: "mkdir", path: `${name}/src-tauri/src` },
    { op: "mkdir", path: `${name}/src-tauri/icons` },
    { op: "mkdir", path: `${name}/public` },
    { op: "create", path: `${name}/package.json`, content: JSON.stringify({
      name,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
        "tauri": "tauri",
      },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      },
      devDependencies: {
        "@tauri-apps/api": "^2.1.1",
        "@tauri-apps/cli": "^2.1.0",
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.3.4",
        typescript: "^5.7.2",
        vite: "^6.0.3",
      },
    }, null, 2) },
    { op: "create", path: `${name}/tsconfig.json`, content: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
      },
      include: ["src"],
    }, null, 2) },
    { op: "create", path: `${name}/vite.config.ts`, content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n  clearScreen: false,\n  server: {\n    port: 1420,\n    strictPort: true,\n  },\n  envPrefix: ["VITE_", "TAURI_"],\n  build: {\n    target: ["es2021", "chrome100", "safari13"],\n    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,\n    sourcemap: !!process.env.TAURI_DEBUG,\n  },\n});\n` },
    { op: "create", path: `${name}/index.html`, content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <link rel="icon" type="image/svg+xml" href="/tauri.svg" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${pascal}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n` },
    { op: "create", path: `${name}/src/main.tsx`, content: `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n` },
    { op: "create", path: `${name}/src/App.tsx`, content: `import { useState } from "react";\nimport { invoke } from "@tauri-apps/api/core";\n\nfunction App() {\n  const [greeting, setGreeting] = useState("");\n\n  async function greet() {\n    const result = await invoke<string>("greet", { name: "World" });\n    setGreeting(result);\n  }\n\n  return (\n    <main\n      style={{\n        padding: 24,\n        minHeight: "100vh",\n        background: "linear-gradient(135deg, #f59e0b, #ef4444, #ec4899)",\n        color: "white",\n        fontFamily: "system-ui, sans-serif",\n      }}\n    >\n      <h1 style={{ fontSize: 32, margin: 0 }}>Welcome to ${pascal}</h1>\n      <p style={{ opacity: 0.9 }}>\n        Built with Tauri 2 + React + Vite + TypeScript + Rust.\n      </p>\n      <button\n        onClick={greet}\n        style={{\n          padding: "8px 16px",\n          borderRadius: 8,\n          border: "none",\n          background: "rgba(255,255,255,0.2)",\n          color: "white",\n          cursor: "pointer",\n        }}\n      >\n        Greet from Rust\n      </button>\n      {greeting && <p>{greeting}</p>}\n    </main>\n  );\n}\n\nexport default App;\n` },
    { op: "create", path: `${name}/src/index.css`, content: `* { box-sizing: border-box; }\nbody { margin: 0; }\n` },
    { op: "create", path: `${name}/src-tauri/Cargo.toml`, content: `[package]\nname = "${name}"\nversion = "0.0.0"\ndescription = "${pascal} - Tauri app built by Mr Robot"\nauthors = ["you"]\nedition = "2021"\n\n[lib]\nname = "${name.replace(/-/g, "_")}_lib"\ncrate-type = ["staticlib", "cdylib", "rlib"]\n\n[build-dependencies]\ntauri-build = { version = "2", features = [] }\n\n[dependencies]\ntauri = { version = "2", features = [] }\ntauri-plugin-opener = "2"\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n` },
    { op: "create", path: `${name}/src-tauri/build.rs`, content: `fn main() {\n    tauri_build::build()\n}\n` },
    { op: "create", path: `${name}/src-tauri/tauri.conf.json`, content: JSON.stringify({
      "$schema": "https://schema.tauri.app/config/2",
      productName: pascal,
      version: "0.0.0",
      identifier: `com.example.${name}`,
      build: {
        frontendDist: "../dist",
        devUrl: "http://localhost:1420",
        beforeDevCommand: "npm run dev",
        beforeBuildCommand: "npm run build",
      },
      app: {
        windows: [{ title: pascal, width: 800, height: 600 }],
        security: { csp: null },
      },
      bundle: {
        active: true,
        targets: "all",
        icon: ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
      },
    }, null, 2) },
    { op: "create", path: `${name}/src-tauri/src/lib.rs`, content: `#[tauri::command]\nfn greet(name: &str) -> String {\n    format!("Hello, {}! You've been greeted from Rust!", name)\n}\n\n#[cfg_attr(mobile, tauri::mobile_entry_point)]\npub fn run() {\n    tauri::Builder::default()\n        .plugin(tauri_plugin_opener::init())\n        .invoke_handler(tauri::generate_handler![greet])\n        .run(tauri::generate_context!())\n        .expect("error while running tauri application");\n}\n` },
    { op: "create", path: `${name}/src-tauri/src/main.rs`, content: `// Prevents additional console window on Windows in release\n#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\n\nfn main() {\n    ${name.replace(/-/g, "_")}_lib::run()\n}\n` },
    { op: "create", path: `${name}/src-tauri/capabilities/default.json`, content: JSON.stringify({
      "$schema": "../gen/schemas/desktop-schema.json",
      identifier: "default",
      description: "Capability for the main window",
      windows: ["main"],
      permissions: ["core:default", "opener:default"],
    }, null, 2) },
    { op: "create", path: `${name}/.gitignore`, content: `node_modules\ndist\nsrc-tauri/target\nsrc-tauri/gen\n.DS_Store\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${pascal}\n\nTauri 2 + React + Vite + TypeScript + Rust. Built by Mr Robot.\n\n## Prerequisites\n\n- [Rust](https://rustup.rs/) (stable toolchain)\n- [Node.js](https://nodejs.org/) 20+\n- Platform-specific dependencies:\n  - Linux: \`webkit2gtk-4.1\`, \`build-essential\`, \`curl\`, \`wget\`, \`file\`, \`libxdo-dev\`, \`libssl-dev\`, \`libayatana-appindicator3-dev\`, \`librsvg2-dev\`\n  - macOS: Xcode Command Line Tools\n  - Windows: Microsoft Visual Studio C++ Build Tools\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run tauri dev\n\`\`\`\n\n## Build installers\n\n\`\`\`bash\nnpm run tauri build\n\`\`\`\n\nOutput: \`src-tauri/target/release/bundle/\`\n\n## Architecture\n\n- \`src/\` — React frontend (Vite)\n- \`src-tauri/src/\` — Rust backend (Tauri)\n- \`src-tauri/tauri.conf.json\` — Tauri config\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a Tauri 2 + React + Vite + TypeScript + Rust project at \`${name}/\`. Includes a Rust backend with a \`greet\` command callable from React via Tauri's IPC, and bundle config for macOS/Windows/Linux installers.`,
    framework: "tauri",
    language: "rust",
    nextSteps: [`cd ${name}`, "npm install", "npm run tauri dev"],
    warnings: [
      "Requires Rust installed (https://rustup.rs/)",
      "Linux: install webkit2gtk-4.1 and other system deps",
      "macOS: Xcode Command Line Tools required",
      "Windows: MSVC Build Tools required",
    ],
  };
}

function scaffoldFlask(name: string, _req: CodeRequest): CodeResult {
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}` },
    { op: "create", path: `${name}/requirements.txt`, content: `flask==3.1.0\ngunicorn==23.0.0\npython-dotenv==1.0.1\n` },
    { op: "create", path: `${name}/app.py`, content: flaskAppTemplate(name) },
    { op: "create", path: `${name}/config.py`, content: `import os\n\nclass Config:\n    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")\n    DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"\n` },
    { op: "create", path: `${name}/.gitignore`, content: `__pycache__/\n*.pyc\nvenv/\n.env\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${name}\n\nFlask + Python. Built by Mr Robot.\n\n\`\`\`bash\npython -m venv venv\nsource venv/bin/activate\npip install -r requirements.txt\npython app.py\n\`\`\`\n\nVisit http://localhost:5000\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a Flask app at \`${name}/\` with a sample route and config.`,
    framework: "flask",
    language: "python",
    nextSteps: [`cd ${name}`, "pip install -r requirements.txt", "python app.py"],
  };
}

function scaffoldDjango(name: string, _req: CodeRequest): CodeResult {
  const files: FileOp[] = [
    { op: "create", path: `${name}/requirements.txt`, content: `django==5.1.4\ndjangorestframework==3.15.2\npython-dotenv==1.0.1\n` },
    { op: "create", path: `${name}/manage.py`, content: djangoManageTemplate(name) },
    { op: "mkdir", path: `${name}/${name}` },
    { op: "create", path: `${name}/${name}/__init__.py`, content: "" },
    { op: "create", path: `${name}/${name}/settings.py`, content: djangoSettingsTemplate(name) },
    { op: "create", path: `${name}/${name}/urls.py`, content: `from django.contrib import admin\nfrom django.urls import path, include\n\nurlpatterns = [\n    path("admin/", admin.site.urls),\n    path("api/", include("apps.api.urls")),\n]\n` },
    { op: "create", path: `${name}/${name}/wsgi.py`, content: `import os\nfrom django.core.wsgi import get_wsgi_application\n\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "${name}.settings")\napplication = get_wsgi_application()\n` },
    { op: "create", path: `${name}/${name}/asgi.py`, content: `import os\nfrom django.core.asgi import get_asgi_application\n\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "${name}.settings")\napplication = get_asgi_application()\n` },
    { op: "mkdir", path: `${name}/apps/api` },
    { op: "create", path: `${name}/apps/api/__init__.py`, content: "" },
    { op: "create", path: `${name}/apps/api/models.py`, content: `from django.db import models\n\nclass Item(models.Model):\n    name = models.CharField(max_length=200)\n    description = models.TextField(blank=True)\n    created_at = models.DateTimeField(auto_now_add=True)\n\n    def __str__(self):\n        return self.name\n` },
    { op: "create", path: `${name}/apps/api/views.py`, content: `from rest_framework.decorators import api_view\nfrom rest_framework.response import Response\n\n@api_view(["GET"])\ndef health(request):\n    return Response({"status": "ok", "service": "${name}"})\n` },
    { op: "create", path: `${name}/apps/api/urls.py`, content: `from django.urls import path\nfrom . import views\n\nurlpatterns = [\n    path("health/", views.health, name="health"),\n]\n` },
    { op: "create", path: `${name}/.gitignore`, content: `__pycache__/\n*.pyc\ndb.sqlite3\nvenv/\n.env\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${name}\n\nDjango + DRF. Built by Mr Robot.\n\n\`\`\`bash\npython -m venv venv\nsource venv/bin/activate\npip install -r requirements.txt\npython manage.py migrate\npython manage.py runserver\n\`\`\`\n\nVisit http://localhost:8000/api/health/\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a Django + Django REST Framework project at \`${name}/\` with a sample Item model and health-check endpoint.`,
    framework: "django",
    language: "python",
    nextSteps: [`cd ${name}`, "pip install -r requirements.txt", "python manage.py migrate", "python manage.py runserver"],
  };
}

function scaffoldFastAPI(name: string, _req: CodeRequest): CodeResult {
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/app` },
    { op: "create", path: `${name}/requirements.txt`, content: `fastapi==0.115.6\nuvicorn[standard]==0.34.0\npydantic==2.10.4\n` },
    { op: "create", path: `${name}/app/__init__.py`, content: "" },
    { op: "create", path: `${name}/app/main.py`, content: fastapiAppTemplate(name) },
    { op: "create", path: `${name}/app/models.py`, content: `from pydantic import BaseModel, Field\nfrom datetime import datetime\nfrom typing import Optional\n\nclass Item(BaseModel):\n    id: Optional[int] = None\n    name: str = Field(..., min_length=1, max_length=200)\n    description: Optional[str] = None\n    created_at: datetime = Field(default_factory=datetime.now)\n` },
    { op: "create", path: `${name}/app/database.py`, content: `import sqlite3\nfrom contextlib import contextmanager\n\nDB_PATH = "app.db"\n\n@contextmanager\ndef get_db():\n    conn = sqlite3.connect(DB_PATH)\n    conn.row_factory = sqlite3.Row\n    try:\n        yield conn\n        conn.commit()\n    finally:\n        conn.close()\n\n\ndef init_db():\n    with get_db() as conn:\n        conn.execute("""\n            CREATE TABLE IF NOT EXISTS items (\n                id INTEGER PRIMARY KEY AUTOINCREMENT,\n                name TEXT NOT NULL,\n                description TEXT,\n                created_at TEXT NOT NULL\n            )\n        """)\n` },
    { op: "create", path: `${name}/.gitignore`, content: `__pycache__/\n*.pyc\napp.db\nvenv/\n.env\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${name}\n\nFastAPI + Pydantic + SQLite. Built by Mr Robot.\n\n\`\`\`bash\npython -m venv venv\nsource venv/bin/activate\npip install -r requirements.txt\nuvicorn app.main:app --reload\n\`\`\`\n\nVisit http://localhost:8000/docs\n` },
  ];
  return {
    files,
    explanation: `I scaffolded a FastAPI project at \`${name}/\` with Pydantic models, SQLite persistence, and auto-docs at /docs.`,
    framework: "fastapi",
    language: "python",
    nextSteps: [`cd ${name}`, "pip install -r requirements.txt", "uvicorn app.main:app --reload"],
  };
}

function scaffoldOdoo(name: string, _req: CodeRequest): CodeResult {
  const files: FileOp[] = [
    { op: "mkdir", path: `${name}/models` },
    { op: "mkdir", path: `${name}/views` },
    { op: "mkdir", path: `${name}/security` },
    { op: "mkdir", path: `${name}/reports` },
    { op: "mkdir", path: `${name}/wizard` },
    { op: "create", path: `${name}/__manifest__.py`, content: odooManifestTemplate(name) },
    { op: "create", path: `${name}/__init__.py`, content: `from . import models\n` },
    { op: "create", path: `${name}/models/__init__.py`, content: `from . import ${name.replace(/-/g, "_")}\n` },
    { op: "create", path: `${name}/models/${name.replace(/-/g, "_")}.py`, content: odooModelTemplate(name) },
    { op: "create", path: `${name}/views/${name.replace(/-/g, "_")}_views.xml`, content: odooViewsTemplate(name) },
    { op: "create", path: `${name}/security/ir.model.access.csv`, content: `id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink\naccess_${name.replace(/-/g, "_")}_user,${name}.user,model_${name.replace(/-/g, "_")},base.group_user,1,1,1,1\n` },
    { op: "create", path: `${name}/README.md`, content: `# ${name}\n\nOdoo 17 custom module. Built by Mr Robot.\n\n## Installation\n\n1. Copy this folder to your Odoo \`addons\` directory\n2. Update Apps list in Odoo\n3. Install the \`${name}\` module\n\n## Features\n\n- Custom model with name, description, and date fields\n- List, form, and search views\n- Security rules for users group\n` },
  ];
  return {
    files,
    explanation: `I scaffolded an Odoo 17 custom module at \`${name}/\` with a model, views, security rules, and proper manifest. Drop it into your addons directory and install from the Odoo apps menu.`,
    framework: "odoo",
    language: "python",
    nextSteps: [
      `Copy ${name}/ to your Odoo addons directory`,
      "Update Apps list in Odoo admin",
      `Install the ${name} module`,
    ],
    warnings: [
      "Replace 'license' and 'author' in __manifest__.py with your own details",
      "Adjust security groups in security/ir.model.access.csv to match your needs",
    ],
  };
}

// ---------- Component generators ----------

async function createComponent(req: CodeRequest): Promise<CodeResult> {
  const name = req.componentName || "MyComponent";
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  switch (req.framework) {
    case "react":
    case "nextjs": {
      const isClient = req.framework === "nextjs" ? '"use client";\n\n' : "";
      const content = `${isClient}import React from "react";\n\nexport interface ${pascal}Props {\n  /** Title to display */\n  title?: string;\n  /** Optional children */\n  children?: React.ReactNode;\n  /** Click handler */\n  onClick?: () => void;\n}\n\nexport function ${pascal}({ title = "${pascal}", children, onClick }: ${pascal}Props) {\n  return (\n    <div\n      onClick={onClick}\n      style={{\n        padding: 24,\n        borderRadius: 12,\n        background: "linear-gradient(135deg, #f59e0b, #ef4444)",\n        color: "white",\n        cursor: onClick ? "pointer" : "default",\n        fontFamily: "system-ui, sans-serif",\n      }}\n    >\n      <h2 style={{ margin: 0, marginBottom: 8 }}>{title}</h2>\n      {children}\n    </div>\n  );\n}\n\nexport default ${pascal};\n`;
      return {
        files: [{ op: "create", path: `src/components/${pascal}.tsx`, content }],
        explanation: `Created a React component \`${pascal}\` at \`src/components/${pascal}.tsx\`. Includes TypeScript props interface, gradient background, and onClick handler.`,
        framework: req.framework,
        language: "typescript",
        nextSteps: [`Import it: \`import { ${pascal} } from "./components/${pascal}";\``],
      };
    }
    case "vue": {
      const content = vueComponentTemplate(pascal, pascal);
      return {
        files: [{ op: "create", path: `src/components/${pascal}.vue`, content }],
        explanation: `Created a Vue 3 SFC \`${pascal}\` at \`src/components/${pascal}.vue\` with Composition API and TypeScript.`,
        framework: "vue",
        language: "typescript",
        nextSteps: [`Import it: \`import ${pascal} from "./components/${pascal}.vue";\``],
      };
    }
    case "angular": {
      const content = angularComponentTemplate(pascal, pascal);
      return {
        files: [{ op: "create", path: `src/app/components/${kebab}/${kebab}.component.ts`, content }],
        explanation: `Created an Angular standalone component \`${pascal}Component\` at \`src/app/components/${kebab}/${kebab}.component.ts\`.`,
        framework: "angular",
        language: "typescript",
        nextSteps: [`Use it in a template: \`<app-${kebab}></app-${kebab}>\``],
      };
    }
    case "svelte": {
      const content = `<script lang="ts">\n  export let title: string = "${pascal}";\n</script>\n\n<div class="card">\n  <h2>{title}</h2>\n  <slot />\n</div>\n\n<style>\n  .card {\n    padding: 24px;\n    border-radius: 12px;\n    background: linear-gradient(135deg, #f59e0b, #ef4444);\n    color: white;\n    font-family: system-ui, sans-serif;\n  }\n</style>\n`;
      return {
        files: [{ op: "create", path: `src/lib/${pascal}.svelte`, content }],
        explanation: `Created a Svelte component \`${pascal}\` at \`src/lib/${pascal}.svelte\`.`,
        framework: "svelte",
        language: "typescript",
        nextSteps: [`Import it: \`import ${pascal} from "$lib/${pascal}.svelte";\``],
      };
    }
    default:
      return fallbackResponse(req);
  }
}

async function createPage(req: CodeRequest): Promise<CodeResult> {
  const name = req.componentName || "Page";
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  if (req.framework === "nextjs") {
    const content = nextjsPageTemplate(pascal);
    return {
      files: [{ op: "create", path: `src/app/${kebab}/page.tsx`, content }],
      explanation: `Created a Next.js page at \`src/app/${kebab}/page.tsx\` using the App Router.`,
      framework: "nextjs",
      language: "typescript",
      nextSteps: [`Visit it at http://localhost:3000/${kebab}`],
    };
  }
  if (req.framework === "vue") {
    return {
      files: [{ op: "create", path: `src/views/${pascal}.vue`, content: vueComponentTemplate(pascal, pascal) }],
      explanation: `Created a Vue page at \`src/views/${pascal}.vue\`.`,
      framework: "vue",
      language: "typescript",
      nextSteps: [`Add a route for it in your router config`],
    };
  }
  if (req.framework === "angular") {
    const content = angularComponentTemplate(pascal, pascal);
    return {
      files: [{ op: "create", path: `src/app/pages/${kebab}/${kebab}.component.ts`, content }],
      explanation: `Created an Angular page component at \`src/app/pages/${kebab}/${kebab}.component.ts\`.`,
      framework: "angular",
      language: "typescript",
      nextSteps: [`Add a route in your router: \`{ path: "${kebab}", component: ${pascal}Component }\``],
    };
  }
  return fallbackResponse(req);
}

async function createApi(req: CodeRequest): Promise<CodeResult> {
  const name = req.componentName || "Api";
  const kebab = toKebabCase(name);

  if (req.framework === "nextjs") {
    const content = `import { NextRequest, NextResponse } from "next/server";\n\nexport async function GET(req: NextRequest) {\n  const { searchParams } = new URL(req.url);\n  const q = searchParams.get("q") || "";\n  return NextResponse.json({\n    message: "Hello from ${name} API",\n    query: q,\n    timestamp: Date.now(),\n  });\n}\n\nexport async function POST(req: NextRequest) {\n  const body = await req.json().catch(() => ({}));\n  return NextResponse.json({ received: body, status: "ok" }, { status: 201 });\n}\n`;
    return {
      files: [{ op: "create", path: `src/app/api/${kebab}/route.ts`, content }],
      explanation: `Created a Next.js API route at \`src/app/api/${kebab}/route.ts\` with GET and POST handlers.`,
      framework: "nextjs",
      language: "typescript",
      nextSteps: [`Test it: curl http://localhost:3000/api/${kebab}`],
    };
  }
  if (req.framework === "express") {
    const content = expressRouteTemplate();
    return {
      files: [{ op: "create", path: `src/routes/${kebab}.ts`, content }],
      explanation: `Created an Express router at \`src/routes/${kebab}.ts\` with GET, POST, PUT, DELETE handlers.`,
      framework: "express",
      language: "typescript",
      nextSteps: [`Mount it: \`app.use("/api/${kebab}", ${toCamelCase(name)}Router);\``],
    };
  }
  if (req.framework === "fastapi") {
    const content = `from fastapi import APIRouter, HTTPException\nfrom pydantic import BaseModel\nfrom typing import List, Optional\n\nrouter = APIRouter(prefix="/${kebab}", tags=["${name}"])\n\nclass ${toPascalCase(name)}Item(BaseModel):\n    id: Optional[int] = None\n    name: str\n    description: Optional[str] = None\n\nitems_db: List[${toPascalCase(name)}Item] = []\n\n@router.get("/")\nasync def list_items():\n    return items_db\n\n@router.post("/", response_model=${toPascalCase(name)}Item, status_code=201)\nasync def create_item(item: ${toPascalCase(name)}Item):\n    item.id = len(items_db) + 1\n    items_db.append(item)\n    return item\n\n@router.get("/{item_id}")\nasync def get_item(item_id: int):\n    for item in items_db:\n        if item.id == item_id:\n            return item\n    raise HTTPException(status_code=404, detail="Item not found")\n\n@router.delete("/{item_id}", status_code=204)\nasync def delete_item(item_id: int):\n    global items_db\n    items_db = [i for i in items_db if i.id != item_id]\n`;
    return {
      files: [{ op: "create", path: `app/routers/${kebab}.py`, content }],
      explanation: `Created a FastAPI router at \`app/routers/${kebab}.py\` with full CRUD operations.`,
      framework: "fastapi",
      language: "python",
      nextSteps: [`Include it in main.py: \`from .routers import ${kebab}\`\n`, `app.include_router(${kebab}.router)`],
    };
  }
  return fallbackResponse(req);
}

async function createHook(req: CodeRequest): Promise<CodeResult> {
  const name = req.componentName || "MyHook";
  const camel = toCamelCase(name);
  if (!name.toLowerCase().startsWith("use")) {
    // prefix
  }
  const hookName = camel.startsWith("use") ? camel : `use${toPascalCase(name)}`;
  const content = reactHookTemplate(hookName);
  return {
    files: [{ op: "create", path: `src/hooks/${hookName}.ts`, content }],
    explanation: `Created a React hook \`${hookName}\` at \`src/hooks/${hookName}.ts\`. Includes state, effects, and cleanup.`,
    framework: "react",
    language: "typescript",
    nextSteps: [`Use it: \`const value = ${hookName}();\``],
  };
}

async function createUtility(req: CodeRequest): Promise<CodeResult> {
  const name = req.componentName || "Utils";
  const kebab = toKebabCase(name);
  const content = `/**\n * ${name} utility functions\n * Generated by Mr Robot\n */\n\n/**\n * Format a date as YYYY-MM-DD.\n */\nexport function formatDate(date: Date): string {\n  return date.toISOString().split("T")[0];\n}\n\n/**\n * Conditionally join class names.\n */\nexport function classNames(...classes: (string | false | null | undefined)[]): string {\n  return classes.filter(Boolean).join(" ");\n}\n\n/**\n * Debounce a function call.\n */\nexport function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300): (...args: Parameters<T>) => void {\n  let timeout: ReturnType<typeof setTimeout> | null = null;\n  return (...args: Parameters<T>) => {\n    if (timeout) clearTimeout(timeout);\n    timeout = setTimeout(() => fn(...args), wait);\n  };\n}\n\n/**\n * Generate a unique ID.\n */\nexport function uid(prefix = "id"): string {\n  return \`\${prefix}-\${Math.random().toString(36).slice(2, 9)}\`;\n}\n\n/**\n * Sleep for ms milliseconds.\n */\nexport function sleep(ms: number): Promise<void> {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n`;
  return {
    files: [{ op: "create", path: `src/utils/${kebab}.ts`, content }],
    explanation: `Created utility functions at \`src/utils/${kebab}.ts\`: formatDate, classNames, debounce, uid, sleep.`,
    framework: req.framework,
    language: "typescript",
    nextSteps: [`Import: \`import { formatDate, classNames } from "./utils/${kebab}";\``],
  };
}

async function createTest(req: CodeRequest): Promise<CodeResult> {
  const target = req.filePath || "src/App";
  const content = `import { describe, it, expect, vi } from "vitest";\n\ndescribe("${req.componentName || "module"}", () => {\n  it("works correctly", () => {\n    expect(true).toBe(true);\n  });\n\n  it("handles edge cases", () => {\n    expect(() => {\n      // call your function here\n    }).not.toThrow();\n  });\n});\n`;
  return {
    files: [{ op: "create", path: `${target}.test.ts`, content }],
    explanation: `Created a test file at \`${target}.test.ts\` with Vitest. Update the test cases to match your actual code.`,
    framework: req.framework,
    language: "typescript",
    nextSteps: ["Run tests: npm test"],
  };
}

async function createModel(req: CodeRequest): Promise<CodeResult> {
  const name = req.componentName || "Item";
  const pascal = toPascalCase(name);

  if (req.framework === "fastapi" || req.framework === "flask" || req.framework === "django" || req.framework === "odoo") {
    if (req.framework === "odoo") {
      const content = `from odoo import models, fields, api\n\nclass ${pascal}(models.Model):\n    _name = "${toKebabCase(name).replace(/-/g, "_")}.${toKebabCase(name).replace(/-/g, "_")}"\n    _description = "${name} Model"\n\n    name = fields.Char(string="Name", required=True, translate=True)\n    description = fields.Text(string="Description")\n    active = fields.Boolean(string="Active", default=True)\n    sequence = fields.Integer(string="Sequence", default=10)\n    date_field = fields.Date(string="Date")\n    datetime_field = fields.Datetime(string="Date Time")\n    state = fields.Selection([\n        ("draft", "Draft"),\n        ("confirmed", "Confirmed"),\n        ("done", "Done"),\n    ], string="State", default="draft")\n    value = fields.Float(string="Value", digits=(16, 2))\n    partner_id = fields.Many2one("res.partner", string="Partner")\n    tag_ids = fields.Many2many("${toKebabCase(name).replace(/-/g, "_")}.tag", string="Tags")\n    note = fields.Html(string="Note")\n\n    @api.model\n    def create(self, vals):\n        # Add your custom create logic here\n        return super().create(vals)\n\n    def action_confirm(self):\n        for rec in self:\n            rec.state = "confirmed"\n\n    def action_done(self):\n        for rec in self:\n            rec.state = "done"\n`;
      return {
        files: [
          { op: "create", path: `models/${toKebabCase(name).replace(/-/g, "_")}.py`, content },
          { op: "update", path: `models/__init__.py`, content: `from . import ${toKebabCase(name).replace(/-/g, "_")}\n` },
        ],
        explanation: `Created an Odoo model \`${pascal}\` with common field types (Char, Text, Selection, Many2one, Many2many, etc.) and action methods.`,
        framework: "odoo",
        language: "python",
        nextSteps: [
          "Add the model to your manifest's 'data' list if needed",
          "Upgrade the module: odoo-bin -u your_module -d your_db",
        ],
      };
    }
    if (req.framework === "django") {
      const content = `from django.db import models\nfrom django.utils import timezone\n\nclass ${pascal}(models.Model):\n    name = models.CharField(max_length=200, db_index=True)\n    description = models.TextField(blank=True)\n    is_active = models.BooleanField(default=True)\n    value = models.DecimalField(max_digits=16, decimal_places=2, default=0)\n    created_at = models.DateTimeField(default=timezone.now)\n    updated_at = models.DateTimeField(auto_now=True)\n\n    class Meta:\n        ordering = ["-created_at"]\n        verbose_name = "${name}"\n        verbose_name_plural = "${name}s"\n\n    def __str__(self):\n        return self.name\n`;
      return {
        files: [{ op: "create", path: `models/${toKebabCase(name)}.py`, content }],
        explanation: `Created a Django model \`${pascal}\` with common fields and Meta options.`,
        framework: "django",
        language: "python",
        nextSteps: ["python manage.py makemigrations", "python manage.py migrate"],
      };
    }
    // FastAPI / Flask - Pydantic
    const content = `from pydantic import BaseModel, Field\nfrom typing import Optional, List\nfrom datetime import datetime\n\nclass ${pascal}(BaseModel):\n    id: Optional[int] = None\n    name: str = Field(..., min_length=1, max_length=200, description="Name")\n    description: Optional[str] = Field(None, description="Description")\n    is_active: bool = Field(default=True)\n    value: float = Field(default=0, ge=0)\n    tags: List[str] = Field(default_factory=list)\n    created_at: datetime = Field(default_factory=datetime.now)\n\n    class Config:\n        json_schema_extra = {\n            "example": {\n                "name": "Sample ${name}",\n                "description": "A sample item",\n                "value": 19.99,\n                "tags": ["sample", "test"],\n            }\n        }\n`;
    return {
      files: [{ op: "create", path: `app/models/${toKebabCase(name)}.py`, content }],
      explanation: `Created a Pydantic model \`${pascal}\` at \`app/models/${toKebabCase(name)}.py\` with validation and example.`,
      framework: req.framework,
      language: "python",
      nextSteps: [`Import: \`from app.models.${toKebabCase(name)} import ${pascal}\``],
    };
  }

  // TypeScript model
  const content = `export interface ${pascal} {\n  id: string;\n  name: string;\n  description?: string;\n  isActive: boolean;\n  value: number;\n  tags: string[];\n  createdAt: Date;\n  updatedAt: Date;\n}\n\nexport function create${pascal}(input: Partial<${pascal}>): ${pascal} {\n  const now = new Date();\n  return {\n    id: input.id || crypto.randomUUID(),\n    name: input.name || "",\n    description: input.description,\n    isActive: input.isActive ?? true,\n    value: input.value ?? 0,\n    tags: input.tags || [],\n    createdAt: input.createdAt || now,\n    updatedAt: now,\n  };\n}\n`;
  return {
    files: [{ op: "create", path: `src/models/${pascal}.ts`, content }],
    explanation: `Created a TypeScript model interface \`${pascal}\` at \`src/models/${pascal}.ts\` with a factory function.`,
    framework: req.framework,
    language: "typescript",
    nextSteps: [`Import: \`import { ${pascal}, create${pascal} } from "./models/${pascal}";\``],
  };
}

// ---------- Fix / Refactor / Explain ----------

async function fixCode(req: CodeRequest): Promise<CodeResult> {
  if (!req.filePath) {
    return {
      files: [],
      explanation: "Please specify a file path to fix. Example: 'fix src/App.tsx'",
      framework: req.framework,
      language: req.language,
      nextSteps: ["Tell me which file to fix"],
    };
  }

  let content: string;
  try {
    content = await readFile(req.filePath);
  } catch {
    return {
      files: [],
      explanation: `Could not read ${req.filePath}. Make sure the file exists in the workspace.`,
      framework: req.framework,
      language: req.language,
      nextSteps: ["Check the file path is correct"],
    };
  }

  const issues = detectCodeIssues(content, req.language);
  if (issues.length === 0) {
    return {
      files: [],
      explanation: `I scanned ${req.filePath} and didn't find obvious issues. If you're seeing a specific error, paste it and I'll diagnose further. I can also run a linter: try asking me to run 'npm run lint' in the terminal.`,
      framework: req.framework,
      language: req.language,
      nextSteps: ["Try running a linter or test to surface hidden issues"],
    };
  }

  const fixed = applyFixes(content, issues);
  const files: FileOp[] = [{ op: "update", path: req.filePath, content: fixed.code }];

  return {
    files,
    explanation: `I found ${issues.length} issue(s) in ${req.filePath}:\n${issues.map((i) => `  • ${i.description}`).join("\n")}\n\nApplied fixes:\n${fixed.applied.map((f) => `  ✓ ${f}`).join("\n")}`,
    framework: req.framework,
    language: req.language,
    nextSteps: ["Review the changes", "Run the tests to verify"],
    warnings: fixed.unfixed.length > 0 ? [`Could not auto-fix: ${fixed.unfixed.join(", ")}`] : undefined,
  };
}

interface CodeIssue {
  type: string;
  description: string;
  fix?: string;
}

function detectCodeIssues(content: string, _language: string): CodeIssue[] {
  const issues: CodeIssue[] = [];

  // Common TS/JS issues
  // 1. var instead of let/const
  if (/\bvar\s+/.test(content)) {
    issues.push({
      type: "var_usage",
      description: "Uses 'var' instead of 'let' or 'const' (can cause scoping bugs)",
      fix: "var->let/const",
    });
  }

  // 2. == instead of ===
  if (/[^=!]==[^=]/.test(content)) {
    issues.push({
      type: "loose_equality",
      description: "Uses '==' loose equality (use '===' for strict equality)",
      fix: "==->===",
    });
  }

  // 3. console.log left in production code
  const consoleCount = (content.match(/console\.log\(/g) || []).length;
  if (consoleCount > 3) {
    issues.push({
      type: "console_log",
      description: `Has ${consoleCount} console.log statements (consider removing for production)`,
      fix: "remove_console_log",
    });
  }

  // 4. Missing semicolons at end of statements (very simple check)
  // Skip - too noisy

  // 5. TODO/FIXME comments
  const todoCount = (content.match(/\/\/\s*(TODO|FIXME|XXX|HACK)/g) || []).length;
  if (todoCount > 0) {
    issues.push({
      type: "todo",
      description: `Has ${todoCount} TODO/FIXME comment(s)`,
      // Don't auto-fix - they're intentional notes
    });
  }

  // 6. any type in TypeScript
  if (/:\s*any\b/.test(content)) {
    issues.push({
      type: "any_type",
      description: "Uses 'any' type (loses type safety)",
      // Don't auto-fix - need user context
    });
  }

  // 7. Empty catch block
  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content)) {
    issues.push({
      type: "empty_catch",
      description: "Empty catch block (errors will be silently swallowed)",
      fix: "empty_catch",
    });
  }

  // 8. Function defined inside render (React)
  if (/function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?return\s*\(</.test(content) && /useState|useEffect/.test(content)) {
    // This is heuristic - check for inline function definitions before JSX
    if (/const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*[^{]/.test(content)) {
      issues.push({
        type: "inline_function",
        description: "Possible inline function definition (may cause unnecessary re-renders in React)",
      });
    }
  }

  // 9. Missing 'use strict' for non-module JS (skip in TS)
  // 10. Hardcoded URLs/secrets
  if (/api[_-]?key\s*[:=]\s*["'][^"']+["']/i.test(content)) {
    issues.push({
      type: "hardcoded_secret",
      description: "Possible hardcoded API key (move to environment variable)",
    });
  }

  return issues;
}

function applyFixes(content: string, issues: CodeIssue[]): { code: string; applied: string[]; unfixed: string[] } {
  let code = content;
  const applied: string[] = [];
  const unfixed: string[] = [];

  for (const issue of issues) {
    if (!issue.fix) {
      unfixed.push(issue.type);
      continue;
    }
    switch (issue.fix) {
      case "var->let/const": {
        // Replace 'var x =' with 'const x =' (or 'let' if reassigned — heuristic: use let)
        const before = code;
        code = code.replace(/\bvar\s+([A-Za-z_$][\w$]*)\s*=/g, (match, name) => {
          // Check if reassigned later (simple heuristic)
          const reassignRegex = new RegExp(`\\b${name}\\s*=[^=]`);
          const afterVar = code.slice(code.indexOf(match) + match.length);
          return reassignRegex.test(afterVar) ? `let ${name} =` : `const ${name} =`;
        });
        if (code !== before) applied.push("Replaced 'var' with 'let'/'const'");
        break;
      }
      case "==->===": {
        const before = code;
        code = code.replace(/([^=!])==([^=])/g, "$1===$2");
        code = code.replace(/([^=!])!=([^=])/g, "$1!==$2");
        if (code !== before) applied.push("Replaced loose equality '==' with '==='");
        break;
      }
      case "remove_console_log": {
        const before = code;
        // Remove standalone console.log lines
        code = code.replace(/^\s*console\.log\([^)]*\);\s*$/gm, "");
        if (code !== before) applied.push("Removed extra console.log statements");
        break;
      }
      case "empty_catch": {
        const before = code;
        code = code.replace(/catch\s*\(([^)]*)\)\s*\{\s*\}/g, 'catch ($1) {\n    console.error($1);\n  }');
        if (code !== before) applied.push("Added error logging to empty catch blocks");
        break;
      }
      default:
        unfixed.push(issue.type);
    }
  }

  return { code, applied, unfixed };
}

async function refactorCode(req: CodeRequest): Promise<CodeResult> {
  if (!req.filePath) {
    return {
      files: [],
      explanation: "Please specify a file to refactor. Example: 'refactor src/utils/helpers.ts'",
      framework: req.framework,
      language: req.language,
      nextSteps: ["Specify a file path"],
    };
  }

  let content: string;
  try {
    content = await readFile(req.filePath);
  } catch {
    return {
      files: [],
      explanation: `Could not read ${req.filePath}.`,
      framework: req.framework,
      language: req.language,
      nextSteps: ["Check the file path"],
    };
  }

  // Same as fix but more aggressive
  const issues = detectCodeIssues(content, req.language);
  const fixed = applyFixes(content, issues);
  let refactored = fixed.code;

  // Additional refactoring: add JSDoc to exported functions without comments
  refactored = addJsdocToExports(refactored);

  // Convert function expressions to arrow functions where appropriate
  // (Skip - too risky without more context)

  if (refactored === content) {
    return {
      files: [],
      explanation: `${req.filePath} already looks well-refactored. No changes needed.`,
      framework: req.framework,
      language: req.language,
      nextSteps: ["Try a different file or be more specific"],
    };
  }

  return {
    files: [{ op: "update", path: req.filePath, content: refactored }],
    explanation: `Refactored ${req.filePath}. Changes:\n${fixed.applied.map((f) => `  ✓ ${f}`).join("\n")}\n  ✓ Added JSDoc comments to undocumented exports`,
    framework: req.framework,
    language: req.language,
    nextSteps: ["Run tests to verify nothing broke"],
  };
}

function addJsdocToExports(code: string): string {
  // Add a JSDoc comment to exported functions that don't have one
  return code.replace(
    /(?<![\s\S]*\/\*\*[\s\S]*?\*\/[\s\S]*?)(export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\))/g,
    (match, exportFn, name, params) => {
      const paramList = params.split(",").map((p: string) => p.trim()).filter(Boolean);
      const doc = [
        "/**",
        ` * ${name}`,
        paramList.length > 0 ? " *" : "",
        ...paramList.map((p: string) => ` * @param ${p.split("=")[0].trim()} - Description`),
        " */",
      ].filter((line) => line).join("\n");
      return `${doc}\n${exportFn}`;
    }
  );
}

async function explainCode(req: CodeRequest): Promise<CodeResult> {
  if (!req.filePath) {
    return {
      files: [],
      explanation: "Please specify a file to explain. Example: 'explain src/App.tsx'",
      framework: req.framework,
      language: req.language,
      nextSteps: ["Specify a file path"],
    };
  }

  let content: string;
  try {
    content = await readFile(req.filePath);
  } catch {
    return {
      files: [],
      explanation: `Could not read ${req.filePath}.`,
      framework: req.framework,
      language: req.language,
      nextSteps: ["Check the file path"],
    };
  }

  const lines = content.split("\n");
  const analysis = analyzeCode(content, req.language);

  const explanation = [
    `**${req.filePath}** — ${lines.length} lines, ${req.language}`,
    "",
    "## Overview",
    analysis.overview,
    "",
    "## Structure",
    analysis.structure,
    "",
    "## Key components",
    analysis.components,
    "",
    "## Notable patterns",
    analysis.patterns,
  ].join("\n");

  return {
    files: [],
    explanation,
    framework: req.framework,
    language: req.language,
    nextSteps: ["Ask me to fix or refactor specific parts"],
  };
}

function analyzeCode(content: string, language: string): { overview: string; structure: string; components: string; patterns: string } {
  const exports: string[] = [];
  const imports: string[] = [];
  const functions: string[] = [];

  // Extract exports
  const exportMatches = content.matchAll(/export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g);
  for (const m of exportMatches) exports.push(m[1]);

  // Extract imports
  const importMatches = content.matchAll(/import\s+(?:\{[^}]+\}|\w+)\s+from\s+["']([^"']+)["']/g);
  for (const m of importMatches) imports.push(m[1]);

  // Extract functions
  const fnMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
  for (const m of fnMatches) functions.push(m[1]);

  const arrowFns = content.match(/=>\s*[{(]/g);
  const arrowCount = arrowFns ? arrowFns.length : 0;

  const overview = `This ${language} file ${exports.length > 0 ? `exports ${exports.length} symbol(s): ${exports.join(", ")}.` : "has no exports."} It imports ${imports.length} module(s) and defines ${functions.length} named function(s) plus ${arrowCount} arrow function(s).`;

  const structure = [
    `- Imports: ${imports.length > 0 ? imports.slice(0, 5).join(", ") + (imports.length > 5 ? `, +${imports.length - 5} more` : "") : "none"}`,
    `- Exports: ${exports.length > 0 ? exports.join(", ") : "none"}`,
    `- Functions: ${functions.length > 0 ? functions.slice(0, 5).join(", ") : "none"}`,
    `- Total lines: ${content.split("\n").length}`,
  ].join("\n");

  const components = functions.slice(0, 5).map((f) => `- \`${f}\``).join("\n") || "(no named functions)";

  const patterns: string[] = [];
  if (/useState|useEffect|useMemo|useCallback/.test(content)) patterns.push("- React hooks pattern (stateful functional component)");
  if (/async\s+function|async\s*\(|\.then\(|await\s/.test(content)) patterns.push("- Async/await pattern");
  if (/class\s+\w+/.test(content)) patterns.push("- Class-based design");
  if (/interface\s+\w+|type\s+\w+\s*=/.test(content)) patterns.push("- TypeScript types/interfaces");
  if (/try\s*\{/.test(content)) patterns.push("- Error handling with try/catch");
  if (patterns.length === 0) patterns.push("- No notable patterns detected");

  return { overview, structure, components, patterns: patterns.join("\n") };
}

async function addFeature(req: CodeRequest): Promise<CodeResult> {
  // Heuristic: if the user said "add X to Y file"
  const targetMatch = req.raw.match(/(?:to|in|into)\s+([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/i);
  const target = targetMatch ? targetMatch[1] : req.filePath;
  if (!target) {
    return {
      files: [],
      explanation: "Tell me which file to add the feature to. Example: 'add dark mode toggle to src/App.tsx'",
      framework: req.framework,
      language: req.language,
      nextSteps: ["Specify a target file"],
    };
  }

  // Generic feature addition - we add a stub and let the user fill in
  const featureName = req.componentName || "Feature";
  const stub = `\n\n// Added by Mr Robot: ${featureName}\n// TODO: Implement this feature based on: ${req.raw}\nexport function ${toCamelCase(featureName)}() {\n  // Implementation goes here\n  console.warn("${featureName} is not yet implemented");\n}\n`;

  let content = "";
  try {
    content = await readFile(target);
  } catch {
    return {
      files: [],
      explanation: `Could not read ${target}.`,
      framework: req.framework,
      language: req.language,
      nextSteps: ["Check the file path"],
    };
  }

  return {
    files: [{ op: "update", path: target, content: content + stub }],
    explanation: `Added a stub for "${featureName}" to ${target}. The function is exported and ready for you to implement. Original request: "${req.raw}"`,
    framework: req.framework,
    language: req.language,
    nextSteps: ["Open the file and implement the function body", "Run tests to verify"],
  };
}

async function removeFeature(req: CodeRequest): Promise<CodeResult> {
  if (!req.filePath) {
    return {
      files: [],
      explanation: "Tell me which file to modify and what to remove.",
      framework: req.framework,
      language: req.language,
      nextSteps: ["Specify a target file"],
    };
  }
  return {
    files: [],
    explanation: `Remove feature requests need more context. Please tell me the specific function name, import, or block to remove from ${req.filePath}.`,
    framework: req.framework,
    language: req.language,
    nextSteps: ["Be more specific about what to remove"],
  };
}

function fallbackResponse(req: CodeRequest): CodeResult {
  return {
    files: [],
    explanation: `I'm not sure exactly what you want. Try phrases like:\n\n• "scaffold a react project called MyApp"\n• "create an angular component called UserCard"\n• "create a nextjs api called users"\n• "create a vue page called Dashboard"\n• "fix src/App.tsx"\n• "refactor src/utils/helpers.ts"\n• "explain src/index.ts"\n• "create an odoo model called Product"\n• "create a fastapi route called orders"\n\nDetected framework: ${req.framework}\nDetected intent: ${req.intent}`,
    framework: req.framework,
    language: req.language,
    nextSteps: ["Try one of the example phrases above"],
  };
}

// ---------- Template helpers ----------

function reactComponentTemplate(_projectName: string, componentName: string): string {
  return `import React, { useState } from "react";\n\nexport interface ${componentName}Props {\n  title?: string;\n}\n\nexport function ${componentName}({ title = "${componentName}" }: ${componentName}Props) {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div\n      style={{\n        padding: 24,\n        borderRadius: 12,\n        background: "linear-gradient(135deg, #f59e0b, #ef4444, #ec4899)",\n        color: "white",\n        fontFamily: "system-ui, sans-serif",\n        minHeight: 200,\n      }}\n    >\n      <h1 style={{ margin: 0, marginBottom: 16, fontSize: 24 }}>{title}</h1>\n      <p style={{ marginBottom: 16, opacity: 0.9 }}>\n        Welcome to your new React app. Edit <code>src/App.tsx</code> to get started.\n      </p>\n      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>\n        <button\n          onClick={() => setCount((c) => c - 1)}\n          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer" }}\n        >\n          -\n        </button>\n        <span style={{ minWidth: 40, textAlign: "center", fontWeight: 600 }}>{count}</span>\n        <button\n          onClick={() => setCount((c) => c + 1)}\n          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.2)", color: "white", cursor: "pointer" }}\n        >\n          +\n        </button>\n      </div>\n    </div>\n  );\n}\n\nexport default ${componentName};\n`;
}

function reactHookTemplate(hookName: string): string {
  return `import { useState, useEffect, useCallback } from "react";\n\n/**\n * ${hookName} - custom React hook\n * Generated by Mr Robot\n */\nexport function ${hookName}(initialValue?: any) {\n  const [value, setValue] = useState(initialValue);\n  const [loading, setLoading] = useState(false);\n  const [error, setError] = useState<Error | null>(null);\n\n  useEffect(() => {\n    // Side effect goes here\n    return () => {\n      // Cleanup goes here\n    };\n  }, []);\n\n  const update = useCallback((newValue: any) => {\n    setValue(newValue);\n  }, []);\n\n  const reset = useCallback(() => {\n    setValue(initialValue);\n    setError(null);\n  }, [initialValue]);\n\n  return { value, loading, error, update, reset, setValue };\n}\n`;
}

function nextjsPageTemplate(_name: string): string {
  return `import { Button } from "@/components/ui/button";\n\nexport default function HomePage() {\n  return (\n    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">\n      <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">\n        Welcome\n      </h1>\n      <p className="text-zinc-400 max-w-md text-center">\n        Built with Next.js 15 + TypeScript. Edit <code className="text-amber-400">src/app/page.tsx</code> to get started.\n      </p>\n      <Button onClick={() => alert("Hello from Next.js!")}>\n        Click me\n      </Button>\n    </main>\n  );\n}\n`;
}

function vueComponentTemplate(_projectName: string, componentName: string): string {
  return `<script setup lang="ts">\nimport { ref, computed } from "vue";\n\nconst props = defineProps<{\n  title?: string;\n}>();\n\nconst count = ref(0);\nconst displayTitle = computed(() => props.title ?? "${componentName}");\n\nfunction increment() {\n  count.value++;\n}\n\nfunction decrement() {\n  count.value--;\n}\n</script>\n\n<template>\n  <div class="card">\n    <h1>{{ displayTitle }}</h1>\n    <p>Welcome to your Vue 3 app. Edit <code>src/App.vue</code> to get started.</p>\n    <div class="counter">\n      <button @click="decrement">-</button>\n      <span>{{ count }}</span>\n      <button @click="increment">+</button>\n    </div>\n  </div>\n</template>\n\n<style scoped>\n.card {\n  padding: 24px;\n  border-radius: 12px;\n  background: linear-gradient(135deg, #f59e0b, #ef4444, #ec4899);\n  color: white;\n  font-family: system-ui, sans-serif;\n  min-height: 200px;\n}\n.counter {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n}\nbutton {\n  padding: 8px 16px;\n  border-radius: 8px;\n  border: none;\n  background: rgba(255, 255, 255, 0.2);\n  color: white;\n  cursor: pointer;\n}\n</style>\n`;
}

function angularComponentTemplate(_projectName: string, componentName: string): string {
  const pascal = toPascalCase(componentName);
  return `import { Component, signal } from "@angular/core";\nimport { CommonModule } from "@angular/common";\n\n@Component({\n  selector: "app-${toKebabCase(componentName)}",\n  standalone: true,\n  imports: [CommonModule],\n  template: \`\n    <div class="card">\n      <h1>{{ title() }}</h1>\n      <p>Welcome to your Angular 19 app. Edit the component to get started.</p>\n      <div class="counter">\n        <button (click)="decrement()">-</button>\n        <span>{{ count() }}</span>\n        <button (click)="increment()">+</button>\n      </div>\n    </div>\n  \`,\n  styles: [\    \`\n      .card {\n        padding: 24px;\n        border-radius: 12px;\n        background: linear-gradient(135deg, #f59e0b, #ef4444, #ec4899);\n        color: white;\n        font-family: system-ui, sans-serif;\n        min-height: 200px;\n      }\n      .counter { display: flex; gap: 8px; align-items: center; }\n      button { padding: 8px 16px; border-radius: 8px; border: none; background: rgba(255,255,255,0.2); color: white; cursor: pointer; }\n    \`,\n  ],\n})\nexport class ${pascal}Component {\n  title = signal("${pascal}");\n  count = signal(0);\n\n  increment() {\n    this.count.update((c) => c + 1);\n  }\n\n  decrement() {\n    this.count.update((c) => c - 1);\n  }\n}\n`;
}

function svelteComponentTemplate(_projectName: string): string {
  return `<script lang="ts">\n  let count = $state(0);\n  let title = $state("Welcome");\n\n  function increment() { count++; }\n  function decrement() { count--; }\n</script>\n\n<main>\n  <h1>{title}</h1>\n  <p>Welcome to your SvelteKit app. Edit <code>src/routes/+page.svelte</code> to get started.</p>\n  <div class="counter">\n    <button onclick={decrement}>-</button>\n    <span>{count}</span>\n    <button onclick={increment}>+</button>\n  </div>\n</main>\n\n<style>\n  main {\n    padding: 24px;\n    border-radius: 12px;\n    background: linear-gradient(135deg, #f59e0b, #ef4444, #ec4899);\n    color: white;\n    font-family: system-ui, sans-serif;\n    min-height: 200px;\n  }\n  .counter { display: flex; gap: 8px; align-items: center; }\n  button { padding: 8px 16px; border-radius: 8px; border: none; background: rgba(255,255,255,0.2); color: white; cursor: pointer; }\n</style>\n`;
}

function expressServerTemplate(name: string): string {
  return `import express, { Request, Response } from "express";\nimport cors from "cors";\nimport { logger } from "./middleware/logger";\nimport usersRouter from "./routes/users";\n\nconst app = express();\nconst PORT = process.env.PORT || 3000;\n\n// Middleware\napp.use(cors());\napp.use(express.json());\napp.use(logger);\n\n// Health check\napp.get("/health", (_req: Request, res: Response) => {\n  res.json({ status: "ok", service: "${name}", timestamp: Date.now() });\n});\n\n// Routes\napp.use("/api/users", usersRouter);\n\n// 404 handler\napp.use((_req: Request, res: Response) => {\n  res.status(404).json({ error: "Not found" });\n});\n\n// Error handler\napp.use((err: Error, _req: Request, res: Response, _next: () => void) => {\n  console.error(err);\n  res.status(500).json({ error: "Internal server error" });\n});\n\napp.listen(PORT, () => {\n  console.log(\`${name} server running on http://localhost:\${PORT}\`);\n});\n\nexport default app;\n`;
}

function expressRouteTemplate(): string {
  return `import { Router, Request, Response } from "express";\n\nconst router = Router();\n\n// In-memory storage (replace with a database in production)\nconst items: any[] = [];\n\n// GET /api/items\nrouter.get("/", (_req: Request, res: Response) => {\n  res.json(items);\n});\n\n// GET /api/items/:id\nrouter.get("/:id", (req: Request, res: Response) => {\n  const item = items.find((i) => i.id === parseInt(req.params.id));\n  if (!item) return res.status(404).json({ error: "Not found" });\n  res.json(item);\n});\n\n// POST /api/items\nrouter.post("/", (req: Request, res: Response) => {\n  const item = { id: items.length + 1, ...req.body, createdAt: new Date() };\n  items.push(item);\n  res.status(201).json(item);\n});\n\n// PUT /api/items/:id\nrouter.put("/:id", (req: Request, res: Response) => {\n  const idx = items.findIndex((i) => i.id === parseInt(req.params.id));\n  if (idx === -1) return res.status(404).json({ error: "Not found" });\n  items[idx] = { ...items[idx], ...req.body };\n  res.json(items[idx]);\n});\n\n// DELETE /api/items/:id\nrouter.delete("/:id", (req: Request, res: Response) => {\n  const idx = items.findIndex((i) => i.id === parseInt(req.params.id));\n  if (idx === -1) return res.status(404).json({ error: "Not found" });\n  items.splice(idx, 1);\n  res.status(204).send();\n});\n\nexport default router;\n`;
}

function fastifyServerTemplate(name: string): string {
  return `import Fastify from "fastify";\nimport cors from "@fastify/cors";\n\nconst app = Fastify({ logger: true });\n\nawait app.register(cors, { origin: true });\n\napp.get("/health", async () => {\n  return { status: "ok", service: "${name}", timestamp: Date.now() };\n});\n\napp.get("/api/items", async () => {\n  return [{ id: 1, name: "Sample item" }];\n});\n\napp.post("/api/items", async (req, reply) => {\n  const body = req.body as { name: string };\n  const item = { id: Date.now(), name: body.name };\n  return reply.code(201).send(item);\n});\n\nconst PORT = Number(process.env.PORT) || 3000;\n\ntry {\n  await app.listen({ port: PORT, host: "0.0.0.0" });\n  app.log.info(\`${name} server running on http://localhost:\${PORT}\`);\n} catch (err) {\n  app.log.error(err);\n  process.exit(1);\n}\n`;
}

function flaskAppTemplate(name: string): string {
  return `from flask import Flask, jsonify, request\nfrom config import Config\n\napp = Flask(__name__)\napp.config.from_object(Config)\n\n# In-memory storage\nitems = []\n\n@app.route("/health")\ndef health():\n    return jsonify({"status": "ok", "service": "${name}"})\n\n@app.route("/api/items", methods=["GET"])\ndef list_items():\n    return jsonify(items)\n\n@app.route("/api/items", methods=["POST"])\ndef create_item():\n    data = request.get_json() or {}\n    item = {"id": len(items) + 1, "name": data.get("name", ""), "description": data.get("description", "")}\n    items.append(item)\n    return jsonify(item), 201\n\n@app.route("/api/items/<int:item_id>", methods=["GET"])\ndef get_item(item_id):\n    item = next((i for i in items if i["id"] == item_id), None)\n    if not item:\n        return jsonify({"error": "Not found"}), 404\n    return jsonify(item)\n\n@app.route("/api/items/<int:item_id>", methods=["DELETE"])\ndef delete_item(item_id):\n    global items\n    items = [i for i in items if i["id"] != item_id]\n    return "", 204\n\nif __name__ == "__main__":\n    app.run(host="0.0.0.0", port=5000, debug=Config.DEBUG)\n`;
}

function djangoManageTemplate(name: string): string {
  return `#!/usr/bin/env python\nimport os\nimport sys\n\ndef main():\n    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "${name}.settings")\n    try:\n        from django.core.management import execute_from_command_line\n    except ImportError as exc:\n        raise ImportError(\n            "Couldn't import Django. Make sure it's installed and "\n            "available on your PYTHONPATH environment variable."\n        ) from exc\n    execute_from_command_line(sys.argv)\n\nif __name__ == "__main__":\n    main()\n`;
}

function djangoSettingsTemplate(name: string): string {
  return `from pathlib import Path\nimport os\n\nBASE_DIR = Path(__file__).resolve().parent.parent\n\nSECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")\nDEBUG = os.environ.get("DEBUG", "1") == "1"\nALLOWED_HOSTS = ["*"]\n\nINSTALLED_APPS = [\n    "django.contrib.admin",\n    "django.contrib.auth",\n    "django.contrib.contenttypes",\n    "django.contrib.sessions",\n    "django.contrib.messages",\n    "django.contrib.staticfiles",\n    "rest_framework",\n    "apps.api",\n]\n\nMIDDLEWARE = [\n    "django.middleware.security.SecurityMiddleware",\n    "django.contrib.sessions.middleware.SessionMiddleware",\n    "django.middleware.common.CommonMiddleware",\n    "django.middleware.csrf.CsrfViewMiddleware",\n    "django.contrib.auth.middleware.AuthenticationMiddleware",\n    "django.contrib.messages.middleware.MessageMiddleware",\n    "django.middleware.clickjacking.XFrameOptionsMiddleware",\n]\n\nROOT_URLCONF = "${name}.urls"\n\nTEMPLATES = [\n    {\n        "BACKEND": "django.template.backends.django.DjangoTemplates",\n        "DIRS": [],\n        "APP_DIRS": True,\n        "OPTIONS": {\n            "context_processors": [\n                "django.template.context_processors.debug",\n                "django.template.context_processors.request",\n                "django.contrib.auth.context_processors.auth",\n                "django.contrib.messages.context_processors.messages",\n            ],\n        },\n    },\n]\n\nWSGI_APPLICATION = "${name}.wsgi.application"\n\nDATABASES = {\n    "default": {\n        "ENGINE": "django.db.backends.sqlite3",\n        "NAME": BASE_DIR / "db.sqlite3",\n    }\n}\n\nAUTH_PASSWORD_VALIDATORS = [\n    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},\n    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},\n    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},\n    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},\n]\n\nLANGUAGE_CODE = "en-us"\nTIME_ZONE = "UTC"\nUSE_I18N = True\nUSE_TZ = True\n\nSTATIC_URL = "static/"\nDEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"\n`;
}

function fastapiAppTemplate(_name: string): string {
  return `from fastapi import FastAPI, HTTPException\nfrom .database import init_db, get_db\nfrom .models import Item\nfrom typing import List\n\napp = FastAPI(title="FastAPI App", version="1.0.0")\n\n@app.on_event("startup")\ndef startup():\n    init_db()\n\n@app.get("/health")\nasync def health():\n    return {"status": "ok", "service": "${_name}"}\n\n@app.get("/api/items", response_model=List[Item])\nasync def list_items():\n    with get_db() as conn:\n        rows = conn.execute("SELECT * FROM items ORDER BY id DESC").fetchall()\n        return [dict(r) for r in rows]\n\n@app.post("/api/items", response_model=Item, status_code=201)\nasync def create_item(item: Item):\n    with get_db() as conn:\n        cur = conn.execute(\n            "INSERT INTO items (name, description, created_at) VALUES (?, ?, ?)",\n            (item.name, item.description, item.created_at.isoformat()),\n        )\n        item.id = cur.lastrowid\n        return item\n\n@app.get("/api/items/{item_id}", response_model=Item)\nasync def get_item(item_id: int):\n    with get_db() as conn:\n        row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()\n        if not row:\n            raise HTTPException(status_code=404, detail="Item not found")\n        return dict(row)\n\n@app.delete("/api/items/{item_id}", status_code=204)\nasync def delete_item(item_id: int):\n    with get_db() as conn:\n        conn.execute("DELETE FROM items WHERE id = ?", (item_id,))\n`;
}

function odooManifestTemplate(name: string): string {
  return `{\n    "name": "${toPascalCase(name)}",\n    "version": "17.0.1.0.0",\n    "summary": "Custom ${toPascalCase(name)} module",\n    "description": """\n${toPascalCase(name)}\n=========\nA custom Odoo module generated by Mr Robot.\n    """,\n    "author": "Mr Robot",\n    "website": "https://example.com",\n    "category": "Tools",\n    "license": "LGPL-3",\n    "depends": ["base", "mail"],\n    "data": [\n        "security/ir.model.access.csv",\n        "views/${name.replace(/-/g, "_")}_views.xml",\n    ],\n    "demo": [],\n    "installable": True,\n    "application": False,\n    "auto_install": False,\n}\n`;
}

function odooModelTemplate(name: string): string {
  const underscore = name.replace(/-/g, "_");
  return `from odoo import models, fields, api\n\n\nclass ${toPascalCase(name)}(models.Model):\n    _name = "${underscore}.${underscore}"\n    _description = "${toPascalCase(name)}"\n\n    name = fields.Char(string="Name", required=True)\n    description = fields.Text(string="Description")\n    active = fields.Boolean(string="Active", default=True)\n    sequence = fields.Integer(string="Sequence", default=10)\n    state = fields.Selection([\n        ("draft", "Draft"),\n        ("confirmed", "Confirmed"),\n        ("done", "Done"),\n    ], string="State", default="draft", tracking=True)\n    value = fields.Float(string="Value", digits=(16, 2))\n    date = fields.Date(string="Date")\n    partner_id = fields.Many2one("res.partner", string="Partner")\n    note = fields.Html(string="Notes")\n\n    def action_confirm(self):\n        for rec in self:\n            rec.state = "confirmed"\n\n    def action_done(self):\n        for rec in self:\n            rec.state = "done"\n\n    def action_reset_draft(self):\n        for rec in self:\n            rec.state = "draft"\n`;
}

function odooViewsTemplate(name: string): string {
  const underscore = name.replace(/-/g, "_");
  const pascal = toPascalCase(name);
  return `<?xml version="1.0" encoding="utf-8"?>\n<odoo>\n    <!-- List View -->\n    <record id="${underscore}_view_list" model="ir.ui.view">\n        <field name="name">${pascal}.list</field>\n        <field name="model">${underscore}.${underscore}</field>\n        <field name="arch" type="xml">\n            <list string="${pascal}">\n                <field name="name"/>\n                <field name="state"/>\n                <field name="value"/>\n                <field name="date"/>\n            </list>\n        </field>\n    </record>\n\n    <!-- Form View -->\n    <record id="${underscore}_view_form" model="ir.ui.view">\n        <field name="name">${pascal}.form</field>\n        <field name="model">${underscore}.${underscore}</field>\n        <field name="arch" type="xml">\n            <form string="${pascal}">\n                <header>\n                    <button name="action_confirm" type="object" string="Confirm" class="oe_highlight" invisible="state != 'draft'"/>\n                    <button name="action_done" type="object" string="Mark Done" class="oe_highlight" invisible="state != 'confirmed'"/>\n                    <button name="action_reset_draft" type="object" string="Reset to Draft" invisible="state == 'draft'"/>\n                    <field name="state" widget="statusbar" statusbar_visible="draft,confirmed,done"/>\n                </header>\n                <sheet>\n                    <group>\n                        <group>\n                            <field name="name"/>\n                            <field name="value"/>\n                            <field name="date"/>\n                        </group>\n                        <group>\n                            <field name="partner_id"/>\n                            <field name="active" invisible="1"/>\n                            <field name="sequence" invisible="1"/>\n                        </group>\n                    </group>\n                    <notebook>\n                        <page string="Description">\n                            <field name="description"/>\n                        </page>\n                        <page string="Notes">\n                            <field name="note"/>\n                        </page>\n                    </notebook>\n                </sheet>\n            </form>\n        </field>\n    </record>\n\n    <!-- Search View -->\n    <record id="${underscore}_view_search" model="ir.ui.view">\n        <field name="name">${pascal}.search</field>\n        <field name="model">${underscore}.${underscore}</field>\n        <field name="arch" type="xml">\n            <search string="${pascal}">\n                <field name="name"/>\n                <field name="partner_id"/>\n                <filter name="filter_draft" string="Draft" domain="[('state', '=', 'draft')]"/>\n                <filter name="filter_confirmed" string="Confirmed" domain="[('state', '=', 'confirmed')]"/>\n                <filter name="filter_done" string="Done" domain="[('state', '=', 'done')]"/>\n                <group expand="0" string="Group By">\n                    <filter name="group_state" string="State" context="{'group_by': 'state'}"/>\n                    <filter name="group_partner" string="Partner" context="{'group_by': 'partner_id'}"/>\n                </group>\n            </search>\n        </field>\n    </record>\n\n    <!-- Action -->\n    <record id="${underscore}_action" model="ir.actions.act_window">\n        <field name="name">${pascal}</field>\n        <field name="res_model">${underscore}.${underscore}</field>\n        <field name="view_mode">list,form</field>\n        <field name="search_view_id" ref="${underscore}_view_search"/>\n    </record>\n\n    <!-- Menu -->\n    <menuitem id="${underscore}_menu_root" name="${pascal}" sequence="10"/>\n    <menuitem id="${underscore}_menu_main" name="${pascal}" parent="${underscore}_menu_root" sequence="10" action="${underscore}_action"/>\n</odoo>\n`;
}
