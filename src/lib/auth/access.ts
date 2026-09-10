/**
 * Access gating for the deployed app.
 *
 * Interview Loop lives in a public repo, so its deployment URL is discoverable. Every API route
 * spends real Anthropic and Deepgram budget, which makes an unauthenticated deployment a way for
 * a stranger to run up a bill. This module decides who gets in.
 *
 * The decision is a pure function so it can be unit-tested without a request object; the Next.js
 * plumbing that calls it lives in `middleware.ts`.
 *
 * Preferred protection is Vercel Deployment Protection, which authenticates at the edge before a
 * request ever reaches this code. This gate is the fallback for deployments that do not have it,
 * and defence in depth for those that do.
 */

/** Cookie that carries the shared secret once it has been presented via `?k=`. */
export const ACCESS_COOKIE = "il_access";

/** Query parameter used to present the secret for the first time. */
export const ACCESS_QUERY_PARAM = "k";

/** Everything the access decision depends on, gathered by the caller. */
export interface AccessInput {
  /** True when running as a real deployment rather than local development. */
  isProduction: boolean;

  /** The secret the server expects, from `APP_ACCESS_SECRET`. Undefined when unconfigured. */
  expectedSecret: string | undefined;

  /** Secret presented by an existing cookie, if any. */
  cookieSecret: string | null;

  /** Secret presented in the query string, if any. */
  querySecret: string | null;
}

export type AccessDecision =
  /** Let the request through untouched. */
  | { readonly kind: "allow" }

  /** Secret was correct and arrived by query string: store it, then redirect to a clean URL. */
  | { readonly kind: "grant"; readonly secret: string }

  /** Refuse. `reason` is for server-side logging only and must never reach the client. */
  | { readonly kind: "deny"; readonly reason: DenyReason };

export type DenyReason =
  /** Deployed without `APP_ACCESS_SECRET` set — refuse everything rather than serve openly. */
  | "server-secret-not-configured"

  /** No secret presented, or the one presented did not match. */
  | "secret-missing-or-invalid";

/**
 * Compare two secrets without leaking their similarity through timing.
 *
 * `===` on a secret short-circuits at the first differing byte, so response time reveals how much
 * of a guess was correct. Web Crypto has no constant-time comparison and `crypto.timingSafeEqual`
 * is Node-only (middleware may run on the Edge runtime), so this is done by hand.
 *
 * Length is deliberately compared first and early-returns: secret length is not worth protecting,
 * and a fixed-length loop over mismatched inputs is harder to reason about.
 */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

/**
 * Decide what to do with an incoming request.
 *
 * The rule that matters most: a production deployment with no configured secret is denied
 * outright. Failing open there would silently expose the API the first time someone forgets an
 * environment variable, which is exactly the failure this module exists to prevent.
 */
export function checkAccess(input: AccessInput): AccessDecision {
  // Local development is never gated - requiring a secret to run `next dev` would be friction
  // with no benefit, since nothing is reachable from outside the machine.
  if (!input.isProduction) {
    return { kind: "allow" };
  }

  // Fail closed. See the note above.
  if (!input.expectedSecret) {
    return { kind: "deny", reason: "server-secret-not-configured" };
  }

  if (input.cookieSecret && secretsMatch(input.cookieSecret, input.expectedSecret)) {
    return { kind: "allow" };
  }

  if (input.querySecret && secretsMatch(input.querySecret, input.expectedSecret)) {
    return { kind: "grant", secret: input.querySecret };
  }

  return { kind: "deny", reason: "secret-missing-or-invalid" };
}
