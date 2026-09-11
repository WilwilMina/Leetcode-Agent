/**
 * Tests for which events a tick should produce.
 *
 * Small on purpose - this is a two-branch function - but it is the one piece of real logic the
 * timer-effect wiring adds, and the repo's whole component-testing gap (no jsdom, no rendered
 * assertions anywhere) makes this the only place that logic gets covered at all.
 */

import { describe, expect, it } from "vitest";

import { tickEvents } from "./ticks";

describe("tickEvents", () => {
  it("always advances the timer", () => {
    expect(tickEvents("recording", 1_000)).toContainEqual({ type: "TIMER_TICK", deltaMs: 1_000 });
    expect(tickEvents("idle", 1_000)).toContainEqual({ type: "TIMER_TICK", deltaMs: 1_000 });
  });

  it("counts silence only when the microphone is idle", () => {
    expect(tickEvents("idle", 1_000)).toContainEqual({ type: "SILENCE_TICK", deltaMs: 1_000 });
  });

  it("does not count silence while recording, transcribing, or thinking", () => {
    for (const status of ["recording", "transcribing", "thinking"] as const) {
      const events = tickEvents(status, 1_000);
      expect(events.some((event) => event.type === "SILENCE_TICK")).toBe(false);
    }
  });

  it("produces exactly one event per tick outside idle, and two while idle", () => {
    expect(tickEvents("recording", 500)).toHaveLength(1);
    expect(tickEvents("idle", 500)).toHaveLength(2);
  });
});
