/**
 * Technical vocabulary boosted in Deepgram STT requests.
 *
 * Deepgram's keyterm prompting accepts 20-50 boosted terms at no latency cost
 * (docs/ARCHITECTURE.md §4). This is the exact list named there. It is unverified against
 * programming speech specifically - the Phase 1 spike (scripts/stt-spike.ts) measures whether it
 * actually helps before later phases build scoring on top of transcripts that use it.
 *
 * Keep this list short. Deepgram's own guidance favors 20-50 terms; padding it with every
 * plausible CS term dilutes the boost rather than strengthening it.
 */
export const STT_KEYTERMS: readonly string[] = [
  "hashmap",
  "hash map",
  "memoize",
  "memoization",
  "two pointers",
  "sliding window",
  "dp",
  "dynamic programming",
  "nums",
  "lo",
  "hi",
  "O of n",
  "O of n log n",
  "O of n squared",
  "big O",
  "recursion",
  "recursive",
  "base case",
  "binary search",
  "linked list",
  "adjacency list",
  "backtracking",
  "greedy",
];
