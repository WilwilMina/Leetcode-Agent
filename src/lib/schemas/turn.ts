/**
 * Structured-output schemas for one interviewer turn.
 *
 * Each schema here is simultaneously the API contract, the runtime validator, and the TypeScript
 * type - passed to `zodOutputFormat` for the Claude call and inferred for everything downstream.
 * There is no separate hand-written interface to drift from it.
 *
 * **`TurnResultSchema` is still just the reply text, and `SignalsSchema` is deliberately not part
 * of it yet.** The Phase 2 reducer needs the `Signals` *type* to accept `SIGNALS_RECEIVED` events,
 * so the schema is defined here now. But no persona emits signals until Phase 3, so adding the
 * field to `TurnResultSchema` today would fail every live parse and silently degrade `/api/turn`
 * to its generic fallback. Phase 3 wires it up by adding one line to `TurnResultSchema`.
 */

import { z } from "zod";

import { PhaseSchema } from "./phase";

export const TurnResultSchema = z.object({
  reply: z.string(),
});

export type TurnResult = z.infer<typeof TurnResultSchema>;

/**
 * The model's per-turn judgments, which the reducer consumes as ordinary events.
 *
 * `docs/ARCHITECTURE.md` §9 draws the line this schema sits on: the reducer owns state, the model
 * owns judgment. Whether an utterance was a bail-out, whether a stated complexity was right, and
 * whether it is time to advance are all judgments - they arrive here rather than being inferred
 * from the transcript by reducer logic.
 *
 * As model output this is untrusted input per `.claude/rules/security.md`, so Phase 3 must parse
 * it through this schema before dispatching, never cast it.
 */
export const SignalsSchema = z.object({
  /** The candidate handed the problem back - said "I don't know" and stopped. The headline metric. */
  bailedOut: z.boolean(),
  /**
   * The candidate landed a real idea, as opposed to merely not refusing.
   *
   * A deliberate addition to the `signals` shape sketched in `docs/ARCHITECTURE.md` §7, which had
   * no such field. Recovery time is defined in `docs/PLAN.md` §6 as running from a bail-out to
   * *the next real idea*, and inferring that from `bailedOut` going false would let a hedge like
   * "hmm, let me think" stop the recovery clock - flattering the one number this app exists to
   * move. It is measured directly instead.
   */
  realIdea: z.boolean(),
  /** Where the model thinks the session should go next, or `null` to stay put. A suggestion only. */
  suggestPhase: PhaseSchema.nullable(),
  /** Level of hint the model judges is warranted now; `0` for none. */
  hintLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  /** The candidate stated a time or space complexity this turn. */
  complexityStated: z.boolean(),
  /** Whether that complexity was correct, or `null` when none was stated. */
  complexityCorrect: z.boolean().nullable(),
  /** The candidate raised an edge case this turn. */
  edgeCaseRaised: z.boolean(),
});

export type Signals = z.infer<typeof SignalsSchema>;
