/**
 * One interviewer turn - the public entry the route handler calls.
 *
 * Delegates to whichever provider src/lib/llm/provider.ts resolves. This signature is
 * unchanged from before Gemini support existed; the route handler
 * (src/app/api/turn/route.ts) needed no edits for this change.
 */

import { resolveProvider } from "./provider";
import * as claude from "./providers/claude";
import * as gemini from "./providers/gemini";
import type { TurnResult } from "../schemas/turn";
import type { TurnRequest } from "../schemas/turnRequest";

/**
 * Get the interviewer's next reply given the conversation so far.
 *
 * @param history Prior turns, oldest first. The caller owns conversation state; this function is
 *        stateless between calls.
 */
export async function getInterviewerReply(history: TurnRequest["history"]): Promise<TurnResult> {
  const provider = resolveProvider(process.env.LLM_PROVIDER);

  return provider === "anthropic" ? claude.getReply(history) : gemini.getReply(history);
}
