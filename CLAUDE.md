# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Interview Loop** — a web app that runs a ~25-30 minute mock technical interview. You speak, it
types back, and it will not let you quit on a problem.

Read [docs/PLAN.md](docs/PLAN.md) before doing anything substantive. It carries the design and,
more importantly, the reasoning behind each decision.

## The one thing to understand

This is not a tool for practising interview *structure*. It targets a specific failure: going
blank under pressure and saying "I don't know" — a **bail-out**. Being stuck is not a bail-out;
announcing it and stopping is.

**Bail-out count and recovery time are the product.** Every feature must make the user better
under pressure or clearer in their spoken reasoning. If a proposed change doesn't, it doesn't
belong in v1.

## Decisions — do not re-litigate

These were settled deliberately. Each is a place where the obvious-looking improvement is wrong;
`docs/PLAN.md` §9 has the full reasoning.

- **Nothing executes.** No sandbox, no Judge0/Piston, no in-browser Pyodide, no generated test
  cases. Interviewers read code rather than running it; the model reads it holding the pre-solve
  notes, and LeetCode's submit button is the ground truth after the session.
- **The editor is deliberately bad.** No autocomplete, no linting, no error squiggles, no Monaco.
  Those make you look competent in VS Code and helpless in an interview.
- **Gates are soft.** The agent resists you skipping ahead; you can always override; the override
  is logged and scored. Hard blocks remove the choice being trained and are trivially gamed.
- **No praise mid-session.** The blankness is the pressure. A warm, helpful interviewer is the
  single fastest way to destroy this product.
- **No drawing canvas.** Pen and paper stays and the agent is blind to it — matching remote
  interviews, where the interviewer cannot see your scratch paper.
- **Voice is push-to-talk in, text out.** Turn-based, so no streaming STT. Browser Web Speech
  recognition is unusable here: Chrome caps a session at ~60s and auto-stops on silence.
- **Never store problem text.** Metadata and links only (copyright). Pasted problems stay in
  session memory.
- **Use the `frontend-design` skill for any UI work.** Invoke it before writing components, not
  after. The interface has to feel cold and high-pressure; a friendly default aesthetic works
  against the product.

## Status: pre-implementation

The stack is decided (below) but **no application code exists yet** — no package manifest, no test
runner, no source directory. Next session starts at Phase 0 in `docs/PLAN.md` §8.

- **There are still no build, lint, or test commands.** Do not guess at one.
- **When Phase 0 lands, record the real commands in this file** — install, dev server, full test
  run, and single-test invocation.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (React + TypeScript), API routes as backend |
| Tests | Vitest |
| Interview brain | Claude API, server-side only |
| Voice in | Push-to-talk, batch transcription |
| Voice out | None in v1 (browser TTS is a later toggle) |
| Storage | IndexedDB, mirrored to a local CSV via the File System Access API |
| Target | Chrome only, by choice |

## Development workflow

@.claude/rules/workflow.md

The loop is deliberately one vertical slice per session, and Plan Mode is not optional — including
for slices that look trivial. A slice is not done until `docs/PROGRESS.md` is updated.

## Security rules

@.claude/rules/security.md

**The sandboxing rule is moot in v1** — nothing executes, by design. It stays in the rules file
because it becomes load-bearing the moment anyone reintroduces code execution, which is itself a
decision listed above as settled.

The rules that do bite: the Claude API key is server-side only, and both problem descriptions and
model output are untrusted input. The pre-solve notes are model-generated and drive scoring, so
validate their shape before use.

## Testing conventions

@.claude/rules/testing.md

## Code style

@.claude/rules/code-style.md

## Subagents

Defined in [.claude/agents/](.claude/agents/), and used at fixed points in the workflow above:

| Agent | Role in the loop |
|---|---|
| `researcher` | Investigate implementation choices, report tradeoffs |
| `qa` | Verify a finished slice against its acceptance criteria |
| `code-reviewer` | Independent review after qa passes, before commit |

`qa` then `code-reviewer` run at the end of every slice — the review is meant to be independent of
the session that wrote the code, so give it the change to review rather than your own summary of it.

## Progress tracking

[docs/PROGRESS.md](docs/PROGRESS.md) is the handoff between sessions and carries the current phase
(now: `PHASE 0 — FOUNDATIONS`). Read it at the start of a session and update it at the end of every slice —
shipped, decided, blocked, and where the next session should start.

## Skills

Skills come from the **user-level `mattpocock-skills` plugin**, not from this repo. Nothing
skill-related is checked in, and there is no `skills-lock.json` or `.claude/skills/` to maintain.

Do not add skills with the `skills` CLI (`npx skills add`). That vendors a copy into `.agents/`
plus a lockfile to keep pinned, and duplicates skills the plugin already ships — `grill-me` among
them. This is a solo project with no cross-tool or multi-developer requirement, so that portability
buys nothing and adds something that can silently break.

## Local settings

`.claude/settings.local.json` is gitignored per-machine config. Project-wide settings meant to be
shared would go in `.claude/settings.json`, which does not exist yet.
