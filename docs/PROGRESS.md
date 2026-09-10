# Progress

## Current phase
PHASE 1 — PUSH-TO-TALK + STT ACCURACY SPIKE (see [ARCHITECTURE.md](ARCHITECTURE.md) §15)

## Last session (2026-09-10)

### Phase 0 — Foundations: COMPLETE
- Shipped:
  - Next.js 16.3.4 + React 19 + TypeScript, App Router, Tailwind v4, ESLint
  - Vitest (`vitest.config.mts`, Node environment — nothing to render yet)
  - CI at `.github/workflows/ci.yml`: lint, typecheck, test, build on every PR and push to main
  - **Deployment access gate** — `lib/auth/access.ts` (pure decision function, 15 tests) applied
    by `proxy.ts`. Fails closed: production with no `APP_ACCESS_SECRET` denies everything
  - `.env.example`; real commands recorded in `CLAUDE.md`
  - Placeholder page replacing create-next-app's Vercel marketing template
- Acceptance criteria: all three verified by `qa` with command output as evidence
- `code-reviewer`: no correctness or security defects; four minor findings, three fixed
  (PROGRESS.md staleness, missing file-header on `app/layout.tsx`, missing fall-through test)
- Decisions made during the slice:
  - `@types/node` bumped ^20 → ^24 to match Node 24 and satisfy Vitest 5, rather than papering
    over the peer conflict with `--legacy-peer-deps`
  - `typecheck` is `next typegen && tsc --noEmit` — Next 16 generates route types that
    `app/layout.tsx` needs and they are not committed, so bare `tsc` fails on a clean checkout
  - `proxy.ts`, not `middleware.ts` — Next 16 deprecated the middleware file convention
  - Gate uses a cookie, not a header: a header secret would have to ship in client JS to let the
    browser call its own API, which defeats the point

## Open / carried forward
- **Not yet smoke-tested against a real deployment.** `npm run build` lists
  `ƒ Proxy (Middleware)` so Next does register the gate, but no request has actually been
  refused in production. Verify on first deploy.
- **`APP_ACCESS_SECRET` must be set in Vercel before the first deploy**, and Vercel Deployment
  Protection enabled if available — the gate is defence in depth, not a replacement
- **STT accuracy on technical speech is unverified** — the Phase 1 spike exists to close it
- Whether `effort: "low"` degrades interviewer judgment — measure in Phase 3

## Next session
- Start here: **Phase 1** — `MediaRecorder` push-to-talk → `/api/transcribe` → `/api/turn` →
  rendered reply, one hardcoded problem, no phase logic yet.
- **The spike is the point of this phase:** record ~10 clips of real spoken explanations,
  transcribe raw and with a Deepgram keyterm list, and write the word error rate on technical
  terms into `ARCHITECTURE.md`. Everything downstream is scored off this transcript.
- UI work goes through the `frontend-design` skill.
- Gate: `qa` → `code-reviewer` before the slice counts as done.
