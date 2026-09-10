#!/usr/bin/env bash
# Run this from inside your interview-loop repo, after git init and after
# you've run `claude` + `/init` once. Creates the full .claude/ scaffold
# and docs/ — no application code.
set -e

mkdir -p .claude/rules .claude/agents docs

# ---------- .claude/rules/ ----------

cat > .claude/rules/workflow.md << 'EOF'
# Development workflow
- One vertical slice per session. Do not try to complete a whole phase in one sitting.
- For every slice: Plan Mode first (scoped to the slice, not the whole phase) -> implement ->
  run tests -> qa agent -> code-reviewer agent -> fix issues -> commit -> update docs/PROGRESS.md
- Never skip Plan Mode for a new slice, even a small one
- Course-correct early: if a slice's approach turns out wrong mid-build, stop and re-plan
  rather than pushing through
EOF

cat > .claude/rules/security.md << 'EOF'
# Security
- Model API keys: server-side only, never exposed to the client
- Treat problem descriptions and all model output as untrusted input
- Validate model-generated structured output against a schema before using it
- If candidate code executes, it runs in a sandbox with strict resource/time limits - never
  directly on the app server
EOF

cat > .claude/rules/testing.md << 'EOF'
# Testing conventions
- Every slice needs a verification target defined before implementation starts
- Run tests incrementally as you build, not only at the end of a slice
- qa agent checks against the slice's acceptance criteria, not just "tests pass"
EOF

# ---------- .claude/agents/ ----------

cat > .claude/agents/researcher.md << 'EOF'
---
name: researcher
description: Research implementation choices and return concise findings with tradeoffs.
tools: Read, Grep, Glob, WebSearch, WebFetch
model: haiku
effort: low
maxTurns: 12
---
EOF

cat > .claude/agents/code-reviewer.md << 'EOF'
---
name: code-reviewer
description: Independently review completed code changes for correctness, maintainability, security, and requirement compliance.
tools: Read, Grep, Glob
model: sonnet
effort: medium
maxTurns: 10
---
EOF

cat > .claude/agents/qa.md << 'EOF'
---
name: qa
description: Verify implemented functionality against acceptance criteria and run the relevant automated tests.
tools: Read, Grep, Glob, Bash
model: haiku
effort: low
maxTurns: 10
---
EOF

# ---------- skills ----------
# Deliberately not installed here. grill-me already ships with the user-level
# mattpocock-skills plugin, so `npx skills add` only vendors a duplicate into
# .agents/ plus a lockfile to keep pinned - and leaves a dangling symlink if
# that directory goes away. See CLAUDE.md "Skills".

# ---------- docs/ ----------

cat > docs/PROGRESS.md << 'EOF'
# Progress

## Current phase
REQUIREMENTS

## Last session (date)
- Shipped:
- Decided:
- Blocked / deferred:

## Next session
- Start here:
EOF

echo "Scaffold created:"
find .claude docs -type f
