/**
 * Which LLM provider answers `/api/turn`.
 *
 * `LLM_PROVIDER=gemini|anthropic` picks explicitly - it does not auto-detect from which API key
 * happens to be set, so behavior stays predictable if both `GEMINI_API_KEY` and
 * `ANTHROPIC_API_KEY` exist at once. Defaults to Gemini: it has a genuine free tier, unlike
 * Claude, and Anthropic support is kept as a fallback (see src/lib/llm/providers/claude.ts) in
 * case Gemini's structured output proves less reliable in real sessions - switching back is then
 * a config change, not a rewrite.
 *
 * Pure function, same discipline as src/lib/auth/access.ts and rateLimit.ts: a decision kept
 * separate from where the input (the env var) actually lives.
 */

export type LlmProviderName = "anthropic" | "gemini";

const DEFAULT_PROVIDER: LlmProviderName = "gemini";

/**
 * Resolve the active provider from an env var value.
 *
 * An unset or unrecognized value falls back to the default rather than throwing - a typo'd
 * `LLM_PROVIDER` should degrade to "use the default," not take the whole app down.
 */
export function resolveProvider(envValue: string | undefined): LlmProviderName {
  if (envValue === "anthropic") return "anthropic";
  if (envValue === "gemini") return "gemini";
  return DEFAULT_PROVIDER;
}
