# Progress

## Current phase
PHASE 1 — PUSH-TO-TALK + STT ACCURACY SPIKE (see [ARCHITECTURE.md](ARCHITECTURE.md) §15)

**Code-complete, blocked on API keys.** Every acceptance criterion that can be checked without
a live network call is verified; the spoken round-trip and the STT spike numbers cannot be
produced until `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` exist in `.env.local`.

## Last session (2026-09-10)

### Phase 1 — Push-to-talk + STT accuracy spike: CODE COMPLETE, KEY-BLOCKED
- Shipped:
  - `/api/transcribe` — Deepgram Nova-3 batch STT (`src/lib/stt/transcribe.ts`), keyterm-boosted
    with the vocabulary list in `src/lib/stt/keyterms.ts`
  - `/api/turn` — Claude Sonnet 5 interviewer reply (`src/lib/llm/turn.ts`), structured output
    via `client.messages.parse()` + Zod (`src/lib/schemas/turn.ts`), hardcoded Two Sum problem,
    neutral persona (no praise, terse) — not the full escalation-ladder persona, which is Phase 3
  - `src/lib/stt/wer.ts` — word-error-rate calculator, the actual instrument for the spike
  - `src/lib/auth/rateLimit.ts` — in-memory sliding-window limiter, mirrors the `access.ts`
    pure-decision-function pattern; applied to **both** `/api/turn` and `/api/transcribe`
  - `/session` page (`src/app/session/`) — push-to-talk button, problem statement, transcript.
    Built via the `frontend-design` skill: a clinical light "interview equipment" look (IBM Plex
    Mono, hairline borders, zero radius, one red accent reserved for the recording state), not a
    chat-app aesthetic
  - `scripts/stt-spike.ts` — standalone CLI (`npm run stt-spike -- clip.webm reference.txt`),
    never wired into the app, for running the accuracy spike by hand
  - `.env.example` updated with `ANTHROPIC_API_KEY` / `DEEPGRAM_API_KEY`
- Verification: `qa` confirmed lint/typecheck/test/build all clean with no live keys (41 tests),
  the blob-size math (≈800 KB/min WebM/Opus vs. Vercel's 4.5 MB cap, ~5.6 min margin), the CLI's
  two error paths, and correctly marked the two key-gated criteria **blocked, not failed** —
  spoken round-trip and spike numbers need real keys and real audio
- `code-reviewer`: two real bugs found and fixed —
  - **The Anthropic SDK was leaking into the client bundle.** `InterviewSession.tsx` imported
    `PROBLEM_STATEMENT` from `lib/llm/turn.ts`, which imports `getAnthropicClient` — whose own
    docstring says never do that. Fixed by extracting the constant into `src/lib/problem.ts`,
    importable from both sides with no server-only code attached. Confirmed by grepping the
    built `.next/static/chunks` for the SDK's signature: zero matches
  - **A very fast tap left the mic open with no way to stop it.** Releasing before
    `getUserMedia` resolved was silently dropped (`stopRecording` no-op'd because `phase` was
    still `"idle"`), so the mic started recording anyway once permission resolved. Fixed with a
    `pendingStopRef` that remembers the release and cancels the recording before it starts
  - Two more addressed: `/api/transcribe` had no rate limit even though Deepgram calls are
    billed the same as Claude calls (now shares the limiter via a new tested
    `getRateLimitKey` helper); one `await` in the transcribe route wasn't wrapped in try/catch,
    inconsistent with the rest of the file
  - Re-verified after fixes — all four confirmed fixed, no new issues
- Decisions made during the slice:
  - Deepgram's v5 SDK is a Fern-generated client (`client.listen.v1.media.transcribeFile`),
    structurally different from the v3 `createClient` pattern most tutorials show — read from the
    installed package's own `.d.ts` files rather than assumed from training data
  - `/session` state is plain `useState`, not the Phase 2 reducer — no phase logic exists yet to
    justify one
  - `TurnResultSchema` is `{ reply: string }` only; the full `signals` object from
    ARCHITECTURE.md §7 waits for Phase 3
  - The video-suggestion note that had appeared in ARCHITECTURE.md was never committed (a local
    edit); removed, and filed in `PLAN.md`'s backlog instead
  - `.claude/agents/qa.md` `maxTurns` raised 10 → 25 — it hit the ceiling mid-verification on
    both Phase 0 and Phase 1 and needed a manual resume each time

## Open / carried forward
- **Blocking Phase 1's remaining two acceptance criteria: no API keys exist.** Get
  `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` into `.env.local`, then:
  1. `npm run dev`, open `/session`, hold the button, speak — confirm the round-trip
  2. Record ~10 real clips, run `npm run stt-spike -- clip.webm reference.txt` on each, write
     the raw-vs-keyterm WER numbers into `ARCHITECTURE.md` §15 by hand
- Deployment access gate still not smoke-tested against a real deployment (carried from Phase 0)
- `APP_ACCESS_SECRET` must be set in Vercel before the first deploy
- Whether `effort: "low"` degrades interviewer judgment — measure in Phase 3

## Next session
- **If keys now exist:** run the two verification steps above first — they're the actual point
  of this phase — then start Phase 2 (the phase reducer) per `ARCHITECTURE.md` §15
- **If keys still don't exist:** Phase 2 (pure reducer, docs/ARCHITECTURE.md §9) can proceed
  key-free in the meantime, same as Phase 1's pure modules were
- Gate: `qa` → `code-reviewer` before the slice counts as done
