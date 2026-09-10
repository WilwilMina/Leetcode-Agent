/**
 * Pure helpers for reasoning about position in `PHASE_ORDER`.
 *
 * These exist so the reducer can answer one question - "did this transition skip anything, and
 * what?" - without embedding index arithmetic in its transition logic. `docs/PLAN.md` §4 makes
 * that question the whole basis of the soft gates: the reducer never blocks a jump, it records
 * what the jump skipped, and the debrief counts it. Getting "skipped" right is therefore what
 * makes the override metric mean anything.
 *
 * Kept separate from `reducer.ts` so they can be tested as plain functions of two phases, with no
 * state object to construct.
 */

import { PHASE_ORDER, type Phase } from "../schemas/phase";

/** Position of `phase` in `PHASE_ORDER`. Always found, since `Phase` is derived from that tuple. */
export function phaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * The next phase in order, or `null` at `debrief`.
 *
 * The bounds check is explicit rather than relying on an out-of-range index: `PHASE_ORDER[i + 1]`
 * types as `Phase` here (the project does not enable `noUncheckedIndexedAccess`) while actually
 * being `undefined` past the end, so trusting the type would hand callers a lie.
 */
export function phaseAfter(phase: Phase): Phase | null {
  const index = phaseIndex(phase);

  return index < PHASE_ORDER.length - 1 ? PHASE_ORDER[index + 1] : null;
}

/**
 * The phases strictly between `from` and `to` when moving forward - the ones a jump passed over.
 *
 * Empty for an adjacent step, for staying put, and for any move backwards. A backward move is not
 * a skip: you cannot skip a phase you already sat through, and `docs/PLAN.md` §6 counts overrides
 * as *skipping ahead*, so folding backward moves in would inflate the metric. `slice` gives this
 * for free - a start past the end yields an empty array.
 */
export function skippedPhases(from: Phase, to: Phase): readonly Phase[] {
  return PHASE_ORDER.slice(phaseIndex(from) + 1, phaseIndex(to));
}
