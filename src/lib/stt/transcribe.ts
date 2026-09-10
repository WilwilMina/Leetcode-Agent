/**
 * Deepgram batch (prerecorded) transcription.
 *
 * Batch, not streaming: the interview is turn-based (hold to talk, release, wait for a reply),
 * so there is no round-trip latency to hide behind a WebSocket - see docs/ARCHITECTURE.md §4/§3.
 * Chrome's `MediaRecorder` emits WebM/Opus, which Deepgram accepts directly with no transcode.
 *
 * `client.listen.v1.media.transcribeFile` is the SDK entry point (v5, Fern-generated) - verified
 * against the installed package's own type declarations and README rather than assumed from a
 * prior SDK generation, since this client's shape changed considerably from the v3 `createClient`
 * pattern documented in most third-party tutorials.
 */

import { DeepgramClient } from "@deepgram/sdk";

let client: DeepgramClient | undefined;

/** Lazy for the same reason as `getAnthropicClient` - importing this module should never throw
 *  for an unrelated page; only an actual transcription attempt should. */
function getDeepgramClient(): DeepgramClient {
  if (!client) {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error(
        "DEEPGRAM_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
      );
    }

    client = new DeepgramClient();
  }

  return client;
}

export interface TranscribeOptions {
  /** Boost these terms during recognition. Omit to transcribe "raw" - the STT accuracy spike
   *  (scripts/stt-spike.ts) calls this twice per clip, once with and once without, to measure
   *  whether keyterm boosting actually helps on programming speech. */
  keyterms?: readonly string[];
}

export interface TranscribeResult {
  text: string;
  /** Deepgram's own confidence score for the top alternative, 0-1. Not the same thing as
   *  accuracy - see docs/ARCHITECTURE.md §4 on why the spike measures WER against a real
   *  reference transcript rather than trusting this number. */
  confidence: number;
}

/**
 * Transcribe one audio clip.
 *
 * @param audio Raw audio bytes - a Buffer works directly as `core.file.Uploadable`.
 * @param filename Passed through as a content-type hint; Chrome's MediaRecorder output is
 *        WebM/Opus, so callers should use a `.webm` name.
 */
export async function transcribe(
  audio: Buffer,
  filename: string,
  options: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const dg = getDeepgramClient();

  const response = await dg.listen.v1.media.transcribeFile(
    { data: audio, filename, contentType: "audio/webm" },
    {
      model: "nova-3",
      smart_format: true,
      ...(options.keyterms && options.keyterms.length > 0
        ? { keyterm: [...options.keyterms] }
        : {}),
    },
  );

  // The SDK's return type is a union with the async-callback "accepted" response, which this
  // call can never actually receive since no `callback` option is passed - narrow explicitly
  // rather than asserting, so a real API shape change surfaces as a clear error instead of a
  // silent `undefined`.
  if (!("results" in response)) {
    throw new Error(
      "Deepgram returned an accepted-request response instead of a transcript. " +
        "This should not happen without a callback URL configured.",
    );
  }

  const alternative = response.results.channels[0]?.alternatives?.[0];

  if (!alternative?.transcript) {
    return { text: "", confidence: 0 };
  }

  return {
    text: alternative.transcript,
    confidence: alternative.confidence ?? 0,
  };
}
