/**
 * The Anthropic implementation of the interviewer.
 *
 * Kept as a fallback behind src/lib/llm/provider.ts even though Gemini is now the default -
 * going back to Claude (e.g. for a harder phase's answer quality) is then a config change, not a
 * rewrite. This is essentially Phase 1's original implementation, moved unchanged except for its
 * parameter type, which now takes the shared provider-agnostic history shape instead of
 * Anthropic's own `MessageParam[]`.
 *
 * No streaming (docs/ARCHITECTURE.md §5): replies are short, so HTTP timeouts are not a concern,
 * and one non-streaming `messages.parse()` call returns the reply text in the same round trip
 * that would otherwise need a second request for structured output.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

import { SYSTEM_PROMPT } from "../persona";
import { TurnResultSchema, type TurnResult } from "../../schemas/turn";
import type { TurnRequest } from "../../schemas/turnRequest";

const MODEL = "claude-sonnet-5";

let client: Anthropic | undefined;

/** Lazily constructed so importing this module never throws when the key is merely unset - only
 *  an actual call should fail, with a clear error, not module load for an unrelated page. */
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in, " +
          "or set LLM_PROVIDER=gemini to use Gemini instead.",
      );
    }

    client = new Anthropic();
  }

  return client;
}

/** Anthropic's roles are "user" | "assistant", matching the shared shape exactly - no mapping
 *  needed, unlike Gemini's "user" | "model". */
function toMessageParams(history: TurnRequest["history"]): MessageParam[] {
  return history.map((turn) => ({ role: turn.role, content: turn.content }));
}

export async function getReply(history: TurnRequest["history"]): Promise<TurnResult> {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: {
      format: zodOutputFormat(TurnResultSchema),
      effort: "low",
    },
    messages: toMessageParams(history),
  });

  if (!response.parsed_output) {
    // Structured output failed to parse. Untrusted-output rule from .claude/rules/security.md:
    // degrade to a generic, still-in-character line rather than let a null reach the UI or throw
    // mid-session. Logged (not just silently returned) so a parse failure is distinguishable
    // server-side from a genuinely thrown error, which the route handler's catch-all already
    // logs on its own.
    console.error("[claude] parsed_output was null");
    return { reply: "Go on." };
  }

  return response.parsed_output;
}
