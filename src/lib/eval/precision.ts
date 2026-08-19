// Judged context precision: of the k chunks retrieval returned, how many are
// actually relevant to the question?
//
// This is the companion to score.ts's `rankPrecision`, and they are deliberately
// both on the page because they fail in opposite directions. Rank precision is
// label-based — it counts a chunk as relevant only if the question's `expect`
// list names it, so a genuinely useful neighbouring card is scored as noise.
// This metric asks a model instead, so it can credit that neighbour — at the
// cost of being an opinion rather than an arithmetic fact. When the two
// disagree, the gap is the label set's blind spot, which is worth seeing.
//
// It also does something neither recall nor rank precision can: it is DEFINED
// for out-of-corpus questions. `summary.uncovered.alwaysFullK` records that the
// RPC applies no similarity floor, so every out-of-corpus query still comes back
// with a full k chunks — until now a caveat on the page with no number attached.
// Here the ideal for those questions is zero relevant chunks, so the caveat
// becomes a measurement.
//
// Honesty rules, the same three that govern judge.ts:
//
//  1. A judge failure is NaN, never 0. A precision of 0 is a real and damning
//     finding — "nothing we retrieved was relevant" — and fabricating it from a
//     timed-out API call would be inventing evidence of a bug.
//  2. Covered and out-of-corpus questions are scored SEPARATELY and never
//     averaged. High is good for one and low is good for the other; a combined
//     mean would let a gain in one silently cancel a loss in the other.
//  3. A verdict list that doesn't match the chunk list one-for-one is a failure,
//     not a smaller denominator. Dropping a verdict for a chunk the judge didn't
//     mention would raise the score, since a missing chunk can no longer be
//     irrelevant.

import type { RetrievedChunk } from "@/lib/rag/retrieve";

/** One retrieved chunk with the judge's verdict on it. */
export interface JudgedChunk {
  sourceTitle: string;
  /** 1-based position in the ranking, so findings can name where it landed. */
  rank: number;
  relevant: boolean;
  /** The judge's one-line reason. Kept for irrelevant chunks — a precision
   *  figure with no examples cannot be checked. */
  note: string;
}

export interface PrecisionVerdict {
  question: string;
  /** False for out-of-corpus questions, which are summarised separately. */
  covered: boolean;
  /** Null when the judge failed. Never coerced to an empty list. */
  chunks: JudgedChunk[] | null;
  /** relevant/total, 0–1. NaN when the judge failed or nothing was retrieved. */
  score: number;
  error: string | null;
}

export interface ContextPrecisionSummary {
  judgeModel: string;
  /** Mean precision over covered questions. Higher is better. NaN if none. */
  score: number;
  /** Covered questions the judge scored. The denominator of `score`. */
  judged: number;
  /** Questions where the JUDGE failed. Not counted as zero precision. */
  failed: number;
  /**
   * Mean precision over OUT-OF-CORPUS questions, where the ideal is 0 — the
   * corpus doesn't cover them, so nothing relevant should come back. Reported
   * separately and never folded into `score`; see rule 2 above.
   */
  uncoveredScore: number;
  uncoveredJudged: number;
  /**
   * Covered questions whose TOP-ranked chunk was judged irrelevant. The full
   * irrelevant list runs to hundreds of rows and reads as noise; this is the
   * subset that means the retriever led with the wrong card.
   */
  topRankIrrelevant: { question: string; sourceTitle: string; note: string }[];
  /**
   * Out-of-corpus questions that retrieved something judged relevant. Either the
   * corpus quietly grew into its own declared scope boundary, or the judge is
   * being generous — both are worth looking at, and okf/index.md calls that
   * boundary load-bearing for the refusal metric.
   */
  uncoveredRelevant: { question: string; sourceTitle: string; note: string }[];
}

// ---------------------------------------------------------------------------
// Prompt (pure)
// ---------------------------------------------------------------------------

/** The reply shape, enforced at the API level as well as described in the prompt. */
export const PRECISION_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          relevant: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["index", "relevant", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

/**
 * Builds the judging prompt. Pure and exported so the exact wording is visible
 * in a test and in review — a judged metric is only as trustworthy as the
 * instruction that produced it, and burying that string inside an API call makes
 * it the one part of the pipeline nobody reads.
 */
export function buildPrecisionPrompt(
  question: string,
  chunks: RetrievedChunk[],
): string {
  const sources = chunks
    .map((c, i) => `[${i + 1}] ${c.sourceTitle}\n${c.text}`)
    .join("\n\n");

  return `You are grading whether each retrieved source is RELEVANT to a question.

A source is relevant if it contains information that would help answer this specific question — a rule, a number, a definition, or a condition the answer would need to cite. Judge each source on its own.

Rules:
- Relevance is about THIS question, not about whether the source is generally useful or well written.
- A source on a neighbouring topic that shares vocabulary but answers a different question is NOT relevant. "Ontario's stream requires CLB 5" is not relevant to a question about the federal minimum.
- A source that only partially helps IS relevant. It does not have to answer the question by itself.
- If the question is outside what these sources cover, mark them all irrelevant. That is a valid and expected outcome — do not stretch to find a connection.
- Judge every source. Return exactly one verdict per source, using its number.

Return ONLY a JSON object of this shape, with no commentary:

{"verdicts":[{"index":1,"relevant":true,"note":"<max 12 words: what makes it relevant, or what it's actually about>"}]}

Question: ${question}

Sources:
${sources}`;
}

// ---------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------

export class PrecisionParseError extends Error {}

interface RawVerdict {
  index: number;
  relevant: boolean;
  note: string;
}

/**
 * Parses the judge's reply into one verdict per chunk, in chunk order.
 *
 * Strict about coverage: every chunk must have exactly one verdict. A reply that
 * skips a chunk, repeats one, or invents an index throws rather than being
 * patched up, because every one of those repairs would move the score in the
 * flattering direction — a chunk with no verdict is a chunk that can no longer
 * be counted irrelevant.
 */
export function parsePrecisionResponse(
  text: string,
  chunks: RetrievedChunk[],
): JudgedChunk[] {
  const raw = text.trim();

  // Tolerant about the wrapper even though the schema should make it
  // unnecessary — models add fences and prose regardless, and a structured
  // output setting is a strong guarantee rather than a total one.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new PrecisionParseError(
      `no JSON object in judge reply: ${raw.slice(0, 120)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new PrecisionParseError(
      `judge reply is not valid JSON (${(err as Error).message})`,
    );
  }

  const verdicts = (parsed as { verdicts?: unknown })?.verdicts;
  if (!Array.isArray(verdicts)) {
    throw new PrecisionParseError("judge reply has no `verdicts` array");
  }

  const byIndex = new Map<number, RawVerdict>();
  verdicts.forEach((v, i) => {
    const o = v as Record<string, unknown>;
    if (typeof o?.index !== "number" || typeof o?.relevant !== "boolean") {
      throw new PrecisionParseError(
        `verdict ${i} is malformed (need numeric \`index\` and boolean \`relevant\`)`,
      );
    }
    if (byIndex.has(o.index)) {
      throw new PrecisionParseError(`verdict for source ${o.index} appears twice`);
    }
    byIndex.set(o.index, {
      index: o.index,
      relevant: o.relevant,
      note: typeof o.note === "string" ? o.note : "",
    });
  });

  return chunks.map((chunk, i) => {
    const verdict = byIndex.get(i + 1);
    if (!verdict) {
      throw new PrecisionParseError(
        `no verdict for source ${i + 1} of ${chunks.length} — an unjudged chunk ` +
          `cannot be counted irrelevant, so this would inflate precision`,
      );
    }
    return {
      sourceTitle: chunk.sourceTitle,
      rank: chunk.rank,
      relevant: verdict.relevant,
      note: verdict.note,
    };
  });
}

// ---------------------------------------------------------------------------
// Scoring (pure)
// ---------------------------------------------------------------------------

/** Fraction of retrieved chunks judged relevant. NaN for an empty list. */
export function precision(chunks: JudgedChunk[]): number {
  if (chunks.length === 0) return NaN;
  return chunks.filter((c) => c.relevant).length / chunks.length;
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Aggregates verdicts. Covered and out-of-corpus questions are summarised into
 * separate figures — see rule 2 at the top of the file.
 */
export function summarisePrecision(
  verdicts: PrecisionVerdict[],
  judgeModel: string,
): ContextPrecisionSummary {
  const scored = verdicts.filter((v) => !Number.isNaN(v.score));
  const covered = scored.filter((v) => v.covered);
  const uncovered = scored.filter((v) => !v.covered);

  return {
    judgeModel,
    score: mean(covered.map((v) => v.score)),
    judged: covered.length,
    failed: verdicts.filter((v) => v.error !== null).length,
    uncoveredScore: mean(uncovered.map((v) => v.score)),
    uncoveredJudged: uncovered.length,
    topRankIrrelevant: covered.flatMap((v) => {
      const top = (v.chunks ?? []).find((c) => c.rank === 1);
      if (!top || top.relevant) return [];
      return [{ question: v.question, sourceTitle: top.sourceTitle, note: top.note }];
    }),
    uncoveredRelevant: uncovered.flatMap((v) =>
      (v.chunks ?? [])
        .filter((c) => c.relevant)
        .map((c) => ({
          question: v.question,
          sourceTitle: c.sourceTitle,
          note: c.note,
        })),
    ),
  };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

/**
 * Judges one question's retrieved chunks. Never throws: a judge failure is data
 * (an unjudged question), not a reason to abandon a run that took ten minutes of
 * API calls.
 */
export async function judgePrecision(input: {
  question: string;
  covered: boolean;
  chunks: RetrievedChunk[];
  generate: (prompt: string) => Promise<string>;
}): Promise<PrecisionVerdict> {
  const { question, covered, chunks, generate } = input;

  if (chunks.length === 0) {
    return {
      question,
      covered,
      chunks: null,
      score: NaN,
      error: "nothing was retrieved, so there is no precision to measure",
    };
  }

  try {
    const reply = await generate(buildPrecisionPrompt(question, chunks));
    const judged = parsePrecisionResponse(reply, chunks);
    return { question, covered, chunks: judged, score: precision(judged), error: null };
  } catch (err) {
    return {
      question,
      covered,
      chunks: null,
      score: NaN,
      error: (err as Error).message,
    };
  }
}
