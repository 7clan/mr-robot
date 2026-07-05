/**
 * Naive Bayes Intent Classifier - Built from scratch
 * Classifies user input into intents (greeting, question, command, etc.)
 * Uses multinomial naive bayes with Laplace smoothing - no external libs.
 */

import { tokenize, removeStopWords } from "./tokenizer";
import { stemAll } from "./stemmer";

export interface TrainingExample {
  text: string;
  intent: string;
}

export interface ClassificationResult {
  intent: string;
  confidence: number;
  scores: Record<string, number>;
}

export class NaiveBayesClassifier {
  // intent -> { word -> count }
  private wordCounts: Map<string, Map<string, number>> = new Map();
  // intent -> total word count
  private intentTotals: Map<string, number> = new Map();
  // intent -> example count
  private intentDocCounts: Map<string, number> = new Map();
  private vocabulary: Set<string> = new Set();
  private totalDocs = 0;

  train(examples: TrainingExample[]): void {
    for (const ex of examples) {
      this.totalDocs++;
      const intent = ex.intent;
      const tokens = this.processText(ex.text);

      if (!this.wordCounts.has(intent)) {
        this.wordCounts.set(intent, new Map());
        this.intentTotals.set(intent, 0);
        this.intentDocCounts.set(intent, 0);
      }
      this.intentDocCounts.set(intent, (this.intentDocCounts.get(intent) || 0) + 1);

      const wc = this.wordCounts.get(intent)!;
      for (const t of tokens) {
        wc.set(t, (wc.get(t) || 0) + 1);
        this.intentTotals.set(intent, (this.intentTotals.get(intent) || 0) + 1);
        this.vocabulary.add(t);
      }
    }
  }

  classify(text: string): ClassificationResult {
    const tokens = this.processText(text);
    const intents = Array.from(this.wordCounts.keys());
    if (intents.length === 0) {
      return { intent: "unknown", confidence: 0, scores: {} };
    }

    const scores: Record<string, number> = {};
    const vocabSize = this.vocabulary.size;

    for (const intent of intents) {
      // log prior (uniform prior if no doc counts)
      const docCount = this.intentDocCounts.get(intent) || 0;
      const prior = docCount / Math.max(this.totalDocs, 1);
      let logProb = Math.log(Math.max(prior, 1e-9));

      const wc = this.wordCounts.get(intent)!;
      const total = this.intentTotals.get(intent) || 0;
      const denom = total + vocabSize;

      for (const t of tokens) {
        const count = wc.get(t) || 0;
        // Laplace smoothing
        const p = (count + 1) / denom;
        logProb += Math.log(p);
      }

      scores[intent] = logProb;
    }

    // Find best intent + compute softmax confidence
    let best = intents[0];
    let bestScore = scores[best];
    for (const i of intents) {
      if (scores[i] > bestScore) {
        best = i;
        bestScore = scores[i];
      }
    }

    // softmax over log scores for confidence
    const max = Math.max(...Object.values(scores));
    const exps = Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [k, Math.exp(v - max)])
    );
    const sum = Object.values(exps).reduce((a, b) => a + b, 0);
    const confidence = exps[best] / sum;

    return { intent: best, confidence, scores };
  }

  private processText(text: string): string[] {
    const tokens = tokenize(text);
    const filtered = removeStopWords(tokens);
    return stemAll(filtered);
  }

  export(): string {
    return JSON.stringify({
      wordCounts: Array.from(this.wordCounts.entries()).map(([k, v]) => [
        k,
        Array.from(v.entries()),
      ]),
      intentTotals: Array.from(this.intentTotals.entries()),
      intentDocCounts: Array.from(this.intentDocCounts.entries()),
      vocabulary: Array.from(this.vocabulary),
      totalDocs: this.totalDocs,
    });
  }

  import(data: string): void {
    try {
      const obj = JSON.parse(data);
      this.wordCounts = new Map(
        obj.wordCounts.map(([k, v]: [string, [string, number][]]) => [
          k,
          new Map(v),
        ])
      );
      this.intentTotals = new Map(obj.intentTotals);
      this.intentDocCounts = new Map(obj.intentDocCounts);
      this.vocabulary = new Set(obj.vocabulary);
      this.totalDocs = obj.totalDocs;
    } catch {
      // ignore
    }
  }
}

// Default training data - built-in intents
export const DEFAULT_TRAINING_DATA: TrainingExample[] = [
  // Greetings
  { text: "hello", intent: "greeting" },
  { text: "hi there", intent: "greeting" },
  { text: "hey", intent: "greeting" },
  { text: "good morning", intent: "greeting" },
  { text: "good afternoon", intent: "greeting" },
  { text: "good evening", intent: "greeting" },
  { text: "howdy", intent: "greeting" },
  { text: "greetings", intent: "greeting" },
  // Farewells
  { text: "bye", intent: "farewell" },
  { text: "goodbye", intent: "farewell" },
  { text: "see you later", intent: "farewell" },
  { text: "talk to you later", intent: "farewell" },
  { text: "catch you later", intent: "farewell" },
  // Questions
  { text: "what is the weather", intent: "question" },
  { text: "who are you", intent: "question" },
  { text: "what can you do", intent: "question" },
  { text: "how does this work", intent: "question" },
  { text: "why is the sky blue", intent: "question" },
  { text: "what time is it", intent: "question" },
  { text: "where am i", intent: "question" },
  { text: "tell me about", intent: "question" },
  { text: "explain", intent: "question" },
  // Commands
  { text: "search for", intent: "command_search" },
  { text: "look up", intent: "command_search" },
  { text: "find information about", intent: "command_search" },
  { text: "google", intent: "command_search" },
  { text: "remember that", intent: "command_remember" },
  { text: "note that", intent: "command_remember" },
  { text: "save this", intent: "command_remember" },
  { text: "store this fact", intent: "command_remember" },
  { text: "what do you remember", intent: "command_recall" },
  { text: "what do you know", intent: "command_recall" },
  { text: "tell me what you know", intent: "command_recall" },
  { text: "recall", intent: "command_recall" },
  { text: "calculate", intent: "command_calculate" },
  { text: "what is x plus y", intent: "command_calculate" },
  { text: "add these numbers", intent: "command_calculate" },
  { text: "speak", intent: "command_speak" },
  { text: "say something", intent: "command_speak" },
  { text: "stop talking", intent: "command_silence" },
  { text: "be quiet", intent: "command_silence" },
  // Help
  { text: "help", intent: "help" },
  { text: "help me", intent: "help" },
  { text: "what can you do for me", intent: "help" },
  { text: "i need assistance", intent: "help" },
  // Conversation
  { text: "thank you", intent: "thanks" },
  { text: "thanks", intent: "thanks" },
  { text: "appreciate it", intent: "thanks" },
  { text: "you are welcome", intent: "welcome" },
  { text: "no problem", intent: "welcome" },
  { text: "my pleasure", intent: "welcome" },
  // Identity
  { text: "what is your name", intent: "identity" },
  { text: "who made you", intent: "identity" },
  { text: "who created you", intent: "identity" },
  { text: "who built you", intent: "identity" },
  { text: "are you a robot", intent: "identity" },
  { text: "are you human", intent: "identity" },
  { text: "are you an ai", intent: "identity" },
  { text: "what are you", intent: "identity" },
  { text: "tell me about yourself", intent: "identity" },
  // Questions that should NOT be identity (contain "who" but ask about other things)
  { text: "who won the match", intent: "question" },
  { text: "who won football", intent: "question" },
  { text: "who won the game", intent: "question" },
  { text: "who won the election", intent: "question" },
  { text: "who is the president of france", intent: "question" },
  { text: "who is the ceo of apple", intent: "question" },
  { text: "who invented the telephone", intent: "question" },
  { text: "who wrote hamlet", intent: "question" },
  { text: "who painted the mona lisa", intent: "question" },
  { text: "who discovered america", intent: "question" },
  // Sports / events / current affairs questions
  { text: "iran vs egypt", intent: "command_search" },
  { text: "iran vs egypt football", intent: "command_search" },
  { text: "iran vs egypt match", intent: "command_search" },
  { text: "who won iran vs egypt", intent: "command_search" },
  { text: "who won the football match", intent: "command_search" },
  { text: "what happened today", intent: "command_search" },
  { text: "latest news", intent: "command_search" },
  { text: "what is the score", intent: "command_search" },
  { text: "when is the next world cup", intent: "command_search" },
  { text: "where is the world cup 2026", intent: "command_search" },
  { text: "whats new in 2026", intent: "command_search" },
  { text: "what is new this year", intent: "command_search" },
  // More question examples
  { text: "how tall is the eiffel tower", intent: "question" },
  { text: "what is the capital of japan", intent: "question" },
  { text: "when was python invented", intent: "question" },
  { text: "why is the sky blue", intent: "question" },
  { text: "how does a computer work", intent: "question" },
  { text: "what is machine learning", intent: "question" },
  { text: "tell me about quantum physics", intent: "question" },
  { text: "explain blockchain", intent: "question" },
];
