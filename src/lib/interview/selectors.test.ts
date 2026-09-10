/**
 * Tests for the derived values.
 *
 * These construct state directly rather than dispatching, which is the point of keeping them
 * derived: the thresholds can be probed at their exact boundary without replaying a session.
 * Both thresholds are tested one millisecond either side, since an off-by-one here means the
 * interviewer either cuts in early or never cuts in at all.
 */

import { describe, expect, it } from "vitest";

import { initialInterviewState, type InterviewState, type Stall } from "./reducer";
import {
  INTERVIEW_THRESHOLDS,
  bailOutCount,
  isRecovering,
  recoveries,
  shouldInterrupt,
  shouldOfferHint,
} from "./selectors";

/** Build a state with sensible defaults so each test states only what it cares about. */
function state(overrides: Partial<InterviewState> = {}): InterviewState {
  return { ...initialInterviewState, ...overrides };
}

/** An open stall, i.e. one the candidate has not recovered from yet. */
function openStall(overrides: Partial<Stall> = {}): Stall {
  return { startedAtMs: 0, phase: "bruteForce", bailOuts: 1, recoveredAtMs: null, ...overrides };
}

describe("bailOutCount", () => {
  it("is zero before anything has gone wrong", () => {
    expect(bailOutCount(state())).toBe(0);
  });

  it("counts every refusal, including repeats inside one stall", () => {
    const stalls = [openStall({ bailOuts: 3, recoveredAtMs: 60_000 }), openStall({ bailOuts: 1 })];

    expect(bailOutCount(state({ stalls }))).toBe(4);
  });
});

describe("recoveries", () => {
  it("ignores a stall that is still open", () => {
    expect(recoveries(state({ stalls: [openStall()] }))).toEqual([]);
  });

  it("measures one span per stall, from its first refusal", () => {
    const stalls = [openStall({ startedAtMs: 10_000, bailOuts: 3, recoveredAtMs: 70_000 })];

    expect(recoveries(state({ stalls }))).toEqual([
      { startedAtMs: 10_000, recoveredAtMs: 70_000, durationMs: 60_000, bailOuts: 3 },
    ]);
  });
});

describe("isRecovering", () => {
  it("is false before any bail-out", () => {
    expect(isRecovering(state())).toBe(false);
  });

  it("is true between a bail-out and the next real idea", () => {
    expect(isRecovering(state({ stalls: [openStall()] }))).toBe(true);
  });

  it("is false once the stall has closed", () => {
    expect(isRecovering(state({ stalls: [openStall({ recoveredAtMs: 30_000 })] }))).toBe(false);
  });
});

describe("shouldOfferHint", () => {
  const { hintAfterNoProgressMs } = INTERVIEW_THRESHOLDS;

  it("is false just under the window", () => {
    expect(shouldOfferHint(state({ elapsedMs: hintAfterNoProgressMs - 1 }))).toBe(false);
  });

  it("is true at exactly the window", () => {
    expect(shouldOfferHint(state({ elapsedMs: hintAfterNoProgressMs }))).toBe(true);
  });

  it("measures from the last progress, not from the start of the session", () => {
    const stalled = state({
      elapsedMs: 10 * 60 * 1000,
      lastProgressAtMs: 10 * 60 * 1000 - hintAfterNoProgressMs + 1,
    });

    expect(shouldOfferHint(stalled)).toBe(false);
  });

  it("is false in the debrief", () => {
    const done = state({ phase: "debrief", elapsedMs: hintAfterNoProgressMs });

    expect(shouldOfferHint(done)).toBe(false);
  });
});

describe("shouldInterrupt", () => {
  const { interruptAfterUnproductiveSpeechMs } = INTERVIEW_THRESHOLDS;

  it("is false just under the threshold", () => {
    const rambling = state({ unproductiveSpeechMs: interruptAfterUnproductiveSpeechMs - 1 });

    expect(shouldInterrupt(rambling)).toBe(false);
  });

  it("is true at exactly the threshold", () => {
    const rambling = state({ unproductiveSpeechMs: interruptAfterUnproductiveSpeechMs });

    expect(shouldInterrupt(rambling)).toBe(true);
  });
});
