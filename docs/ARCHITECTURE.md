# Interview Loop — Architecture

How [PLAN.md](PLAN.md) gets built. That document settles *what* and *why*; this one settles
*how*: module boundaries, API shapes, library choices, data schema, and the build order.

**Guiding constraint: smallest thing that is production-quality.** One deployable Next.js app,
no separate backend, no database server, no container. Every dependency below earns its place;
where a lighter option was rejected, the reason is stated.

## 1. Inherited Constraints

Settled in `PLAN.md` and `CLAUDE.md`. The architecture serves these; it does not revisit them.

- **Nothing executes.** No sandbox, no Judge0, no Pyodide, no generated test cases.
- **The editor is deliberately bare.** No autocomplete, no linting, no error squiggles.
- **Gates are soft.** The agent resists; the user can always override; overrides are logged.
- **No praise mid-session.** No canvas. Push-to-talk in, text out.
- **Never store problem text.** Metadata and links only; pasted problems stay in memory.
- **Bail-out count and recovery time are the product.** Every component serves them.

## 2. Stack

| Concern | Choice | Why not the alternative |
|---|---|---|
| App | Next.js App Router + TypeScript | API routes remove the need for a second deployable |
| LLM | `claude-sonnet-5` | See §5 — including one capability this costs us |
| STT | Deepgram Nova-3 (batch) | Native WebM/Opus + keyterm prompting; see §4 |
| Editor | CodeMirror 6, hand-assembled | Monaco fights minimalism; see §3 |
| Storage | Dexie.js + PapaParse | See §11 |
| Tests | Vitest | Matches `PLAN.md` |

Runtime target is Chrome only, by choice — `MediaRecorder` and the File System Access API both
assume it.

## 3. Frontend

**Visual design goes through the `frontend-design` skill.** Any session that builds or reshapes
UI — Phases 1, 5, 6 and 7 — invokes it before writing components. This app's look is not
incidental: a warm, friendly, rounded interface actively undermines a product whose entire
mechanic is pressure and blankness. The skill exists to stop the UI defaulting to a templated
dashboard aesthetic, and the interviewer's coldness has to be visible, not just textual.

Single route, `/session`. One React tree, one reducer, no client-side router, no global state
library — the session *is* the state, and it lives in one reducer (§4).

```
<SessionPage>
  <Clock/>            visible, never pauses, drives TIMER_TICK
  <PhaseRail/>        current phase + override affordance
  <ProblemPanel/>     title/metadata, or pasted text (memory only)
  <Transcript/>       interviewer + candidate turns, reading-pace reveal
  <PushToTalk/>       hold-to-record; owns MediaRecorder
  <Editor/>           CodeMirror 6, dynamic import, ssr:false
  <DebriefView/>      scores, retry comparison, CSV export button
</SessionPage>
```

**Reading-pace reveal.** The interviewer's text is revealed client-side at a fixed
characters-per-second with a deliberate beat before the first character. This is *simulated*, not
streamed — see §5 for why that is both simpler and better-looking.

**The editor.** CodeMirror 6 is *additive*: autocomplete and linting exist only if imported. That
inverts Monaco's problem, where suppressing IntelliSense takes roughly seven options and some
squiggles [cannot be fully disabled](https://github.com/microsoft/monaco-editor/issues/1681).
Exact extension set — deliberately hand-assembled rather than `basicSetup`, which bundles
`autocompletion()` and `lintKeymap`:

| Extension | Package |
|---|---|
| `lineNumbers()`, `keymap.of(...)` | `@codemirror/view` |
| `history()`, `defaultKeymap`, `historyKeymap` | `@codemirror/commands` |
| `indentOnInput()`, `bracketMatching()` | `@codemirror/language` |
| `python()` | `@codemirror/lang-python` |

No `autocompletion()`. No `lintGutter()`. **No highlight theme** — the Python grammar still drives
indentation, but nothing is colored, which is closer to a whiteboard than to an IDE.

~210 KB gzipped. Requires `dynamic(() => import(...), { ssr: false })` — it touches `navigator`
at module scope. An `onPaste` handler flags pasted solutions; that feeds a scored dimension, so
it is worth the five lines.

A plain `<textarea>` was considered and rejected: ~180–280 lines of custom gutter, scroll-sync and
Python indent heuristics to reimplement badly what CodeMirror does correctly.

## 4. Backend

Four route handlers, all **Node runtime** (the Anthropic and Deepgram SDKs need it; none of this
runs on Edge).

| Route | In | Out |
|---|---|---|
| `POST /api/transcribe` | `multipart/form-data` audio blob | `{ text, confidence }` |
| `POST /api/presolve` | `{ title }` or `{ problemText }` | `PreSolveNotes` (§7) |
| `POST /api/turn` | `{ phase, history, elapsedMs, hintLevel, notes }` | `{ reply, signals }` (§7) |
| `POST /api/score` | `{ transcript, code, events }` | `Scorecard` (§7) |

**Audio path.** Chrome's `MediaRecorder` emits **WebM/Opus**, ~800 KB per 60 seconds. That sits
comfortably under Vercel's **4.5 MB** request body cap, so the blob posts directly — no Blob
store, no presigned URL detour. Deepgram accepts WebM/Opus natively, so there is **no ffmpeg
transcode step**. This is the concrete reason to prefer Deepgram over OpenAI Whisper here, whose
Opus support is undocumented and would force a server-side WebM→MP3 conversion.

**Keyterm prompting.** Deepgram accepts 20–50 boosted terms per request at no latency cost. A
static list — `hashmap`, `memoize`, `two pointers`, `dp`, `nums`, `lo`, `hi`, `O of n log n` —
ships with the app. See §13 for why this is the riskiest unverified assumption in the design.

## 5. LLM Integration

**Model: `claude-sonnet-5` for every call**, with `output_config.effort` as the cost lever:
`low` for per-turn replies, `high` for pre-solve and scoring.

### The capability this choice costs

Sonnet 5 **does not support mid-conversation `role: "system"` messages** — the operator channel
that would be the natural home for "you are now in the Optimize phase, nine minutes remain."
Volatile state therefore rides in a **user-turn text block** instead.

Two honest consequences:

- **It is spoofable in principle.** Irrelevant here — one user, one device, nobody else writes to
  the transcript — but this pattern should not be copied into a multi-user product.
- **The Opus 5 upgrade path stays cheap.** All volatile-state injection goes through a single
  helper (`lib/llm/injectState.ts`). Switching to Opus 5 later changes that one function, not the
  call sites.

### No streaming

Interviewer replies are two sentences. `max_tokens` is small, so HTTP timeouts — the usual reason
to stream — do not apply. Every turn is one **non-streaming** `client.messages.parse()` call
returning reply text *and* structured signals together.

This is strictly better here. Real token streaming is bursty and arrives faster than reading
pace; a client-side reveal gives the deliberate, even cadence `PLAN.md` §4 asks for. One call,
both payloads, better rendering.

Pre-solve and scoring are also non-streaming, with a raised `maxDuration` (§12).

## 6. Prompt Architecture

The interviewer must know the clock, the phase, and the hint count. All three change every turn.

**The trap:** prompt caching is a *prefix match*. Interpolating the clock into the top-level
`system` prompt changes the prefix ahead of the entire conversation, re-processing every prior
turn uncached — **on every single turn**. On a 20-turn session that is the difference between a
cheap session and a pointlessly expensive one.

Three layers, ordered by volatility:

| Layer | Content | Placement | Cached |
|---|---|---|---|
| 1. Frozen | Persona, phase rules, scoring definitions, escalation ladder | Top-level `system` | Yes, `ttl: "1h"` |
| 2. Per-session | Pre-solve notes | Second `system` block | Yes, session lifetime |
| 3. Volatile | Clock, phase, hint level, override count | User-turn block, **after** history | No — and must not be |

**Rule: nothing dynamic ever enters layers 1 or 2.** No `Date.now()`, no session ID, no counts.

Verified, not assumed: dev asserts `usage.cache_read_input_tokens > 0` from turn two onward. Zero
across repeated turns means a silent invalidator crept into the prefix.

## 7. Validation

One Zod schema per structured call, in `lib/schemas/`. Each schema is simultaneously the API
contract, the runtime validator, and the TypeScript type — no separate validation layer, no
hand-written interfaces that can drift.

```ts
// lib/schemas/turn.ts
export const TurnResult = z.object({
  reply: z.string(),
  signals: z.object({
    bailedOut: z.boolean(),
    suggestPhase: PhaseEnum.nullable(),
    hintLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    complexityStated: z.boolean(),
    complexityCorrect: z.boolean().nullable(),
    edgeCaseRaised: z.boolean(),
  }),
});
```

Called via `client.messages.parse()` with `zodOutputFormat(TurnResult)` in `output_config.format`.

**`parsed_output` is `null` when parsing fails — guard it, never assert it.** Model output is
untrusted input (`.claude/rules/security.md`); a failed parse degrades to a generic interviewer
prompt rather than throwing into the UI mid-session.

Same pattern for `PreSolveNotes` (approach, complexities, key insight, common wrong turns, edge
cases) and `Scorecard` (the nine dimensions from `PLAN.md` §6, plus overrides and hints by level).

## 8. Code Execution Strategy

**There is none, and that is the design.** No sandbox, no container, no Judge0/Piston, no
in-browser Pyodide, no generated test cases. Settled in `PLAN.md` §2 and §9.

Correctness is established three ways instead: the model reads the code holding the pre-solve
notes (which is what a real interviewer does), the hand-trace makes the candidate predict the
output before moving on, and the debrief links to LeetCode for actual ground truth after the
session.

**Consequences for this document.** The sandboxing rule in `.claude/rules/security.md` is
**inert in v1** — there is no untrusted execution to contain. It stops being inert the moment
anyone reintroduces execution.

**The seam, if it ever returns.** It belongs at the debrief boundary, never in the interview loop,
and it is a client-side concern: a `CodeRunner` interface with a single `run(code, cases)` method,
implemented over in-browser WASM. Nothing candidate-authored should reach the server, which keeps
the app serverless and keeps the security rule satisfied by construction.

## 9. Interview State Machine

`lib/interview/reducer.ts` — pure, synchronous, zero imports from React or any UI module.
`PLAN.md` §5 notes the original draft conflated two different things; the split is structural
here.

**The reducer owns state.** Current phase, elapsed time, bail-out count, recovery timers, hint
level, override log, silence duration.

**The model owns judgment.** Whether an answer was good enough to advance, whether an utterance
was a bail-out, whether a stated complexity was right. These arrive as `signals` (§7) and enter
the reducer as ordinary events.

```
Events: TRANSCRIPT_RECEIVED | SIGNALS_RECEIVED | TIMER_TICK | SILENCE_TICK
      | OVERRIDE_USED | HINT_OFFERED | CODE_CHANGED | CODE_PASTED | PHASE_CONFIRMED

Phases: intro → clarify → bruteForce → optimize → complexity → code → handTrace → debrief
```

Derived, not stored: `shouldOfferHint` (≥3 min without progress), `shouldInterrupt` (≥45 s
unproductive speech), `isRecovering` (bail-out seen, no real idea yet). Keeping these derived
means they are testable as pure functions of state, and it keeps the timing thresholds in one
place.

The reducer never calls the network. `/api/turn` is invoked by the page; its result dispatches an
event. This is what makes every transition unit-testable without mocking an LLM.

## 10. Testing Strategy

Three tiers, because the three parts of this app fail in completely different ways.

**Tier 1 — Pure unit (Vitest).** The reducer, hint-gate timing, interrupt threshold, scoring
arithmetic, CSV escaping. Fast, deterministic, exhaustive. Every transition and every event.

**Tier 2 — Transcript fixtures.** The interviewer's persona cannot be asserted on exact wording —
that would test the model's phrasing, not its behavior. Instead: recorded real sessions stored as
JSON, replayed through the persona, asserting on **`signals`**. "Given a transcript where the
candidate says *I don't know*, `bailedOut` is true and the reply does not advance the phase."
These are evals, not unit tests: they cost API calls, run on demand rather than on every commit,
and are allowed to be occasionally flaky.

**Tier 3 — Manual session.** Whether it *feels* like pressure is not automatable. `PLAN.md` §8
budgets real sessions for tuning Phase 3, and that is the honest answer.

Deliberately absent: browser E2E. Microphone permissions and Chrome-only APIs make Playwright
expensive here, and it would test the framework more than the product.

## 11. Persistence

### Session records — Dexie.js

Dexie over raw IndexedDB or `idb` (31 KB vs ~1.2 KB) buys schema versioning and indexed queries.
The retry queue and topic heatmap both need real queries, and a v1 schema *will* need migrating.

```ts
db.version(1).stores({
  sessions: "++id, sessionDate, topic, needsReview, [topic+sessionDate]",
});
```

Every field is JSON-serializable with **ISO date strings, never `Date` objects** — that is what
makes a later Supabase migration a copy rather than a transform. Stored per session: date,
problem slug, topic, difficulty, the nine dimensions, overrides, hints by level, elapsed per
phase, `needsReview`, and the agent-written **approach summary**. Not the code (`PLAN.md` §7).

`navigator.storage.persist()` is called once on init — cheap insurance against LRU eviction under
storage pressure. It does not protect against manual clearing, so the debrief carries a plain
warning that this data is local.

### CSV mirror — and the open risk in PLAN.md, now closed

`PLAN.md` §10 flags File System Access permission persistence as unverified. **It works, with
conditions.** Chrome 122+ shows a three-option dialog; **"Allow on every visit" survives a browser
restart**, "Allow this time" does not. Handles are structured-cloneable, so the handle is stored
in IndexedDB and reused.

Two mechanics that cause **silent data loss** if gotten wrong:

- **`createWritable()` truncates by default.** Appending requires
  `createWritable({ keepExistingData: true })` followed by `seek(file.size)`.
- **`requestPermission()` requires a user gesture.** It cannot run from a timer or a bare promise
  chain — so "auto-append after every session" is not achievable unattended.

The design adapts rather than fights this: **the CSV write is attached to a button on the debrief
screen.** That is a real user gesture at exactly the moment the data is ready, and it costs one
click. IndexedDB remains the source of truth, so a denied or lapsed permission loses nothing.

CSV generation uses **PapaParse `unparse()`** (RFC 4180). The approach summary is free text that
will contain commas and quotes; naive `join(",")` corrupts it. Written **UTF-8 without BOM** — a
BOM helps Excel on Windows but breaks Google Sheets imports.

## 12. Deployment

Vercel, one project, `main` auto-deploys. Node runtime on all four routes. `maxDuration` raised
for `/api/presolve` and `/api/score`; the default 30 s is enough for turns but tight for a
high-effort scoring pass over a full transcript.

Environment: `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`. Server-side only — **never** `NEXT_PUBLIC_`.

## 13. Security

The rules in `.claude/rules/security.md`, applied to what this app actually does:

- **Keys are server-side only.** Both SDKs are called from route handlers. Nothing reaches the
  browser.
- **Model output is untrusted.** Everything structured passes a Zod schema before use; a `null`
  parse degrades gracefully (§7).
- **Problem text is never persisted.** Pasted problems live in React state for the session and are
  gone on reload. `problems.json` holds metadata and links only.
- **Sandboxing is inert in v1** — nothing executes (§8).

**One risk `PLAN.md` does not cover.** A public Vercel deployment makes `/api/turn` an
**unauthenticated internet endpoint that spends your Anthropic and Deepgram budget.** The repo is
public, so the URL is discoverable. Mitigation is required **in Phase 0, before the first
deploy** — Vercel Deployment Protection, or a shared-secret header checked by every route
handler. Not a later hardening pass.

## 14. Cost

Rough per-session arithmetic at Sonnet 5 ($2/MTok in, $10/MTok out; cache reads ~0.1×) and
Deepgram ($0.0043/min), for ~20 turns:

| Item | Estimate |
|---|---|
| 20 turns — cached prefix reads | ~$0.01 |
| 20 turns — uncached history + output | ~$0.06 |
| Pre-solve (1 call, high effort) | ~$0.01 |
| Scoring (1 call, full transcript) | ~$0.04 |
| Deepgram (~13 min of speech) | ~$0.06 |
| **Per session** | **~$0.18** |
| **Monthly, one session/day** | **~$5–6** |

Three levers, in order of leverage:

1. **Prompt caching (§6).** The single biggest factor. A broken cache prefix multiplies the LLM
   cost several times over and does it invisibly — hence the `cache_read_input_tokens` assertion.
2. **`effort: "low"` on turns.** Adaptive thinking bills as output tokens. A terse two-sentence
   interviewer has no use for deep reasoning per turn; pre-solve and scoring do.
3. **Terseness is free money.** The persona's two-sentence limit is a product requirement that
   happens to be the cheapest possible output profile.

Treat these as estimates to re-measure in Phase 1, not as a budget.

## 15. Build Order

Vertical slices, each ending merged to `main`. **Every phase ends with the same gate — it is part
of the plan, not something to request:**

> **Gate:** `qa` verifies against the acceptance criteria → `code-reviewer` reviews the diff
> independently → fix findings → commit → update `docs/PROGRESS.md`.

Give `code-reviewer` the diff, not a summary of it — the review is meant to be independent of the
session that wrote the code.

Phases that build UI (1, 5, 6, 7) additionally **invoke the `frontend-design` skill before writing
components** (§3).

### Phase 0 — Foundations
Next.js + TypeScript + Vitest, ESLint, GitHub Actions (lint, typecheck, test on PR), Vercel deploy.

- CI passes on a trivial PR
- **The deployment is not publicly callable** (§13)
- **Real build/lint/test commands recorded in `CLAUDE.md`**, which currently states none exist

### Phase 1 — Push-to-talk + STT accuracy spike
`MediaRecorder` → `/api/transcribe` → `/api/turn` → rendered reply. One hardcoded problem, no
phases.

- A spoken round-trip works end to end
- **The spike:** ~10 recorded clips of real spoken explanations, transcribed raw and with the
  keyterm list, **word error rate on technical terms recorded in this document**
- Blob size confirmed under the 4.5 MB cap

*Why this is a spike and not a task: transcription accuracy feeds every downstream score, and
there is no published benchmark for programming jargon. The keyterm evidence is Deepgram's own
blog showing **confidence** gains on medical vocabulary — and confidence is not accuracy. Measure
before building on it.*

### Phase 2 — Phase reducer
`PLAN.md` §5 as a pure reducer.

- Unit tests cover every transition and every event type
- `reducer.ts` imports nothing from React or any UI module

### Phase 3 — The interviewer's teeth
The persona: refuses "I don't know", escalates, interrupts, stays terse, never praises.

- Escalation ladder fires on a bail-out instead of advancing
- Interrupt triggers at ~45 s of unproductive speech
- Clock visible; agent references it
- Soft-gate overrides logged
- Judged on transcript fixtures asserting `signals`, **not exact wording** (§10)

*`PLAN.md` §8 calls this the highest-value phase and the one most likely to be rushed. Budget real
sessions for tuning; a persona prompt does not land first try.*

### Phase 4 — Pre-solve + hints
Private notes; three graduated hint levels, proactive at ~3 min.

- Agent catches a deliberately wrong complexity
- Hints fire unprompted and are logged with level
- **`cache_read_input_tokens > 0` from turn two** (§6)

### Phase 5 — Editor + hand-trace
CodeMirror 6 minimal config; prediction step before advancing.

- Full session runs end to end
- **No autocomplete, no lint gutter, no highlight theme present** — verified by inspection
- Paste events flagged

### Phase 6 — Scoring + debrief
All nine dimensions extracted; debrief rendered.

- A fixture transcript with known expected values scores correctly on all nine
- A `null` parse degrades gracefully rather than throwing

### Phase 7 — Tracking
Dexie schema, log, bail-out trend, retry queue, topic heatmap, CSV export.

- A bailed-out problem resurfaces after 7 days with an old-vs-new comparison
- **CSV append survives a browser restart** — the permission path in §11 verified by hand
- Appending does not truncate the existing file

### Phase 8 — Problem library
NeetCode 150 metadata, picker, paste-your-own.

- Session starts from either source
- Pre-solve states the problem back before the clock starts
- **No problem text written to disk** — verified by inspecting IndexedDB and the CSV

## 16. Open Questions

- **STT accuracy on technical speech** — unverified, and Phase 1's spike exists to close it. If
  keyterm prompting underdelivers, the fallback is OpenAI `gpt-4o-transcribe` (lower published
  WER, but needs a server-side transcode) behind the same `Transcriber` interface.
- **`requestPermission()` inside a debounced handler** — unverified whether deferred user
  activation still counts. Attaching the CSV write to a direct click avoids the question entirely,
  which is why the design does that.
- **Whether `effort: "low"` degrades the interviewer's judgment.** Cheapest lever, but it trades
  the exact quality the product depends on. Measure in Phase 3 before treating it as settled.
