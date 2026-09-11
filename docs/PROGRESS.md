# Progress

## Current phase
PHASE 2 — PHASE REDUCER (see [ARCHITECTURE.md](ARCHITECTURE.md) §15), slice 2 of N just landed.

**Slice 1 (the pure reducer) and slice 2 (wiring it into the UI) are both code-complete and
gated.** `src/lib/interview/reducer.ts` plus `phases.ts`/`selectors.ts` implement `PLAN.md` §5 as
a pure, synchronous state machine. Slice 2 (`src/app/session/InterviewSession.tsx`) now actually
runs it: a real clock (`useReducer` + a `Date.now()`-delta timer effect, clamped to 5s per tick to
survive a laptop sleep), a status readout (phase/elapsed/bail-outs/overrides), a "confirm next
phase" button, and an always-enabled override row — the literal soft-gate affordance from
`PLAN.md` §4. 111 tests total. `qa` passed all criteria; `code-reviewer` found and fixed two real
bugs before commit (see below) plus a documented accessibility gap.

**Still not persona work.** `SIGNALS_RECEIVED`, `HINT_OFFERED`, `CODE_CHANGED`, `CODE_PASTED` stay
unwired — no model emits `Signals` (Phase 3), no hints exist (Phase 4), no editor exists (Phase 5).

**Open item, not closed this session:** the phase-control UI, the timer effect, and the full
record→transcribe→turn flow have zero automated coverage (no jsdom/RTL, by deliberate repo
policy — see `vitest.config.mts`), and no headless-browser tool was available in this environment
to screenshot/click through it. **This needs a human to manually verify in a real browser** before
it's fully trusted — see Next session.

**Phase 1's two acceptance criteria are still open**, carried forward from last session.
`DEEPGRAM_API_KEY` is now real (set since last session), but `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`
are still empty placeholders in `.env.local`, and no WER numbers are recorded in
`ARCHITECTURE.md` §15. The STT spike is unblocked on the Deepgram side and needs ~10 recorded
clips of real spoken explanations — a human task, not something this session can produce.

## This session (2026-09-10, even later)

### Phase 2, slice 2: wire the reducer into `InterviewSession.tsx`
Built per the approved plan. One decision made with the user during planning: timer deltas are
clamped to 5s before dispatch, since the reducer trusts whatever delta it's handed and a laptop
sleep/backgrounded tab would otherwise hand it an hours-long gap on the next tick, corrupting
elapsed time and every hint/interrupt threshold for the rest of the session.

Resolved the naming collision flagged in slice 1's plan: the component's local mic-status `Phase`
(`idle`/`recording`/`transcribing`/`thinking`) is renamed `RecorderStatus` throughout, freeing
`phase`/`Phase` for the interview phase. New pure helper `src/lib/interview/ticks.ts`
(`tickEvents`) is the one piece of real decision logic the timer effect needed — which events a
wall-clock delta produces given what the mic is doing — kept out of the component and unit-tested
in isolation, same pattern as the rest of `src/lib/interview/`.

Invoked the `frontend-design` skill before building the new phase-control UI (status readout,
confirm button, override row), per this repo's blanket UI rule. Design call: `--signal` (the one
accent color, reserved site-wide for "you are being recorded" per `globals.css`) is *not* reused
for the override row — reusing it would dilute its one established meaning. Overrides are instead
distinguished by size/weight (small, peripheral buttons vs. the large central push-to-talk
control) and a plain-stated cost ("Skipping is not blocked. It is scored."), not color.

- `qa`: all criteria pass — 111 tests, clean typecheck/lint/build, soft-gate behavior confirmed
  (override row is disabled only while `busy`, never by phase, matching `PLAN.md` §4). Explicitly
  flagged what it could not verify: no component test infra exists (deliberate repo policy — see
  `vitest.config.mts`) and no headless-browser tool was available in this environment, so the
  rendered UI and the real record→transcribe→turn flow were not exercised end-to-end.
- `code-reviewer`: found and fixed two real bugs before commit — (1) **High**: `TRANSCRIPT_RECEIVED`'s
  `durationMs` was measuring recording time *plus* the transcription network round-trip, since the
  stop timestamp was read after `await`ing the whole `/api/transcribe` chain instead of at
  `recorder.stop()` time. Fixed by capturing the stop timestamp synchronously before the async
  chain begins. (2) **Medium**: the tick-delta clamp only capped the high end
  (`Math.min(..., 5_000)`), not the low end — a backward system-clock adjustment (NTP sync) could
  produce a negative delta that the reducer would add unconditionally, running the visible session
  clock backward. Fixed with `Math.max(0, ...)`. Also added a scoped `aria-live="polite"` to just
  the phase-name status item (not the whole strip, which would otherwise chatter every second as
  elapsed time ticks) — flagged as an unconsidered accessibility gap, not a hard bug.
- Tried to get an automated screenshot via the `run` skill; `chromium-cli` isn't installed in this
  environment and installing a full Playwright/Chromium stack was judged out of scope for this
  slice. **Manual browser verification is still owed** — see Next session.

### Phase 2, slice 1: the pure interview phase reducer
Built per the approved plan (`docs/PLAN.md` §5, `docs/ARCHITECTURE.md` §9). Two decisions were
made explicitly with the user during planning, both affecting the two metrics `PLAN.md` §6 calls
"the product":

- **`realIdea: boolean` added to `SignalsSchema`** (`src/lib/schemas/turn.ts`), a deliberate
  deviation from `ARCHITECTURE.md` §7's original sketch. Recovery time is "bail-out to next real
  idea"; inferring it from `bailedOut` alone going false would let a hedge like "hmm, let me
  think" falsely stop the recovery clock. Now recorded in `ARCHITECTURE.md` §7.
- **Each refusal counts as its own bail-out; recovery is measured once per stall.** Three "I
  don't know"s in a row is three bail-outs, one recovery span, timed from the first refusal to
  the next `realIdea` signal. Implemented as a `Stall` log in `InterviewState`, not a bare
  counter, so `bailOutCount`/`recoveries` (`src/lib/interview/selectors.ts`) derive from it rather
  than risking drift. Now recorded in `ARCHITECTURE.md` §9.

New files: `src/lib/schemas/phase.ts` (the canonical `Phase` vocabulary, in `schemas/` since
`signals.suggestPhase` needs it too), `src/lib/interview/{phases,reducer,selectors}.ts` plus
`.test.ts` alongside each. `TurnResultSchema` is deliberately **unchanged** — `SignalsSchema` is
defined but not wired into the live API contract, since no persona emits it until Phase 3; wiring
it now would fail every live parse.

Soft gates (`PLAN.md` §4) are structural, not a rule the caller has to remember: `PHASE_CONFIRMED`
and `OVERRIDE_USED` both funnel through one internal classifier that always commits the
transition and logs an override when it skipped a phase, contradicted the model's suggestion, or
was explicit — so a UI cannot launder a skip by picking the gentler event.

- `qa`: all 6 acceptance criteria pass, including a full command run (`npm test`/`typecheck`/
  `lint`/`build`) and independent confirmation of the two planning decisions in the code, not just
  the tests.
- `code-reviewer`: clean, no correctness/security/purity issues. Two minor findings, both fixed
  before commit: (1) the plan asked for "a hand-written skip matrix" but only one skip length was
  tested — added a single-phase skip and the maximal `intro→debrief` skip as an `it.each` table;
  (2) `ARCHITECTURE.md` §7/§9 hadn't been updated to record the two planning decisions, despite
  the plan's own "Carried forward" section calling that out — done.

## Earlier this session (2026-09-10)

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
- **Owed from slice 2: manual browser verification.** Nothing automated exercised the actual
  rendered UI. Open `/session` (dev server: `npm run dev`) and confirm: the status strip appears
  and elapsed time visibly advances; "Continue to..." advances the phase with the override count
  staying flat; an override-row button jumps straight to that phase and the override count
  increments; the push-to-talk button disables once `debrief` is reached. If a headless-browser
  tool becomes available in a future environment, consider `/run-skill-generator` to capture this
  as a repeatable project skill instead of re-deriving it each time.
- **Phase 2, slice 3 (or Phase 3 directly — pick based on where the last session left off).** The
  reducer and its UI wiring are both done; `SIGNALS_RECEIVED`/`HINT_OFFERED`/`CODE_CHANGED`/
  `CODE_PASTED` are still unwired because nothing produces them yet. The next real functional gap
  is Phase 3 — the interviewer's persona — which is what will finally make `SIGNALS_RECEIVED` mean
  something. `PLAN.md` itself flags Phase 3 as the hardest to unit-test and the one most likely to
  be rushed; budget real sessions for prompt-tuning, not just code.
- **Needs `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) to make real progress.** Wiring more events is
  possible key-free, but Phase 3 is fundamentally about tuning persona behavior against live model
  replies — that can't be faked with a stub. Check whether the key has landed in `.env.local`.
- **If Phase 1's live keys now exist** (see Open / carried forward above): run the two
  verification steps there — they're still open and are the actual point of that phase — but they
  do not block Phase 2/3 from continuing.
- Gate: `qa` → `code-reviewer` before the slice counts as done
