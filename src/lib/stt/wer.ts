/**
 * Word Error Rate (WER) between a reference transcript and a hypothesis (what STT produced).
 *
 * This is the measurement instrument for the Phase 1 STT accuracy spike (see
 * docs/ARCHITECTURE.md §15/§16): there is no published benchmark for programming-jargon
 * transcription accuracy, so this module exists to produce one on real clips before anything
 * downstream is built to trust a transcript.
 *
 * WER is edit distance over words, normalized by reference length:
 *
 *   WER = (substitutions + deletions + insertions) / reference word count
 *
 * A WER of 0 is a perfect match; a WER of 1.0 means as many edits as words in the reference.
 * It can exceed 1.0 when the hypothesis contains far more words than the reference (mostly
 * insertions) - that is a real, meaningful signal, not a bug, so it is not clamped.
 */

/** One aligned comparison, useful for a caller that wants to show more than the bare number. */
export interface WerResult {
  /** Word error rate. 0 is perfect; not clamped above 1. */
  readonly wer: number;
  readonly substitutions: number;
  readonly deletions: number;
  readonly insertions: number;
  /** Word count of the reference - the denominator `wer` is computed against. */
  readonly referenceWordCount: number;
}

/** Lowercases and splits on whitespace. WER is about word identity, not casing or spacing. */
function tokenize(text: string): string[] {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Compute WER via the standard dynamic-programming edit-distance table over words.
 *
 * `dp[i][j]` is the edit distance between the first `i` reference words and the first `j`
 * hypothesis words. This is the classic Levenshtein recurrence; the only difference from
 * character-level edit distance is that the alphabet is words instead of letters.
 */
export function wordErrorRate(reference: string, hypothesis: string): WerResult {
  const refWords = tokenize(reference);
  const hypWords = tokenize(hypothesis);

  const refLen = refWords.length;
  const hypLen = hypWords.length;

  if (refLen === 0) {
    // An empty reference has no words to get wrong; only insertions are possible, and WER is
    // conventionally undefined (0/0) rather than infinite - report 0 when the hypothesis also
    // has nothing to say, otherwise treat every hypothesis word as pure noise.
    return {
      wer: hypLen === 0 ? 0 : hypLen,
      substitutions: 0,
      deletions: 0,
      insertions: hypLen,
      referenceWordCount: 0,
    };
  }

  // dp[i][j], plus parallel tables tracking which operation produced the minimum at each cell so
  // the counts (not just the total distance) can be recovered by walking the path back.
  const dp: number[][] = Array.from({ length: refLen + 1 }, () =>
    new Array<number>(hypLen + 1).fill(0),
  );

  for (let i = 0; i <= refLen; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= hypLen; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= refLen; i += 1) {
    for (let j = 1; j <= hypLen; j += 1) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        const substitution = dp[i - 1][j - 1] + 1;
        const deletion = dp[i - 1][j] + 1;
        const insertion = dp[i][j - 1] + 1;
        dp[i][j] = Math.min(substitution, deletion, insertion);
      }
    }
  }

  // Walk back from the bottom-right corner to classify each edit, preferring a match whenever
  // one is available so the counts reflect the same minimum-cost path `dp[refLen][hypLen]` found.
  let i = refLen;
  let j = hypLen;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refWords[i - 1] === hypWords[j - 1]) {
      i -= 1;
      j -= 1;
      continue;
    }

    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      substitutions += 1;
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      deletions += 1;
      i -= 1;
    } else {
      insertions += 1;
      j -= 1;
    }
  }

  return {
    wer: dp[refLen][hypLen] / refLen,
    substitutions,
    deletions,
    insertions,
    referenceWordCount: refLen,
  };
}
