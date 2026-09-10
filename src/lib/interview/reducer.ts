/**
 * The interview state machine - `docs/PLAN.md` §5 as a pure reducer.
 *
 * Pure and synchronous, with zero imports from React or any UI module, per
 * `docs/ARCHITECTURE.md` §9. That constraint is what makes every transition unit-testable without
 * mocking an LLM: `/api/turn` is called by the page, and its result is dispatched here as an
 * ordinary event.
 *
 * **The division of labor is the point.** The reducer owns *state* - current phase, elapsed time,
 * bail-outs, recovery spans, hints, overrides, silence. The model owns *judgment* - whether an
 * answer was good enough to advance, whether an utterance was a bail-out, whether a stated
 * complexity was right. Judgments arrive as `Signals` and are recorded, never second-guessed here.
 * The original design conflated the two; this split is why the phase logic stays testable.
 *
 * **No clock.** `Date.now()` appears nowhere in this module. Time advances only when the caller
 * dispatches `TIMER_TICK`, exactly as `lib/auth/rateLimit.ts` takes `now` as an argument. Every
 * timestamp in the state below is therefore elapsed milliseconds since the session opened, never
 * an epoch value - which is also what makes a three-minute threshold testable in one dispatch
 * rather than with fake timers.
 *
 * **Nothing is ever refused.** `docs/PLAN.md` §4: a real interviewer never physically stops you
 * skipping to code, and the failure being trained is the *choice* under pressure, so removing the
 * choice never exercises the muscle. The reducer commits every transition it is handed and records
 * what the transition skipped. The debrief counts it later.
 */

import type { Phase } from "../schemas/phase";
import type { Signals } from "../schemas/turn";
import { skippedPhases } from "./phases";

/** Hint levels from `docs/PLAN.md` §4. `0` means "no hint", so it is not a level you can log. */
export type HintLevel = 1 | 2 | 3;

/**
 * One stall: opened by a refusal, closed by the next real idea.
 *
 * Refusals are counted individually - three "I don't know"s is three bail-outs, because you handed
 * the problem back three times - but recovery is measured once per stall, from the *first* refusal
 * to the idea that ended it. Measuring per refusal instead would nest overlapping spans and make
 * later refusals in a stall show artificially fast recoveries.
 */
export interface Stall {
  /** Elapsed ms of the first refusal in this stall. Recovery is measured from here. */
  readonly startedAtMs: number;
  /** The phase the stall began in. */
  readonly phase: Phase;
  /** How many separate refusals happened before this stall ended. At least 1. */
  readonly bailOuts: number;
  /** Elapsed ms of the real idea that ended it, or `null` while the candidate is still stalling. */
  readonly recoveredAtMs: number | null;
}

/** A hint that was offered, with the level it was offered at. Level matters more than count. */
export interface Hint {
  readonly atMs: number;
  readonly phase: Phase;
  readonly level: HintLevel;
}

/** A paste into the editor. Recorded because pasting is a signal, not work. */
export interface Paste {
  readonly atMs: number;
  readonly phase: Phase;
  readonly length: number;
}

/**
 * A transition that went against the grain - facts only.
 *
 * Deliberately not classified here. Whether a given override counts against the candidate is a
 * scoring question, and scoring is Phase 6; this record carries enough for that decision to be
 * made later without re-running the session.
 */
export interface Override {
  readonly atMs: number;
  readonly from: Phase;
  readonly to: Phase;
  /** Phases jumped over. Empty for a single step, for staying put, and for a move backwards. */
  readonly skipped: readonly Phase[];
  /** What the model had suggested at the time, if anything - context for why this was an override. */
  readonly suggestedPhase: Phase | null;
  /** True when the candidate pressed the override affordance rather than confirming normally. */
  readonly explicit: boolean;
}

export interface InterviewState {
  readonly phase: Phase;
  /** Elapsed ms since the session opened. Advanced only by `TIMER_TICK`. */
  readonly elapsedMs: number;
  /** Elapsed ms at which the current phase was entered. */
  readonly phaseEnteredAtMs: number;
  /** Total time spent in each phase already left. The current phase is not folded in until exit. */
  readonly phaseDurationsMs: Readonly<Partial<Record<Phase, number>>>;
  /** The model's most recent uncommitted suggestion. Cleared whenever a phase is committed. */
  readonly suggestedPhase: Phase | null;
  /** Every stall, open or closed. Bail-out count and recovery times both derive from this. */
  readonly stalls: readonly Stall[];
  readonly hints: readonly Hint[];
  readonly overrides: readonly Override[];
  readonly pastes: readonly Paste[];
  /** Elapsed ms of the last thing that counted as progress. Drives the hint window. */
  readonly lastProgressAtMs: number;
  /** Speech accumulated since the last progress. Drives the interrupt threshold. */
  readonly unproductiveSpeechMs: number;
  /** The current unbroken run of silence. Reset whenever the candidate speaks or types. */
  readonly silenceMs: number;
  /** The longest silence run seen so far - `docs/PLAN.md` §6 dimension 3, unrecoverable if dropped. */
  readonly longestSilenceMs: number;
  /** The most recent judgments, kept so the page and debrief can read them without re-deriving. */
  readonly lastSignals: Signals | null;
}

/**
 * The nine events from `docs/ARCHITECTURE.md` §9, unchanged.
 *
 * There is deliberately no `SESSION_ENDED`: the page ends a session by confirming the `debrief`
 * phase like any other transition, which keeps the event list to the one the architecture names.
 */
export type InterviewEvent =
  | { readonly type: "TIMER_TICK"; readonly deltaMs: number }
  | { readonly type: "SILENCE_TICK"; readonly deltaMs: number }
  | { readonly type: "TRANSCRIPT_RECEIVED"; readonly text: string; readonly durationMs: number }
  | { readonly type: "SIGNALS_RECEIVED"; readonly signals: Signals }
  | { readonly type: "HINT_OFFERED"; readonly level: HintLevel }
  | { readonly type: "CODE_CHANGED"; readonly length: number }
  | { readonly type: "CODE_PASTED"; readonly length: number }
  | { readonly type: "PHASE_CONFIRMED"; readonly to: Phase }
  | { readonly type: "OVERRIDE_USED"; readonly to: Phase };

export const initialInterviewState: InterviewState = {
  phase: "intro",
  elapsedMs: 0,
  phaseEnteredAtMs: 0,
  phaseDurationsMs: {},
  suggestedPhase: null,
  stalls: [],
  hints: [],
  overrides: [],
  pastes: [],
  lastProgressAtMs: 0,
  unproductiveSpeechMs: 0,
  silenceMs: 0,
  longestSilenceMs: 0,
  lastSignals: null,
};

export function interviewReducer(state: InterviewState, event: InterviewEvent): InterviewState {
  switch (event.type) {
    case "TIMER_TICK":
      return { ...state, elapsedMs: state.elapsedMs + event.deltaMs };

    case "SILENCE_TICK": {
      const silenceMs = state.silenceMs + event.deltaMs;

      return {
        ...state,
        silenceMs,
        longestSilenceMs: Math.max(state.longestSilenceMs, silenceMs),
      };
    }

    // Speaking breaks silence but is not progress - rambling for two minutes without landing
    // anything is precisely the state the interrupt threshold exists to catch.
    case "TRANSCRIPT_RECEIVED":
      return {
        ...state,
        silenceMs: 0,
        unproductiveSpeechMs: state.unproductiveSpeechMs + event.durationMs,
      };

    case "SIGNALS_RECEIVED":
      return applySignals(state, event.signals);

    // A hint counts as progress so that three hints cannot fire back to back the moment the
    // window opens; the candidate gets the full window again to act on the one they were given.
    case "HINT_OFFERED":
      return markProgress({
        ...state,
        hints: [...state.hints, { atMs: state.elapsedMs, phase: state.phase, level: event.level }],
      });

    case "CODE_CHANGED":
      return markProgress({ ...state, silenceMs: 0 });

    // Pasting is the failure, not the work, so it breaks silence without counting as progress.
    case "CODE_PASTED":
      return {
        ...state,
        silenceMs: 0,
        pastes: [
          ...state.pastes,
          { atMs: state.elapsedMs, phase: state.phase, length: event.length },
        ],
      };

    case "PHASE_CONFIRMED":
      return commitPhase(state, event.to, false);

    case "OVERRIDE_USED":
      return commitPhase(state, event.to, true);
  }
}

/**
 * Record the model's judgments.
 *
 * `bailedOut` takes precedence over `realIdea` when a turn somehow carries both: you cannot
 * recover in the same breath you refuse, and resolving it the other way would let a stall close
 * itself the instant it opened.
 *
 * Note what this never does: change `phase`. A suggestion is recorded and waits for the candidate
 * to commit it, because auto-advancing would put state under model control and, worse, make a move
 * the model initiated indistinguishable from one the candidate chose - which is the exact
 * distinction the override metric measures.
 */
function applySignals(state: InterviewState, signals: Signals): InterviewState {
  const recorded: InterviewState = {
    ...state,
    lastSignals: signals,
    suggestedPhase: signals.suggestPhase,
  };

  if (signals.bailedOut) {
    return { ...recorded, stalls: openOrExtendStall(state.stalls, state.elapsedMs, state.phase) };
  }

  if (signals.realIdea) {
    return markProgress({ ...recorded, stalls: closeOpenStall(state.stalls, state.elapsedMs) });
  }

  // Naming a complexity or an edge case is real work even when it is not the idea that unsticks
  // the problem, so it holds off the hint window without ending a stall.
  if (signals.complexityStated || signals.edgeCaseRaised) {
    return markProgress(recorded);
  }

  return recorded;
}

/** Add a refusal to the open stall, or start a new one when the candidate was not already stalling. */
function openOrExtendStall(
  stalls: readonly Stall[],
  atMs: number,
  phase: Phase,
): readonly Stall[] {
  const open = openStall(stalls);

  if (open === null) {
    return [...stalls, { startedAtMs: atMs, phase, bailOuts: 1, recoveredAtMs: null }];
  }

  return [
    ...stalls.slice(0, -1),
    { ...open, bailOuts: open.bailOuts + 1 },
  ];
}

/** Close the open stall at `atMs`. A no-op when nothing was open - a real idea is not a recovery. */
function closeOpenStall(stalls: readonly Stall[], atMs: number): readonly Stall[] {
  const open = openStall(stalls);

  if (open === null) {
    return stalls;
  }

  return [...stalls.slice(0, -1), { ...open, recoveredAtMs: atMs }];
}

/** The trailing stall if it is still open. Only the most recent stall can be. */
function openStall(stalls: readonly Stall[]): Stall | null {
  if (stalls.length === 0) {
    return null;
  }

  const last = stalls[stalls.length - 1];

  return last.recoveredAtMs === null ? last : null;
}

/**
 * Commit a phase transition, logging it as an override when it went against the grain.
 *
 * Both `PHASE_CONFIRMED` and `OVERRIDE_USED` funnel through here so the classification is the
 * reducer's, not the caller's - otherwise a UI could launder a skip by dispatching the gentler
 * event. The transition itself is never refused; only recorded.
 */
function commitPhase(state: InterviewState, to: Phase, explicit: boolean): InterviewState {
  const skipped = skippedPhases(state.phase, to);
  const wentElsewhere = state.suggestedPhase !== null && to !== state.suggestedPhase;
  const isOverride = skipped.length > 0 || wentElsewhere || explicit;

  const override: Override = {
    atMs: state.elapsedMs,
    from: state.phase,
    to,
    skipped,
    suggestedPhase: state.suggestedPhase,
    explicit,
  };

  const spentInPhase = state.elapsedMs - state.phaseEnteredAtMs;

  return markProgress({
    ...state,
    phase: to,
    phaseEnteredAtMs: state.elapsedMs,
    phaseDurationsMs: {
      ...state.phaseDurationsMs,
      [state.phase]: (state.phaseDurationsMs[state.phase] ?? 0) + spentInPhase,
    },
    suggestedPhase: null,
    overrides: isOverride ? [...state.overrides, override] : state.overrides,
  });
}

/** Mark now as the last real progress, which reopens the hint window and clears dead speech. */
function markProgress(state: InterviewState): InterviewState {
  return { ...state, lastProgressAtMs: state.elapsedMs, unproductiveSpeechMs: 0 };
}
