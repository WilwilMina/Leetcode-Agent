/**
 * Everything derived from `InterviewState` rather than stored in it.
 *
 * `docs/ARCHITECTURE.md` §9 requires these to be derived: keeping them out of the state means
 * they cannot drift from the log they are computed off, and it puts both timing thresholds in one
 * place instead of scattering `45_000` through the reducer's branches.
 *
 * All pure functions of state, so a test constructs a state object and asserts - no dispatching,
 * no clock, no fake timers.
 */

import type { InterviewState } from "./reducer";

/**
 * The two timing rules from `docs/PLAN.md` §4.
 *
 * Three minutes rather than five: waiting five in a 25-minute session is dead air, not pressure.
 * Forty-five seconds is the point at which an unproductive monologue stops being thinking out loud.
 */
export const INTERVIEW_THRESHOLDS = {
  hintAfterNoProgressMs: 3 * 60 * 1000,
  interruptAfterUnproductiveSpeechMs: 45 * 1000,
} as const;

/** One completed bail-out-to-recovery span. */
export interface Recovery {
  readonly startedAtMs: number;
  readonly recoveredAtMs: number;
  /** How long the candidate was stuck - `docs/PLAN.md` §6 dimension 2. */
  readonly durationMs: number;
  /** How many separate refusals happened inside this stall. */
  readonly bailOuts: number;
}

/**
 * Total refusals across the session - `docs/PLAN.md` §6 dimension 1, the headline number.
 *
 * Summed from the stall log rather than kept as a counter so it cannot disagree with the stalls it
 * is supposed to describe.
 */
export function bailOutCount(state: InterviewState): number {
  return state.stalls.reduce((total, stall) => total + stall.bailOuts, 0);
}

/**
 * The closed recovery spans, one per stall that ended.
 *
 * `flatMap` rather than `filter` so the `recoveredAtMs !== null` check actually narrows the type -
 * a `filter` would leave it `number | null` and force a non-null assertion.
 */
export function recoveries(state: InterviewState): readonly Recovery[] {
  return state.stalls.flatMap((stall) =>
    stall.recoveredAtMs === null
      ? []
      : [
          {
            startedAtMs: stall.startedAtMs,
            recoveredAtMs: stall.recoveredAtMs,
            durationMs: stall.recoveredAtMs - stall.startedAtMs,
            bailOuts: stall.bailOuts,
          },
        ],
  );
}

/** True between a bail-out and the next real idea - the candidate has not landed anything yet. */
export function isRecovering(state: InterviewState): boolean {
  if (state.stalls.length === 0) {
    return false;
  }

  return state.stalls[state.stalls.length - 1].recoveredAtMs === null;
}

/**
 * True once the candidate has gone the full window without progress.
 *
 * Suppressed in `debrief`, where there is nothing left to be hinted towards.
 */
export function shouldOfferHint(state: InterviewState): boolean {
  if (state.phase === "debrief") {
    return false;
  }

  return state.elapsedMs - state.lastProgressAtMs >= INTERVIEW_THRESHOLDS.hintAfterNoProgressMs;
}

/** True once enough speech has accumulated without landing anything to warrant cutting in. */
export function shouldInterrupt(state: InterviewState): boolean {
  return (
    state.unproductiveSpeechMs >= INTERVIEW_THRESHOLDS.interruptAfterUnproductiveSpeechMs
  );
}
