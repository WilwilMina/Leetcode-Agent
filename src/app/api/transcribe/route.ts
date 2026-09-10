/**
 * POST /api/transcribe - accepts a recorded audio clip and returns its transcript.
 *
 * Node runtime (the Deepgram SDK needs it - docs/ARCHITECTURE.md §4). Multipart, not JSON: the
 * body is an audio blob from the browser's `MediaRecorder`, which Chrome emits as WebM/Opus at
 * roughly 800 KB/minute - comfortably under Vercel's 4.5 MB request body cap for a single
 * push-to-talk turn.
 *
 * Rate-limited the same way as `/api/turn`: `.claude/rules/security.md` names the interview-turn
 * endpoint specifically, but a Deepgram call is billed exactly like a Claude call, so leaving
 * this route uncapped would let a tight client loop run up Deepgram spend while never touching
 * `/api/turn` at all.
 */

import { NextResponse } from "next/server";

import { checkAndRecord, getRateLimitKey } from "@/lib/auth/rateLimit";
import { STT_KEYTERMS } from "@/lib/stt/keyterms";
import { transcribe } from "@/lib/stt/transcribe";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const decision = checkAndRecord(getRateLimitKey(request));

  if (decision.kind === "deny") {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(decision.retryAfterMs / 1000)) } },
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const audio = formData.get("audio");

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'audio' field" }, { status: 400 });
  }

  let buffer: Buffer;

  try {
    buffer = Buffer.from(await audio.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read audio data" }, { status: 400 });
  }

  try {
    const result = await transcribe(buffer, "clip.webm", { keyterms: STT_KEYTERMS });
    return NextResponse.json(result);
  } catch (error) {
    // Do not leak provider error details (which can include request internals) to the client -
    // log server-side, return a generic message.
    console.error("[transcribe]", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }
}
