# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A LeetCode agent that mocks how a real technical interview goes (see [README.md](README.md)).

## Status: pre-implementation

There is **no application code in this repository yet** — no package manifest, no build system,
no test runner, no source directory. What exists is the agent scaffold (`.claude/`), a progress
tracker (`docs/PROGRESS.md`), and the script that generated them (`setup-interview-loop (1).sh`).

Consequences for anyone working here:

- There are **no build, lint, or test commands to run**. Do not guess at one; nothing is wired up.
- The first slices of work will involve *choosing* a stack. That is a decision to make with the
  user in Plan Mode, not to assume.
- **When you do add a toolchain, record its commands in this file** — install, dev server, full
  test run, and single-test invocation. That is the main thing a future session will need and
  cannot discover from an empty repo.

## Development workflow

@.claude/rules/workflow.md

The loop is deliberately one vertical slice per session, and Plan Mode is not optional — including
for slices that look trivial. A slice is not done until `docs/PROGRESS.md` is updated.

## Security rules

@.claude/rules/security.md

The sandboxing rule is load-bearing for this project specifically: the whole point of the app is
executing candidate-authored code, so the execution boundary is a design constraint from the first
slice, not a hardening pass to bolt on later. Problem descriptions and model output are both
untrusted inputs.

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
(now: `REQUIREMENTS`). Read it at the start of a session and update it at the end of every slice —
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
