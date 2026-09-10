/**
 * Tests for the WER calculator. Each expected value below is hand-computed, not asserted against
 * the implementation's own output - the point is to catch the implementation being wrong, which a
 * self-referential test cannot do.
 */

import { describe, expect, it } from "vitest";

import { wordErrorRate } from "./wer";

describe("wordErrorRate", () => {
  it("is zero for an exact match", () => {
    const result = wordErrorRate("use a hashmap for one pass", "use a hashmap for one pass");

    expect(result.wer).toBe(0);
    expect(result.substitutions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.insertions).toBe(0);
  });

  it("is case-insensitive", () => {
    const result = wordErrorRate("Two Pointers", "two pointers");

    expect(result.wer).toBe(0);
  });

  it("ignores extra whitespace", () => {
    const result = wordErrorRate("two   pointers", "two pointers");

    expect(result.wer).toBe(0);
  });

  it("counts one substitution correctly", () => {
    // "hashmap" -> "has map": reference has 2 words, hypothesis has 2 words, but they don't
    // align word-for-word - hand trace: ref=[hashmap], hyp=[has,map] costs 2 edits (sub + ins)
    // against a reference of 1 word, so WER = 2/1 = 2.0. Use a cleaner single-substitution case
    // instead so the hand computation is unambiguous.
    const result = wordErrorRate("use a hashmap here", "use a dict here");

    expect(result.substitutions).toBe(1);
    expect(result.deletions).toBe(0);
    expect(result.insertions).toBe(0);
    expect(result.wer).toBe(1 / 4);
  });

  it("counts one deletion correctly", () => {
    const result = wordErrorRate("two pointers approach", "two pointers");

    expect(result.deletions).toBe(1);
    expect(result.substitutions).toBe(0);
    expect(result.insertions).toBe(0);
    expect(result.wer).toBe(1 / 3);
  });

  it("counts one insertion correctly", () => {
    const result = wordErrorRate("two pointers", "two pointers approach");

    expect(result.insertions).toBe(1);
    expect(result.substitutions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.wer).toBe(1 / 2);
  });

  it("is 1.0 when every word is wrong and lengths match", () => {
    const result = wordErrorRate("a b c", "x y z");

    expect(result.substitutions).toBe(3);
    expect(result.wer).toBe(1);
  });

  it("can exceed 1.0 when the hypothesis is much longer than the reference", () => {
    // Real signal, not a bug: a short reference against a rambling hypothesis should read as a
    // very bad transcription, not be capped at "100% wrong".
    const result = wordErrorRate("dp", "well i think maybe dp or something like that");

    expect(result.wer).toBeGreaterThan(1);
  });

  it("treats an empty hypothesis against a non-empty reference as all deletions", () => {
    const result = wordErrorRate("two pointers", "");

    expect(result.deletions).toBe(2);
    expect(result.wer).toBe(1);
  });

  it("treats two empty strings as zero error, not NaN", () => {
    const result = wordErrorRate("", "");

    expect(result.wer).toBe(0);
    expect(Number.isNaN(result.wer)).toBe(false);
  });

  it("treats a non-empty hypothesis against an empty reference as pure insertion noise", () => {
    const result = wordErrorRate("", "hashmap dp");

    expect(result.insertions).toBe(2);
    expect(result.wer).toBe(2);
  });

  it("reports the reference word count used as the denominator", () => {
    const result = wordErrorRate("two pointers approach here", "two pointers");

    expect(result.referenceWordCount).toBe(4);
  });
});
