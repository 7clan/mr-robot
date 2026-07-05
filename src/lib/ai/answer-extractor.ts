/**
 * Answer Extractor - Built from scratch
 *
 * Takes a question and a set of search results, fetches the full content
 * of the top results, and extracts the sentences most likely to answer
 * the question.
 *
 * This is an extractive question-answering system — it finds and ranks
 * sentences from the source material based on relevance to the query.
 */

import { fetchPageContent, WebResult } from "./web-search";

export interface ExtractedAnswer {
  text: string;
  source: string;
  sourceUrl: string;
  relevanceScore: number;
}

export interface AnswerResult {
  directAnswer: string | null;
  supportingSentences: ExtractedAnswer[];
  sources: Array<{ title: string; url: string }>;
}

/**
 * Extract key terms from a question for matching.
 * Removes stop words and keeps the important entities.
 */
function extractKeyTerms(query: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "can", "what", "who", "whom", "whose",
    "where", "when", "why", "how", "which", "that", "this", "these", "those",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "about",
    "tell", "me", "find", "search", "look", "up", "google",
    "won", "win", "wins", "winning", // for "who won" — we want the entities, not "won"
  ]);

  const terms = query
    .toLowerCase()
    .replace(/[?!.]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));

  return terms;
}

/**
 * Split text into sentences.
 * Filters out navigation noise, redirects, and other non-content text.
 */
function splitIntoSentences(text: string): string[] {
  // If the text is short (like a search snippet), treat it as one sentence
  if (text.length < 300) {
    const cleaned = text.trim();
    if (cleaned.length > 10 && /[a-zA-Z]{3,}/.test(cleaned)) {
      const lower = cleaned.toLowerCase();
      if (!lower.includes("you are being redirected") &&
          !lower.includes("click here if it doesn't happen") &&
          !lower.includes("from duckduckgo") &&
          !lower.includes("non-javascript site")) {
        return [cleaned];
      }
    }
    return [];
  }

  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => {
      // Must be reasonable length
      if (s.length < 30 || s.length > 500) return false;
      // Filter out noise
      const lower = s.toLowerCase();
      if (lower.includes("jump to content")) return false;
      if (lower.includes("you are being redirected")) return false;
      if (lower.includes("click here if it doesn't happen")) return false;
      if (lower.includes("from wikipedia, the free encyclopedia")) return false;
      if (lower.includes("from duckduckgo")) return false;
      if (lower.includes("non-javascript site")) return false;
      if (lower.includes("this article is about")) return false;
      if (lower.includes("contents [")) return false;
      if (lower.includes("edit]")) return false;
      if (lower.includes("jump to")) return false;
      if (lower.match(/^\[?\d+\]?$/)) return false; // just a number
      if (lower.match(/^(category|file|image|template):/)) return false;
      // Filter out citation/reference noise
      if (lower.includes("retrieved")) return false;
      if (lower.includes("{{cite")) return false;
      if (lower.includes("cs1 maint:")) return false;
      if (lower.startsWith("^ ")) return false;
      if (lower.startsWith("archived from")) return false;
      if (lower.includes("doi:")) return false;
      if (lower.includes("isbn")) return false;
      if (lower.includes("pmid:")) return false;
      if (lower.match(/^\^?[a-z]? /)) return false; // citation markers like "^ a b"
      if (lower.includes("please help update")) return false;
      if (lower.includes("needs additional citations")) return false;
      if (lower.includes("this section needs expansion")) return false;
      if (lower.includes("may require cleanup")) return false;
      if (lower.includes("deprecated archival")) return false;
      // Must contain at least one alphabetic word
      if (!/[a-zA-Z]{3,}/.test(s)) return false;
      return true;
    });
}

/**
 * Score a sentence based on how many query terms it contains.
 * For "vs" queries, require the entity names but not generic words like "football".
 */
function scoreSentence(sentence: string, queryTerms: string[], originalQuery: string): number {
  const lower = sentence.toLowerCase();
  let score = 0;
  let matchedTerms = 0;

  for (const term of queryTerms) {
    if (lower.includes(term)) {
      score += 10;
      matchedTerms++;
      const regex = new RegExp(`\\b${term}\\b`, "i");
      if (regex.test(sentence)) {
        score += 5;
      }
    }
  }

  // For "vs" queries, require the entity names (not "vs" or "football" themselves)
  // The entities are the terms that aren't "vs", "versus", "football", "match", "game", etc.
  const isVsQuery = /\b(vs|versus|against)\b/i.test(originalQuery);
  if (isVsQuery && queryTerms.length >= 2) {
    const entityTerms = queryTerms.filter(t => 
      !["vs", "versus", "against", "football", "match", "game", "score", "play", "played"].includes(t)
    );
    // Require ALL entity terms to be present
    const matchedEntities = entityTerms.filter(t => lower.includes(t));
    if (matchedEntities.length < entityTerms.length) {
      return -100; // Missing an entity — can't answer the question
    }
    // Bonus for having all entities
    score += 20;
  } else if (queryTerms.length >= 2 && matchedTerms < Math.ceil(queryTerms.length / 2)) {
    score -= 30;
  }

  if (/\d/.test(sentence)) score += 3;
  if (sentence.length < 200) score += 2;
  if (sentence.length > 400) score -= 5;
  if (/\b(is|was|are|were)\b/i.test(sentence)) score += 2;

  return score;
}

/**
 * Fetch full content for a web result and extract relevant sentences.
 */
async function fetchAndExtract(
  result: WebResult,
  queryTerms: string[],
  originalQuery: string,
  maxSentences: number = 3
): Promise<ExtractedAnswer[]> {
  try {
    // First try the snippet/content we already have
    const snippetText = result.content || result.snippet || "";
    let sentences = splitIntoSentences(snippetText);

    // If the snippet is too short, fetch the full page
    if (sentences.length < 2 && result.url) {
      try {
        const pageContent = await fetchPageContent(result.url, 8000);
        if (pageContent) {
          sentences = splitIntoSentences(pageContent);
        }
      } catch {
        // ignore fetch errors
      }
    }

    // Score and rank sentences
    const scored = sentences
      .map((s) => ({
        text: s,
        source: result.title,
        sourceUrl: result.url,
        relevanceScore: scoreSentence(s, queryTerms, originalQuery),
      }))
      .filter((a) => a.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    return scored.slice(0, maxSentences);
  } catch {
    return [];
  }
}

/**
 * Main function: given a query and search results, extract the best answer.
 */
export async function extractAnswer(
  query: string,
  results: WebResult[]
): Promise<AnswerResult> {
  const queryTerms = extractKeyTerms(query);

  if (results.length === 0) {
    return {
      directAnswer: null,
      supportingSentences: [],
      sources: [],
    };
  }

  // Fetch and extract from top 3 results (in parallel for speed)
  const topResults = results.slice(0, 3);
  const extractionPromises = topResults.map((r) =>
    fetchAndExtract(r, queryTerms, query, 3)
  );
  const extractedArrays = await Promise.all(extractionPromises);

  // Flatten and sort all extracted sentences
  const allSentences = extractedArrays
    .flat()
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Take the top sentence as the "direct answer" only if it's truly relevant
  const topSentence = allSentences[0];
  let directAnswer: string | null = null;

  // Lower threshold for direct answer — real web search snippets are highly relevant
  if (topSentence && topSentence.relevanceScore >= 10) {
    directAnswer = topSentence.text;
  }

  // Filter out low-scoring supporting sentences
  const goodSentences = allSentences.filter((s) => s.relevanceScore >= 5);

  return {
    directAnswer,
    supportingSentences: goodSentences.slice(0, 5),
    sources: results.slice(0, 5).map((r) => ({ title: r.title, url: r.url })),
  };
}

/**
 * Format the answer result into a human-readable response.
 */
export function formatAnswer(query: string, answer: AnswerResult): string {
  // Case 1: No direct answer and no supporting sentences
  if (!answer.directAnswer && answer.supportingSentences.length === 0) {
    return `I searched the web for "${query}" but couldn't find a direct answer in the results. Here are the sources I found — you might find the answer by visiting them:\n\n${answer.sources
      .map((s, i) => `${i + 1}. ${s.title}\n   ${s.url}`)
      .join("\n\n")}`;
  }

  let response = "";

  if (answer.directAnswer) {
    response += `Based on what I found, here's the answer to "${query}":\n\n`;
    response += `${answer.directAnswer}\n\n`;

    if (answer.supportingSentences.length > 1) {
      const supporting = answer.supportingSentences
        .filter((s) => s.text !== answer.directAnswer)
        .slice(0, 3);
      if (supporting.length > 0) {
        response += `Here's more context:\n\n`;
        response += supporting.map((s) => `• ${s.text}`).join("\n\n");
        response += "\n\n";
      }
    }
  } else {
    response += `I found some information related to "${query}":\n\n`;
    response += answer.supportingSentences
      .slice(0, 3)
      .map((s) => `• ${s.text}`)
      .join("\n\n");
    response += "\n\n";
  }

  response += `Sources:\n`;
  response += answer.sources
    .slice(0, 3)
    .map((s, i) => `${i + 1}. ${s.title} — ${s.url}`)
    .join("\n");

  return response;
}
