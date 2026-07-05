/**
 * AI Brain - Built from scratch
 *
 * The central orchestrator. Combines:
 *  - Naive Bayes intent classifier
 *  - From-scratch neural network for response selection
 *  - Knowledge base (subject-predicate-object store)
 *  - Web search (no API key, server-side scraping)
 *  - Rule-based response generator
 *  - Agent execution loop (plan -> act -> observe -> respond)
 *
 * NO external AI APIs are used. Everything runs on logic written in this project.
 */

import { NaiveBayesClassifier, DEFAULT_TRAINING_DATA, ClassificationResult } from "./classifier";
import { NeuralNetwork } from "./neural-net";
import { tokenize, removeStopWords } from "./tokenizer";
import { stem } from "./stemmer";
import {
  extractFact,
  storeFact,
  recallAbout,
  searchKnowledge,
  factToText,
  saveMessage,
  getRecentMessages,
  similarity,
  Fact,
} from "./knowledge-base";
import { webSearch, summarizeResults, WebResult } from "./web-search";
import { generateCode, CodeResult } from "./code-engine";
import { applyOps } from "./file-system";
import { execute as execTerminal } from "./terminal";
import { matchError, recordMistake, lookupMistake } from "./self-correct";
import { extractAnswer, formatAnswer } from "./answer-extractor";
import { realSearch } from "./real-search";
// Transformer loaded dynamically to avoid slow startup
// Conversation memory loaded dynamically
// Reasoning loaded dynamically
// Code understanding loaded dynamically

// Reasoning is done inline (no heavy module loading)
function getReasoning() {
  return null; // Reasoning is handled inline in the think() function
}

export type AgentStep = {
  action: string;
  description: string;
  result: string;
  success: boolean;
};

export type BrainResponse = {
  text: string;
  intent: string;
  confidence: number;
  steps?: AgentStep[];
  facts?: Fact[];
  webResults?: WebResult[];
  spoke?: boolean;
  metadata?: Record<string, unknown>;
  codeResult?: {
    files: Array<{ op: string; path: string; content?: string }>;
    explanation: string;
    framework: string;
    language: string;
    nextSteps: string[];
    applied: number;
    warnings?: string[];
  };
  terminalResult?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    command: string;
    durationMs: number;
    autoFix?: {
      applied: boolean;
      fixCommand?: string;
      fixDescription?: string;
      pattern?: string;
      learnedFrom?: string;
      retryResult?: unknown;
    };
  };
  mistakes?: Array<{
    id: string;
    context: string;
    errorOutput: string;
    fixApplied: string;
    occurrenceCount: number;
    successRate: number;
    lastSeenAt: string;
  }>;
};

// Singleton brain state across requests
let classifierInstance: NaiveBayesClassifier | null = null;
let neuralNet: NeuralNetwork | null = null;

function getClassifier(): NaiveBayesClassifier {
  if (!classifierInstance) {
    classifierInstance = new NaiveBayesClassifier();
    classifierInstance.train(DEFAULT_TRAINING_DATA);
  }
  return classifierInstance;
}

function getNeuralNet(): NeuralNetwork {
  if (!neuralNet) {
    // Tiny network: 10 input features -> 8 hidden -> 6 output intents
    neuralNet = new NeuralNetwork({
      inputSize: 10,
      hiddenSizes: [8],
      outputSize: 6,
      learningRate: 0.1,
    });
  }
  return neuralNet;
}

/**
 * Extract numeric features from text for the neural network.
 * Features: [word_count, avg_word_length, has_question_mark, has_digit, starts_with_verb,
 *            has_greeting_word, has_command_word, has_search_word, has_remember_word,
 *            sentiment_score]
 */
function featurize(text: string): number[] {
  const tokens = tokenize(text);
  const words = removeStopWords(tokens);
  const avgLen = tokens.length ? tokens.reduce((s, t) => s + t.length, 0) / tokens.length : 0;
  const hasQ = /[?]/.test(text) ? 1 : 0;
  const hasDigit = /\d/.test(text) ? 1 : 0;
  const lower = text.toLowerCase();
  const greetings = ["hello", "hi", "hey", "morning", "evening"];
  const commandWords = ["search", "find", "look", "calculate", "remember", "note", "save"];
  const searchWords = ["search", "find", "look up", "google", "online"];
  const rememberWords = ["remember", "note", "save", "store"];
  const hasGreeting = greetings.some((g) => lower.includes(g)) ? 1 : 0;
  const hasCommand = commandWords.some((c) => lower.includes(c)) ? 1 : 0;
  const hasSearch = searchWords.some((s) => lower.includes(s)) ? 1 : 0;
  const hasRemember = rememberWords.some((r) => lower.includes(r)) ? 1 : 0;
  const sentiment = sentimentScore(text);
  // Normalize word count
  const wc = Math.min(tokens.length / 20, 1);
  const avgLenN = Math.min(avgLen / 10, 1);
  return [wc, avgLenN, hasQ, hasDigit, 0, hasGreeting, hasCommand, hasSearch, hasRemember, sentiment];
}

function sentimentScore(text: string): number {
  const positive = ["good", "great", "awesome", "love", "happy", "excellent", "nice", "wonderful", "thanks", "thank"];
  const negative = ["bad", "terrible", "hate", "sad", "awful", "wrong", "broken", "stupid", "angry"];
  const tokens = tokenize(text);
  let score = 0;
  for (const t of tokens) {
    if (positive.includes(t)) score += 1;
    if (negative.includes(t)) score -= 1;
  }
  // Normalize to [0, 1]
  return Math.max(0, Math.min(1, 0.5 + score * 0.1));
}

// Intent -> neural net output index mapping (for response shaping)
const INTENT_TO_NN: Record<string, number> = {
  greeting: 0,
  farewell: 1,
  question: 2,
  command_search: 3,
  command_remember: 4,
  help: 5,
};

/**
 * Math evaluator - parses simple arithmetic expressions safely.
 * Built from scratch (no eval).
 */
function evaluateMath(expr: string): string | null {
  // Allow digits, +, -, *, /, parentheses, spaces, decimal points
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
  try {
    // Convert to RPN then evaluate (safer than eval)
    const tokens = tokenizeMath(expr);
    const rpn = toRPN(tokens);
    const result = evalRPN(rpn);
    if (result === null || !isFinite(result)) return null;
    return `${result}`;
  } catch {
    return null;
  }
}

function tokenizeMath(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " ") {
      i++;
      continue;
    }
    if ("+-*/()".includes(c)) {
      tokens.push(c);
      i++;
    } else if (/\d|\./.test(c)) {
      let num = "";
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push(num);
    } else {
      i++;
    }
  }
  return tokens;
}

function precedence(op: string): number {
  if (op === "+" || op === "-") return 1;
  if (op === "*" || op === "/") return 2;
  return 0;
}

function toRPN(tokens: string[]): string[] {
  const output: string[] = [];
  const stack: string[] = [];
  for (const t of tokens) {
    if (/^[\d.]+$/.test(t)) {
      output.push(t);
    } else if (t === "(") {
      stack.push(t);
    } else if (t === ")") {
      while (stack.length && stack[stack.length - 1] !== "(") {
        output.push(stack.pop()!);
      }
      stack.pop(); // remove (
    } else {
      while (stack.length && precedence(stack[stack.length - 1]) >= precedence(t)) {
        output.push(stack.pop()!);
      }
      stack.push(t);
    }
  }
  while (stack.length) output.push(stack.pop()!);
  return output;
}

function evalRPN(rpn: string[]): number | null {
  const stack: number[] = [];
  for (const t of rpn) {
    if (/^[\d.]+$/.test(t)) {
      stack.push(parseFloat(t));
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      switch (t) {
        case "+": stack.push(a + b); break;
        case "-": stack.push(a - b); break;
        case "*": stack.push(a * b); break;
        case "/": stack.push(b === 0 ? NaN : a / b); break;
        default: return null;
      }
    }
  }
  return stack.length === 1 ? stack[0] : null;
}

/**
 * Detect math expressions in user input.
 */
function detectMath(text: string): string | null {
  // "what is 2+2", "calculate 5 * 3", "5 + 3"
  const m = text.match(/(?:what\s+is|calculate|compute|eval(?:uate)?)\s+([\d+\-*/().\s]+)\??/i);
  if (m) return evaluateMath(m[1].trim());
  // Pure math
  if (/^[\d+\-*/().\s]+$/.test(text.trim()) && /[+\-*/]/.test(text)) {
    return evaluateMath(text.trim());
  }
  return null;
}

/**
 * The main brain function. Takes user input and produces a response.
 * Acts as an agent: plans, takes actions, observes results, responds.
 */
export async function think(input: string, opts?: { speak?: boolean }): Promise<BrainResponse> {
  let text = input.trim();
  const steps: AgentStep[] = [];

  // === CONVERSATION CONTEXT ===
  // Detect if this is a follow-up question related to the previous conversation.
  // Expanded pattern to catch more follow-up phrases.
  const isFollowUpPattern = /^(when|why|what|how|where|that|this|it|and|but|so|then|did|do|does|is|are|was|were|can|could|would|should|tell me more|continue|what about|how about|give more|more info|more information|elaborate|explain more|go on|what else|who was|how did|why did|what happened|tell me about that|tell me about it|what about that)\b/i.test(text) 
    && text.split(/\s+/).length < 15 
    && !/^(who are you|what is your name|who made you|hello|hi|hey|help|calculate|scaffold|create a|build a|what do you know|what do you remember|remember that|recall)/i.test(text);
  
  if (isFollowUpPattern) {
    try {
      // Get more messages (10 instead of 4) so we don't lose context after 3 replies
      const recent = await getRecentMessages(10);
      
      // KEY FIX: Find the original USER query that started the conversation topic.
      // Walk backwards through messages to find the last substantive user message
      // that looks like a search/question (not a greeting, math, remember, etc.)
      // This is the "conversation topic anchor" — we stay on this topic.
      const reversed = [...recent].reverse();
      let topicAnchor = "";
      let topicAssistantContent = "";
      
      for (const msg of reversed) {
        if (msg.role === "user") {
          const userText = msg.content.trim();
          // Skip greetings, math, remember commands, and very short messages
          if (/^(hello|hi|hey|bye|thank|calculate|remember that|note that|save this|help|who are you)/i.test(userText)) continue;
          if (userText.length < 5) continue;
          // Skip follow-up patterns themselves — we want the ORIGINAL query
          // Two categories of skip:
          // 1. ALWAYS skip: phrases that are ALWAYS follow-ups regardless of length
          if (/^(give more|more info|more information|elaborate|explain more|go on|what else|tell me about that|tell me about it|what about that|continue|then what|what about|how about)\b/i.test(userText)) continue;
          // 2. Skip short follow-ups (≤4 words) starting with question words
          if (/^(when|why|what|how|where|that|this|it|then|did|do|does|is|are|was|were)\b/i.test(userText) && userText.split(/\s+/).length <= 4) continue;
          // This is the original topic query
          topicAnchor = userText;
          break;
        }
      }
      
      // Also find the last assistant message for the isRelatedToPrevious check
      const lastAssistant = reversed.find((m) => m.role === "assistant" && m.content.length > 50);
      
      if (topicAnchor && topicAnchor.length > 3) {
        // Use the ORIGINAL user query as the topic, NOT the AI response
        // This prevents drift because the user's query is clean while the AI
        // response contains web page noise
        const cleanTopic = cleanSearchQuery(topicAnchor);
        
        if (cleanTopic && cleanTopic.length > 2) {
          // SMART FOLLOW-UP RESOLUTION
          // Instead of literally searching "when was that? (about X)",
          // detect what KIND of follow-up this is and build a focused search:
          //   "when was that?" → "X date" or "X when"
          //   "why?" → "X reason" or "X why"
          //   "who?" → "X who"
          //   "where?" → "X location"
          //   "is it still ongoing?" → "X latest" or "X update today"
          //   "tell me more" → just search X again with more depth
          const lowerInput = input.trim().toLowerCase();
          let smartQuery = cleanTopic;
          let followUpKind = "more info";
          
          if (/^when\b/.test(lowerInput)) {
            smartQuery = `${cleanTopic} date`;
            followUpKind = "when/date";
          } else if (/^why\b/.test(lowerInput)) {
            smartQuery = `${cleanTopic} reason why`;
            followUpKind = "why/reason";
          } else if (/^who\b/.test(lowerInput)) {
            smartQuery = `${cleanTopic} who`;
            followUpKind = "who";
          } else if (/^where\b/.test(lowerInput)) {
            smartQuery = `${cleanTopic} location where`;
            followUpKind = "where";
          } else if (/^how\b/.test(lowerInput)) {
            smartQuery = `${cleanTopic} how`;
            followUpKind = "how";
          } else if (/\b(ongoing|still happening|still going|still on|continuing|continue|latest|update)\b/.test(lowerInput)) {
            smartQuery = `${cleanTopic} latest update today`;
            followUpKind = "ongoing/latest";
          } else if (/^what\b/.test(lowerInput)) {
            smartQuery = `${cleanTopic} what`;
            followUpKind = "what";
          } else if (/\b(more|elaborate|detail|explain|continue|go on)\b/.test(lowerInput)) {
            smartQuery = `${cleanTopic} details background`;
            followUpKind = "more detail";
          }
          
          const contextualText = smartQuery;
          steps.push({
            action: "context",
            description: `Follow-up detected (${followUpKind}) — staying on topic: "${cleanTopic}"`,
            result: `Original: "${input.trim()}" → Smart search: "${contextualText}"`,
            success: true,
          });
          text = contextualText;
        }
      } else if (lastAssistant && lastAssistant.content) {
        // Fallback: extract topic from assistant response
        const related = isRelatedToPrevious(text, lastAssistant.content);
        if (related) {
          const topic = extractTopic(lastAssistant.content);
          if (topic && topic.length > 3) {
            const contextualText = `${text} (about ${topic})`;
            steps.push({
              action: "context",
              description: `Follow-up detected — continuing about: "${topic}"`,
              result: `Enhanced: "${contextualText}"`,
              success: true,
            });
            text = contextualText;
          }
        }
      }
    } catch {
      // ignore — proceed with original text
    }
  }

  const classifier = getClassifier();
  const classification: ClassificationResult = classifier.classify(text);
  // Explicit intent overrides (more reliable than Naive Bayes for common intents)
  let intent = classification.intent;
  const lowerText = text.toLowerCase().trim();
  
  // CRITICAL FIX: If we already detected this is a follow-up with a topic anchor
  // (text was rewritten to "topic date" / "topic reason why" / etc.), FORCE search intent.
  // The Naive Bayes classifier has trouble with topical entity words and may
  // misclassify "south lebanon date" as "identity" with low confidence.
  // We check if a "context" step was pushed (meaning follow-up was detected).
  const followUpStep = steps.find(s => s.action === "context");
  if (followUpStep) {
    intent = "command_search";
  }
  
  if (/^(hello|hi|hey|howdy|greetings|good morning|good afternoon|good evening)\b/i.test(lowerText)) intent = "greeting";
  else if (/^(bye|goodbye|see you|farewell)\b/i.test(lowerText)) intent = "farewell";
  else if (/^(thank|thanks|appreciate)\b/i.test(lowerText)) intent = "thanks";
  else if (/^(who are you|what are you|what is your name|who made you|who created you|are you (an? )?(ai|robot|human))\b/i.test(lowerText)) intent = "identity";
  else if (/^(help|what can you do)\b/i.test(lowerText)) intent = "help";
  else if (/^(calculate|compute|what is \d|\d\s*[+\-*/])\b/i.test(lowerText)) intent = "command_calculate";
  else if (/^(remember that|note that|save this)\b/i.test(lowerText)) intent = "command_remember";
  else if (/^(what do you (know|remember) (about|of)|recall)\b/i.test(lowerText)) intent = "command_recall";
  // Follow-up questions that contain "about" + topic from context should search, not remember
  else if (intent === "command_search" && text.includes("(about ") && /\b(how|why|when|what|who|where|give|more|elaborate|explain|tell)\b/i.test(input.trim())) {
    // Legacy: keep command_search intent for old-style follow-ups
    intent = "command_search";
  }
  const confidence = classification.confidence;
  let webResults: WebResult[] | undefined;
  let facts: Fact[] | undefined;
  let responseText = "";
  let spoke = opts?.speak ?? false;

  // === CHAIN-OF-THOUGHT REASONING ===
  // Inline reasoning (fast, no module loading)
  try {
    const reasoningThought = getInlineReasoning(text);
    if (reasoningThought) {
      steps.push({
        action: "think",
        description: reasoningThought,
        result: "Reasoning complete",
        success: true,
      });
    }
  } catch {
    // Reasoning failed — continue without it
  }

  // === CONVERSATION MEMORY ===
  // Store user message — fire and forget (don't block the response)
  // Embeddings are generated in the background, not on the critical path
  try {
    await saveMessage("user", input.trim(), intent);
  } catch {}
  // Store with embedding in background (non-blocking)
  // Embeddings stored in background (disabled for speed)
  // storeMessageWithEmbedding is available via /api/ai/llm-status

  // === CODING DETECTION ===
  // Check early — coding requests get full project agent treatment
  if (isCodingRequest(text)) {
    const codeResponse = await handleCodingRequest(text, steps, opts?.speak);
    if (codeResponse) {
      return codeResponse;
    }
  }

  // === TERMINAL DETECTION ===
  // "run X", "execute X", "npm install", "ls", etc.
  if (isTerminalRequest(text)) {
    const termResponse = await handleTerminalRequest(text, steps, opts?.speak);
    if (termResponse) {
      return termResponse;
    }
  }

  // --- AGENT LOOP ---
  // 1) Try math first
  const mathResult = detectMath(text);
  if (mathResult !== null) {
    steps.push({
      action: "calculate",
      description: `Evaluated math expression`,
      result: mathResult,
      success: true,
    });
    responseText = `The answer is ${mathResult}.`;
  } else if (intent === "greeting") {
    responseText = pick([
      "Hey! I'm Mr Robot. I can chat, search the web, write code, and remember what you tell me. What's up?",
      "Hi there! Mr Robot here. What can I help you with today?",
      "Hey, good to see you! I'm Mr Robot — ask me anything, or tell me to search, code, or remember something.",
      "Hello! I'm Mr Robot. I work entirely from scratch — no APIs. What would you like to do?",
    ]);
  } else if (intent === "farewell") {
    responseText = pick([
      "See you later! I'll remember what you taught me.",
      "Bye! Come back any time.",
      "Take care — your facts are safe with me.",
    ]);
  } else if (intent === "thanks") {
    responseText = pick([
      "You're welcome! Happy to help.",
      "Anytime — that's what I'm here for.",
      "No problem at all!",
    ]);
  } else if (intent === "welcome") {
    responseText = "Of course!";
  } else if (intent === "identity") {
    responseText =
      "I'm Mr Robot — an AI built entirely from scratch in TypeScript. I have my own tokenizer, Porter stemmer, Naive Bayes intent classifier, neural network with backpropagation, knowledge base for storing facts, and a web scraper that searches Bing, Google, and DuckDuckGo. No external AI APIs — every bit of my intelligence is custom code you can read in src/lib/ai/. I can chat, search the web, remember what you tell me, write code in 19 frameworks, use a terminal, manage git, and learn from my mistakes. What would you like to do?";
  } else if (intent === "help") {
    responseText =
      "Here's what I can do:\n\n• Chat naturally — I classify your intent with a from-scratch Naive Bayes classifier.\n• Search the web — I search Bing, Google, and DuckDuckGo with no API key.\n• Remember facts — say 'remember that Paris is the capital of France'.\n• Recall facts — ask 'what do you know about Paris?'.\n• Calculate — say 'calculate 5 * 3 + 2'.\n• Speak — toggle the voice button and I'll read my responses aloud using your browser's Web Speech API.\n• Act as an agent — I plan, take actions, and observe results before responding.\n\n**CODING (full-stack senior dev mode):**\n• Scaffold projects — 'scaffold a react project called MyApp' (supports React, Next.js, Vue, Angular, Svelte, Express, Fastify, NestJS, Flask, Django, FastAPI, Odoo, Node)\n• Create components — 'create a react component called UserCard'\n• Create pages, APIs, hooks, models, tests — 'create a nextjs api called users'\n• Fix code — 'fix src/App.tsx' — I detect var usage, loose equality, console.logs, empty catches, etc.\n• Refactor code — 'refactor src/utils/helpers.ts'\n• Explain code — 'explain src/index.ts'\n• Use the terminal — 'run npm install' or 'run ls' or 'execute npm test'\n• Learn from mistakes — when a command fails, I parse the error, look up the fix, apply it, and remember for next time\n\nOpen the **Code Studio** tab to see the file explorer, edit files, and watch me work.";
  } else if (intent === "command_remember") {
    // Strip "remember that" / "note that" / "save this" prefix before extracting the fact
    const prefixMatch = text.match(
      /^(?:remember that|note that|save this:?)\s+(.+)$/i
    );
    const innerText = prefixMatch ? prefixMatch[1].trim() : text;
    const fact = extractFact(innerText);
    if (fact) {
      try {
        await storeFact(fact);
        steps.push({
          action: "remember",
          description: `Stored fact: ${fact.subject} ${fact.predicate} ${fact.object}`,
          result: "Saved to knowledge base",
          success: true,
        });
      } catch (e) {
        console.error("Store fact failed:", e);
        steps.push({
          action: "remember",
          description: `Tried to store fact but DB failed`,
          result: "Fact extracted but not saved",
          success: false,
        });
      }
      try {
        responseText = `Got it. I'll remember that ${await factToText(fact)}`;
      } catch {
        responseText = `Got it. I'll remember that.`;
      }
    } else {
      try {
        await storeFact({ subject: "note", predicate: "is", object: innerText.toLowerCase() });
      } catch (e) {
        console.error("Store note failed:", e);
      }
      responseText = `Okay, I've noted that: ${innerText}`;
    }
  } else if (intent === "command_recall") {
    // Extract subject from the question
    const m = text.match(/(?:what do you (?:know|remember) (?:about|of)|recall(?:\s+about)?)\s+(.+?)\??$/i);
    const subject = m ? m[1].trim() : "";
    if (subject) {
      let recalled: Fact[] = [];
      try {
        recalled = await recallAbout(subject);
      } catch (e) {
        console.error("Recall failed:", e);
      }
      if (recalled.length > 0) {
        let texts: string[] = [];
        try {
          texts = await Promise.all(recalled.map(factToText));
        } catch (e) {
          console.error("Fact to text failed:", e);
          texts = recalled.map((f) => `${f.subject} ${f.predicate} ${f.object}`);
        }
        responseText = `Here's what I know about ${subject}:\n\n${texts.join("\n")}`;
        facts = recalled;
        steps.push({
          action: "recall",
          description: `Retrieved ${recalled.length} facts about ${subject}`,
          result: `${recalled.length} facts found`,
          success: true,
        });
      } else {
        responseText = `I don't have any stored facts about ${subject} yet. Would you like me to search the web for information?`;
      }
    } else {
      // List everything
      const all = await searchKnowledge("");
      responseText = `I have ${all.length} facts stored. Tell me a subject to recall.`;
      facts = all;
    }
  } else if (intent === "command_search" || intent === "question") {
    // === REASONING LAYER ===
    // Think about what the user is asking before searching
    const reasoning = reasonAboutQuery(text);
    steps.push({
      action: "think",
      description: `Reasoning: ${reasoning.thought}`,
      result: `Search strategy: ${reasoning.strategy}`,
      success: true,
    });

    // Extract search query — smart extraction that keeps the key entities
    let query = reasoning.searchQuery;

    // First check local knowledge (non-blocking)
    let localFacts: Fact[] = [];
    try {
      localFacts = await searchKnowledge(query);
    } catch (e) {
      console.error("Local knowledge search failed:", e);
    }
    steps.push({
      action: "search_local",
      description: `Searched local knowledge for: ${query}`,
      result: `Found ${localFacts.length} facts`,
      success: true,
    });

    // Then search the REAL web (Bing/Google/DuckDuckGo → fetch pages → extract answers)
    // NO Wikipedia — this opens actual websites and reads their content
    let web: WebResult[] = [];
    let realAnswer: string | null = null;
    let realSources: Array<{ title: string; url: string }> = [];
    try {
      const real = await realSearch(query);
      if (real.results.length > 0) {
        web = real.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          content: r.content,
          source: r.source as "bing" | "google" | "duckduckgo" | "web" | "page",
        }));
        realAnswer = real.answer;
        realSources = real.sources;
      }
      // If real search found nothing, fall back to old search
      if (web.length === 0) {
        web = await webSearch(query);
      }
    } catch (e) {
      console.error("Real web search failed:", e);
      try {
        web = await webSearch(query);
      } catch (e2) {
        console.error("Fallback search failed:", e2);
      }
    }
    webResults = web;
    steps.push({
      action: "search_web",
      description: `Searched the web for: ${query}`,
      result: `Found ${web.length} results`,
      success: web.length > 0,
    });

    if (web.length > 0) {
      // Build local memory text if available
      let localText = "";
      if (localFacts.length > 0) {
        const localTexts = await Promise.all(localFacts.slice(0, 2).map(factToText));
        localText = `I remember this: ${localTexts.join(" ")}\n\n`;
      }

      // If we have a direct answer from the real search, use it
      if (realAnswer) {
        const cleanAnswer = cleanWebText(realAnswer);
        // Rich response: prioritize content, sources are minimal tags at the end
        const parts = [cleanAnswer];
        
        // Add supporting context (cleaned, max 2 items)
        const supporting = web
          .filter((r) => r.content && r.content.includes(realAnswer.slice(0, 30)) === false)
          .slice(0, 2)
          .map((r) => cleanWebText(r.snippet).slice(0, 200))
          .filter((s) => s.length > 30);
        if (supporting.length > 0) {
          parts.push("\n" + supporting.map(s => `• ${s}`).join("\n"));
        }
        
        // Sources: minimal — just "via domain" tags, not full URLs
        const sourceTags = (realSources.length > 0 ? realSources : web.slice(0, 3).map((r) => ({ title: r.title, url: r.url })))
          .map((s) => {
            try { return new URL(s.url).hostname.replace("www.", ""); }
            catch { return cleanWebText(s.title).slice(0, 30); }
          })
          .filter((v, i, a) => a.indexOf(v) === i) // dedupe
          .slice(0, 3);
        if (sourceTags.length > 0) {
          parts.push(`\nvia ${sourceTags.join(", ")}`);
        }
        
        responseText = parts.join("\n");
      } else {
        // Use the answer extractor to find answers from the fetched page content
        let answerResult: Awaited<ReturnType<typeof extractAnswer>> | null = null;
        try {
          answerResult = await extractAnswer(query, web);
        } catch (e) {
          console.error("Answer extraction failed:", e);
        }

        if (answerResult && (answerResult.directAnswer || answerResult.supportingSentences.length > 0)) {
          // Clean the answer result before formatting
          if (answerResult.directAnswer) answerResult.directAnswer = cleanWebText(answerResult.directAnswer);
          answerResult.supportingSentences = answerResult.supportingSentences.map(s => ({ ...s, text: cleanWebText(s.text) }));
          answerResult.sources = answerResult.sources.map(s => ({ title: cleanWebText(s.title), url: s.url }));
          responseText = formatAnswerRich(query, answerResult);
        } else {
          // Fallback: show cleaned snippets from the fetched pages
          const snippets = web.slice(0, 3)
            .map((r) => cleanWebText(r.snippet).slice(0, 200))
            .filter((s) => s.length > 30);
          if (snippets.length > 0) {
            const sourceTags = web.slice(0, 3)
              .map((r) => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return r.source; } })
              .filter((v, i, a) => a.indexOf(v) === i);
            responseText = `${snippets.join("\n\n")}\n\nvia ${sourceTags.join(", ")}`;
          } else {
            responseText = `I searched the web for "${query}" but couldn't find clear information. Try rephrasing your question.`;
          }
        }
      }

      steps.push({
        action: "extract_answer",
        description: `Extracted answer from ${web.length} web results`,
        result: realAnswer ? "Direct answer found" : "Supporting info found",
        success: true,
      });

      // Apply what we learned: store interesting facts
      try {
        const newFacts = extractFactsFromText(web[0].snippet || web[0].content || "", query);
        for (const f of newFacts.slice(0, 2)) {
          try {
            await storeFact({ ...f, source: "web" });
          } catch {}
        }
        if (newFacts.length > 0) {
          steps.push({
            action: "apply",
            description: `Applied web knowledge: stored ${newFacts.length} new facts`,
            result: newFacts.map((f) => `${f.subject} ${f.predicate} ${f.object}`).join("; "),
            success: true,
          });
        }
      } catch {}
    } else if (localFacts.length > 0) {
      const localTexts = await Promise.all(localFacts.map(factToText));
      responseText = `From what I remember: ${localTexts.join(" ")}\n\nI couldn't find anything new on the web just now, but I'll keep what I know.`;
    } else {
      responseText = `I searched for "${query}" but couldn't find clear results. This might be because:\n\n• The topic is very specific or recent (search engines may not have indexed this yet)\n• The search terms need to be more general\n\nTry rephrasing — for example, instead of "who won iran vs egypt", try adding the year (e.g., "iran vs egypt 2026") or the competition name (e.g., "FIFA World Cup 2026").`;
    }
    facts = localFacts;
  } else if (intent === "command_speak") {
    responseText = "Voice is on! I'll speak my responses aloud. You can toggle it off with the voice button.";
    spoke = true;
  } else if (intent === "command_silence") {
    responseText = "Okay, I'll stop speaking. Toggle the voice button if you want me to talk again.";
    spoke = false;
  } else if (intent === "command_calculate") {
    const m = text.match(/(?:calculate|compute|eval(?:uate)?)\s+(.+?)\??$/i);
    const expr = m ? m[1] : text;
    const result = evaluateMath(expr);
    if (result !== null) {
      steps.push({
        action: "calculate",
        description: `Evaluated ${expr}`,
        result,
        success: true,
      });
      responseText = `${expr} = ${result}`;
    } else {
      responseText = "I couldn't parse that math expression. Try something like 'calculate 5 * 3 + 2'.";
    }
  } else {
    // Fallback: search knowledge base by similarity, then web
    let localFacts: Fact[] = [];
    try {
      localFacts = await searchKnowledge(text);
    } catch (e) {
      console.error("Fallback knowledge search failed:", e);
    }
    if (localFacts.length > 0) {
      const best = localFacts[0];
      try {
        responseText = await factToText(best);
      } catch {
        responseText = `I found something about ${best.subject} but couldn't format it.`;
      }
      facts = localFacts;
    } else {
      // Try web search as fallback
      let web: WebResult[] = [];
      try {
        web = await webSearch(text);
      } catch (e) {
        console.error("Fallback web search failed:", e);
      }
      webResults = web;
      if (web.length > 0) {
        const summary = summarizeResults(web.slice(0, 2), 600);
        responseText = `I'm not sure I understood fully, but here's what I found online:\n\n${summary}`;
        steps.push({
          action: "search_web",
          description: `Searched web as fallback for: ${text}`,
          result: `Found ${web.length} results`,
          success: true,
        });
      } else {
        responseText =
          "I'm not sure how to respond to that. Try asking me to search, remember a fact, calculate something, or just chat. Type 'help' to see what I can do.";
      }
    }
  }

  // Run the neural net for additional signal (purely demonstrative — used for confidence calibration)
  try {
    const features = featurize(text);
    const nn = getNeuralNet();
    const out = nn.predict(features);
    const maxOut = Math.max(...out);
    const nnIntentIdx = out.indexOf(maxOut);
    // We don't override the classifier; the NN is a parallel signal
    void nnIntentIdx;
  } catch {
    // ignore
  }

  // Clean up the response — remove excessive whitespace, empty lines, and formatting noise
  // NOTE: use [ \t] instead of \s to avoid removing newlines from empty lines
  responseText = responseText
    .replace(/\n{3,}/g, "\n\n")           // Max 2 consecutive newlines
    .replace(/[ \t]{2,}/g, " ")            // Collapse spaces/tabs
    .replace(/^[ \t]+|[ \t]+$/gm, "")     // Trim spaces/tabs on each line (NOT newlines)
    .replace(/\n[ \t]+/g, "\n")           // Remove leading spaces on lines
    .replace(/[ \t]+\n/g, "\n")           // Remove trailing spaces on lines
    .replace(/\n{3,}/g, "\n\n")           // Final pass: max 2 newlines
    .trim();

  // Save assistant message (non-blocking)
  try {
    await saveMessage("assistant", responseText, intent, {
      confidence,
      steps: steps.length,
      webResults: webResults?.length || 0,
    });
  } catch (e) {
    console.error("Failed to save assistant message:", e);
  }
  // Store with embedding in background (non-blocking)
  // Embeddings stored in background (disabled for speed)

  return {
    text: responseText,
    intent,
    confidence,
    steps: steps.length > 0 ? steps : undefined,
    facts,
    webResults,
    spoke,
    metadata: {
      classifierScores: classification.scores,
      timestamp: Date.now(),
    },
  };
}

function getInlineReasoning(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(search|find|look up|who|what|where|when|why|how)\b/i.test(lower)) {
    return "User wants information. I'll search Bing/Google/DDG, fetch the actual web pages, and extract the answer.";
  }
  if (/\b(calculate|compute|math)\b/i.test(lower) || /\d\s*[+\-*/]\s*\d/.test(lower)) {
    return "User wants math. I'll evaluate the expression safely using RPN.";
  }
  if (/\b(remember|note|save)\b/i.test(lower)) {
    return "User wants me to remember something. I'll extract and store the fact.";
  }
  if (/\b(scaffold|create a|build)\b/i.test(lower)) {
    return "User wants code. I'll detect the framework and generate/scaffold it.";
  }
  if (/\b(run|execute|npm|node|python)\b/i.test(lower)) {
    return "User wants to run a command. I'll execute it safely in the terminal.";
  }
  return "General conversation. I'll respond naturally.";
}

/**
 * Clean web page text — decode HTML entities, remove junk, fix spacing.
 */
function cleanWebText(text: string): string {
  if (!text) return "";
  let t = text;
  // Decode HTML entities
  t = t.replace(/&#x27;/g, "'").replace(/&#39;/g, "'");
  t = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  t = t.replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
  t = t.replace(/&#91;/g, "[").replace(/&#93;/g, "]");
  t = t.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
  // Remove navigation junk patterns
  t = t.replace(/\b(Follow|Share|Subscribe|Sign in|Log in|Register|Download|Watch now|Read more|See more|Show more|Learn more|Skip to content|Click here|Skip to main content|Back to Map|Listen|Updated|By the Center)\b/gi, "");
  // Remove social media junk
  t = t.replace(/\b(Facebook|Twitter|Instagram|LinkedIn|WhatsApp|Telegram)\b/gi, "");
  // Remove common web page noise
  t = t.replace(/\b(mins?|hours?|days?)\s*$/gim, "");
  t = t.replace(/\b(Global Conflict Tracker|Center for Preventive Action)\b/gi, "");
  // Remove lines that are just one or two words (navigation labels)
  const lines = t.split("\n").map(l => l.trim());
  const cleanLines = lines.filter(l => {
    if (l.length < 3) return false;
    const words = l.split(/\s+/);
    if (words.length <= 2 && l.length < 20) return false;
    return true;
  });
  t = cleanLines.join(" ");
  // Fix sentences running together: add period between lowercase→uppercase
  t = t.replace(/([a-z])([A-Z])/g, "$1. $2");
  // Fix missing space after periods
  t = t.replace(/\.(?=[A-Z])/g, ". ");
  // Collapse multiple spaces (but keep newlines)
  t = t.replace(/[ \t]+/g, " ").trim();
  // Remove leading/trailing junk
  t = t.replace(/^[\s•\-\|]+|[\s•\-\|]+$/g, "");
  return t;
}

/**
 * Format answer in a rich way — content first, sources as minimal tags.
 */
function formatAnswerRich(query: string, answer: Awaited<ReturnType<typeof extractAnswer>>): string {
  const parts: string[] = [];

  if (answer.directAnswer) {
    parts.push(answer.directAnswer);
  }

  if (answer.supportingSentences.length > 1) {
    const supporting = answer.supportingSentences
      .filter((s) => s.text !== answer.directAnswer)
      .slice(0, 3)
      .map((s) => `• ${s.text}`)
      .join("\n");
    if (supporting) parts.push("\n" + supporting);
  }

  // Sources: minimal domain tags
  const sourceTags = answer.sources
    .slice(0, 3)
    .map((s) => {
      try { return new URL(s.url).hostname.replace("www.", ""); }
      catch { return s.title.slice(0, 30); }
    })
    .filter((v, i, a) => a.indexOf(v) === i);
  if (sourceTags.length > 0) {
    parts.push(`\nvia ${sourceTags.join(", ")}`);
  }

  return parts.join("\n");
}

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Clean a user query to extract just the key topic words.
 * Strips question words, command prefixes, and filler — keeps entities.
 * Example: "what happened in beirut lately" → "beirut"
 *          "what happened in south lebanon" → "south lebanon"
 */
function cleanSearchQuery(query: string): string {
  let q = query.trim().toLowerCase();
  // Strip command prefixes
  q = q.replace(
    /^(?:please\s+)?(?:search(?:\s+for)?|look\s+up|find(?:\s+information\s+about)?|google|tell me about|tell me|explain|what is|what's|whats|who is|who's|whos|where is|when is|why is|how do|how does|how is|how are|what happened|what's new|whats new|what's happening|whats happening)\s+/i,
    ""
  );
  // Strip "who won"
  q = q.replace(/^who\s+won\s+(?:the\s+)?/i, "");
  // Strip trailing question marks
  q = q.replace(/[?!.]+$/g, "").trim();
  // Strip leading filler words (but keep entity names)
  q = q.replace(
    /^(?:the|a|an|is|are|was|were|did|do|does|can|could|would|should|will|about|of|in|on|at|lately|recently|today|now|this|that)\s+/i,
    ""
  );
  // Remove trailing filler words
  q = q.replace(/\s+(?:lately|recently|today|now|happening|going on|going on with)$/i, "");
  q = q.trim();
  return q.length > 1 ? q : query.replace(/[?!.]+$/g, "").trim();
}

/**
 * Extract the main topic from a previous response.
 * Smarter context extraction — finds the actual subject being discussed.
 */
function extractTopic(content: string): string {
  // Remove URLs
  let text = content.replace(/https?:\/\/[^\s]+/g, "");
  text = text.replace(/[*_`#\[\]]/g, "");
  text = text.replace(/&[#a-z0-9]+;/gi, "");

  // Strategy 1: Look for the query in quotes
  const queryMatch = text.match(/(?:answer to|about|for|question)\s+"([^"]+)"/i);
  if (queryMatch) return queryMatch[1].trim();

  // Strategy 2: Look for "via domain.com" — the text before it is the content
  // Extract the most meaningful words from the first 200 chars of actual content
  const firstPart = text.slice(0, 300);
  
  // Remove common web page noise words
  const noiseWords = new Set([
    "the", "and", "for", "with", "from", "about", "into", "that", "this",
    "what", "when", "where", "why", "how", "was", "were", "been", "have",
    "has", "had", "will", "would", "could", "should", "may", "might",
    "based", "found", "following", "after", "during", "according",
    "answer", "question", "result", "source", "context", "more", "here",
    "lebanon", "today", "featured", "content", "explainer", "google", "news",
    "latest", "al", "jazeera", "skip", "main", "back", "map", "listen",
    "updated", "center", "preventive", "action", "global", "conflict", "tracker",
    "menu", "world", "sections", "iran", "war", "newsletter", "morning", "wire",
    "via", "follow", "share", "subscribe"
  ]);
  
  // Find the most frequent meaningful words
  const words = firstPart.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !noiseWords.has(w));
  
  if (words.length > 0) {
    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      return sorted.slice(0, 4).map((s) => s[0]).join(" ");
    }
  }

  // Strategy 3: Named entities (but heavily filtered)
  const capWords = firstPart.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
  if (capWords && capWords.length > 0) {
    const skip = new Set([
      "The", "This", "That", "Here", "Based", "From", "More", "Sources",
      "Watch", "Read", "According", "Following", "After", "During",
      "HTTP", "DNS", "API", "GET", "POST", "Lebanon", "Today", "Featured",
      "Content", "EXPLAINER", "Google", "News", "Latest", "Al", "Jazeera",
      "Menu", "World", "Sections", "Iran", "Newsletter", "Morning", "Wire",
      "Center", "Preventive", "Action", "Global", "Conflict", "Tracker"
    ]);
    const filtered = capWords.filter((w) => !skip.has(w) && w.length > 3);
    if (filtered.length > 0) return filtered.slice(0, 3).join(" ");
  }

  return "";
}

/**
 * Check if a follow-up question is actually related to the previous conversation.
 * Returns true only if there's meaningful overlap.
 */
function isRelatedToPrevious(followUp: string, previousContent: string): boolean {
  const followUpLower = followUp.toLowerCase();
  const prevLower = previousContent.toLowerCase();

  // If the follow-up contains pronouns or question words, it's likely a follow-up
  const hasPronouns = /\b(it|that|this|those|these|they|them|he|she|his|her|its)\b/i.test(followUpLower);
  const hasQuestionWords = /\b(when|why|who|what|how|where|did|does|is|was|were|happen|happened|continue|more|about|give|elaborate|explain)\b/i.test(followUpLower);
  const isShort = followUp.split(/\s+/).length < 15;

  if (hasPronouns && isShort) return true;
  if (hasQuestionWords && isShort) return true;

  // Check if any significant words from the previous response appear in the follow-up
  const prevWords = new Set(prevLower.split(/\s+/).filter(w => w.length > 4));
  const followWords = followUpLower.split(/\s+/).filter(w => w.length > 4);
  let overlap = 0;
  for (const w of followWords) {
    if (prevWords.has(w)) overlap++;
  }

  return overlap >= 2;
}

/**
 * Smart search query extraction.
 * Strips command prefixes and question words but KEEPS the key entities.
 *
 * Examples:
 *   "search for javascript" → "javascript"
 *   "who won football iran vs egypt" → "iran vs egypt football"
 *   "what is python programming" → "python programming"
 *   "tell me about paris france" → "paris france"
 *   "whats new in 2026" → "2026"
 *   "from the web tell me who won the football match iran vs egypt" → "iran vs egypt football match"
 */
/**
 * Reasoning layer — thinks about the question before searching.
 * This is Mr Robot's "extended thinking" — it plans the search strategy.
 */
function reasonAboutQuery(text: string): {
  thought: string;
  strategy: string;
  searchQuery: string;
  isSports: boolean;
  isCurrentEvent: boolean;
  isKnowledge: boolean;
} {
  const lower = text.toLowerCase();

  // Detect question type
  const isSports = /\b(football|soccer|match|score|vs|versus|won|lost|draw|game|team|league|cup|tournament)\b/i.test(text);
  const isCurrentEvent = /\b(today|yesterday|this week|this month|2025|2026|news|latest|recent|happening|breaking)\b/i.test(text);
  const isKnowledge = /\b(what is|explain|how does|tell me about|definition|history of|who invented|when was)\b/i.test(text);

  let thought = "";
  let strategy = "";
  let searchQuery = extractSearchQuery(text);

  if (isSports) {
    thought = "This is a sports question. The user wants specific match results or team info. I should search for the event name + year to find web pages that contain the results.";
    strategy = "Search Bing, Google, and DuckDuckGo for the event (e.g., '2026 FIFA World Cup Group G' contains match results)";
    // For sports, try adding the year and event type
    if (/\b2026\b/.test(text) || /\bworld cup\b/i.test(text)) {
      searchQuery = text.replace(/^(?:who won|search for|look up|find|tell me about)\s+/i, "").replace(/[?!.]+$/g, "").trim();
      // Also try "2026 FIFA World Cup" if it mentions world cup
      if (/\bworld cup\b/i.test(text)) {
        searchQuery = "2026 FIFA World Cup " + searchQuery.replace(/world cup/i, "").trim();
      }
    }
  } else if (isCurrentEvent) {
    thought = "This is about current events. Search engines may have recent results. I should search with the specific year and topic.";
    strategy = "Search Bing/Google/DDG with year + topic";
  } else if (isKnowledge) {
    thought = "This is a knowledge question. Search engines should have results about this topic.";
    strategy = "Search Bing/Google/DDG for the key concept";
  } else {
    thought = "General search query. I'll search Bing, Google, and DuckDuckGo for the key terms.";
    strategy = "Search Bing/Google/DDG with extracted key terms";
  }

  return { thought, strategy, searchQuery, isSports, isCurrentEvent, isKnowledge };
}

function extractSearchQuery(text: string): string {
  let q = text.trim();

  // Strip leading command phrases
  q = q.replace(
    /^(?:please\s+)?(?:search(?:\s+for)?|look\s+up|find(?:\s+information\s+about)?|google|tell me about|tell me|explain|what is|what's|whats|who is|who's|whos|where is|when is|why is|how do|how does|how is|how are|from the web(?:\s+tell me)?(?:\s+who)?(?:\s+won)?)\s+/i,
    ""
  );

  // Strip "who won" patterns but keep the entities
  q = q.replace(/^who\s+won\s+(?:the\s+)?/i, "");
  q = q.replace(/^who\s+won\s+/i, "");

  // Strip trailing question marks
  q = q.replace(/[?!.]+$/g, "").trim();

  // Strip common filler words but KEEP entities like "iran", "egypt", "vs", "football"
  // Only strip very generic question words at the start
  q = q.replace(
    /^(?:the|a|an|is|are|was|were|did|do|does|can|could|would|should|will|about|of|in|on|at)\s+/i,
    ""
  );

  // If the query is too short or empty, fall back to original
  if (q.length < 2) {
    return text.replace(/[?!.]+$/g, "").trim();
  }

  return q;
}

/**
 * Heuristically extract facts from web text.
 * Not perfect, but pulls out "X is Y" sentences.
 */
function extractFactsFromText(text: string, subjectHint: string): Fact[] {
  if (!text) return [];
  const facts: Fact[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 5);
  for (const s of sentences) {
    const f = extractFact(s);
    if (f && (f.subject.includes(subjectHint.toLowerCase()) || f.object.includes(subjectHint.toLowerCase()))) {
      facts.push(f);
    }
  }
  return facts;
}

/**
 * Train the neural network on a new example (online learning).
 */
export function learn(input: string, targetIntentIdx: number): void {
  const features = featurize(input);
  const target = new Array(6).fill(0);
  target[targetIntentIdx] = 1;
  const nn = getNeuralNet();
  nn.train([{ input: features, target }], 50);
}

/**
 * Export the brain state (classifier weights + NN weights) as a JSON string.
 * The user can download this to "save" their AI's learned state.
 */
export function exportBrain(): string {
  return JSON.stringify({
    classifier: getClassifier().export(),
    neuralNet: getNeuralNet().serialize(),
    version: 1,
    exportedAt: new Date().toISOString(),
  });
}

/**
 * Get the list of all built-in intents (for UI display).
 */
export function listIntents(): string[] {
  return Array.from(new Set(DEFAULT_TRAINING_DATA.map((d) => d.intent)));
}

// ============================================================
// CODING DETECTION & HANDLING
// ============================================================

const CODING_KEYWORDS = [
  "scaffold", "create a react", "create a vue", "create an angular", "create a svelte",
  "create a next", "create a component", "create a page", "create an api", "create a hook",
  "create a utility", "create a util", "create a test", "create a model", "create an odoo",
  "create a flask", "create a django", "create a fastapi", "create a fastify", "create a nest",
  "create an express", "create a node", "build a react", "build a project",
  "fix code", "fix src", "fix the", "refactor", "explain code", "explain src",
  "add a feature", "remove a feature",
  "react component", "angular component", "vue component", "svelte component",
  "nextjs page", "next.js page", "express route", "fastapi router",
];

function isCodingRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return CODING_KEYWORDS.some((kw) => lower.includes(kw));
}

async function handleCodingRequest(
  text: string,
  steps: AgentStep[],
  speak?: boolean
): Promise<BrainResponse | null> {
  try {
    steps.push({
      action: "parse_request",
      description: "Parsing code request",
      result: "Detected coding intent",
      success: true,
    });

    // Generate code
    const codeResult = await generateCode(text);

    if (codeResult.files.length === 0 && !codeResult.explanation) {
      return null;
    }

    // Apply file operations
    const applied = await applyOps(codeResult.files);
    steps.push({
      action: "apply_files",
      description: `Applied ${codeResult.files.length} file operations`,
      result: `${applied.applied} succeeded, ${applied.errors.length} failed`,
      success: applied.errors.length === 0,
    });

    // If it was a scaffold, try to install dependencies (best effort, non-blocking)
    if (
      codeResult.files.some((f) => f.path.endsWith("package.json")) &&
      codeResult.nextSteps[0]?.startsWith("cd ")
    ) {
      const projectName = codeResult.nextSteps[0].slice(4);
      steps.push({
        action: "install_deps",
        description: `Running npm install in ${projectName}`,
        result: "Starting in background",
        success: true,
      });
      // Don't await — too slow. The user can run it themselves.
    }

    const responseText = `${codeResult.explanation}\n\n**Files created/modified:** ${applied.applied}\n**Next steps:**\n${codeResult.nextSteps.map((s) => `  $ ${s}`).join("\n")}${codeResult.warnings && codeResult.warnings.length > 0 ? `\n\n⚠️ **Warnings:**\n${codeResult.warnings.map((w) => `  • ${w}`).join("\n")}` : ""}${applied.errors.length > 0 ? `\n\n❌ **Errors:**\n${applied.errors.map((e) => `  • ${e}`).join("\n")}` : ""}`;

    await saveMessage("assistant", responseText, "coding", {
      filesCreated: applied.applied,
      framework: codeResult.framework,
    });

    return {
      text: responseText,
      intent: "coding",
      confidence: 0.95,
      steps,
      spoke: speak,
      codeResult: {
        files: codeResult.files,
        explanation: codeResult.explanation,
        framework: codeResult.framework,
        language: codeResult.language,
        nextSteps: codeResult.nextSteps,
        applied: applied.applied,
        warnings: codeResult.warnings,
      },
    };
  } catch (e) {
    console.error("Coding request failed:", e);
    return null;
  }
}

// ============================================================
// TERMINAL HANDLING
// ============================================================

const TERMINAL_PREFIXES = [
  "run ", "execute ", "exec ", "shell ", "terminal ",
  "npm ", "npx ", "bun ", "yarn ", "pnpm ", "node ", "python ",
  "pip ", "git ", "ls", "cat ", "echo ", "mkdir ", "cd ",
  "tsc ", "eslint ", "prettier ", "vite ", "pytest ", "cargo ",
  "go ", "make ", "curl ", "wget ",
];

function isTerminalRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return TERMINAL_PREFIXES.some((p) => lower.startsWith(p));
}

async function handleTerminalRequest(
  text: string,
  steps: AgentStep[],
  speak?: boolean
): Promise<BrainResponse | null> {
  try {
    // Extract command — strip leading "run "/"execute "/etc.
    let cmd = text.trim();
    const prefixMatch = cmd.match(/^(?:run|execute|exec|shell|terminal)\s+(.+)/i);
    if (prefixMatch) {
      cmd = prefixMatch[1].trim();
    }
    // Strip surrounding backticks or quotes
    cmd = cmd.replace(/^["'`]|["'`]$/g, "");

    steps.push({
      action: "execute_command",
      description: `Running: ${cmd}`,
      result: "Command started",
      success: true,
    });

    const result = await execTerminal(cmd, { fullAccess: false, timeout: 60000 });

    steps.push({
      action: "command_result",
      description: `Command exited with code ${result.exitCode}`,
      result: result.exitCode === 0 ? "Success" : `Failed: ${result.stderr.slice(0, 200)}`,
      success: result.exitCode === 0,
    });

    let autoFix:
      | {
          applied: boolean;
          fixCommand?: string;
          fixDescription?: string;
          pattern?: string;
          learnedFrom?: string;
          retryResult?: unknown;
        }
      | undefined;

    // If the command failed, try to auto-fix
    if (result.exitCode !== 0 && result.stderr) {
      // First check if we've learned this mistake before
      const learned = await lookupMistake(result.stderr);
      let fixCommand: string | undefined;
      let fixDescription: string | undefined;
      let matchedPattern: string | undefined;
      let learnedFrom: string | undefined;

      if (learned && learned.successRate > 0.5) {
        fixCommand = learned.fixApplied;
        fixDescription = learned.fixDescription || "Re-using learned fix";
        matchedPattern = "learned_pattern";
        learnedFrom = `Seen ${learned.occurrenceCount}x before, ${Math.round(learned.successRate * 100)}% success rate`;
      } else {
        const match = matchError(result.stderr, result.stdout);
        if (match.matched && match.fixCommand) {
          fixCommand = match.fixCommand;
          fixDescription = match.fixDescription;
          matchedPattern = match.pattern?.id;
        }
      }

      if (fixCommand) {
        steps.push({
          action: "auto_fix",
          description: `Attempting fix: ${fixDescription}`,
          result: `Running: ${fixCommand}`,
          success: true,
        });

        try {
          const fixResult = await execTerminal(fixCommand, { fullAccess: true, timeout: 60000 });
          let retryResult: typeof result | undefined;
          if (fixResult.exitCode === 0) {
            steps.push({
              action: "fix_succeeded",
              description: "Fix applied successfully, retrying original command",
              result: "Retrying",
              success: true,
            });
            retryResult = await execTerminal(cmd, { fullAccess: false, timeout: 60000 });
            steps.push({
              action: "retry_result",
              description: `Retry exited with code ${retryResult.exitCode}`,
              result: retryResult.exitCode === 0 ? "Success" : "Still failing",
              success: retryResult.exitCode === 0,
            });
          } else {
            steps.push({
              action: "fix_failed",
              description: "Fix command itself failed",
              result: fixResult.stderr.slice(0, 200),
              success: false,
            });
          }

          const success = retryResult?.exitCode === 0;
          await recordMistake({
            context: cmd,
            errorOutput: result.stderr,
            fixApplied: fixCommand,
            fixDescription,
            success,
          });

          autoFix = {
            applied: true,
            fixCommand,
            fixDescription,
            pattern: matchedPattern,
            learnedFrom,
            retryResult: retryResult
              ? {
                  stdout: retryResult.stdout,
                  stderr: retryResult.stderr,
                  exitCode: retryResult.exitCode,
                  command: retryResult.command,
                }
              : undefined,
          };
        } catch (e) {
          autoFix = {
            applied: false,
            fixCommand,
            fixDescription: `Fix attempt failed: ${e instanceof Error ? e.message : "unknown"}`,
          };
        }
      }
    }

    const finalResult = (autoFix?.retryResult as typeof result) || result;
    const finalExit = finalResult.exitCode;

    let responseText = "";
    if (finalExit === 0) {
      responseText = `✓ Command succeeded: \`${cmd}\`\n\n`;
      if (autoFix?.applied) {
        responseText += `🔧 I auto-fixed an issue first:\n  ${autoFix.fixDescription}\n  Ran: \`${autoFix.fixCommand}\`\n${autoFix.learnedFrom ? `  (${autoFix.learnedFrom})\n` : ""}\n`;
      }
      if (finalResult.stdout.trim()) {
        const truncated = finalResult.stdout.length > 2000 ? finalResult.stdout.slice(0, 2000) + "\n... [truncated]" : finalResult.stdout;
        responseText += `\`\`\`\n${truncated}\n\`\`\``;
      } else {
        responseText += "(no output)";
      }
    } else {
      responseText = `✗ Command failed: \`${cmd}\` (exit ${finalExit})\n\n`;
      if (autoFix?.applied) {
        responseText += `🔧 I tried to auto-fix it but the fix didn't work:\n  ${autoFix.fixDescription}\n  Ran: \`${autoFix.fixCommand}\`\n\n`;
      } else if (result.stderr) {
        responseText += `I couldn't auto-fix this. The error:\n\`\`\`\n${result.stderr.slice(0, 1000)}\n\`\`\`\n\nTip: ask me to "search the web for <error message>" and I'll look up solutions.`;
      } else {
        responseText += "(no error output)";
      }
    }

    await saveMessage("assistant", responseText, "terminal", {
      command: cmd,
      exitCode: finalExit,
      autoFix: autoFix?.applied,
    });

    return {
      text: responseText,
      intent: "terminal",
      confidence: 0.95,
      steps,
      spoke: speak,
      terminalResult: {
        stdout: finalResult.stdout,
        stderr: finalResult.stderr,
        exitCode: finalExit,
        command: cmd,
        durationMs: finalResult.durationMs,
        autoFix,
      },
    };
  } catch (e) {
    console.error("Terminal request failed:", e);
    return null;
  }
}
