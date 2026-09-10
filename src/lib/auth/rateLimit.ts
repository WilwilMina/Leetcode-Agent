/**
 * Rate limit for `/api/turn` - added per `.claude/rules/security.md`: "a candidate can't run up
 * spend by holding the mic open." Every call to that route triggers a billed Claude request, so
 * a stuck key, a retry loop, or an open mic left recording could otherwise run up real cost.
 *
 * Same shape as `lib/auth/access.ts`: the decision is a pure function of state you hand it, kept
 * separate from where that state actually lives, so it is testable without a request object or a
 * clock.
 *
 * Caveat that matters for this specific app and is recorded here rather than left implicit: the
 * window state lives in memory (the `windows` map below), so it does not survive a serverless
 * cold start and is not shared across concurrent instances. That is a real gap for a
 * multi-instance production service. It is acceptable here because this app has exactly one user
 * and the goal is "stop a runaway loop," not "enforce a hard quota" - Vercel's own request
 * concurrency limits and the Anthropic/Deepgram account-level spend caps are the backstop for
 * anything this module misses. Revisit if this ever serves more than one person.
 */

import { ACCESS_COOKIE } from "./access";

/** A sliding window of request timestamps for one key (one visitor, via the access cookie). */
export interface RateLimitState {
  /** Epoch milliseconds of requests within the current window, oldest first. */
  readonly timestamps: readonly number[];
}

export interface RateLimitConfig {
  /** Requests allowed per window. */
  readonly maxRequests: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
}

export type RateLimitDecision =
  | { readonly kind: "allow"; readonly nextState: RateLimitState }
  | { readonly kind: "deny"; readonly retryAfterMs: number };

/** Default: 20 turns per 10 minutes. A real interview turn is a few seconds of speech plus a
 *  reply, so a working session runs well under this; a held-open mic or a client retry loop
 *  would hit it within seconds. */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 20,
  windowMs: 10 * 60 * 1000,
};

/**
 * Decide whether a new request at `now` is allowed, given the prior state for its key.
 *
 * Pure: no clock reads, no storage reads or writes. The caller supplies `now` and the prior
 * state, and applies `nextState` back to storage on an `allow` - see `checkAndRecord` below for
 * the version that actually does that against the in-memory store.
 */
export function checkRateLimit(
  state: RateLimitState,
  config: RateLimitConfig,
  now: number,
): RateLimitDecision {
  const windowStart = now - config.windowMs;
  const withinWindow = state.timestamps.filter((t) => t > windowStart);

  if (withinWindow.length >= config.maxRequests) {
    const oldestInWindow = withinWindow[0];
    return { kind: "deny", retryAfterMs: oldestInWindow + config.windowMs - now };
  }

  return {
    kind: "allow",
    nextState: { timestamps: [...withinWindow, now] },
  };
}

// --- In-memory store: the actual state, separate from the pure decision above ---

const windows = new Map<string, RateLimitState>();

/**
 * Apply `checkRateLimit` against the module-level in-memory store for `key` and persist the
 * result. This is the function route handlers call; `checkRateLimit` above is what tests call.
 */
export function checkAndRecord(
  key: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT,
  now: number = Date.now(),
): RateLimitDecision {
  const state = windows.get(key) ?? { timestamps: [] };
  const decision = checkRateLimit(state, config, now);

  if (decision.kind === "allow") {
    windows.set(key, decision.nextState);
  }

  return decision;
}

/** Test-only escape hatch to reset the module-level store between test cases. */
export function _resetForTests(): void {
  windows.clear();
}

/**
 * Derive the rate-limit key for a request: the Phase 0 access cookie value, which is already
 * unique per browser once the deployment gate has granted access. Shared by both `/api/turn`
 * and `/api/transcribe` - a Deepgram call is billed exactly like a Claude call, so both routes
 * apply the same limiter rather than leaving one of the two paths uncapped.
 *
 * In local dev there is no cookie (the Phase 0 gate does not run outside production), so every
 * request shares one key - correct for a single-user app: the point is stopping a runaway loop,
 * not distinguishing visitors that do not exist yet.
 */
export function getRateLimitKey(request: Request): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const accessCookie = cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${ACCESS_COOKIE}=`));

  return accessCookie ?? "local-dev";
}
