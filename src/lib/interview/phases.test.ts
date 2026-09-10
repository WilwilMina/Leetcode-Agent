/**
 * Tests for the phase-order helpers.
 *
 * `skippedPhases` gets the most attention because the override metric in `docs/PLAN.md` §6 is
 * built directly on it: if a backward move or an adjacent step reported skipped phases, the
 * debrief would count overrides that never happened.
 */

import { describe, expect, it } from "vitest";

import { PHASE_ORDER } from "../schemas/phase";
import { phaseAfter, phaseIndex, skippedPhases } from "./phases";

describe("phaseIndex", () => {
  it("returns the position of a phase in the running order", () => {
    expect(phaseIndex("intro")).toBe(0);
    expect(phaseIndex("code")).toBe(5);
    expect(phaseIndex("debrief")).toBe(PHASE_ORDER.length - 1);
  });
});

describe("phaseAfter", () => {
  it("returns the next phase in order", () => {
    expect(phaseAfter("intro")).toBe("clarify");
    expect(phaseAfter("complexity")).toBe("code");
  });

  it("returns null at the last phase", () => {
    expect(phaseAfter("debrief")).toBeNull();
  });

  it("walks the whole order without a gap", () => {
    PHASE_ORDER.slice(0, -1).forEach((phase, index) => {
      expect(phaseAfter(phase)).toBe(PHASE_ORDER[index + 1]);
    });
  });
});

describe("skippedPhases", () => {
  it("returns nothing for a single step forward", () => {
    expect(skippedPhases("clarify", "bruteForce")).toEqual([]);
  });

  it("returns the phases jumped over", () => {
    expect(skippedPhases("clarify", "code")).toEqual(["bruteForce", "optimize", "complexity"]);
  });

  it("returns nothing for a move backwards", () => {
    expect(skippedPhases("code", "clarify")).toEqual([]);
  });

  it("returns nothing for staying in the same phase", () => {
    expect(skippedPhases("optimize", "optimize")).toEqual([]);
  });
});
