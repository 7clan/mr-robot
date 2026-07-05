/**
 * Web Search Engine — Built from scratch
 *
 * NO Wikipedia. NO API keys needed.
 * 
 * Search strategy:
 *   1. Bing HTML scraping (works from residential IPs)
 *   2. Bing HTML scraping (works from residential IPs)
 *   3. Google HTML scraping (works from residential IPs)
 *   4. DuckDuckGo HTML scraping (works from residential IPs)
 *   5. Fetch actual web pages from result URLs
 *   6. Extract readable text and find the answer
 *
 * All search engines block sandbox/datacenter IPs but work from home IPs.
 */

import { db } from "@/lib/db";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  source: "bing" | "google" | "duckduckgo" | "web" | "page";
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Fetch with timeout
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract readable text from HTML — aggressively cleans whitespace.
 * Uses @mozilla/readability (Firefox Reader View engine) for the best
 * content extraction. Falls back to manual extraction if not available.
 */
async function extractText(html: string, url?: string): Promise<string> {
  // Method 1: Use @mozilla/readability (Firefox Reader View) — best quality
  try {
    const { Readability } = await import("@mozilla/readability");
    const { JSDOM } = await import("jsdom");
    const doc = new JSDOM(html, { url: url || "http://localhost" });
    const reader = new Readability(doc.window.document, {
      charThreshold: 100,  // Lower threshold for shorter articles
    });
    const article = reader.parse();
    if (article && article.textContent && article.textContent.length > 50) {
      // Clean up the extracted text
      const cleaned = article.textContent
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 15)
        .join("\n");
      return cleaned.slice(0, 8000);
    }
  } catch {
    // Readability not available or failed — fall through to manual extraction
  }

  // Method 2: Manual extraction (fallback)
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  text = text.replace(/<form[\s\S]*?<\/form>/gi, "");
  text = text.replace(/<button[\s\S]*?<\/button>/gi, "");
  text = text.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  text = text.replace(/<\/(p|div|li|h[1-6]|br|tr|td|section|article|blockquote)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#91;/g, "[").replace(/&#93;/g, "]");
  const lines = text.split("\n").map(l => l.replace(/[ \t]+/g, " ").trim());
  const cleanLines = lines.filter(l => l.length > 15 && !/^\s*$/.test(l));
  const deduped: string[] = [];
  for (const l of cleanLines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== l) {
      deduped.push(l);
    }
  }
  return deduped.join("\n").slice(0, 8000);
}

/**
 * Parse Bing search results from HTML.
 */
function parseBing(html: string): Array<{url: string; title: string; snippet: string}> {
  const results: Array<{url: string; title: string; snippet: string}> = [];
  // Bing: <li class="b_algo"><h2><a href="URL">TITLE</a></h2><p>SNIPPET</p></li>
  const blocks = html.match(/<li[^>]*class="b_algo"[\s\S]*?<\/li>/gi) || [];
  for (const block of blocks) {
    const linkM = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkM) continue;
    const url = linkM[1];
    const title = linkM[2].replace(/<[^>]+>/g, "").trim();
    const snipM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snipM ? snipM[1].replace(/<[^>]+>/g, "").trim() : "";
    if (!url.includes("bing.com") && !url.includes("microsoft.com")) {
      results.push({ url, title, snippet });
    }
  }
  return results;
}

/**
 * Parse Google search results from HTML.
 * Uses the same selectors as pskill9/web-search (456 stars on GitHub):
 *   div.g → result containers
 *   h3 → titles
 *   a → links
 *   .VwiC3b → snippets
 */
function parseGoogle(html: string): Array<{url: string; title: string; snippet: string}> {
  const results: Array<{url: string; title: string; snippet: string}> = [];
  
  // Method 1: Use the proven selectors from pskill9/web-search
  // div.g contains each result, h3 has the title, a has the link, .VwiC3b has the snippet
  const blockRegex = /<div[^>]*class="[^"]*g[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let match: RegExpExecArray | null;
  let count = 0;
  
  while ((match = blockRegex.exec(html)) !== null && count < 15) {
    const block = match[1];
    // Find h3 title
    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    // Find link (must start with http)
    const linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/i);
    // Find snippet (.VwiC3b class)
    const snippetMatch = block.match(/<[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    
    if (titleMatch && linkMatch) {
      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      const url = linkMatch[1];
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      
      if (url && !url.includes("google.com") && !url.includes("youtube.com/results") && title.length > 3) {
        results.push({ url, title, snippet });
        count++;
      }
    }
  }
  
  // Method 2: Fallback — look for /url?q= pattern (older Google format)
  if (results.length === 0) {
    const urlMatches = html.matchAll(/\/url\?q=(https?:\/\/[^&]+)/g);
    const seen = new Set<string>();
    for (const m of urlMatches) {
      const url = decodeURIComponent(m[1]);
      if (!seen.has(url) && !url.includes("google.com") && !url.includes("youtube.com/results")) {
        seen.add(url);
        results.push({ url, title: "", snippet: "" });
      }
    }
  }
  
  // Method 3: Fallback — find all external links with h3 titles nearby
  if (results.length === 0) {
    const linkMatches = html.matchAll(/<a[^>]*href="(https?:\/\/(?!www\.google\.|accounts\.google\.|support\.google\.|policies\.google\.)[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi);
    for (const m of linkMatches) {
      const url = m[1];
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (title.length > 5) {
        results.push({ url, title, snippet: "" });
      }
    }
  }
  
  return results;
}

/**
 * Parse DuckDuckGo HTML search results.
 */
function parseDDG(html: string): Array<{url: string; title: string; snippet: string}> {
  const results: Array<{url: string; title: string; snippet: string}> = [];
  // DDG: <a class="result__a" href="...">title</a>
  const links = html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
  for (const m of links) {
    let url = m[1];
    const ddgM = url.match(/uddg=([^&]+)/);
    if (ddgM) { try { url = decodeURIComponent(ddgM[1]); } catch {} }
    const title = m[2].replace(/<[^>]+>/g, "").trim();
    if (!url.includes("duckduckgo.com")) {
      results.push({ url, title, snippet: "" });
    }
  }
  // Also try lite format: <a class="result-link" href="...">
  if (results.length === 0) {
    const links2 = html.matchAll(/<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    for (const m of links2) {
      let url = m[1];
      const ddgM = url.match(/uddg=([^&]+)/);
      if (ddgM) { try { url = decodeURIComponent(ddgM[1]); } catch {} }
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (!url.includes("duckduckgo.com")) {
        results.push({ url, title, snippet: "" });
      }
    }
  }
  return results;
}


/**
 * Search using Bing HTML scraping.
 */
async function searchBing(query: string, max = 8): Promise<WebResult[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=15`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": BROWSER_UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
      cache: "no-store",
    }, 8000);
    if (!res.ok) return [];
    const html = await res.text();
    const results = parseBing(html);
    return results.slice(0, max).map(r => ({
      title: r.title, url: r.url, snippet: r.snippet, content: r.snippet, source: "bing" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Search using Google HTML scraping.
 */
async function searchGoogle(query: string, max = 8): Promise<WebResult[]> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": BROWSER_UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
      cache: "no-store",
    }, 8000);
    if (!res.ok) return [];
    const html = await res.text();
    const results = parseGoogle(html);
    return results.slice(0, max).map(r => ({
      title: r.title, url: r.url, snippet: r.snippet, content: r.snippet, source: "google" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Search using DuckDuckGo HTML scraping.
 */
async function searchDDG(query: string, max = 8): Promise<WebResult[]> {
  try {
    const body = new URLSearchParams({ q: query, kl: "" });
    const res = await fetchWithTimeout("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded", "Accept": "text/html" },
      body: body.toString(),
      cache: "no-store",
    }, 8000);
    if (!res.ok) return [];
    const html = await res.text();
    if (html.toLowerCase().includes("anomaly")) return []; // CAPTCHA
    const results = parseDDG(html);
    return results.slice(0, max).map(r => ({
      title: r.title, url: r.url, snippet: r.snippet, content: r.snippet, source: "duckduckgo" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch a web page and extract readable text content.
 * Uses Firefox Reader View engine (Readability) for clean extraction.
 */
export async function fetchPageContent(url: string, maxChars = 6000): Promise<string> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": BROWSER_UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
      cache: "no-store",
    }, 10000);
    if (!res.ok) return "";
    const html = await res.text();
    const text = await extractText(html, url);
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}

/**
 * Extract relevant sentences from text — clean and compact.
 * Works with Readability-extracted text (which is already clean).
 */
function findRelevantSentences(text: string, queryTerms: string[], max = 5): string[] {
  // Clean the text: remove empty lines, collapse whitespace
  const cleanedText = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 15)
    .join(" ");

  // Split into sentences
  const sentences = cleanedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s.length > 30 && s.length < 500);

  // Score each sentence by query term overlap
  const scored = sentences.map(s => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (lower.includes(term)) score += 10;
      // Bonus for exact word match
      if (new RegExp(`\\b${term}\\b`, "i").test(s)) score += 5;
    }
    // Bonus for numbers (dates, statistics, scores)
    if (/\d/.test(s)) score += 3;
    // Bonus for action/result words
    if (/\b(is|was|won|scored|drew|beat|defeated|finished|ended|result|happened|occurred|started|began|killed|injured|destroyed|caused|destroyed|launched|attacked|agreed|signed|announced|reported)\b/i.test(s)) score += 5;
    return { sentence: s, score };
  })
  .filter(s => s.score > 0)
  .sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map(s => s.sentence);
}

/**
 * MAIN SEARCH FUNCTION — NO Wikipedia.
 * 
 * Tries multiple search engines, fetches actual web pages, extracts answers.
 */
export async function webSearch(query: string): Promise<WebResult[]> {
  // Check cache
  const cached = await db.searchResult.findMany({ where: { query }, take: 8 });
  if (cached.length > 0) {
    return cached.map(c => ({
      title: c.title, url: c.url, snippet: c.snippet, content: c.content || undefined,
      source: "web" as const,
    }));
  }

  let results: WebResult[] = [];

  // 1. Try Bing
  if (results.length === 0) {
    results = await searchBing(query, 8);
  }

  // 3. Try Google
  if (results.length === 0) {
    results = await searchGoogle(query, 8);
  }

  // 4. Try DuckDuckGo
  if (results.length === 0) {
    results = await searchDDG(query, 8);
  }

  // 5. Fetch full page content for top 3 results
  if (results.length > 0) {
    const top3 = results.slice(0, 3);
    const contents = await Promise.all(
      top3.map(r => fetchPageContent(r.url, 6000))
    );
    for (let i = 0; i < top3.length; i++) {
      if (contents[i].length > 100) {
        results[i].content = contents[i];
        if (!results[i].snippet) {
          results[i].snippet = contents[i].slice(0, 200);
        }
      }
    }
  }

  // Cache
  for (const r of results.slice(0, 8)) {
    try {
      await db.searchResult.create({
        data: { query, title: r.title, url: r.url, snippet: r.snippet, content: r.content || null },
      });
    } catch {}
  }

  return results;
}

/**
 * Summarize search results.
 */
export function summarizeResults(results: WebResult[], maxChars = 1200): string {
  if (results.length === 0) return "";
  const parts: string[] = [];
  let total = 0;
  for (const r of results) {
    const block = `[${r.source}] ${r.title}\n${r.url}\n${r.snippet || r.content || ""}`.trim();
    if (total + block.length > maxChars) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join("\n\n---\n\n");
}
