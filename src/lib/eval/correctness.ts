// Correctness: is the answer actually right?
//
// This is the metric the other three cannot reach. Recall proves the card came
// back. Context precision proves the cards were relevant. Faithfulness proves
// nothing was invented on top of them. Every one of those can be satisfied at
// 100% by an answer that is simply wrong — because they all grade the answer
// against the corpus, and the corpus is not the law. judge.ts:34-36 says this
// out loud: "an answer faithfully derived from a retrieved chunk is still wrong
// if the chunk was the wrong chunk, or if the corpus itself is wrong."
//
// So correctness is graded against IRCC, not against okf/. Each gold question
// carries the facts a right answer must state, the facts that would make it
// wrong, and the canada.ca page those came from with the date it was read. That
// is the same discipline docs/crs-verification-log.md applies to the rulesets,
// for the same reason: a number nobody can trace to a primary source is a claim,
// not a measurement.
//
// Two scores, deliberately separate:
//
//   Fact coverage — a normalised string check. No model, no cost, no opinion.
//     Catches the failure that matters most in this domain: a wrong number.
//     "1,560 hours" either appears or it doesn't.
//   Correctness   — a judge, because "thirty hours a week" and "30 hours/week"
//     are the same fact and only one of them is a substring.
//
// Coverage is the floor and correctness is the reading; publishing both makes it
// visible when the judge is being generous with a paraphrase.
//
// THE DENOMINATOR IS THE POINT. Correctness covers only the gold-labelled
// subset, and every figure derived from it is reported over that subset — never
// over the full question set, and never averaged into another metric. A
// correctness percentage that silently implied coverage of all 154 questions
// would be the same class of lie score.ts:28-32 exists to prevent.

import type { GoldAnswer } from "@/lib/eval/questions";

export interface FactCheck {
  /** Gold facts found verbatim (after normalisation) in the answer. */
  stated: string[];
  /** Gold facts not found. Not proof of a wrong answer — see `coverage`. */
  missing: string[];
  /** Forbidden assertions found in the answer. Any of these means it's wrong. */
  contradicted: string[];
  /**
   * stated / mustState, 0–1. A LOWER BOUND on correctness, not correctness: it
   * cannot see a paraphrase, so a fully correct answer that writes "thirty hours
   * a week" scores 0 here. Read it alongside the judged figure, never instead.
   */
  coverage: number;
}

export interface CorrectnessVerdict {
  question: string;
  /** The deterministic check. Always present — it cannot fail. */
  facts: FactCheck;
  /** Null when the judge failed. */
  graded: { fact: string; stated: boolean; note: string }[] | null;
  /** Judged correctness, 0–1. NaN when the judge failed. */
  score: number;
  /** True when the judge found a forbidden assertion. Forces `score` to 0. */
  wrong: boolean;
  error: string | null;
}

export interface CorrectnessResult {
  judgeModel: string;
  /** Mean judged correctness over gold questions. NaN when none were judged. */
  score: number;
  /** Gold questions the judge scored. The denominator of `score`. */
  judged: number;
  /**
   * Gold questions in the set. Published beside `judged` so the subset is
   * impossible to miss — this metric never speaks for the whole question set.
   */
  gold: number;
  /** Total covered questions in the run, so the subset's size is legible. */
  covered: number;
  /** Judge failures. Not counted as incorrect. */
  failed: number;
  /** Mean deterministic fact coverage. The floor under `score`. */
  factCoverage: number;
  /** Answers that asserted something the gold source forbids. The real failures. */
  contradictions: { question: string; fact: string; source: string }[];
  /** Gold facts a graded answer failed to state, with the source to check against. */
  missing: { question: string; fact: string; note: string; source: string }[];
}

// ---------------------------------------------------------------------------
// Deterministic fact checking (pure)
// ---------------------------------------------------------------------------

/**
 * Normalises text for substring comparison.
 *
 * Digit-group separators are stripped so "1,560" and "1560" match — in a corpus
 * whose whole subject is numeric thresholds, treating those as different facts
 * would make the check useless. Unicode dashes and non-breaking spaces are
 * folded for the same reason: canada.ca uses them and a model rarely reproduces
 * them exactly.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[  ]/g, " ")
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks an answer against a gold record. Pure, deterministic, and free — this
 * is the half of correctness that is data rather than opinion.
 */
export function checkFacts(answer: string, gold: GoldAnswer): FactCheck {
  const haystack = normalise(answer);
  const has = (fact: string) => haystack.includes(normalise(fact));

  const stated = gold.mustState.filter(has);
  const missing = gold.mustState.filter((f) => !has(f));
  const contradicted = (gold.mustNotState ?? []).filter(has);

  return {
    stated,
    missing,
    contradicted,
    // No gold facts is a labelling bug, not a perfect score.
    coverage: gold.mustState.length === 0 ? NaN : stated.length / gold.mustState.length,
  };
}

// ---------------------------------------------------------------------------
// Prompt (pure)
// ---------------------------------------------------------------------------

export const CORRECTNESS_SCHEMA = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          stated: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["index", "stated", "note"],
        additionalProperties: false,
      },
    },
    contradictions: { type: "array", items: { type: "integer" } },
  },
  required: ["facts", "contradictions"],
  additionalProperties: false,
} as const;

/**
 * Builds the grading prompt.
 *
 * The judge is given the gold facts and NOT the retrieved chunks. That is the
 * whole design: grading against the passages the model saw is what faithfulness
 * already does, and repeating it here would produce a second faithfulness score
 * wearing a correctness label.
 */
export function buildCorrectnessPrompt(
  question: string,
  answer: string,
  gold: GoldAnswer,
): string {
  const required = gold.mustState.map((f, i) => `[${i + 1}] ${f}`).join("\n");
  const forbidden = (gold.mustNotState ?? [])
    .map((f, i) => `[${i + 1}] ${f}`)
    .join("\n");

  return `You are grading whether an answer is CORRECT against a verified reference.

The reference facts below were taken from the official source and are the ground truth. Grade the answer against them, not against your own knowledge and not against how well written it is.

For each required fact, decide whether the answer states it. A fact counts as stated if the answer conveys it — a paraphrase, a different unit of the same quantity, or a restatement in other words all count. It does NOT count if the answer merely mentions the topic, hedges about it, or states a different value.

Then list the numbers of any forbidden claims the answer actually asserts. A forbidden claim counts only if the answer asserts it as true — mentioning it in order to correct or deny it does not count.

Return ONLY a JSON object of this shape, with no commentary:

{"facts":[{"index":1,"stated":true,"note":"<max 12 words: where, or what it said instead>"}],"contradictions":[]}

Question: ${question}

Required facts:
${required}

Forbidden claims:
${forbidden || "(none)"}

Answer to grade:
${answer}`;
}

// ---------------------------------------------------------------------------
// Parsing and scoring (pure)
// ---------------------------------------------------------------------------

export class CorrectnessParseError extends Error {}

export interface ParsedCorrectness {
  facts: { fact: string; stated: boolean; note: string }[];
  contradictions: string[];
}

/**
 * Parses the judge's reply and pairs it back to the gold facts.
 *
 * Strict about coverage for the same reason precision.ts is: a required fact
 * with no verdict cannot be counted as missing, so quietly dropping it would
 * raise the score.
 */
export function parseCorrectnessResponse(
  text: string,
  gold: GoldAnswer,
): ParsedCorrectness {
  const raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new CorrectnessParseError(`no JSON object in reply: ${raw.slice(0, 120)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new CorrectnessParseError(
      `reply is not valid JSON (${(err as Error).message})`,
    );
  }

  const body = parsed as { facts?: unknown; contradictions?: unknown };
  if (!Array.isArray(body?.facts)) {
    throw new CorrectnessParseError("reply has no `facts` array");
  }

  const byIndex = new Map<number, { stated: boolean; note: string }>();
  body.facts.forEach((f, i) => {
    const o = f as Record<string, unknown>;
    if (typeof o?.index !== "number" || typeof o?.stated !== "boolean") {
      throw new CorrectnessParseError(
        `fact ${i} is malformed (need numeric \`index\` and boolean \`stated\`)`,
      );
    }
    byIndex.set(o.index, {
      stated: o.stated,
      note: typeof o.note === "string" ? o.note : "",
    });
  });

  const facts = gold.mustState.map((fact, i) => {
    const verdict = byIndex.get(i + 1);
    if (!verdict) {
      throw new CorrectnessParseError(
        `no verdict for required fact ${i + 1} of ${gold.mustState.length} — ` +
          `an ungraded fact cannot be counted missing, so this would inflate correctness`,
      );
    }
    return { fact, stated: verdict.stated, note: verdict.note };
  });

  const forbidden = gold.mustNotState ?? [];
  const contradictions = Array.isArray(body.contradictions)
    ? body.contradictions
        .filter((n): n is number => typeof n === "number")
        .map((n) => forbidden[n - 1])
        .filter((f): f is string => typeof f === "string")
    : [];

  return { facts, contradictions };
}

/**
 * Fraction of required facts stated — forced to 0 by any contradiction.
 *
 * The cliff is deliberate. An answer that states four right things and one wrong
 * one is not 80% correct to someone about to file on it; a forbidden claim is
 * the specific error the gold record was written to catch.
 */
export function correctness(parsed: ParsedCorrectness): number {
  if (parsed.contradictions.length > 0) return 0;
  if (parsed.facts.length === 0) return NaN;
  return parsed.facts.filter((f) => f.stated).length / parsed.facts.length;
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function summariseCorrectness(
  verdicts: CorrectnessVerdict[],
  sources: Map<string, string>,
  judgeModel: string,
  covered: number,
): CorrectnessResult {
  const scored = verdicts.filter((v) => !Number.isNaN(v.score));
  const source = (q: string) => sources.get(q) ?? "";

  return {
    judgeModel,
    score: mean(scored.map((v) => v.score)),
    judged: scored.length,
    gold: verdicts.length,
    covered,
    failed: verdicts.filter((v) => v.error !== null).length,
    factCoverage: mean(
      verdicts.map((v) => v.facts.coverage).filter((c) => !Number.isNaN(c)),
    ),
    // Reported even for verdicts the judge failed on. A forbidden string that
    // literally appears in the answer is confirmed wrong whether or not a model
    // was available to agree — the score stays NaN, but hiding the finding
    // because the grader timed out would suppress the strongest evidence here.
    contradictions: verdicts.flatMap((v) =>
      v.facts.contradicted.map((fact) => ({
        question: v.question,
        fact,
        source: source(v.question),
      })),
    ),
    missing: scored.flatMap((v) =>
      (v.graded ?? [])
        .filter((g) => !g.stated)
        .map((g) => ({
          question: v.question,
          fact: g.fact,
          note: g.note,
          source: source(v.question),
        })),
    ),
  };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

/** Grades one gold question. Never throws. */
export async function judgeCorrectness(input: {
  question: string;
  answer: string;
  gold: GoldAnswer;
  generate: (prompt: string) => Promise<string>;
}): Promise<CorrectnessVerdict> {
  const { question, answer, gold, generate } = input;
  const facts = checkFacts(answer, gold);

  try {
    const parsed = parseCorrectnessResponse(
      await generate(buildCorrectnessPrompt(question, answer, gold)),
      gold,
    );
    // The judge's contradiction finding is unioned with the deterministic one.
    // A forbidden string that literally appears in the answer is a contradiction
    // whether or not the judge noticed it.
    const contradictions = [
      ...new Set([...parsed.contradictions, ...facts.contradicted]),
    ];
    const merged = { ...parsed, contradictions };
    return {
      question,
      facts: { ...facts, contradicted: contradictions },
      graded: parsed.facts,
      score: correctness(merged),
      wrong: contradictions.length > 0,
      error: null,
    };
  } catch (err) {
    return {
      question,
      facts,
      graded: null,
      score: NaN,
      wrong: false,
      error: (err as Error).message,
    };
  }
}
