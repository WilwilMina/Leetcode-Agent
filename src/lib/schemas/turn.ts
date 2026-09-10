/**
 * Structured-output schema for one interviewer turn.
 *
 * Deliberately minimal for Phase 1: just the reply text. `docs/ARCHITECTURE.md` §7 specifies a
 * fuller `signals` object (bailedOut, hintLevel, complexityStated, ...) - that arrives with
 * Phase 3's persona work, once there is phase logic to feed it. Building it now would be
 * speculative against behavior this phase doesn't implement yet.
 *
 * This schema is simultaneously the API contract, the runtime validator, and the TypeScript
 * type - passed to `zodOutputFormat` for the Claude call and inferred as `TurnResult` for
 * everything downstream. There is no separate hand-written interface to drift from it.
 */

import { z } from "zod";

export const TurnResultSchema = z.object({
  reply: z.string(),
});

export type TurnResult = z.infer<typeof TurnResultSchema>;
