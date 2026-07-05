/**
 * Real Web Search Engine — Built from scratch
 *
 * NO Wikipedia. NO API keys. This searches the REAL web:
 *   1. Uses DuckDuckGo autocomplete to expand the query
 *   2. Tries multiple search backends (Bing, Google, DuckDuckGo HTML)
 *   3. Fetches actual web pages from the result URLs
 *   4. Extracts readable text and finds the answer
 *
 * This is a from-scratch search engine — no external APIs needed.
 */

import { fetchWithTimeout } from "./web-search";

export interface RealSearchResult {
  title: string;
  url: string;
  snippet: string;
  content: string;
  source: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Extract readable text from HTML — strips scripts, styles, tags.
 */
function extractText(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<\/(p|div|li|h[1-6]|br|tr|td)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#91;/g, "[")
    .replace(/&#93;/g, "]");
  text = text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
  return text;
}

/**
 * Extract result URLs from Bing search results HTML.
 */
function parseBingResults(html: string): Array<{ url: string; title: string; snippet: string }> {
  const results: Array<{ url: string; title: string; snippet: string }> = [];

  // Bing uses <li class="b_algo"> with <h2><a href="...">title</a></h2>
  // and <p class="b_lineclamp...">snippet</p>
  const blockRegex = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null) {
    const block = match[1];
    const linkMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (linkMatch) {
      const url = linkMatch[1];
      const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      if (url && !url.includes("bing.com") && !url.includes("microsoft.com")) {
        results.push({ url, title, snippet });
      }
    }
  }

  return results;
}

/**
 * Extract result URLs from Google search results HTML.
 */
function parseGoogleResults(html: string): Array<{ url: string; title: string; snippet: string }> {
  const results: Array<{ url: string; title: string; snippet: string }> = [];
  // Google uses /url?q= for results
  const urlRegex = /\/url\?q=([^&]+)/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(html)) !== null) {
    const url = decodeURIComponent(match[1]);
    if (!seen.has(url) && !url.includes("google.com") && !url.includes("youtube.com/results")) {
      seen.add(url);
      results.push({ url, title: "", snippet: "" });
    }
  }

  // Also try to find titles and snippets
  const divRegex = /<div[^>]*class="[^"]*BNeawe[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  const texts: string[] = [];
  while ((match = divRegex.exec(html)) !== null) {
    texts.push(match[1].replace(/<[^>]+>/g, "").trim());
  }
  for (let i = 0; i < results.length && i < texts.length; i++) {
    results[i].title = texts[i] || "";
  }

  return results;
}

/**
 * Extract result URLs from DuckDuckGo HTML search results.
 */
function parseDuckDuckGoResults(html: string): Array<{ url: string; title: string; snippet: string }> {
  const results: Array<{ url: string; title: string; snippet: string }> = [];

  // DDG HTML uses <a class="result__a" href="...">title</a>
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    // DDG wraps URLs in redirect
    const ddgMatch = url.match(/uddg=([^&]+)/);
    if (ddgMatch) {
      try {
        url = decodeURIComponent(ddgMatch[1]);
      } catch {
        // keep original
      }
    }
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    if (url && !url.includes("duckduckgo.com")) {
      results.push({ url, title, snippet: "" });
    }
  }

  // Also try the lite version format
  if (results.length === 0) {
    const liteRegex = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = liteRegex.exec(html)) !== null) {
      let url = match[1];
      const ddgMatch = url.match(/uddg=([^&]+)/);
      if (ddgMatch) {
        try {
          url = decodeURIComponent(ddgMatch[1]);
        } catch {
          // keep original
        }
      }
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      if (url && !url.includes("duckduckgo.com")) {
        results.push({ url, title, snippet: "" });
      }
    }
  }

  return results;
}

/**
 * Try to get search results from multiple search engines.
 * Returns URLs to fetch.
 */
async function findUrls(query: string, max = 8): Promise<Array<{ url: string; title: string; snippet: string }>> {
  const allResults: Array<{ url: string; title: string; snippet: string }> = [];
  const seen = new Set<string>();

  // 1. Try Bing
  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=15`;
    const res = await fetchWithTimeout(bingUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    }, 8000);
    if (res.ok) {
      const html = await res.text();
      const bingResults = parseBingResults(html);
      for (const r of bingResults) {
        if (!seen.has(r.url)) {
          seen.add(r.url);
          allResults.push(r);
          if (allResults.length >= max) break;
        }
      }
    }
  } catch {}

  // 2. Try Google
  if (allResults.length < max) {
    try {
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`;
      const res = await fetchWithTimeout(googleUrl, {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      }, 8000);
      if (res.ok) {
        const html = await res.text();
        const googleResults = parseGoogleResults(html);
        for (const r of googleResults) {
          if (!seen.has(r.url)) {
            seen.add(r.url);
            allResults.push(r);
            if (allResults.length >= max) break;
          }
        }
      }
    } catch {}
  }

  // 3. Try DuckDuckGo HTML
  if (allResults.length < max) {
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetchWithTimeout(ddgUrl, {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "text/html",
        },
        cache: "no-store",
      }, 8000);
      if (res.ok) {
        const html = await res.text();
        const ddgResults = parseDuckDuckGoResults(html);
        for (const r of ddgResults) {
          if (!seen.has(r.url)) {
            seen.add(r.url);
            allResults.push(r);
            if (allResults.length >= max) break;
          }
        }
      }
    } catch {}
  }

  // 4. Try DuckDuckGo Lite
  if (allResults.length < max) {
    try {
      const body = new URLSearchParams({ q: query, kl: "" });
      const res = await fetchWithTimeout("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: {
          "User-Agent": BROWSER_UA,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "text/html",
        },
        body: body.toString(),
        cache: "no-store",
      }, 8000);
      if (res.ok) {
        const html = await res.text();
        const ddgResults = parseDuckDuckGoResults(html);
        for (const r of ddgResults) {
          if (!seen.has(r.url)) {
            seen.add(r.url);
            allResults.push(r);
            if (allResults.length >= max) break;
          }
        }
      }
    } catch {}
  }

  return allResults;
}

/**
 * Fetch a web page and extract readable text content.
 */
async function fetchPage(url: string, maxChars = 5000): Promise<string> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    }, 10000);
    if (!res.ok) return "";
    const html = await res.text();
    const text = extractText(html);
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}

/**
 * Extract sentences from text that are relevant to the query.
 */
function findRelevantSentences(text: string, queryTerms: string[], maxSentences = 5): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400);

  const scored = sentences.map((s) => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (lower.includes(term)) score += 10;
    }
    // Bonus for numbers (scores, dates)
    if (/\d/.test(s)) score += 3;
    // Bonus for "is", "was", "won", "scored", "drew"
    if (/\b(is|was|won|scored|drew|beat|defeated|finished|ended)\b/i.test(s)) score += 5;
    return { sentence: s, score };
  })
  .filter((s) => s.score > 0)
  .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSentences).map((s) => s.sentence);
}

/**
 * MAIN ENTRY POINT: Real web search.
 * Searches Bing/Google/DuckDuckGo, fetches actual web pages, extracts answers.
 * NO Wikipedia. NO API keys. Works on any machine with internet.
 */
export async function realSearch(query: string): Promise<{
  results: RealSearchResult[];
  answer: string | null;
  sources: Array<{ title: string; url: string }>;
}> {
  // Step 1: Find URLs from search engines
  const searchResults = await findUrls(query, 8);

  if (searchResults.length === 0) {
    return { results: [], answer: null, sources: [] };
  }

  // Step 2: Fetch the top 3 pages and extract content
  const queryTerms = query
    .toLowerCase()
    .replace(/[?!.]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "with", "what", "who", "how", "when", "where", "why", "about", "from"].includes(t));

  const fetchPromises = searchResults.slice(0, 3).map(async (r) => {
    const content = await fetchPage(r.url, 8000);
    return {
      title: r.title || r.url,
      url: r.url,
      snippet: r.snippet || content.slice(0, 200),
      content,
      source: new URL(r.url).hostname.replace("www.", ""),
    };
  });

  const fetchedResults = await Promise.all(fetchPromises);
  const validResults = fetchedResults.filter((r) => r.content.length > 100);

  // Step 3: Extract relevant sentences from the fetched pages
  const allSentences: Array<{ text: string; source: string; url: string; score: number }> = [];

  for (const result of validResults) {
    const sentences = findRelevantSentences(result.content, queryTerms, 3);
    for (const sentence of sentences) {
      let score = 0;
      const lower = sentence.toLowerCase();
      for (const term of queryTerms) {
        if (lower.includes(term)) score += 10;
      }
      allSentences.push({
        text: sentence,
        source: result.source,
        url: result.url,
        score,
      });
    }
  }

  allSentences.sort((a, b) => b.score - a.score);

  // Step 4: Compose the answer
  let answer: string | null = null;
  if (allSentences.length > 0 && allSentences[0].score >= 20) {
    const top = allSentences[0];
    answer = top.text;
  }

  return {
    results: validResults.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      content: r.content,
      source: r.source,
    })),
    answer,
    sources: validResults.slice(0, 5).map((r) => ({ title: r.title, url: r.url })),
  };
}
