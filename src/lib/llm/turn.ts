/**
 * One interviewer turn.
 *
 * Phase 1 scope only: a single hardcoded problem (Two Sum - canonical, universally known, a
 * reasonable choice per the "model already knows the NeetCode 150" decision in PLAN.md §3), and
 * a neutral interviewer persona. This is deliberately not the full escalation-ladder persona from
 * docs/ARCHITECTURE.md §4/PLAN.md §4 - that is Phase 3's "interviewer's teeth" work, which needs
 * phase state this slice does not have yet. What is *not* deferred: the standing "no praise"
 * rule from CLAUDE.md applies from the first line of prompt ever written for this app.
 *
 * No streaming (docs/ARCHITECTURE.md §5): replies are short, so HTTP timeouts are not a concern,
 * and one non-streaming `messages.parse()` call returns the reply text in the same round trip
 * that would otherwise need a second request for structured output.
 */

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

import { getAnthropicClient } from "./client";
import { TurnResultSchema, type TurnResult } from "../schemas/turn";
import { PROBLEM_STATEMENT } from "../problem";

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `
You are conducting a technical interview. The problem is:

${PROBLEM_STATEMENT}

Rules for this conversation:
- Never praise or evaluate the candidate mid-session. No "good point", no "exactly", no
  encouragement of any kind. Stay neutral.
- Keep every reply to at most two sentences.
- Ask questions; do not lecture or explain the problem back unless asked to clarify it.
- Do not reveal the optimal solution or its time complexity unless the candidate has already
  stated their own approach.
`.trim();

/**
 * Get the interviewer's next reply given the conversation so far.
 *
 * @param history Prior turns, oldest first. The caller owns conversation state; this function is
 *        stateless between calls.
 */
export async function getInterviewerReply(history: MessageParam[]): Promise<TurnResult> {
  const client = getAnthropicClient();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: {
      format: zodOutputFormat(TurnResultSchema),
      effort: "low",
    },
    messages: history,
  });

  if (!response.parsed_output) {
    // Structured output failed to parse. Untrusted-output rule from .claude/rules/security.md:
    // degrade to a generic, still-in-character line rather than let a null reach the UI or throw
    // mid-session.
    return { reply: "Go on." };
  }

  return response.parsed_output;
}
