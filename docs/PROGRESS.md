# Progress

## Current phase
PHASE 1 — PUSH-TO-TALK + STT ACCURACY SPIKE (see [ARCHITECTURE.md](ARCHITECTURE.md) §15)

**Code-complete, blocked on API keys.** Every acceptance criterion that can be checked without
a live network call is verified; the spoken round-trip and the STT spike numbers cannot be
produced until a Deepgram key and an LLM key (Gemini by default, or Anthropic) exist in
`.env.local`.

## Last session (2026-09-10, later)

### Amendment to Phase 1: Gemini added as the default LLM provider
The user has no Anthropic key but wants to use Google Gemini instead — mainly because Gemini's
flash-tier models have a genuine free tier, unlike Claude. This directly targets Phase 1's
still-open "spoken round-trip" criterion.

- **Not a flat swap.** `getInterviewerReply(history)` was already the one seam
  `/api/turn/route.ts` calls, so a thin provider interface behind it cost almost nothing and
  keeps Claude intact as a fallback:
  - `src/lib/llm/provider.ts` — pure `resolveProvider(envValue)`, `LLM_PROVIDER=gemini|anthropic`,
    defaults to `gemini`, falls back to the default on an unrecognized value rather than throwing
  - `src/lib/llm/persona.ts` — the system prompt, extracted so it is written once, not once per
    provider
  - `src/lib/llm/providers/claude.ts` / `providers/gemini.ts` — one file per provider; `turn.ts`
    is now a thin delegator. **`/api/turn/route.ts` needed zero changes** — confirmed by `qa` via
    `git status`/`git diff`
  - Model: `gemini-2.5-flash` (user's choice — cheaper and more established than `gemini-3.8-flash`,
    the safer pick given structured-output behavior couldn't be fully pinned ahead of time)
- **Google's own docs were unreliable and nearly produced wrong code.** Three separate fetches
  gave three different structured-output config shapes. Resolved by reading the installed
  `@google/genai` package's actual `.d.ts` files directly — which also revealed the docs weren't
  just inconsistently worded, the field genuinely moved: `responseSchema` → `responseJsonSchema`,
  per the SDK's own source comment. Same lesson as Deepgram's SDK in the same phase: pin fast-moving
  external APIs against installed types, not docs or training data
  - Zod v4 ships a native `toJSONSchema()` — no extra dependency needed to drive Gemini's
    structured output off the same canonical `TurnResultSchema` used for Claude
- **Security catch before this even started:** `.env.example` had a real Deepgram key value
  pasted into it. Confirmed via `git log`/`git diff origin/main` that it was never committed or
  pushed — caught in the working tree, not a live leak. Fixed: real value moved to `.env.local`
  (gitignored), `.env.example` restored to a placeholder. `qa` re-verified both the placeholder
  file and `.env.local`'s gitignore status explicitly as its two highest-priority checks
- `qa`: all criteria pass with no live keys (47 tests, was 41 — +6 for `resolveProvider`); both
  security checks pass; confirmed via `.next/static/chunks` grep that **neither** SDK reaches the
  client bundle
- `code-reviewer`: no correctness or security defects in the Gemini implementation — traced the
  role mapping (`assistant`→`model`), the `response.text` guard, the `JSON.parse` try/catch, and
  confirmed the Zod validation actually gates the return path. Two cosmetic findings, both fixed:
  a stale "Anthropic SDK" comment in `route.ts`, and no server-side logging distinguishing the
  three silent-fallback failure modes (empty response / bad JSON / wrong shape) in either
  provider — added `console.error` to each
- Docs updated: `CLAUDE.md` Stack table and Status, `ARCHITECTURE.md` §5 (provider selection,
  the docs-vs-installed-types lesson) and §14 (parallel Gemini/Claude cost tables — Gemini's
  likely actual cost is $0 within its free tier), `PLAN.md` §3, `.claude/rules/security.md`
  (now names all three API keys), `.env.example`

## Open / carried forward
- **Blocking Phase 1's remaining two acceptance criteria: no live keys exist.** Get
  `DEEPGRAM_API_KEY` and `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY` with `LLM_PROVIDER=anthropic`)
  into `.env.local`, then:
  1. `npm run dev`, open `/session`, hold the button, speak — confirm the round-trip
  2. Record ~10 real clips, run `npm run stt-spike -- clip.webm reference.txt` on each, write
     the raw-vs-keyterm WER numbers into `ARCHITECTURE.md` §15 by hand
- Deployment access gate still not smoke-tested against a real deployment (carried from Phase 0)
- `APP_ACCESS_SECRET` must be set in Vercel before the first deploy
- Whether `effort: "low"` degrades interviewer judgment on Claude — measure in Phase 3 if/when
  Claude becomes the active provider again
- Gemini's exact free-tier daily/per-minute limits were never confirmed against current numbers —
  check Google AI Studio before assuming $0/month is guaranteed
- Prompt caching (ARCHITECTURE.md §6) is only wired up for Claude; revisit for Gemini if its free
  tier stops covering actual usage

## Next session
- **If keys now exist:** run the two verification steps above first — they're the actual point
  of this phase — then start Phase 2 (the phase reducer) per `ARCHITECTURE.md` §15
- **If keys still don't exist:** Phase 2 (pure reducer, docs/ARCHITECTURE.md §9) can proceed
  key-free in the meantime, same as Phase 1's pure modules were
- Gate: `qa` → `code-reviewer` before the slice counts as done
