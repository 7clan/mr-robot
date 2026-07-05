/**
 * Terms of Service — User-owned, editable
 *
 * The whole point of Mr Robot is that the user OWNS the AI.
 * This module lets the user write their own terms of service,
 * which then become part of the LLM's system prompt.
 *
 * Storage:
 *   - Primary: SQLite (TermsOfService table) — survives reinstalls
 *   - Default seed: DEFAULT_TOS below (used on first run)
 *
 * License note:
 *   The LLM models used (Llama-3.2, Qwen2.5, Phi-3.5) are Apache 2.0
 *   or similar permissive licenses. The user is free to set their own
 *   terms on top — this file is where they do it.
 */

import { db as prisma } from "@/lib/db";

export const DEFAULT_TOS = `# Mr Robot — Terms of Service (Default)

Welcome to Mr Robot, an AI assistant that runs **entirely on your device**.
You can edit these terms however you like — you own this AI.

## 1. What Mr Robot Is
Mr Robot is an open-source AI assistant built from scratch.
- The reasoning engine is a real open-source LLM (Llama-3.2 / Qwen2.5 / Phi-3.5 — Apache 2.0)
- It runs **in your browser** via WebGPU. No data leaves your device.
- Web search results are fetched to ground answers in real facts.

## 2. Privacy
- Your conversations never leave your device.
- Web search queries are sent to Bing/Google/DuckDuckGo (you can disable this).
- Training feedback you provide stays in your local SQLite database.

## 3. What You Can Do
- Use Mr Robot for any legal purpose.
- Modify the source code (MIT-style: attribution appreciated, not required).
- Redistribute, sell, or build a product on top of Mr Robot.
- Fine-tune the model and ship your own version.

## 4. What You Cannot Do
- Use Mr Robot to generate illegal, harmful, or deceptive content.
- Claim the upstream LLM licenses (Llama, Qwen, Phi) as your own.

## 5. No Warranty
Mr Robot is provided "as is". The model can make mistakes.
Verify critical information (medical, legal, financial) with professionals.

## 6. Your Edits Below
Replace everything in this file with your own terms.
The text you write here is shown to users on first launch and is
injected into the AI's system prompt so the AI knows its own rules.

— Default terms generated on install. Edit freely.`;

export interface TosRecord {
  id: string;
  version: number;
  title: string;
  body: string;
  accepted: boolean;
  acceptedAt: Date | null;
  updatedAt: Date;
}

/**
 * Get the current Terms of Service. Seeds the default on first call.
 */
export async function getTos(): Promise<TosRecord> {
  let tos = await prisma.termsOfService.findFirst({
    orderBy: { version: "desc" },
  });
  if (!tos) {
    tos = await prisma.termsOfService.create({
      data: {
        version: 1,
        title: "Mr Robot Terms of Service",
        body: DEFAULT_TOS,
        accepted: false,
      },
    });
  }
  return tos;
}

/**
 * Update the ToS body. Bumps version, resets acceptance.
 * (User edits → existing users must re-accept.)
 */
export async function updateTos(body: string, title?: string): Promise<TosRecord> {
  const current = await getTos();
  const updated = await prisma.termsOfService.create({
    data: {
      version: current.version + 1,
      title: title ?? current.title,
      body,
      accepted: false,
      acceptedAt: null,
    },
  });
  return updated;
}

/**
 * Mark the current ToS as accepted by the user.
 */
export async function acceptTos(): Promise<TosRecord> {
  const current = await getTos();
  return prisma.termsOfService.update({
    where: { id: current.id },
    data: { accepted: true, acceptedAt: new Date() },
  });
}

/**
 * Reset ToS to the default (used by "Reset to default" button).
 */
export async function resetTos(): Promise<TosRecord> {
  const current = await getTos();
  return prisma.termsOfService.update({
    where: { id: current.id },
    data: {
      body: DEFAULT_TOS,
      title: "Mr Robot Terms of Service",
      accepted: false,
      acceptedAt: null,
    },
  });
}

/**
 * Build the system-prompt fragment that informs the LLM about its own ToS.
 * This is what makes the AI "aware" of the user's rules.
 */
export function tosToSystemPrompt(tos: TosRecord): string {
  // Strip markdown headers for cleaner LLM context
  const plain = tos.body
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
  return `You are Mr Robot, an AI assistant that runs entirely on the user's device.
You must follow these Terms of Service that the user has set for you:

--- BEGIN TERMS OF SERVICE (v${tos.version}) ---
${plain}
--- END TERMS OF SERVICE ---

If a request would violate these terms, refuse politely and explain which clause applies.
Otherwise, help the user thoroughly and cite your sources when you use web-search facts.`;
}
