/**
 * The Phase 1 interview session: hold-to-talk, transcript, nothing else yet.
 *
 * No clock, no phase rail, no editor - those are later phases (docs/ARCHITECTURE.md §3, §15).
 * State is plain `useState` here; the pure reducer that will eventually own this arrives in
 * Phase 2 once there is real phase logic to model.
 *
 * Push-to-talk, not tap-to-toggle: the control is held down, matching how the app's own name
 * describes it and how a two-way radio actually works - you do not get an accidental open mic if
 * you let go.
 */

"use client";

import { useCallback, useRef, useState } from "react";

import { PROBLEM_STATEMENT } from "@/lib/problem";

type Role = "user" | "assistant";

interface Turn {
  role: Role;
  text: string;
}

type Phase = "idle" | "recording" | "transcribing" | "thinking";

const STATUS_TEXT: Record<Phase, string> = {
  idle: "Hold to talk",
  recording: "Recording — release to send",
  transcribing: "Transcribing",
  thinking: "Interviewer is responding",
};

/** Loose runtime check on a fetch response body - API output is untrusted input just as much as
 *  model output is (.claude/rules/security.md); a malformed body should not crash the page. */
function readStringField(body: unknown, field: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

export function InterviewSession() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const keyHeldRef = useRef(false);
  // Set when the button is released before getUserMedia has resolved. Without this, a very
  // fast tap leaves the mic recording with nothing left to stop it: stopRecording no-ops
  // because phase is still "idle" at that instant, and startRecording later flips to
  // "recording" regardless, having missed the release entirely.
  const pendingStopRef = useRef(false);

  const startRecording = useCallback(async () => {
    if (phase !== "idle") return;

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

    setPhase("recording");
  }, [phase]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || phase !== "recording") {
      // Still waiting on getUserMedia (phase is "idle" but a start is in flight) - remember
      // the release so startRecording can honor it once the mic is actually ready. Any other
      // phase (transcribing/thinking, or truly idle with nothing in flight) is a correct no-op.
      if (phase === "idle") {
        pendingStopRef.current = true;
      }
      return;
    }

    setPhase("transcribing");

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
          setPhase("idle");
          return;
        }

        const transcribed = readStringField(await transcribeResponse.json(), "text");

        if (!transcribed) {
          setError("Did not catch that. Hold the button and try again.");
          setPhase("idle");
          return;
        }

        const candidateTurn: Turn = { role: "user", text: transcribed };
        const historySoFar = [...transcript, candidateTurn];
        setTranscript(historySoFar);
        setPhase("thinking");

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
          setPhase("idle");
          return;
        }

        const reply = readStringField(await turnResponse.json(), "reply");
        setTranscript((prev) => [...prev, { role: "assistant", text: reply ?? "…" }]);
        setPhase("idle");
      } catch {
        setError("Something went wrong. Try again.");
        setPhase("idle");
      }
    })();
  }, [phase, transcript]);

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

  const busy = phase === "transcribing" || phase === "thinking";

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

      <footer className="flex flex-col gap-2">
        <p className="text-xs text-muted">{STATUS_TEXT[phase]}</p>
        <button
          type="button"
          disabled={busy}
          onPointerDown={() => void startRecording()}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className="w-full border px-4 py-6 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: phase === "recording" ? "var(--signal)" : "var(--line)",
            backgroundColor: phase === "recording" ? "var(--signal-wash)" : "var(--panel)",
            color: phase === "recording" ? "var(--signal)" : "var(--ink)",
          }}
        >
          {phase === "recording" ? "Recording" : "Hold to talk"}
        </button>
      </footer>
    </div>
  );
}
