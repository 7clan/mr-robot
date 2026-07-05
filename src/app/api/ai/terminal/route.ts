import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/ai/terminal";
import { matchError, recordMistake, lookupMistake } from "@/lib/ai/self-correct";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      command,
      cwd,
      timeout,
      fullAccess,
      autoFix = true,
      context = "terminal",
    } = body as {
      command?: string;
      cwd?: string;
      timeout?: number;
      fullAccess?: boolean;
      autoFix?: boolean;
      context?: string;
    };

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "Missing 'command'" }, { status: 400 });
    }

    // Execute the command
    const result = await execute(command, { cwd, timeout, fullAccess });

    // If it failed and autoFix is enabled, try to find a fix
    let fix: {
      applied: boolean;
      pattern?: string;
      fixCommand?: string;
      fixDescription?: string;
      learnedFrom?: string;
      retryResult?: typeof result;
    } = { applied: false };

    if (result.exitCode !== 0 && autoFix && result.stderr) {
      // First check if we've seen this exact mistake before
      const learned = await lookupMistake(result.stderr);

      let fixCommand: string | undefined;
      let fixDescription: string | undefined;
      let matchedPattern: string | undefined;
      let learnedFrom: string | undefined;

      if (learned && learned.successRate > 0.5) {
        fixCommand = learned.fixApplied;
        fixDescription = learned.fixDescription || "Re-using previously learned fix";
        matchedPattern = "learned_pattern";
        learnedFrom = `Previous occurrence (${learned.occurrenceCount}x, ${Math.round(learned.successRate * 100)}% success)`;
      } else {
        // Try matching against built-in patterns
        const match = matchError(result.stderr, result.stdout);
        if (match.matched && match.fixCommand) {
          fixCommand = match.fixCommand;
          fixDescription = match.fixDescription;
          matchedPattern = match.pattern?.id;
        }
      }

      if (fixCommand) {
        try {
          const fixResult = await execute(fixCommand, { cwd, timeout, fullAccess: true });
          let retryResult: typeof result | undefined;
          // If the fix succeeded, retry the original command
          if (fixResult.exitCode === 0) {
            retryResult = await execute(command, { cwd, timeout, fullAccess });
          }
          const success = retryResult?.exitCode === 0;
          // Record the mistake for future learning
          await recordMistake({
            context,
            errorOutput: result.stderr,
            fixApplied: fixCommand,
            fixDescription,
            success,
          });
          fix = {
            applied: true,
            pattern: matchedPattern,
            fixCommand,
            fixDescription,
            learnedFrom,
            retryResult,
          };
        } catch (e) {
          fix = {
            applied: false,
            pattern: matchedPattern,
            fixCommand,
            fixDescription: `Fix attempt failed: ${e instanceof Error ? e.message : "unknown"}`,
            learnedFrom,
          };
        }
      }
    }

    return NextResponse.json({ result, fix });
  } catch (e) {
    console.error("Terminal API error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
