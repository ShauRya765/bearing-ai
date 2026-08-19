// A saved eval run: the artifact scripts/bench-retrieve.ts writes and the /eval
// dashboard reads.
//
// Runs are committed to the repo as JSON under src/lib/eval/runs/. That is the
// whole design: a recall figure is meaningless on its own, and only becomes a
// signal when you can see it move. Keeping runs in git means every number on the
// dashboard is attributable to a commit, a corpus and a model — and a regression
// shows up in a diff instead of in someone's memory of what the number used to be.
//
// Two rules make the artifacts trustworthy:
//
//  1. Everything needed to decide whether two runs are COMPARABLE is recorded in
//     `meta` — embedding model, k, corpus size, question-set size. Recall across
//     two different embedding models is not a comparison, and without this
//     metadata nobody can tell that's what they're looking at.
//  2. NaN survives the round trip. JSON has no NaN literal: JSON.stringify(NaN)
//     silently produces null, and a null read back as a number is 0. Since NaN is
//     load-bearing here — it's how score.ts refuses to claim a recall for
//     out-of-corpus questions — a naive save would turn "undefined" into a
//     confident 0% and invent a regression. serializeRun/parseRun map it
//     explicitly, and run.test.ts asserts the round trip.

import type { EvalSummary, QuestionScore, SetScore } from "@/lib/eval/score";
import { summariseRankPrecision } from "@/lib/eval/score";
import type { ContextPrecisionSummary } from "@/lib/eval/precision";
import type { AnswerRelevanceResult } from "@/lib/eval/relevance";
import type { CorrectnessResult } from "@/lib/eval/correctness";

/**
 * Bumped whenever the shape below changes incompatibly. parseRun refuses a run
 * it doesn't understand rather than rendering a half-populated dashboard from a
 * file written by an older version of the script.
 */
export const RUN_SCHEMA_VERSION = 1;

export interface RunMeta {
  schema: number;
  /** ISO 8601, UTC. When the run started, not when the file was written. */
  startedAt: string;
  /** Short git SHA of the working tree the run was made from. Null outside a repo. */
  gitSha: string | null;
  /** Vectors are only comparable within one embedding model. */
  embeddingModel: string;
  /** Null on a retrieval-only run — no generation calls were made. */
  generationModel: string | null;
  /** k in recall@k. */
  matchCount: number;
  /** Corpus the run retrieved against. Recall rises trivially as this shrinks. */
  corpus: { chunks: number; sources: number };
  /** Size of the question set, so a changed denominator is visible. */
  questions: { total: number; covered: number; hard: number; uncovered: number };
}

/**
 * Faithfulness judging. Optional on the interface, not merely nullable, and that
 * distinction is load-bearing:
 *
 *   undefined — this run predates judging, or was made without --judge. The
 *               dashboard shows "not measured".
 *   null      — judging ran and produced nothing usable.
 *
 * Adding it as an optional field is why RUN_SCHEMA_VERSION stays at 1. Bumping
 * it would make every previously committed run unreadable and blank the
 * dashboard's history, which is a steep price for a field older readers can
 * simply not find.
 */
export interface FaithfulnessResult {
  /** A faithfulness figure belongs to one judge. Comparing across judges is not
   *  a comparison — the same trap the embedding model poses for recall. */
  judgeModel: string;
  /** Mean per-question faithfulness, 0–1. NaN when nothing was judged. */
  score: number;
  /** Questions the judge scored. The denominator of `score`. */
  judged: number;
  /** Refusals, excluded rather than counted as perfectly faithful. */
  skippedRefusals: number;
  /** Questions where the JUDGE failed. Not counted as unfaithful. */
  failed: number;
  /** Questions where every claim was supported. */
  clean: number;
  /** Every unsupported claim, kept verbatim. Publishing the failures is the
   *  point — a faithfulness percentage with no examples cannot be checked. */
  unsupported: { question: string; claim: string; note: string }[];
}

/** Results of the generation pass. Null unless the run was made with --full. */
export interface GenerationResult {
  /** Repetitions per question, for the latency percentiles. */
  reps: number;
  latency: LatencyStage[];
  refusals: {
    /** Out-of-corpus questions asked. */
    total: number;
    /** How many were correctly declined. */
    refused: number;
    /** The failures, kept verbatim — a refusal rate with no examples isn't debuggable. */
    answered: { question: string; excerpt: string }[];
  };
  /** Undefined on runs that didn't judge. See FaithfulnessResult. */
  faithfulness?: FaithfulnessResult | null;
  /**
   * The Claude-judged metrics. Optional for exactly the same reason
   * faithfulness is, and added the same way — which is what keeps
   * RUN_SCHEMA_VERSION at 1 and every previously committed run readable.
   *
   * All three follow the same three-state encoding: absent means never
   * measured, null means measured and got nothing, and a present object with a
   * NaN score means judged but unscoreable. Collapsing any pair of those would
   * turn a gap in the evidence into a finding.
   */
  contextPrecision?: ContextPrecisionSummary | null;
  answerRelevance?: AnswerRelevanceResult | null;
  correctness?: CorrectnessResult | null;
}

export interface LatencyStage {
  stage: string;
  p50: number;
  p95: number;
  note: string;
}

export interface EvalRun {
  meta: RunMeta;
  summary: EvalSummary;
  /**
   * Every question's score, not just the misses. The dashboard diffs miss lists
   * between runs, which needs to know that a question PASSED in the older run —
   * information a misses-only artifact throws away.
   */
  scores: QuestionScore[];
  generation: GenerationResult | null;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * JSON has no NaN. `null` is the wire representation; the type is nullable so
 * TypeScript forces every reader through parseRun instead of treating a parsed
 * file as an EvalRun directly.
 */
type Nullable<T> = { [K in keyof T]: T[K] extends number ? number | null : T[K] };

function numToJson(n: number): number | null {
  return Number.isNaN(n) ? null : n;
}

function numFromJson(n: number | null | undefined): number {
  return n === null || n === undefined ? NaN : n;
}

// Only `recall` is ever NaN. allHit and total are counts, so widening them to
// nullable would invite null checks that can never fire and hide the one field
// that genuinely needs them.
type SetScoreJson = Omit<SetScore, "recall"> & { recall: number | null };
type QuestionScoreJson = Omit<QuestionScore, "recall"> & { recall: number | null };

// `generation` is otherwise passed through untouched, but every judged metric
// carries at least one NaN-able score and so needs the same explicit mapping as
// recall. Without it a run where the judge never succeeded would serialise NaN
// to null and read back as 0 — a fabricated 0%, which is the worst possible
// direction for any of these numbers to be wrong in.
//
// The NaN-able keys are listed per metric rather than discovered, because the
// cost of forgetting one is silent and the cost of listing it is a line.
type ScoreJson<T, K extends keyof T> = Omit<T, K> & { [P in K]: number | null };

const FAITHFULNESS_SCORES = ["score"] as const;
const PRECISION_SCORES = ["score", "uncoveredScore"] as const;
const RELEVANCE_SCORES = ["score"] as const;
const CORRECTNESS_SCORES = ["score", "factCoverage"] as const;

type FaithfulnessJson = ScoreJson<FaithfulnessResult, "score">;
type PrecisionJson = ScoreJson<ContextPrecisionSummary, "score" | "uncoveredScore">;
type RelevanceJson = ScoreJson<AnswerRelevanceResult, "score">;
type CorrectnessJson = ScoreJson<CorrectnessResult, "score" | "factCoverage">;

/** NaN → null on the listed keys; every other field is copied untouched. */
function encodeMetric<J>(m: object | null, keys: readonly string[]): J | null {
  if (m === null) return null;
  const out: Record<string, unknown> = { ...m };
  for (const k of keys) out[k] = numToJson(out[k] as number);
  return out as J;
}

/** null → NaN on the listed keys. The inverse of encodeMetric. */
function decodeMetric<T>(m: object | null, keys: readonly string[]): T | null {
  if (m === null) return null;
  const out: Record<string, unknown> = { ...m };
  for (const k of keys) out[k] = numFromJson(out[k] as number | null);
  return out as T;
}

type GenerationJson = Omit<
  GenerationResult,
  "faithfulness" | "contextPrecision" | "answerRelevance" | "correctness"
> & {
  faithfulness?: FaithfulnessJson | null;
  contextPrecision?: PrecisionJson | null;
  answerRelevance?: RelevanceJson | null;
  correctness?: CorrectnessJson | null;
};

// Both directions spread each metric in ONLY when the key was present. An
// unconditional spread would turn "never measured" into an explicit null on the
// way out, and the dashboard would stop being able to tell a run that skipped a
// metric from one that ran it and got nothing.
function generationToJson(g: GenerationResult | null): GenerationJson | null {
  if (!g) return null;
  const {
    faithfulness: f,
    contextPrecision: cp,
    answerRelevance: ar,
    correctness: c,
    ...rest
  } = g;
  return {
    ...rest,
    ...(f !== undefined ? { faithfulness: encodeMetric<FaithfulnessJson>(f, FAITHFULNESS_SCORES) } : {}),
    ...(cp !== undefined
      ? { contextPrecision: encodeMetric<PrecisionJson>(cp, PRECISION_SCORES) }
      : {}),
    ...(ar !== undefined
      ? { answerRelevance: encodeMetric<RelevanceJson>(ar, RELEVANCE_SCORES) }
      : {}),
    ...(c !== undefined ? { correctness: encodeMetric<CorrectnessJson>(c, CORRECTNESS_SCORES) } : {}),
  };
}

function generationFromJson(g: GenerationJson | null): GenerationResult | null {
  if (!g) return null;
  const {
    faithfulness: f,
    contextPrecision: cp,
    answerRelevance: ar,
    correctness: c,
    ...rest
  } = g;
  return {
    ...rest,
    ...(f !== undefined ? { faithfulness: decodeMetric<FaithfulnessResult>(f, FAITHFULNESS_SCORES) } : {}),
    ...(cp !== undefined
      ? { contextPrecision: decodeMetric<ContextPrecisionSummary>(cp, PRECISION_SCORES) }
      : {}),
    ...(ar !== undefined
      ? { answerRelevance: decodeMetric<AnswerRelevanceResult>(ar, RELEVANCE_SCORES) }
      : {}),
    ...(c !== undefined ? { correctness: decodeMetric<CorrectnessResult>(c, CORRECTNESS_SCORES) } : {}),
  };
}

interface EvalRunJson {
  meta: RunMeta;
  summary: {
    overall: SetScoreJson;
    easy: SetScoreJson;
    hard: SetScoreJson;
    uncovered: EvalSummary["uncovered"];
    latency: Nullable<EvalSummary["latency"]>;
    /** Omitted on write: derivable from `scores`, and duplicating it invites drift. */
    misses?: never;
    /**
     * Also omitted, for the same reason — and with a bonus: because it is
     * derived from the rank-ordered `scores[].titles` every run already stores,
     * runs committed before this metric existed report it too. A serialised
     * field would have left them blank forever.
     */
    rankPrecision?: never;
  };
  scores: QuestionScoreJson[];
  generation: GenerationJson | null;
}

function setToJson(s: SetScore): SetScoreJson {
  return { recall: numToJson(s.recall), allHit: s.allHit, total: s.total };
}

function setFromJson(s: SetScoreJson): SetScore {
  return { recall: numFromJson(s.recall), allHit: s.allHit, total: s.total };
}

export function serializeRun(run: EvalRun): string {
  const json: EvalRunJson = {
    meta: run.meta,
    summary: {
      overall: setToJson(run.summary.overall),
      easy: setToJson(run.summary.easy),
      hard: setToJson(run.summary.hard),
      uncovered: run.summary.uncovered,
      latency: {
        embedP50: numToJson(run.summary.latency.embedP50),
        embedP95: numToJson(run.summary.latency.embedP95),
        searchP50: numToJson(run.summary.latency.searchP50),
        searchP95: numToJson(run.summary.latency.searchP95),
      },
    },
    scores: run.scores.map((s) => ({ ...s, recall: numToJson(s.recall) })),
    generation: generationToJson(run.generation),
  };
  // Trailing newline so the files are well-behaved in git diffs.
  return JSON.stringify(json, null, 2) + "\n";
}

export class RunParseError extends Error {}

/**
 * Parses a saved run. Throws rather than returning a partial run: a dashboard
 * built on a silently-degraded artifact reports numbers nobody can trust, which
 * is strictly worse than a build that fails loudly.
 */
export function parseRun(text: string, filename = "<unknown>"): EvalRun {
  let json: EvalRunJson;
  try {
    json = JSON.parse(text) as EvalRunJson;
  } catch (err) {
    throw new RunParseError(
      `${filename}: not valid JSON (${(err as Error).message})`,
    );
  }

  if (json?.meta?.schema !== RUN_SCHEMA_VERSION) {
    throw new RunParseError(
      `${filename}: run schema ${json?.meta?.schema} but this build reads ` +
        `${RUN_SCHEMA_VERSION}. Re-run the benchmark to regenerate it.`,
    );
  }

  const scores: QuestionScore[] = json.scores.map((s) => ({
    ...s,
    recall: numFromJson(s.recall),
  }));

  return {
    meta: json.meta,
    summary: {
      overall: setFromJson(json.summary.overall),
      easy: setFromJson(json.summary.easy),
      hard: setFromJson(json.summary.hard),
      uncovered: json.summary.uncovered,
      latency: {
        embedP50: numFromJson(json.summary.latency.embedP50),
        embedP95: numFromJson(json.summary.latency.embedP95),
        searchP50: numFromJson(json.summary.latency.searchP50),
        searchP95: numFromJson(json.summary.latency.searchP95),
      },
      // Rebuilt from `scores` rather than read from the file, so the miss list
      // can never disagree with the per-question rows it's supposed to summarise.
      misses: scores.filter((s) => s.covered && !s.complete),
      rankPrecision: summariseRankPrecision(scores),
    },
    scores,
    generation: generationFromJson(json.generation),
  };
}

/**
 * Filename for a run, chosen so lexicographic sort equals chronological sort —
 * the store lists a directory and sorts strings, with no dates to parse.
 */
export function runFilename(startedAt: string): string {
  return `${startedAt.replace(/\.\d+Z$/, "Z").replace(/:/g, "-")}.json`;
}
