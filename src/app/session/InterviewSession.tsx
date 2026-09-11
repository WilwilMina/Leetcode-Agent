/**
 * The interview session page: hold-to-talk, transcript, and - as of Phase 2 slice 2 - the real
 * phase clock and the soft-gate controls that let the candidate move between phases by hand.
 *
 * No editor, no hints, no interviewer judgment yet (docs/ARCHITECTURE.md §3, §15) - there is no
 * persona to emit `Signals` until Phase 3, no hint system until Phase 4, and no code surface until
 * Phase 5, so `SIGNALS_RECEIVED`, `HINT_OFFERED`, `CODE_CHANGED`, and `CODE_PASTED` stay unwired.
 * What this slice adds is real: `src/lib/interview/reducer.ts` now actually drives `phase`,
 * `elapsedMs`, the bail-out/recovery log, and the override log, replacing what used to be nothing.
 *
 * Push-to-talk, not tap-to-toggle: the control is held down, matching how the app's own name
 * describes it and how a two-way radio actually works - you do not get an accidental open mic if
 * you let go.
 */

"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { PROBLEM_STATEMENT } from "@/lib/problem";
import { phaseAfter } from "@/lib/interview/phases";
import { initialInterviewState, interviewReducer } from "@/lib/interview/reducer";
import { bailOutCount } from "@/lib/interview/selectors";
import { tickEvents, type RecorderStatus } from "@/lib/interview/ticks";
import { PHASE_ORDER, type Phase } from "@/lib/schemas/phase";

type Role = "user" | "assistant";

interface Turn {
  role: Role;
  text: string;
}

const STATUS_TEXT: Record<RecorderStatus, string> = {
  idle: "Hold to talk",
  recording: "Recording — release to send",
  transcribing: "Transcribing",
  thinking: "Interviewer is responding",
};

/** Sentence-case labels for the interview phases - `PHASE_ORDER`'s own values are camelCase
 *  identifiers, not display copy. */
const PHASE_LABELS: Record<Phase, string> = {
  intro: "Intro",
  clarify: "Clarify",
  bruteForce: "Brute force",
  optimize: "Optimize",
  complexity: "Complexity",
  code: "Code",
  handTrace: "Hand-trace",
  debrief: "Debrief",
};

/** A single tick's real-world delta is capped before it reaches the reducer. A laptop sleep or a
 *  backgrounded tab would otherwise hand the reducer an hours-long gap on the next tick, and the
 *  reducer trusts whatever delta it is given by design - that gap says nothing about how the
 *  candidate performed and should not blow past every hint/interrupt threshold for the rest of
 *  the session. */
const MAX_TICK_DELTA_MS = 5_000;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Loose runtime check on a fetch response body - API output is untrusted input just as much as
 *  model output is (.claude/rules/security.md); a malformed body should not crash the page. */
function readStringField(body: unknown, field: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

export function InterviewSession() {
  const [recorderStatus, setRecorderStatus] = useState<RecorderStatus>("idle");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [interviewState, dispatch] = useReducer(interviewReducer, initialInterviewState);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const keyHeldRef = useRef(false);
  // Set when the button is released before getUserMedia has resolved. Without this, a very
  // fast tap leaves the mic recording with nothing left to stop it: stopRecording no-ops
  // because recorderStatus is still "idle" at that instant, and startRecording later flips to
  // "recording" regardless, having missed the release entirely.
  const pendingStopRef = useRef(false);
  // Wall-clock start of the current recording, so the eventual TRANSCRIPT_RECEIVED event carries
  // how long the candidate actually spoke rather than a guess.
  const recordingStartedAtRef = useRef<number | null>(null);

  // The session clock. Real elapsed time only ever enters the reducer through a dispatched
  // TIMER_TICK/SILENCE_TICK, computed from an actual Date.now() difference - the interval's
  // nominal 1000ms period drifts from wall-clock time under background-tab throttling, so the
  // period itself is never trusted, only used as a polling cadence. Torn down and rebuilt on
  // every recorderStatus/phase change (cheap - these change rarely - and lossless, since the
  // new instance's baseline is captured in the same commit as the old instance's cleanup) and
  // not scheduled at all once the interview is over, so the visible elapsed time stops climbing
  // once there is nothing left to time.
  useEffect(() => {
    if (interviewState.phase === "debrief") return;

    let lastTickAtMs = Date.now();

    const id = setInterval(() => {
      const now = Date.now();
      // Floored at zero, not just capped: a backward clock adjustment (NTP sync, VM clock
      // correction) would otherwise produce a negative delta, and the reducer adds deltaMs to
      // elapsedMs/silenceMs unconditionally - an uncaught negative tick would run the visible
      // session clock backward.
      const deltaMs = Math.max(0, Math.min(now - lastTickAtMs, MAX_TICK_DELTA_MS));
      lastTickAtMs = now;

      for (const event of tickEvents(recorderStatus, deltaMs)) {
        dispatch(event);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [recorderStatus, interviewState.phase]);

  const startRecording = useCallback(async () => {
    if (recorderStatus !== "idle") return;

    pendingStopRef.current = false;
    setError(null);

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was denied or is unavailable.");
      return;
    }

    if (pendingStopRef.current) {
      // Released before the mic was even ready. Too short to be a real press - mirrors a
      // physical push-to-talk radio ignoring a sub-threshold tap rather than transmitting a
      // fragment of silence.
      pendingStopRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    recordingStartedAtRef.current = Date.now();

    setRecorderStatus("recording");
  }, [recorderStatus]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorderStatus !== "recording") {
      // Still waiting on getUserMedia (recorderStatus is "idle" but a start is in flight) -
      // remember the release so startRecording can honor it once the mic is actually ready. Any
      // other status (transcribing/thinking, or truly idle with nothing in flight) is a correct
      // no-op.
      if (recorderStatus === "idle") {
        pendingStopRef.current = true;
      }
      return;
    }

    setRecorderStatus("transcribing");

    // Captured now, before transcription's network round-trip begins - if this were read after
    // `await stopped`/`fetch`, the resulting duration would include upload and Deepgram latency
    // as if the candidate had been speaking that whole time, inflating unproductiveSpeechMs for
    // reasons that have nothing to do with what they said.
    const recordingStoppedAtMs = Date.now();

    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
    });

    recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());

    void (async () => {
      try {
        const audioBlob = await stopped;
        const form = new FormData();
        form.append("audio", audioBlob, "clip.webm");

        const transcribeResponse = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });

        if (!transcribeResponse.ok) {
          setError("Transcription failed. Try again.");
          setRecorderStatus("idle");
          return;
        }

        const transcribed = readStringField(await transcribeResponse.json(), "text");

        if (!transcribed) {
          setError("Did not catch that. Hold the button and try again.");
          setRecorderStatus("idle");
          return;
        }

        const startedAtMs = recordingStartedAtRef.current ?? recordingStoppedAtMs;
        dispatch({
          type: "TRANSCRIPT_RECEIVED",
          text: transcribed,
          durationMs: recordingStoppedAtMs - startedAtMs,
        });

        const candidateTurn: Turn = { role: "user", text: transcribed };
        const historySoFar = [...transcript, candidateTurn];
        setTranscript(historySoFar);
        setRecorderStatus("thinking");

        const turnResponse = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: historySoFar.map((turn) => ({ role: turn.role, content: turn.text })),
          }),
        });

        if (!turnResponse.ok) {
          setError(
            turnResponse.status === 429
              ? "Rate limit reached. Wait a moment before continuing."
              : "The interviewer did not respond. Try again.",
          );
          setRecorderStatus("idle");
          return;
        }

        const reply = readStringField(await turnResponse.json(), "reply");
        setTranscript((prev) => [...prev, { role: "assistant", text: reply ?? "…" }]);
        setRecorderStatus("idle");
      } catch {
        setError("Something went wrong. Try again.");
        setRecorderStatus("idle");
      }
    })();
  }, [recorderStatus, transcript]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (keyHeldRef.current) return; // ignore OS key-repeat
      keyHeldRef.current = true;
      void startRecording();
    },
    [startRecording],
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      keyHeldRef.current = false;
      stopRecording();
    },
    [stopRecording],
  );

  const busy = recorderStatus === "transcribing" || recorderStatus === "thinking";
  const sessionOver = interviewState.phase === "debrief";
  const nextPhase = phaseAfter(interviewState.phase);
  const overrideTargets = PHASE_ORDER.filter((candidate) => candidate !== interviewState.phase);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <header className="border border-line bg-panel px-5 py-4">
        <h1 className="text-sm font-medium">Two Sum</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{PROBLEM_STATEMENT}</p>
      </header>

      <section
        aria-live="polite"
        aria-label="Transcript"
        className="flex-1 overflow-y-auto border border-line bg-panel px-5 py-4"
      >
        {transcript.length === 0 ? (
          <p className="text-sm text-muted">Hold the button below to begin.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {transcript.map((turn, i) => (
              <li key={i} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                <p className="text-xs text-muted">
                  {turn.role === "user" ? "You" : "Interviewer"}
                </p>
                <p className="mt-1 text-sm leading-relaxed">{turn.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      ) : null}

      <div
        aria-label="Session status"
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border border-line bg-panel px-5 py-3 text-sm"
      >
        <StatusItem label="phase" value={PHASE_LABELS[interviewState.phase]} live />
        <StatusItem label="elapsed" value={formatElapsed(interviewState.elapsedMs)} />
        <StatusItem label="bail-outs" value={String(bailOutCount(interviewState))} />
        <StatusItem label="overrides" value={String(interviewState.overrides.length)} />
      </div>

      {sessionOver ? null : (
        <>
          <button
            type="button"
            disabled={busy || nextPhase === null}
            onClick={() => nextPhase !== null && dispatch({ type: "PHASE_CONFIRMED", to: nextPhase })}
            className="w-full border border-line bg-panel px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {nextPhase !== null ? `Continue to ${PHASE_LABELS[nextPhase].toLowerCase()}` : "Session complete"}
          </button>

          <div className="flex flex-col gap-2 border border-line bg-panel px-5 py-4">
            <p className="text-xs text-muted">Skipping is not blocked. It is scored.</p>
            <div className="flex flex-wrap gap-2">
              {overrideTargets.map((target) => (
                <button
                  key={target}
                  type="button"
                  disabled={busy}
                  onClick={() => dispatch({ type: "OVERRIDE_USED", to: target })}
                  className="border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {PHASE_LABELS[target]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <footer className="flex flex-col gap-2">
        <p className="text-xs text-muted">{STATUS_TEXT[recorderStatus]}</p>
        <button
          type="button"
          disabled={busy || sessionOver}
          onPointerDown={() => void startRecording()}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className="w-full border px-4 py-6 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: recorderStatus === "recording" ? "var(--signal)" : "var(--line)",
            backgroundColor: recorderStatus === "recording" ? "var(--signal-wash)" : "var(--panel)",
            color: recorderStatus === "recording" ? "var(--signal)" : "var(--ink)",
          }}
        >
          {recorderStatus === "recording" ? "Recording" : "Hold to talk"}
        </button>
      </footer>
    </div>
  );
}

/**
 * One entry in the status strip: a muted label beside an ink-colored value, separated from its
 * neighbor by a hairline rule rather than punctuation - the site's border language stays the one
 * structural device, so status data never needs a middot or a bracket to read as grouped.
 *
 * `live` marks the value as an `aria-live` region. Only the phase item sets it: phase changes on
 * discrete, meaningful transitions, while elapsed time changes every second - making the whole
 * strip live would announce the clock ticking instead of the one change worth announcing.
 */
function StatusItem({ label, value, live = false }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 border-l border-line pl-4 first:border-l-0 first:pl-0">
      <span aria-live={live ? "polite" : undefined} className="tabular-nums text-ink">
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
