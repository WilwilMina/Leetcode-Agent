/**
 * The Gemini implementation of the interviewer. Default provider - see
 * src/lib/llm/provider.ts for why.
 *
 * Config field names below are pinned against the installed `@google/genai` package's own
 * `.d.ts` files, not from documentation: Google's own docs were inconsistent across several
 * fetches on the exact structured-output shape (a stale `responseSchema`-only doc, a newer
 * `Interactions API` surface with a different shape again). The installed types resolved it -
 * notably, the SDK's own source comment says `responseSchema` was superseded by
 * `responseJsonSchema` for JSON Schema input, which is the field used here.
 *
 * No streaming, for the same reason as the Claude implementation: replies are short, so HTTP
 * timeouts are not a concern.
 */

import { GoogleGenAI, type Content } from "@google/genai";
import { z } from "zod";

import { SYSTEM_PROMPT } from "../persona";
import { TurnResultSchema, type TurnResult } from "../../schemas/turn";
import type { TurnRequest } from "../../schemas/turnRequest";

const MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | undefined;

/** Lazily constructed so importing this module never throws when the key is merely unset - only
 *  an actual call should fail, with a clear error, not module load for an unrelated page. */
function getClient(): GoogleGenAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not set. Copy .env.example to .env.local and fill it in, " +
          "or set LLM_PROVIDER=anthropic to use Claude instead.",
      );
    }

    // Reads GEMINI_API_KEY from the environment automatically.
    client = new GoogleGenAI({});
  }

  return client;
}

/** Gemini's roles are "user" | "model" - "assistant" from the shared shape has to be mapped,
 *  unlike the Claude provider where the roles already match. */
function toGeminiContents(history: TurnRequest["history"]): Content[] {
  return history.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
}

export async function getReply(history: TurnRequest["history"]): Promise<TurnResult> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: toGeminiContents(history),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(TurnResultSchema),
    },
  });

  // Unlike Anthropic's `messages.parse()`, generateContent() does not parse or validate
  // structured output for us - it is just a JSON string in `.text`. Both failure modes below
  // (malformed JSON, JSON that doesn't match the schema) get the same untrusted-output
  // treatment as the Claude provider's null-parse case: degrade to a generic in-character line
  // rather than let bad model output reach the UI or throw mid-session. Each is logged with
  // which failure mode it was - "empty," "bad JSON," and "wrong shape" want different fixes,
  // and the route handler's own catch-all only sees thrown errors, not a silent fallback return.
  if (!response.text) {
    console.error("[gemini] empty response text");
    return { reply: "Go on." };
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(response.text);
  } catch (error) {
    console.error("[gemini] response was not valid JSON", error, response.text);
    return { reply: "Go on." };
  }

  const parsed = TurnResultSchema.safeParse(parsedJson);

  if (!parsed.success) {
    console.error("[gemini] response JSON did not match TurnResultSchema", parsed.error);
    return { reply: "Go on." };
  }

  return parsed.data;
}
