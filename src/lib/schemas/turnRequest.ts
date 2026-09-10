/**
 * Request-body schema for POST /api/turn.
 *
 * The conversation is stateless server-side (docs/ARCHITECTURE.md §5): the client sends the full
 * message history each call, and this validates that shape before it reaches the Claude request -
 * client input is untrusted the same way model output is (.claude/rules/security.md).
 */

import { z } from "zod";

export const TurnRequestSchema = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
});

export type TurnRequest = z.infer<typeof TurnRequestSchema>;
