/**
 * Shared Anthropic client.
 *
 * One instance per server process. The constructor resolves `ANTHROPIC_API_KEY` from the
 * environment on its own - never pass a key from anywhere client-reachable, and never import
 * this module from a Client Component.
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

/** Lazily constructed so importing this module never throws when the key is merely unset - the
 *  route handler that actually calls Claude is what should fail, with a clear error, not module
 *  load for an unrelated page. */
export function getAnthropicClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
      );
    }

    client = new Anthropic();
  }

  return client;
}
