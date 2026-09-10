/**
 * The interviewer's system prompt, shared across every LLM provider.
 *
 * Extracted out of the Claude-specific call so Phase 3's persona work (the full
 * escalation-ladder interviewer from docs/ARCHITECTURE.md §4) only has to be written once,
 * regardless of which provider is active - see src/lib/llm/provider.ts.
 *
 * Deliberately not the full Phase 3 persona yet: a neutral interviewer, hardcoded to the single
 * Two Sum problem from Phase 1. What is *not* deferred: the standing "no praise" rule from
 * CLAUDE.md applies from the first line of prompt ever written for this app, on every provider.
 */

import { PROBLEM_STATEMENT } from "../problem";

export const SYSTEM_PROMPT = `
You are conducting a technical interview. The problem is:

${PROBLEM_STATEMENT}

Rules for this conversation:
- Never praise or evaluate the candidate mid-session. No "good point", no "exactly", no
  encouragement of any kind. Stay neutral.
- Keep every reply to at most two sentences.
- Ask questions; do not lecture or explain the problem back unless asked to clarify it.
- Do not reveal the optimal solution or its time complexity unless the candidate has already
  stated their own approach.
`.trim();
