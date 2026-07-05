/**
 * Math Evaluator - Built from scratch (no eval())
 * Uses RPN (Reverse Polish Notation) for safe evaluation.
 */

export function evaluateMath(expr: string): string | null {
  if (!expr) return null;
  // Allow digits, +, -, *, /, parentheses, spaces, decimal points
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
  try {
    const tokens = tokenizeMath(expr);
    const rpn = toRPN(tokens);
    const result = evalRPN(rpn);
    if (result === null || !isFinite(result)) return null;
    return `${result}`;
  } catch {
    return null;
  }
}

export function tokenizeMath(expr: string): string[] {
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
      stack.pop();
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
 * Returns the result if found, null otherwise.
 */
export function detectMath(text: string): string | null {
  // "what is 2+2", "calculate 5 * 3", "5 + 3"
  const m = text.match(/(?:what\s+is|calculate|compute|eval(?:uate)?)\s+([\d+\-*/().\s]+)\??/i);
  if (m) return evaluateMath(m[1].trim());
  // Pure math
  if (/^[\d+\-*/().\s]+$/.test(text.trim()) && /[+\-*/]/.test(text)) {
    return evaluateMath(text.trim());
  }
  return null;
}
