/**
 * Grounded Generation — kill hallucination by injecting real facts
 *
 * Pipeline:
 *   1. User asks a question
 *   2. Run web search (Bing/Google/DDG — no API keys)
 *   3. Extract & clean relevant content from top results
 *   4. Build a "grounded" system prompt that includes the facts as context
 *   5. LLM generates an answer that MUST cite the sources
 *   6. (Optional) Self-verify: LLM checks each claim against the sources
 *
 * This module is the bridge between web-search.ts (server-side scraping)
 * and local-llm.ts (browser-side LLM). It runs server-side to gather facts,
 * returns a "grounding bundle" to the client, which then feeds it to the LLM.
 */

import { webSearch, type WebResult } from "./web-search";
import { extractAnswer } from "./answer-extractor";
import { tosToSystemPrompt, getTos } from "./terms-of-service";

export interface GroundingBundle {
  query: string;
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    content: string; // cleaned, truncated
  }>;
  systemPrompt: string; // ready to pass to LLM
  contextBlock: string; // the facts block injected into the prompt
  tosVersion: number;
}

export interface GroundOptions {
  maxSources?: number;
  maxCharsPerSource?: number;
  /** If false, skip web search and just return the ToS-enriched system prompt. */
  searchWeb?: boolean;
}

/**
 * Gather facts from the web and build a grounded system prompt.
 * Called server-side; the bundle is sent to the client where the LLM uses it.
 */
export async function buildGroundingBundle(
  query: string,
  options: GroundOptions = {}
): Promise<GroundingBundle> {
  const maxSources = options.maxSources ?? 4;
  const maxCharsPerSource = options.maxCharsPerSource ?? 1200;
  const searchWeb = options.searchWeb ?? true;

  const tos = await getTos();
  const tosPrompt = tosToSystemPrompt(tos);

  let sources: GroundingBundle["sources"] = [];
  let contextBlock = "";

  if (searchWeb && query.trim().length > 0) {
    try {
      const results = await webSearch(query, 8);
      // Take top N results directly — summarizeResults returns a string, not an array
      const topResults = (results ?? []).slice(0, maxSources);

      sources = topResults.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet ?? "",
        content: cleanForLLMContext(r.content ?? r.snippet ?? "", maxCharsPerSource),
      }));

      contextBlock = sources
        .map(
          (s, i) =>
            `### Source ${i + 1}: ${s.title}\nURL: ${s.url}\n${s.content}\n`
        )
        .join("\n");
    } catch (err) {
      // Search failures shouldn't kill generation
      console.error("[grounded-gen] web search failed:", err);
      contextBlock = "(Web search unavailable. Use your training knowledge.)";
    }
  }

  const systemPrompt = `${tosPrompt}

## Your Task
You are about to answer the user's question. The user's question may be the latest in a conversation — read the full conversation history to understand context, references like "that", "it", "they", "when was that", "why", "is it still ongoing" etc.

## Grounding Facts (from web search)
These are real, current facts gathered from the web. USE THESE. Do not invent facts that contradict them. If the facts don't answer the question, say so honestly.

${contextBlock || "(No web results were found. Answer from your training data, and clearly say that this is from training data, not live search.)"}

## Rules — Follow these strictly
1. **Cite sources inline.** After any factual claim, write [Source N] where N is the source number from above. Example: "Israel struck southern Lebanon on Wednesday [Source 1]."
2. **No hallucination.** If a fact is not in the sources above and not common knowledge, say "I'm not sure about that" instead of making something up.
3. **Resolve references.** When the user says "that", "it", "why", "when was that", figure out what they're referring to from the conversation history. Quote it back briefly so they know you understood: "About the southern Lebanon strike you mentioned..."
4. **Be thorough.** Write at least 3-5 paragraphs of useful information. Don't be terse.
5. **Acknowledge uncertainty.** If sources conflict, present both views and cite each.
6. **Stay on topic.** Don't drift to unrelated topics. If the user asks "is it still ongoing?", answer specifically about ongoing status — don't repeat background.
7. **Use the user's language.** If they ask in Arabic, reply in Arabic. If English, English. Etc.

## Output Format
- Body paragraphs with inline [Source N] citations
- End with a short "Sources:" line listing the source URLs you actually used

Begin your answer now.`;

  return {
    query,
    sources,
    systemPrompt,
    contextBlock,
    tosVersion: tos.version,
  };
}

/**
 * Clean web text for inclusion in the LLM context window.
 * Strips navigation, share buttons, HTML entities, etc.
 */
function cleanForLLMContext(text: string, maxChars: number): string {
  let t = text;
  // Decode common HTML entities
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");

  // Remove navigation/UI junk
  t = t
    .replace(/\b(Follow|Share|Subscribe|Sign up|Log in|Newsletter|Cookie|Accept|Reject|Skip to|Menu|Search|Home|Back to top|Read more|Related topics|Topics)\b[^.\n]*/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:min|sec|hour|day)s? (?:ago|read)\b/gi, "")
    .replace(/\b@\w+/g, "") // twitter handles
    .replace(/https?:\/\/\S+/g, "") // inline URLs (we have them in the URL field)
    .replace(/\s{3,}/g, "  ")
    .replace(/\n{3,}/g, "\n\n");

  // Trim to max chars but try to end on sentence boundary
  if (t.length > maxChars) {
    const slice = t.slice(0, maxChars);
    const lastPeriod = slice.lastIndexOf(". ");
    if (lastPeriod > maxChars * 0.6) {
      t = slice.slice(0, lastPeriod + 1);
    } else {
      t = slice + "...";
    }
  }

  return t.trim();
}

/**
 * Self-verification prompt — ask the LLM to check its own answer.
 * Returns the LLM's self-assessment (which the client may display as "verified").
 */
export function buildVerificationPrompt(
  question: string,
  answer: string,
  sources: GroundingBundle["sources"]
): string {
  return `You are a fact-checker. Below is a question, an answer, and the source material.
Check every claim in the answer against the sources. List any claims that are:
  (a) not supported by the sources
  (b) contradicted by the sources
  (c) supported by the sources (briefly say which source)

QUESTION:
${question}

ANSWER:
${answer}

SOURCES:
${sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url})\n${s.content}`).join("\n\n")}

Reply with a JSON object: {"verified_claims": [...], "unsupported_claims": [...], "contradicted_claims": [...], "overall": "verified" | "partial" | "unreliable"}`;
}
