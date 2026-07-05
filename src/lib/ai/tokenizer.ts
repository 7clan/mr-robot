/**
 * Tokenizer - Built from scratch
 * Splits text into meaningful tokens, normalizes them, and removes noise.
 * No external libraries used.
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "when",
  "at", "by", "for", "with", "about", "against", "between", "into",
  "through", "during", "before", "after", "above", "below", "to", "from",
  "up", "down", "in", "out", "on", "off", "over", "under", "again",
  "further", "once", "here", "there", "all", "any", "both", "each",
  "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "can", "will",
  "just", "should", "now", "is", "am", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "having", "do", "does", "did",
  "doing", "would", "could", "ought", "i", "you", "he", "she", "it",
  "we", "they", "them", "their", "theirs", "me", "my", "mine", "your",
  "yours", "his", "her", "hers", "its", "our", "ours", "us",
]);

export interface Token {
  text: string;
  index: number;
  isStopWord: boolean;
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matches = lower.match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
  return matches;
}

export function tokenizeAdvanced(text: string): Token[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const regex = /[a-z0-9]+(?:'[a-z]+)?/g;
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(lower)) !== null) {
    const word = match[0];
    tokens.push({
      text: word,
      index: match.index,
      isStopWord: STOP_WORDS.has(word),
    });
  }
  return tokens;
}

export function removeStopWords(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

export function splitSentences(text: string): string[] {
  if (!text) return [];
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences;
}

export function ngrams(tokens: string[], n: number): string[][] {
  if (n <= 0 || tokens.length < n) return [];
  const result: string[][] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    result.push(tokens.slice(i, i + n));
  }
  return result;
}
