/**
 * The one piece of real decision logic behind the session's real-time clock: which events a
 * wall-clock delta should produce, given what the microphone is doing right now.
 *
 * Kept out of the React layer and tested in isolation because it is the only branching this
 * slice adds - everything else in `InterviewSession.tsx`'s timer effect is a thin `setInterval`
 * caller with no decision left to get wrong.
 */

import type { InterviewEvent } from "./reducer";

/** What the microphone is doing right now. `InterviewSession.tsx` imports this rather than
 *  declaring its own copy, so the two can never drift apart. */
export type RecorderStatus = "idle" | "recording" | "transcribing" | "thinking";

/**
 * A tick always advances the session clock. It only counts as silence when nothing is actively
 * happening - recording, transcribing, or waiting on the interviewer all break silence, matching
 * how `TRANSCRIPT_RECEIVED` and the phase-commit events already reset `silenceMs` in the reducer.
 */
export function tickEvents(recorderStatus: RecorderStatus, deltaMs: number): InterviewEvent[] {
  const events: InterviewEvent[] = [{ type: "TIMER_TICK", deltaMs }];

  if (recorderStatus === "idle") {
    events.push({ type: "SILENCE_TICK", deltaMs });
  }

  return events;
}
