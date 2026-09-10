# Interview Loop — Development Plan

A web app that runs a ~25–30 minute mock technical interview. You speak, it types back, and it
will not let you quit on a problem.

> This plan replaces the original draft. Nearly every major decision changed; see
> [§9 What Changed](#9-what-changed-and-why) for the diff and the reasoning.

## 1. The Problem This Solves

**Not** "I skip interview structure." The actual failure, in the user's words:

> "I got asked a question, I attempted to answer it and I straight up said I don't know — I
> couldn't even think through it."

That is a **bail-out**: the moment you stop trying and announce it, handing the problem back to
the interviewer.

Being stuck is not a bail-out. Everyone is stuck for most of a hard problem. Bailing out is what
you do *with* being stuck:

| | |
|---|---|
| **Bail-out** | "I don't know. I've never seen this one." |
| **Not a bail-out** | "I don't have the efficient version yet. Brute force is check every pair, O(n²). The inner loop is a lookup — I'm trying to see if I can precompute that." |

Both are "I haven't solved it." The second gets you hired: it stays inside the problem,
externalizes where the search is, and gives the interviewer something to grade. **Interviewers can
only score what you say**, so a bail-out scores zero.

There is a second, related difficulty. The user thinks on pen and paper, so speaking an
unconverged idea means serializing a thought that isn't finished yet — and the instinct is to go
quiet until it *is* finished. The skill being trained is **narrating a search, not narrating a
solution**.

**Every mechanic in this document serves bail-out recovery.** If a feature does not make the user
better under pressure or clearer in their spoken reasoning, it does not belong in v1.

## 2. Goals / Non-Goals

**Goals (v1)**
- Rehearse pressure: an interviewer that refuses to accept "I don't know."
- Force spoken reasoning before and during code.
- Measure bail-out count and recovery time, and show them falling over weeks.
- Resurface the problems that broke you, so practice compounds instead of accumulating.

**Non-goals (v1)** — each was actively considered and cut, not merely deferred:
- **Code execution of any kind.** No sandbox, no Judge0/Piston, no in-browser Pyodide. Real
  interviewers read your code rather than running it; the model reads it holding the pre-solve
  notes. LeetCode's own submit button is the ground truth, after the session.
- **A drawing canvas.** Pen and paper stays, and the agent is blind to it — which matches remote
  interviews, where the interviewer cannot see your scratch paper.
- **Agent text-to-speech.** Free browser TTS is a later toggle, not v1.
- Multiple users, accounts, cross-device sync, native or mobile app, VS Code extension.

## 3. Architecture

- **Framework:** Next.js (React + TypeScript). API routes are the backend.
- **Ship target:** web app. Real remote interviews happen in a browser; mic access is native; no
  install or extension review for an audience of one. A VS Code extension would hand you
  autocomplete, linting and your own keybindings — the opposite of interview conditions.
- **Voice in:** push-to-talk. Hold to record, release, upload the audio blob, batch-transcribe.
  The interview is turn-based, so **streaming STT is not needed** — which also sidesteps Chrome
  Web Speech's ~60s session cap and silence auto-stop, the thing that would otherwise cut you off
  mid-explanation. The couple-second delay after release is realistic; interviewers pause.
- **Voice out:** none in v1. The agent types.
- **Interview brain:** Gemini by default (a genuine free tier, unlike Claude), Claude as a
  fallback behind the same interface (`LLM_PROVIDER` env var) — see `docs/ARCHITECTURE.md` §5.
  Called server-side from a Next.js API route so no provider's key ever reaches the browser.
- **Editor:** a bare text surface. Monospace, line numbers, bracket matching at most.
  **No autocomplete, no linting, no error squiggles** — those make you look competent in VS Code
  and helpless in an interview. Nothing executes.
- **Problems:** the model's own knowledge of the NeetCode 150, which is popular enough to
  reconstruct reliably from a title. The pre-solve states the problem back to you at session start
  so you catch a misremembered variant before wasting a session. Paste-your-own is the fallback,
  held in memory for that session only. `problems.json` holds metadata and links —
  **never problem text** (copyright).
- **Storage:** IndexedDB as source of truth, auto-appending to a local CSV via Chrome's File
  System Access API. Supabase is the right move the day this needs to be on a phone, and not
  before; the CSV makes that migration trivial.

```
Browser (mic, editor, clock)
   |  hold-to-talk -> audio blob
   v
POST /api/transcribe --------> batch STT
   |  text
   v
Phase reducer (pure, unit-tested)
   |  POST /api/interview-turn  { phase, transcript, notes }
   v
Next.js API route -> Claude API (interviewer persona + phase rules + pre-solve notes)
   |  terse text reply
   v
Rendered at reading pace -> session log -> IndexedDB -> CSV mirror
```

## 4. The Interviewer

The behavior *is* the product. Ranked by how much each contributes:

1. **Never accepts "I don't know."** Escalates instead: *"What would you try first, even if it's
   terrible?"* -> *"Forget efficiency — how would you do this by hand for five elements?"* ->
   hint. This is the single most important behavior in the app.
2. **Interrupts.** If you ramble past ~45 seconds without landing anything, it cuts in. The most
   authentically interviewer-like mechanic available, and it costs nothing.
3. **Zero praise mid-session.** No "good point," no "exactly." The blankness is the pressure.
4. **Terse.** Two sentences. A warm, thorough, helpful wall of text destroys the illusion faster
   than anything else.
5. **Interrogates constantly** — "what's the time complexity of that?", "why a dict there?",
   "what happens on an empty input?" Presence without evaluation: a real interviewer is highly
   engaged while revealing nothing about how you're doing.
6. **Text arrives at reading pace**, with a beat before it — never an instant dump.
7. **Visible clock that never pauses.** The agent references it: *"About ten minutes left — can
   you get something coded?"*

### Soft gates, not hard blocks

The original design blocked phase transitions. That was wrong. A real interviewer never physically
stops you from skipping to code — they let you, and it sinks your feedback. The failure being
trained is the *choice* under pressure, so removing the choice never exercises the muscle. A hard
gate is also trivially gamed: "is the array sorted?" satisfies "ask at least one clarifying
question" and teaches nothing.

**So: the agent resists, you can override, and every override is logged and counted against you in
the debrief.** This is also the only version that produces the metric — an override is a countable
event, where a hard gate would pin it at zero forever.

### Hints

Three graduated levels, **offered proactively at ~3 minutes of no progress** — not on request.
Real interviewers volunteer a nudge rather than waiting to be asked, partly because a totally
stuck candidate generates no signal. Waiting 5 minutes in a 25-minute session is dead air, not
pressure.

| Level | Shape |
|---|---|
| 1 | Reframing question — *"What's the input actually shaped like?"* |
| 2 | Names the territory — *"Think about what you'd want to cache."* |
| 3 | Gives the insight outright |

Every hint is logged with its level. Needing level 3 twice reads very differently from a level 1
unsticking you.

### Pre-solve

One call before the session opens generates the interviewer's private notes: optimal approach,
correct complexities, the key insight, common wrong turns, edge cases people miss. Cached and fed
as hidden context.

This is the difference between an interrogator and a chat partner. Without it the agent may accept
a wrong complexity, miss a better approach, or fail to spot the trap you walked into. It is also
what makes reading your code — rather than running it — trustworthy.

## 5. Session Flow

**~25–30 minutes**, one continuous session.

| Phase | What happens |
|---|---|
| Intro | Pre-solve states the problem back; clock starts |
| Clarify | You ask questions; agent answers or says "assume X" |
| Brute force | You state a working-but-slow approach out loud |
| Optimize | You improve it; agent probes weak spots |
| Complexity | Time and space, ideally volunteered before being asked |
| Code | Bare editor. Agent goes quiet unless you ask, or you go silent too long |
| Hand-trace | You walk an example and **predict the output before moving on** |
| Debrief | Scores, what was rushed, LeetCode submit link for ground truth |

Phase transitions live in a **pure, unit-testable reducer** with no UI coupling. Note the
division of labor: the reducer tracks state, but *whether an answer was good enough to advance* is
a model judgment, not reducer logic. The original plan conflated these.

**Predict-then-verify** survives the cut of execution: you still state what your code outputs
before moving on, and the agent checks it against what it knows the answer to be. Being wrong
about what your own code does is a real and unglamorous weakness that nothing else surfaces.

## 6. Scoring

Every dimension is mechanically extractable from the transcript. **Nothing subjective** —
"communicated clearly" is unscoreable and rots into flattery.

| # | Dimension | Why |
|---|---|---|
| 1 | **Bail-out count** | The headline. How often you handed the problem back |
| 2 | **Recovery time** | From bail-out to your next real idea after being pushed |
| 3 | Silence during search | Longest and total gap while visibly working |
| 4 | Brute force before optimizing | Yes/no |
| 5 | Complexity volunteered unprompted | vs. only after being asked — a big signal |
| 6 | Complexity correct | Separate from whether you said it |
| 7 | Edge cases raised unprompted | Count |
| 8 | Code matched described approach | Describing a hashmap then writing nested loops is common |
| 9 | Prediction matched actual | From the hand-trace |

Plus overrides used, and hints used by level.

**Dimensions 1 and 2 are the product.** Session one might be four bail-outs at 90 seconds
recovery. Watching that fall is the entire point; everything else is a footnote.

## 7. Tracking

The payoff, and therefore core — not the "Phase 4" afterthought it was in the original plan.

- **Session log** — one row per session: date, problem, topic, difficulty, all nine dimensions,
  overrides, hints by level, and an **agent-written summary of your approach**. *Not your code* —
  "hashmap of complements, one pass, O(n)/O(n), got there after one level-2 hint" is what you'd
  actually reread three weeks later.
- **Bail-out trend** — one line chart over time. The headline graph.
- **Retry queue** — any problem you bailed out on returns after 7 days, and the debrief shows old
  vs. new side by side: *"Last time: 3 bail-outs, 94s recovery. Today: 1, 20s."* This is the
  mechanism by which practice compounds; without it you are accumulating rows.
- **Topic heatmap** — bail-out rate by topic. Discovering you are fine on arrays and freeze on
  graphs directs practice far better than "do 150 problems."
- **CSV export/mirror** — the log as a spreadsheet, appended automatically.

Later, cheaply, once the log has data: weakness-of-the-week, and a warm-up card showing your last
debrief for ten seconds before a new session starts.

## 8. Build Order

Each phase ends in something merged to `main` and actually usable.

| # | Phase | Definition of Done |
|---|---|---|
| 0 | Foundations — Next.js + TS + Vitest, CI (lint/typecheck/test), deploy | Empty app deploys; CI passes on a trivial PR |
| 1 | Push-to-talk loop — record, transcribe, Claude, text reply; one hardcoded problem, no phases | You can hold a spoken conversation about one fixed problem |
| 2 | Phase reducer — §5 as a pure reducer; interviewer persona and phase rules server-side | Unit tests cover every transition; agent resists skipping ahead |
| 3 | **The interviewer's teeth** — refuses "I don't know", interrupts at ~45s, terse, no praise, clock, soft-gate overrides | A session *feels* like pressure; overrides are logged |
| 4 | Pre-solve + hints — private notes; 3 levels, proactive at ~3 min | Agent catches a deliberately wrong complexity; hints fire unprompted |
| 5 | Editor + hand-trace — bare surface, prediction step | Full session runs end to end |
| 6 | Scoring + debrief — all nine dimensions extracted | Debrief on a real session is specific, not generic |
| 7 | Tracking — IndexedDB, log, trend, retry queue, heatmap, CSV mirror | A bailed-out problem resurfaces after 7 days with a comparison |
| 8 | Problem library — NeetCode 150 metadata, picker, paste-your-own | Can start from either source |

**Phase 3 is the highest-value phase and the one most likely to be rushed.** It is also the
hardest to unit-test — budget real sessions for tuning the persona rather than assuming a prompt
lands first try.

Later, if wanted: browser TTS toggle, coach mode (live feedback, deliberately separate from
interview mode so neither is diluted), interviewer personas, Supabase sync, weakness-of-the-week.

Also later, if wanted: suggesting solution videos in the debrief. Needs a content-quality and licensing check before it is more than an idea - a bad or pirated link in the debrief is worse than no link.

## 9. What Changed, and Why

| Original plan | Now | Why |
|---|---|---|
| Full duplex voice, Web Speech both ways | Push-to-talk in, text out | Chrome caps recognition at ~60s and auto-stops on silence — fatal for 30–90s monologues. Turn-based interviews don't need streaming |
| Hard gates, "editor unlocks" | Soft gates, overrides logged | Real interviewers let you hang yourself; a gate removes the choice being trained, and is gamed by "is it sorted?" |
| Six phases as the rubric | Bail-out recovery as the rubric | Phase compliance measures structure. The actual failure is quitting |
| 45 minutes | 25–30 minutes | Personal tool; two focused blocks beat one weeknight slog you skip |
| Monaco + Judge0 sandbox (stretch) | Bare editor, nothing runs | Interviewers read code, they don't run it. Removes sandbox, Docker, and the security constraint entirely |
| Session history at Phase 4 | Tracking is core | The trend and retry queue *are* the payoff |
| localStorage, DB "someday" | IndexedDB + CSV mirror | Losing months of history to a cache clear would be demoralizing |
| — | Hints, pre-solve, retry queue | New; each serves bail-out recovery |
| — | Pen and paper, agent blind | Matches remote interviews; costs nothing to build |

Also considered and rejected: a shared drawing canvas (removes the verbal-translation pressure
being trained; revisit for onsite prep), and in-browser Pyodide execution with a reference solution
and generated test cases (large build serving a secondary goal — model-generated *expected outputs*
are unreliable at volume, and the fix, differential testing against a generated reference, was more
machinery than the goal justified).

## 10. Risks

- **The persona is the whole product and prompt-tuning is unglamorous.** If the agent is warm,
  verbose, or encouraging, none of the rest matters. Phase 3 deserves more time than it looks like.
- **Transcription accuracy on technical speech** — "O of n log n", variable names, "i plus one".
  Worth checking early in Phase 1; a mangled transcript poisons every downstream score.
- **Chrome-only** by choice (File System Access API, mic). Fine for personal use, a blocker if this
  ever ships to others.
- **File System Access permission persistence across browser restarts is unverified.** A stored
  handle plus `requestPermission()` is believed to survive, but confirm before building on it.
  IndexedDB remains the source of truth precisely so this can fail without data loss.
- **Reading code instead of running it can wave through an off-by-one.** Mitigated by the LeetCode
  submit link in the debrief — thirty seconds after the session you know whether it passed.
- **Copyright:** never store full problem text. Metadata and links only; pasted problems stay in
  session memory.
- **API cost** — a spoken interview is many turns, plus one pre-solve call per session.
