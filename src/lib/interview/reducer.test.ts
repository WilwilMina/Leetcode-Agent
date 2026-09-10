/**
 * Tests for the interview state machine.
 *
 * Covers every event type and every phase transition, which is Phase 2's acceptance criterion in
 * `docs/ARCHITECTURE.md` §15. Two areas get disproportionate attention because they are what the
 * app is measured on: stall bookkeeping (bail-out count and recovery time, `docs/PLAN.md` §6
 * dimensions 1 and 2) and the soft gates (a transition is never refused, only recorded).
 *
 * No fake timers anywhere. The reducer's clock only moves when a `TIMER_TICK` is dispatched, so a
 * three-minute stall is one dispatch rather than a wait.
 */

import { describe, expect, it } from "vitest";

import { PHASE_ORDER, type Phase } from "../schemas/phase";
import type { Signals } from "../schemas/turn";
import {
  initialInterviewState,
  interviewReducer,
  type InterviewState,
} from "./reducer";

/** Build a state with sensible defaults so each test states only what it cares about. */
function state(overrides: Partial<InterviewState> = {}): InterviewState {
  return { ...initialInterviewState, ...overrides };
}

/** Build a turn's signals with everything quiet, so each test states only the judgment it means. */
function signals(overrides: Partial<Signals> = {}): Signals {
  return {
    bailedOut: false,
    realIdea: false,
    suggestPhase: null,
    hintLevel: 0,
    complexityStated: false,
    complexityCorrect: null,
    edgeCaseRaised: false,
    ...overrides,
  };
}

/** Every adjacent step in the running order, for exhaustive transition coverage. */
const adjacentPairs = PHASE_ORDER.slice(0, -1).map((from, index) => ({
  from,
  to: PHASE_ORDER[index + 1] as Phase,
}));

describe("initialInterviewState", () => {
  it("starts in the intro phase with the clock at zero", () => {
    expect(initialInterviewState.phase).toBe("intro");
    expect(initialInterviewState.elapsedMs).toBe(0);
  });

  it("starts with nothing logged against the candidate", () => {
    expect(initialInterviewState.stalls).toEqual([]);
    expect(initialInterviewState.overrides).toEqual([]);
    expect(initialInterviewState.hints).toEqual([]);
    expect(initialInterviewState.pastes).toEqual([]);
  });
});

describe("interviewReducer", () => {
  it("advances elapsed time by the tick delta", () => {
    const next = interviewReducer(state(), { type: "TIMER_TICK", deltaMs: 5_000 });

    expect(next.elapsedMs).toBe(5_000);
  });

  it("accumulates silence without advancing elapsed time", () => {
    const next = interviewReducer(state({ elapsedMs: 1_000 }), {
      type: "SILENCE_TICK",
      deltaMs: 4_000,
    });

    expect(next.silenceMs).toBe(4_000);
    expect(next.elapsedMs).toBe(1_000);
  });

  it("remembers the longest silence run after it is broken", () => {
    const silent = interviewReducer(state(), { type: "SILENCE_TICK", deltaMs: 20_000 });
    const spoke = interviewReducer(silent, {
      type: "TRANSCRIPT_RECEIVED",
      text: "so the idea is a hash map",
      durationMs: 3_000,
    });

    expect(spoke.silenceMs).toBe(0);
    expect(spoke.longestSilenceMs).toBe(20_000);
  });

  it("accumulates speech duration across utterances without counting it as progress", () => {
    const first = interviewReducer(state(), {
      type: "TRANSCRIPT_RECEIVED",
      text: "hmm",
      durationMs: 12_000,
    });
    const second = interviewReducer(first, {
      type: "TRANSCRIPT_RECEIVED",
      text: "so maybe, I mean, I could sort it?",
      durationMs: 18_000,
    });

    expect(second.unproductiveSpeechMs).toBe(30_000);
    expect(second.lastProgressAtMs).toBe(0);
  });

  it("clears accumulated speech once an idea lands", () => {
    const rambling = state({ elapsedMs: 60_000, unproductiveSpeechMs: 40_000 });
    const next = interviewReducer(rambling, {
      type: "SIGNALS_RECEIVED",
      signals: signals({ realIdea: true }),
    });

    expect(next.unproductiveSpeechMs).toBe(0);
    expect(next.lastProgressAtMs).toBe(60_000);
  });

  it("records the model's suggestion without changing the phase", () => {
    const next = interviewReducer(state({ phase: "clarify" }), {
      type: "SIGNALS_RECEIVED",
      signals: signals({ suggestPhase: "bruteForce" }),
    });

    expect(next.suggestedPhase).toBe("bruteForce");
    expect(next.phase).toBe("clarify");
  });

  it("stores the latest signals", () => {
    const judgments = signals({ complexityStated: true, complexityCorrect: false });
    const next = interviewReducer(state(), { type: "SIGNALS_RECEIVED", signals: judgments });

    expect(next.lastSignals).toEqual(judgments);
  });

  it("opens a stall when signals report a bail-out", () => {
    const next = interviewReducer(state({ elapsedMs: 45_000, phase: "bruteForce" }), {
      type: "SIGNALS_RECEIVED",
      signals: signals({ bailedOut: true }),
    });

    expect(next.stalls).toEqual([
      { startedAtMs: 45_000, phase: "bruteForce", bailOuts: 1, recoveredAtMs: null },
    ]);
  });

  it("counts each refusal separately within one stall", () => {
    const first = interviewReducer(state({ elapsedMs: 30_000 }), {
      type: "SIGNALS_RECEIVED",
      signals: signals({ bailedOut: true }),
    });
    const ticked = interviewReducer(first, { type: "TIMER_TICK", deltaMs: 20_000 });
    const second = interviewReducer(ticked, {
      type: "SIGNALS_RECEIVED",
      signals: signals({ bailedOut: true }),
    });

    expect(second.stalls).toHaveLength(1);
    expect(second.stalls[0].bailOuts).toBe(2);
  });

  it("measures recovery from the first refusal of the stall", () => {
    const stalled = state({
      elapsedMs: 100_000,
      stalls: [{ startedAtMs: 40_000, phase: "bruteForce", bailOuts: 3, recoveredAtMs: null }],
    });
    const next = interviewReducer(stalled, {
      type: "SIGNALS_RECEIVED",
      signals: signals({ realIdea: true }),
    });

    expect(next.stalls[0].recoveredAtMs).toBe(100_000);
    expect(next.stalls[0].bailOuts).toBe(3);
  });

  it("keeps the stall open when a turn both refuses and lands an idea", () => {
    const stalled = state({
      elapsedMs: 60_000,
      stalls: [{ startedAtMs: 20_000, phase: "optimize", bailOuts: 1, recoveredAtMs: null }],
    });
    const next = interviewReducer(stalled, {
      type: "SIGNALS_RECEIVED",
      signals: signals({ bailedOut: true, realIdea: true }),
    });

    expect(next.stalls[0].recoveredAtMs).toBeNull();
    expect(next.stalls[0].bailOuts).toBe(2);
  });

  it("does not open a stall when an idea lands with nothing stalling", () => {
    const next = interviewReducer(state(), {
      type: "SIGNALS_RECEIVED",
      signals: signals({ realIdea: true }),
    });

    expect(next.stalls).toEqual([]);
  });

  it("starts a fresh stall after recovering from the previous one", () => {
    const recovered = state({
      elapsedMs: 120_000,
      stalls: [{ startedAtMs: 20_000, phase: "optimize", bailOuts: 1, recoveredAtMs: 50_000 }],
    });
    const next = interviewReducer(recovered, {
      type: "SIGNALS_RECEIVED",
      signals: signals({ bailedOut: true }),
    });

    expect(next.stalls).toHaveLength(2);
    expect(next.stalls[1].startedAtMs).toBe(120_000);
  });

  it("treats a stated complexity as progress without ending a stall", () => {
    const stalled = state({
      elapsedMs: 80_000,
      stalls: [{ startedAtMs: 20_000, phase: "complexity", bailOuts: 1, recoveredAtMs: null }],
    });
    const next = interviewReducer(stalled, {
      type: "SIGNALS_RECEIVED",
      signals: signals({ complexityStated: true, complexityCorrect: true }),
    });

    expect(next.lastProgressAtMs).toBe(80_000);
    expect(next.stalls[0].recoveredAtMs).toBeNull();
  });

  it("logs a hint with its level and counts it as progress", () => {
    const next = interviewReducer(state({ elapsedMs: 200_000, phase: "optimize" }), {
      type: "HINT_OFFERED",
      level: 2,
    });

    expect(next.hints).toEqual([{ atMs: 200_000, phase: "optimize", level: 2 }]);
    expect(next.lastProgressAtMs).toBe(200_000);
  });

  it("counts typing as progress and breaks silence", () => {
    const quiet = state({ elapsedMs: 300_000, silenceMs: 40_000, unproductiveSpeechMs: 20_000 });
    const next = interviewReducer(quiet, { type: "CODE_CHANGED", length: 120 });

    expect(next.silenceMs).toBe(0);
    expect(next.lastProgressAtMs).toBe(300_000);
    expect(next.unproductiveSpeechMs).toBe(0);
  });

  it("logs a paste without counting it as progress", () => {
    const quiet = state({ elapsedMs: 300_000, silenceMs: 40_000 });
    const next = interviewReducer(quiet, { type: "CODE_PASTED", length: 420 });

    expect(next.pastes).toEqual([{ atMs: 300_000, phase: "intro", length: 420 }]);
    expect(next.silenceMs).toBe(0);
    expect(next.lastProgressAtMs).toBe(0);
  });

  it.each(adjacentPairs)("advances from $from to $to", ({ from, to }) => {
    const next = interviewReducer(state({ phase: from }), { type: "PHASE_CONFIRMED", to });

    expect(next.phase).toBe(to);
    expect(next.overrides).toEqual([]);
  });

  it("logs no override when confirming the phase the model suggested", () => {
    const suggested = state({ phase: "clarify", suggestedPhase: "bruteForce" });
    const next = interviewReducer(suggested, { type: "PHASE_CONFIRMED", to: "bruteForce" });

    expect(next.overrides).toEqual([]);
    expect(next.suggestedPhase).toBeNull();
  });

  it("logs an override when confirming a phase the model did not suggest", () => {
    const suggested = state({ phase: "clarify", suggestedPhase: "bruteForce" });
    const next = interviewReducer(suggested, { type: "PHASE_CONFIRMED", to: "optimize" });

    expect(next.overrides).toHaveLength(1);
    expect(next.overrides[0].suggestedPhase).toBe("bruteForce");
  });

  it("permits a jump straight to code and records what it skipped", () => {
    const next = interviewReducer(state({ phase: "clarify", elapsedMs: 60_000 }), {
      type: "PHASE_CONFIRMED",
      to: "code",
    });

    expect(next.phase).toBe("code");
    expect(next.overrides).toEqual([
      {
        atMs: 60_000,
        from: "clarify",
        to: "code",
        skipped: ["bruteForce", "optimize", "complexity"],
        suggestedPhase: null,
        explicit: false,
      },
    ]);
  });

  // A skip matrix rather than one hand-picked case: skip length is an off-by-one hazard
  // (`skippedPhases` is a slice), and every entry here feeds the override count that Phase 6
  // scores against, so the boundary sizes matter as much as the middle of the range.
  it.each([
    { from: "clarify", to: "optimize", skipped: ["bruteForce"] },
    { from: "intro", to: "debrief", skipped: PHASE_ORDER.slice(1, -1) },
  ])("logs $skipped.length skipped phase(s) jumping from $from to $to", ({ from, to, skipped }) => {
    const next = interviewReducer(state({ phase: from as Phase }), {
      type: "PHASE_CONFIRMED",
      to: to as Phase,
    });

    expect(next.overrides[0].skipped).toEqual(skipped);
  });

  it("logs an explicit override even for a single step in order", () => {
    const next = interviewReducer(state({ phase: "clarify" }), {
      type: "OVERRIDE_USED",
      to: "bruteForce",
    });

    expect(next.phase).toBe("bruteForce");
    expect(next.overrides).toHaveLength(1);
    expect(next.overrides[0].explicit).toBe(true);
  });

  it("permits a move backwards without counting it as a skip", () => {
    const next = interviewReducer(state({ phase: "code" }), {
      type: "PHASE_CONFIRMED",
      to: "clarify",
    });

    expect(next.phase).toBe("clarify");
    expect(next.overrides).toEqual([]);
  });

  it("logs a move backwards that contradicts the model, with nothing skipped", () => {
    const suggested = state({ phase: "code", suggestedPhase: "handTrace" });
    const next = interviewReducer(suggested, { type: "PHASE_CONFIRMED", to: "clarify" });

    expect(next.overrides).toHaveLength(1);
    expect(next.overrides[0].skipped).toEqual([]);
  });

  it("records elapsed time per phase on each transition", () => {
    const inPhase = state({ phase: "clarify", elapsedMs: 90_000, phaseEnteredAtMs: 30_000 });
    const next = interviewReducer(inPhase, { type: "PHASE_CONFIRMED", to: "bruteForce" });

    expect(next.phaseDurationsMs).toEqual({ clarify: 60_000 });
    expect(next.phaseEnteredAtMs).toBe(90_000);
  });
});
