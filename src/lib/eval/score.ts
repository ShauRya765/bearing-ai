// Scoring for the retrieval eval. Pure functions over already-retrieved
// titles — no Supabase, no Gemini, no I/O — so the numbers can be tested
// against fixed inputs and can't drift between the CLI (scripts/bench-retrieve)
// and the /eval page. Both call these; neither computes recall itself.

import type { EvalQuestion } from "@/lib/eval/questions";

/** What retrieval returned for one question. */
export interface EvalRetrieval {
  /** source_title of each retrieved chunk, in rank order. */
  titles: string[];
  chunksUsed: number;
  embedMs: number;
  searchMs: number;
}

export interface QuestionScore {
  question: string;
  hard: boolean;
  /** Titles the question expects. Empty = out-of-corpus, see `covered`. */
  expect: string[];
  /** True when the question is expected to be answerable from the corpus. */
  covered: boolean;
  titles: string[];
  hit: string[];
  missing: string[];
  /**
   * Fraction of expected sources retrieved, 0–1. NaN for out-of-corpus
   * questions: with no similarity floor the RPC always returns k chunks, so
   * "recall" over an empty expectation is undefined, not 100%. Averaging those
   * in as 1.0 would be the single easiest way to fake a good score.
   */
  recall: number;
  /** Every expected source was retrieved. */
  complete: boolean;
}

export function scoreQuestion(
  item: EvalQuestion,
  retrieval: EvalRetrieval,
): QuestionScore {
  const covered = item.expect.length > 0;
  const hit = item.expect.filter((e) => retrieval.titles.includes(e));
  const missing = item.expect.filter((e) => !retrieval.titles.includes(e));

  return {
    question: item.q,
    hard: item.hard === true,
    expect: item.expect,
    covered,
    titles: retrieval.titles,
    hit,
    missing,
    recall: covered ? hit.length / item.expect.length : NaN,
    complete: covered && missing.length === 0,
  };
}

export interface SetScore {
  /** Mean per-question recall, 0–1. NaN for an empty set. */
  recall: number;
  /** Questions where every expected source came back. */
  allHit: number;
  total: number;
}

/**
 * Averages per question, not per expected source. A question expecting two
 * sources counts the same as one expecting a single source — otherwise the
 * handful of two-source questions would quietly dominate the number.
 */
export function scoreSet(scores: QuestionScore[]): SetScore {
  const covered = scores.filter((s) => s.covered);
  if (covered.length === 0) return { recall: NaN, allHit: 0, total: 0 };

  const recall =
    covered.reduce((sum, s) => sum + s.recall, 0) / covered.length;
  return {
    recall,
    allHit: covered.filter((s) => s.complete).length,
    total: covered.length,
  };
}

export interface EvalSummary {
  overall: SetScore;
  easy: SetScore;
  hard: SetScore;
  /** Out-of-corpus questions. Retrieval can't score these — see the note below. */
  uncovered: { total: number; alwaysFullK: boolean };
  latency: { embedP50: number; embedP95: number; searchP50: number; searchP95: number };
  misses: QuestionScore[];
}

/**
 * Nearest-rank percentile. No interpolation — at these sample sizes an
 * interpolated percentile implies precision the data doesn't support.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function summarise(
  scores: QuestionScore[],
  latencies: { embedMs: number; searchMs: number }[],
  matchCount: number,
  uncoveredChunkCounts: number[],
): EvalSummary {
  const covered = scores.filter((s) => s.covered);
  const embed = latencies.map((l) => l.embedMs);
  const search = latencies.map((l) => l.searchMs);

  return {
    overall: scoreSet(covered),
    easy: scoreSet(covered.filter((s) => !s.hard)),
    hard: scoreSet(covered.filter((s) => s.hard)),
    uncovered: {
      total: scores.length - covered.length,
      // When every out-of-corpus question still comes back with a full k chunks,
      // the retriever is applying no similarity floor and refusing is entirely
      // the prompt's job — which retrieval-only scoring cannot observe.
      alwaysFullK:
        uncoveredChunkCounts.length > 0 &&
        uncoveredChunkCounts.every((n) => n === matchCount),
    },
    latency: {
      embedP50: percentile(embed, 50),
      embedP95: percentile(embed, 95),
      searchP50: percentile(search, 50),
      searchP95: percentile(search, 95),
    },
    misses: covered.filter((s) => !s.complete),
  };
}
