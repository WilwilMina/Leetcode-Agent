# Progress

## Current phase
PHASE 2 — PHASE REDUCER (see [ARCHITECTURE.md](ARCHITECTURE.md) §15), slice 1 of N in progress.

**Slice 1 (the pure reducer) is code-complete and gated.** `src/lib/interview/reducer.ts` plus
`phases.ts`/`selectors.ts` implement `PLAN.md` §5 as a pure, synchronous state machine — zero
React/UI imports, zero `Date.now()`. 56 new tests (103 total). `qa` passed all criteria;
`code-reviewer` found two minor gaps (a missing skip-matrix test case, two doc updates), both
fixed. No UI wiring yet — `InterviewSession.tsx` is untouched and still runs on its local
`useState` triad; that's the next slice.

**Phase 1's two acceptance criteria are still open**, carried forward from last session.
`DEEPGRAM_API_KEY` is now real (set since last session), but `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`
are still empty placeholders in `.env.local`, and no WER numbers are recorded in
`ARCHITECTURE.md` §15. The STT spike is unblocked on the Deepgram side and needs ~10 recorded
clips of real spoken explanations — a human task, not something this session can produce.

## This session (2026-09-10, later still)

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
- **Phase 2, slice 2: wire the reducer into `InterviewSession.tsx`.** The reducer exists and is
  fully tested but nothing calls it yet — the page still runs its own local `useState` triad
  (`phase`/`transcript`/`error`, where `phase` is mic status, not interview phase — do not
  conflate the two). This slice replaces that with `useReducer(interviewReducer,
  initialInterviewState)`, dispatches `TRANSCRIPT_RECEIVED`/`TIMER_TICK`/etc. from the existing
  record→transcribe→turn flow, and needs a UI decision for the override affordance
  (`OVERRIDE_USED`) that `PLAN.md` §4 requires be visible and logged. No persona work yet —
  `SIGNALS_RECEIVED` will have nothing real to dispatch until Phase 3, so this slice likely stubs
  it or defers dispatching it.
- **If Phase 1's live keys now exist** (see Open / carried forward above): run the two
  verification steps there — they're still open and are the actual point of that phase — but they
  do not block Phase 2 from continuing.
- Gate: `qa` → `code-reviewer` before the slice counts as done
