# Progress

## Current phase
PHASE 0 — FOUNDATIONS (see [PLAN.md](PLAN.md) §8)

## Last session (2026-09-10)
- Shipped:
  - `.claude/` scaffold: rules (workflow, security, testing, code-style), subagents
    (researcher, qa, code-reviewer), `CLAUDE.md`
  - Dropped the `skills` CLI channel — skills come from the user-level `mattpocock-skills`
    plugin; removed a dangling `grill-me` symlink and `skills-lock.json`
  - `PLAN.md` — full rewrite of the original draft after a design interrogation
- Decided (reasoning in [PLAN.md](PLAN.md) §9):
  - The target is **bail-out recovery**, not interview-structure compliance. Bail-out count and
    recovery time are the headline metrics
  - Nothing executes — no sandbox, no Pyodide, no generated test cases. LeetCode submit is the
    ground truth after the session
  - Bare editor, deliberately: no autocomplete, no linting, no Monaco
  - Soft gates with logged overrides, never hard blocks
  - Push-to-talk voice in, text out. Web Speech recognition ruled out (~60s Chrome cap)
  - Session is ~25-30 min; pen and paper stays and the agent is blind to it
  - Tracking (log, bail-out trend, retry queue, topic heatmap) is core, not a later phase
  - Storage: IndexedDB + CSV mirror via File System Access API. Supabase only when this needs
    to be on a phone
  - Stack: Next.js + TypeScript + Vitest, Chrome-only, web app
- Blocked / deferred:
  - File System Access API permission persistence across browser restarts is **unverified** —
    confirm before Phase 7 builds on it
  - Browser TTS toggle, coach mode, interviewer personas, Supabase sync: all post-v1

## Next session
- Start here: **Phase 0.** `npx create-next-app` with TypeScript + ESLint + Vitest, GitHub Actions
  running lint/typecheck/test on every PR, deploy target set up.
- DoD: empty app deploys; CI passes on a trivial PR.
- Then record the real build/lint/test commands in `CLAUDE.md`, which currently says none exist.
