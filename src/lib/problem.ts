/**
 * The Phase 1 hardcoded problem.
 *
 * Lives in its own module, separate from src/lib/llm/persona.ts, specifically so the
 * client-side session UI can show the problem statement without pulling either LLM provider's
 * SDK into the browser bundle - persona.ts is imported by both src/lib/llm/providers/claude.ts
 * and providers/gemini.ts, whose lazy client constructors must never reach a Client Component.
 * A famous, freely-restated problem, not scraped LeetCode text, per the copyright rule in
 * CLAUDE.md.
 */

export const PROBLEM_STATEMENT = `
Two Sum: Given an array of integers "nums" and an integer "target", return the indices of the
two numbers that add up to target. Assume exactly one solution exists, and the same element may
not be used twice.
`.trim();
