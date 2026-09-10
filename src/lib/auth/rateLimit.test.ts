/**
 * Tests for the rate limiter's pure decision function. `checkAndRecord` (the in-memory-store
 * wrapper route handlers actually call) gets its own smaller suite below, since its only job is
 * correctly threading state through `checkRateLimit` - the decision logic itself is covered here.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  _resetForTests,
  checkAndRecord,
  checkRateLimit,
  getRateLimitKey,
  type RateLimitConfig,
  type RateLimitState,
} from "./rateLimit";

const config: RateLimitConfig = { maxRequests: 3, windowMs: 1000 };

function state(timestamps: number[]): RateLimitState {
  return { timestamps };
}

describe("checkRateLimit", () => {
  it("allows the first request against an empty window", () => {
    const decision = checkRateLimit(state([]), config, 0);

    expect(decision).toEqual({ kind: "allow", nextState: { timestamps: [0] } });
  });

  it("allows a request under the limit and appends it to the window", () => {
    const decision = checkRateLimit(state([0, 100]), config, 200);

    expect(decision).toEqual({ kind: "allow", nextState: { timestamps: [0, 100, 200] } });
  });

  it("denies the request that would put the window at the limit", () => {
    // maxRequests: 3 - a 4th timestamp in-window is denied.
    const decision = checkRateLimit(state([0, 100, 200]), config, 300);

    expect(decision.kind).toBe("deny");
  });

  it("allows exactly maxRequests within a window, not one fewer", () => {
    // Two prior requests plus this one is exactly 3 - the boundary must allow, not deny.
    const decision = checkRateLimit(state([0, 100]), config, 200);

    expect(decision.kind).toBe("allow");
  });

  it("reports a retryAfterMs that reflects when the oldest entry ages out", () => {
    const decision = checkRateLimit(state([0, 100, 200]), config, 300);

    if (decision.kind !== "deny") {
      throw new Error("expected deny");
    }

    // Oldest timestamp (0) ages out of the window at 0 + windowMs (1000); now is 300.
    expect(decision.retryAfterMs).toBe(1000 - 300);
  });

  it("drops timestamps that have aged out of the window before counting", () => {
    // windowMs is 1000; at now=1500 the window starts at 500, so both 0 and 100 have aged out
    // and the request is scored against an effectively empty window.
    const decision = checkRateLimit(state([0, 100]), config, 1500);

    expect(decision).toEqual({ kind: "allow", nextState: { timestamps: [1500] } });
  });

  it("recovers to allow once every old timestamp has aged out", () => {
    const decision = checkRateLimit(state([0, 100, 200]), config, 5000);

    expect(decision).toEqual({ kind: "allow", nextState: { timestamps: [5000] } });
  });
});

describe("checkAndRecord", () => {
  afterEach(() => {
    _resetForTests();
  });

  it("allows requests under the limit for a given key", () => {
    const a = checkAndRecord("visitor-1", config, 0);
    const b = checkAndRecord("visitor-1", config, 10);
    const c = checkAndRecord("visitor-1", config, 20);

    expect(a.kind).toBe("allow");
    expect(b.kind).toBe("allow");
    expect(c.kind).toBe("allow");
  });

  it("denies once a key exceeds its limit", () => {
    checkAndRecord("visitor-1", config, 0);
    checkAndRecord("visitor-1", config, 10);
    checkAndRecord("visitor-1", config, 20);
    const fourth = checkAndRecord("visitor-1", config, 30);

    expect(fourth.kind).toBe("deny");
  });

  it("tracks separate keys independently", () => {
    checkAndRecord("visitor-1", config, 0);
    checkAndRecord("visitor-1", config, 10);
    checkAndRecord("visitor-1", config, 20);

    // visitor-2 has made no requests, so it should not be affected by visitor-1's usage.
    const decision = checkAndRecord("visitor-2", config, 30);

    expect(decision.kind).toBe("allow");
  });
});

describe("getRateLimitKey", () => {
  it("extracts the access cookie value from a Cookie header", () => {
    const request = new Request("http://localhost/api/turn", {
      headers: { cookie: "il_access=abc123; other=ignored" },
    });

    expect(getRateLimitKey(request)).toBe("il_access=abc123");
  });

  it("finds the access cookie among several, regardless of position", () => {
    const request = new Request("http://localhost/api/turn", {
      headers: { cookie: "first=1; il_access=abc123; last=2" },
    });

    expect(getRateLimitKey(request)).toBe("il_access=abc123");
  });

  it("falls back to a shared key when there is no Cookie header at all", () => {
    const request = new Request("http://localhost/api/turn");

    expect(getRateLimitKey(request)).toBe("local-dev");
  });

  it("falls back to the shared key when the access cookie is absent from other cookies", () => {
    const request = new Request("http://localhost/api/turn", {
      headers: { cookie: "unrelated=1" },
    });

    expect(getRateLimitKey(request)).toBe("local-dev");
  });
});
