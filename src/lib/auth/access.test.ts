/**
 * Tests for the deployment access gate.
 *
 * The case that matters most is `deploys without a configured secret`: a regression there would
 * silently open the API to the internet, which is the exact failure this module prevents.
 */

import { describe, expect, it } from "vitest";

import { checkAccess, secretsMatch, type AccessInput } from "./access";

/** Build an input with sensible defaults so each test states only what it cares about. */
function input(overrides: Partial<AccessInput> = {}): AccessInput {
  return {
    isProduction: true,
    expectedSecret: "correct-horse",
    cookieSecret: null,
    querySecret: null,
    ...overrides,
  };
}

describe("secretsMatch", () => {
  it("accepts identical secrets", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
  });

  it("rejects secrets differing only in the final character", () => {
    expect(secretsMatch("abc123", "abc124")).toBe(false);
  });

  it("rejects secrets of different lengths", () => {
    expect(secretsMatch("abc", "abcd")).toBe(false);
  });

  it("rejects a prefix of the real secret", () => {
    expect(secretsMatch("abc", "abc123")).toBe(false);
  });

  it("treats empty strings as equal, leaving the empty-secret guard to checkAccess", () => {
    expect(secretsMatch("", "")).toBe(true);
  });
});

describe("checkAccess", () => {
  it("allows local development without any secret configured", () => {
    const decision = checkAccess(
      input({ isProduction: false, expectedSecret: undefined }),
    );

    expect(decision.kind).toBe("allow");
  });

  it("denies a production deployment with no configured secret", () => {
    const decision = checkAccess(input({ expectedSecret: undefined }));

    expect(decision).toEqual({
      kind: "deny",
      reason: "server-secret-not-configured",
    });
  });

  it("denies a production deployment configured with an empty secret", () => {
    const decision = checkAccess(input({ expectedSecret: "" }));

    expect(decision).toEqual({
      kind: "deny",
      reason: "server-secret-not-configured",
    });
  });

  it("denies when no secret is presented", () => {
    const decision = checkAccess(input());

    expect(decision).toEqual({
      kind: "deny",
      reason: "secret-missing-or-invalid",
    });
  });

  it("denies a wrong cookie", () => {
    const decision = checkAccess(input({ cookieSecret: "wrong" }));

    expect(decision).toEqual({
      kind: "deny",
      reason: "secret-missing-or-invalid",
    });
  });

  it("allows a matching cookie", () => {
    const decision = checkAccess(input({ cookieSecret: "correct-horse" }));

    expect(decision.kind).toBe("allow");
  });

  it("grants a cookie when the secret arrives by query string", () => {
    const decision = checkAccess(input({ querySecret: "correct-horse" }));

    expect(decision).toEqual({ kind: "grant", secret: "correct-horse" });
  });

  it("denies a wrong query secret", () => {
    const decision = checkAccess(input({ querySecret: "wrong" }));

    expect(decision).toEqual({
      kind: "deny",
      reason: "secret-missing-or-invalid",
    });
  });

  it("falls through to the query secret when the cookie is stale", () => {
    // The combination that proves the cookie branch does not short-circuit to deny: a wrong
    // cookie must not block a correct secret presented in the query string.
    const decision = checkAccess(
      input({ cookieSecret: "stale", querySecret: "correct-horse" }),
    );

    expect(decision).toEqual({ kind: "grant", secret: "correct-horse" });
  });

  it("prefers a valid cookie over an invalid query secret", () => {
    const decision = checkAccess(
      input({ cookieSecret: "correct-horse", querySecret: "wrong" }),
    );

    expect(decision.kind).toBe("allow");
  });
});
