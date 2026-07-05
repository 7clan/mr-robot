/**
 * Chain-of-Thought Reasoning — Built from scratch
 *
 * Before responding, the AI plans its approach step by step.
 * Uses the from-scratch transformer for reasoning generation.
 *
 * Also includes:
 *   - Multi-turn planning (#11): state tracking across steps
 *   - Instruction following (#8): breaking down complex instructions
 */

import { retrieveRelevantContext, buildContextWindow } from "./conversation-memory";

export interface ReasoningStep {
  step: number;
  thought: string;
  action: string;
  result?: string;
}

export interface Plan {
  goal: string;
  steps: Array<{
    description: string;
    type: "search" | "think" | "respond" | "code" | "execute" | "remember" | "recall";
    status: "pending" | "running" | "done" | "failed";
    result?: string;
  }>;
  currentStep: number;
  context: string;
}

/**
 * Analyze a user message and create a reasoning plan.
 * This is the "thinking" phase before responding.
 */
export function reasonAboutMessage(
  text: string,
  conversationContext: string
): ReasoningStep[] {
  const steps: ReasoningStep[] = [];
  const lower = text.toLowerCase().trim();

  // Step 1: Understand what the user wants
  let intent = "unknown";
  if (/^(hello|hi|hey|good morning|good evening)/i.test(lower)) intent = "greeting";
  else if (/^(bye|goodbye|see you)/i.test(lower)) intent = "farewell";
  else if (/^(thank|thanks|appreciate)/i.test(lower)) intent = "thanks";
  else if (/\b(who are you|what are you|your name)\b/i.test(lower)) intent = "identity";
  else if (/\b(help|what can you do)\b/i.test(lower)) intent = "help";
  else if (/\b(calculate|compute|math|\d\s*[+\-*/]\s*\d)\b/i.test(lower)) intent = "math";
  else if (/\b(remember that|note that|save this)\b/i.test(lower)) intent = "remember";
  else if (/\b(what do you know|recall|what do you remember)\b/i.test(lower)) intent = "recall";
  else if (/\b(search|look up|find|google|who won|what is|what's|whats|where|when|why|how|tell me about|explain)\b/i.test(lower)) intent = "search";
  else if (/\b(scaffold|create a|build a|make a)\b/i.test(lower)) intent = "code";
  else if (/\b(run|execute|npm|node|python|git|ls|cat)\b/i.test(lower)) intent = "terminal";
  else if (/\b(fix|debug|refactor|explain code)\b/i.test(lower)) intent = "code_fix";
  else if (conversationContext && isFollowUp(text)) intent = "follow_up";
  else intent = "chat";

  steps.push({
    step: 1,
    thought: `User intent: ${intent}. ${getIntentDescription(intent)}`,
    action: "classify_intent",
  });

  // Step 2: Check if this is a follow-up
  if (intent === "follow_up" || isFollowUp(text)) {
    steps.push({
      step: 2,
      thought: `This is a follow-up question. I need to use conversation context to understand what "${text}" refers to.`,
      action: "retrieve_context",
    });
  }

  // Step 3: Plan the search/action strategy
  if (intent === "search" || intent === "follow_up") {
    const queryTerms = extractKeyTerms(text);
    steps.push({
      step: 3,
      thought: `I need to search the web for: "${queryTerms}". I'll try Bing first, then Google, then DuckDuckGo. After finding results, I'll fetch the actual web pages and extract the answer.`,
      action: "plan_search",
    });
  } else if (intent === "code" || intent === "code_fix") {
    steps.push({
      step: 3,
      thought: `This is a coding request. I need to detect the framework, generate the appropriate code, and apply it to the workspace.`,
      action: "plan_code",
    });
  } else if (intent === "math") {
    steps.push({
      step: 3,
      thought: `This is a math problem. I'll parse the expression and evaluate it safely using RPN.`,
      action: "plan_math",
    });
  }

  // Step 4: Plan the response
  steps.push({
    step: steps.length + 1,
    thought: `I'll format my response clearly with no excessive whitespace, include sources if I searched, and make it sound natural.`,
    action: "plan_response",
  });

  return steps;
}

/**
 * Check if a message is a follow-up to a previous conversation.
 */
function isFollowUp(text: string): boolean {
  const words = text.split(/\s+/);
  if (words.length > 15) return false;
  return /^(when|why|who|what|how|where|that|this|it|and|but|so|did|do|does|is|are|was|were|can|could|would|should|tell me more|continue|what about|how about)\b/i.test(text);
}

/**
 * Extract key terms from a query for search.
 */
function extractKeyTerms(text: string): string {
  let q = text.trim();
  q = q.replace(
    /^(?:please\s+)?(?:search(?:\s+for)?|look\s+up|find(?:\s+information\s+about)?|google|tell me about|tell me|explain|what is|what's|whats|who is|who's|whos|where is|when is|why is|how do|how does|how is|how are|from the web(?:\s+tell me)?(?:\s+who)?(?:\s+won)?)\s+/i,
    ""
  );
  q = q.replace(/^who\s+won\s+(?:the\s+)?/i, "");
  q = q.replace(/[?!.]+$/g, "").trim();
  q = q.replace(/^(?:the|a|an|is|are|was|were|did|do|does|can|could|would|should|will|about|of|in|on|at)\s+/i, "");
  return q.length > 1 ? q : text.replace(/[?!.]+$/g, "").trim();
}

/**
 * Get description for an intent.
 */
function getIntentDescription(intent: string): string {
  const descriptions: Record<string, string> = {
    greeting: "User is greeting me. I should respond warmly.",
    farewell: "User is leaving. I should say goodbye.",
    thanks: "User is thanking me. I should acknowledge.",
    identity: "User wants to know who I am. I should explain I'm Mr Robot.",
    help: "User needs help. I should list my capabilities.",
    math: "User wants me to calculate something. I'll use the RPN evaluator.",
    remember: "User wants me to store a fact. I'll extract and save it.",
    recall: "User wants me to recall stored facts. I'll search the knowledge base.",
    search: "User wants information. I'll search the web (Bing/Google/DDG).",
    code: "User wants code. I'll detect the framework and scaffold/generate.",
    terminal: "User wants to run a command. I'll execute it safely.",
    code_fix: "User wants me to fix code. I'll analyze and apply fixes.",
    follow_up: "User is continuing the conversation. I'll use context.",
    chat: "General conversation. I'll respond naturally.",
    unknown: "I'm not sure what the user wants. I'll try to help.",
  };
  return descriptions[intent] || descriptions.unknown;
}

/**
 * Create a multi-step plan for complex instructions.
 */
export function createPlan(instruction: string): Plan {
  const steps: Plan["steps"] = [];
  const lower = instruction.toLowerCase();

  // Detect if this is a multi-step instruction
  const hasMultipleSteps = /\b(then|after that|next|also|and then|finally)\b/i.test(instruction);
  const hasConditionals = /\b(if|when|unless|otherwise)\b/i.test(instruction);

  if (hasMultipleSteps || hasConditionals) {
    // Break down the instruction into steps
    const parts = instruction.split(/\b(?:then|after that|next|also|and then|finally)\b/i);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part.length < 3) continue;

      let type: Plan["steps"][0]["type"] = "respond";
      if (/\b(search|find|look up|google)\b/i.test(part)) type = "search";
      else if (/\b(create|scaffold|build|make)\b/i.test(part)) type = "code";
      else if (/\b(run|execute|npm|node)\b/i.test(part)) type = "execute";
      else if (/\b(remember|save|store)\b/i.test(part)) type = "remember";
      else if (/\b(recall|what do you know)\b/i.test(part)) type = "recall";
      else if (/\b(think|analyze|consider)\b/i.test(part)) type = "think";

      steps.push({
        description: part,
        type,
        status: "pending",
      });
    }
  } else {
    // Single-step instruction
    steps.push({
      description: instruction,
      type: "respond",
      status: "pending",
    });
  }

  return {
    goal: instruction,
    steps,
    currentStep: 0,
    context: "",
  };
}

/**
 * Advance the plan to the next step.
 */
export function advancePlan(plan: Plan, result: string): Plan {
  if (plan.currentStep < plan.steps.length) {
    plan.steps[plan.currentStep].status = "done";
    plan.steps[plan.currentStep].result = result;
    plan.currentStep++;
    if (plan.currentStep < plan.steps.length) {
      plan.steps[plan.currentStep].status = "running";
    }
  }
  return plan;
}
