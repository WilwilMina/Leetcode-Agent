/**
 * The interview's phases, in the order a session moves through them.
 *
 * This lives in `schemas/` rather than in `lib/interview/` because it is shared vocabulary, not
 * reducer logic: the phase reducer needs it, and so does `signals.suggestPhase` in `turn.ts`. If
 * it lived beside the reducer, the schema layer would have to import the reducer to describe its
 * own API contract - the wrong dependency direction. Everything that needs a phase imports it
 * from here.
 *
 * The order is load-bearing, not cosmetic. `lib/interview/phases.ts` derives "is this a skip
 * ahead, and what did it skip" from the array's index order, which is what makes the soft gates in
 * `docs/PLAN.md` §4 measurable.
 */

import { z } from "zod";

/**
 * `docs/PLAN.md` §5, in order. Declared `as const` so the tuple's literal order survives into the
 * type and can be indexed against at runtime.
 */
export const PHASE_ORDER = [
  "intro",
  "clarify",
  "bruteForce",
  "optimize",
  "complexity",
  "code",
  "handTrace",
  "debrief",
] as const;

export const PhaseSchema = z.enum(PHASE_ORDER);

export type Phase = z.infer<typeof PhaseSchema>;
