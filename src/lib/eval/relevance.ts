// Answer relevance: does the answer actually address the question that was asked?
//
// This is the gap faithfulness leaves open from the other side. Faithfulness
// grades an answer against its retrieved chunks, so an answer that is perfectly
// grounded in those chunks scores 100% even if it answers a question adjacent to
// the one asked — "here is how provincial nomination points work" in response to
// "how do I claim a nomination I already have". Recall says the right card came
// back; faithfulness says nothing was invented; neither notices the miss.
//
// The method is the reverse-question one: ask a model what questions the answer
// would fully answer, embed those, and compare them against the original
// question. An answer that addresses the question generates questions close to
// it; an answer that drifts generates questions that don't.
//
// Why this rather than a rubric judge: the number then rests on the same
// embedding space the retriever itself uses, and everything downstream of the
// model call — cosine, averaging, the failure rules — is arithmetic that can be
// tested against fixed vectors instead of a model's opinion of its own output.
//
// Honesty rules, matching judge.ts:
//
//  1. A failure in either stage — generation or embedding — is NaN, never 0. A
//     relevance of 0 means "this answer addressed nothing that was asked", which
//     is a serious claim to make about a system on the strength of a timeout.
//  2. Refusals are skipped, not scored. "I don't have any indexed rules that
//     address that" is a correct answer to an out-of-corpus question and a
//     terrible match for its embedding — scoring it would punish the system for
//     the exact behaviour the refusal metric rewards.
//  3. Out-of-corpus questions that got ANSWERED are scored. That is where a
//     confidently on-topic answer with nothing behind it shows up.
//
// What it does NOT measure: correctness, completeness, or groundedness. A fluent
// wrong answer to the right question scores well here. It is a check that the
// system is answering the question in front of it, nothing more.

/** The reverse-generated questions for one answer, with their similarity. */
export interface RelevanceVerdict {
  question: string;
  /** Questions the model says the answer would answer. Null when generation failed. */
  generated: string[] | null;
  /** Mean cosine similarity to the original question, 0–1. NaN on failure. */
  score: number;
  error: string | null;
}

export interface AnswerRelevanceResult {
  judgeModel: string;
  /**
   * Cosine similarity is a property of one embedding space. A relevance figure
   * from a different embedding model is not comparable to this one, for exactly
   * the reason recall isn't — so the model is recorded and diff.ts warns on a
   * change, the same as it does for the judge.
   */
  embeddingModel: string;
  /** Mean per-question relevance. NaN when nothing was scored. */
  score: number;
  judged: number;
  /** Refusals, excluded rather than scored near zero. See rule 2. */
  skippedRefusals: number;
  /** Questions where generation or embedding failed. Not counted as irrelevant. */
  failed: number;
  /** The weakest answers, published so the figure can be checked against them. */
  lowest: { question: string; score: number; generated: string[] }[];
}

/** How many questions to reverse-generate per answer. */
export const REVERSE_QUESTIONS = 3;

/** How many of the weakest rows to publish. */
const LOWEST_SHOWN = 10;

// ---------------------------------------------------------------------------
// Prompt (pure)
// ---------------------------------------------------------------------------

export const RELEVANCE_SCHEMA = {
  type: "object",
  properties: {
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

/**
 * Builds the reverse-question prompt. Pure and exported so the wording is
 * visible in review — the instruction is the metric here.
 *
 * The answer is given WITHOUT the original question on purpose. Showing the
 * question would let the model echo it back, and every answer would then score
 * near-perfect relevance regardless of what it said.
 */
export function buildRelevancePrompt(answer: string): string {
  return `Below is an answer written by an assistant. You cannot see the question it was answering.

Write ${REVERSE_QUESTIONS} questions that this answer fully and directly answers. Base them ONLY on what the answer actually says — not on what it gestures at, mentions in passing, or what you imagine the original question might have been. If the answer is narrow, your questions should be narrow.

Return ONLY a JSON object of this shape, with no commentary:

{"questions":["<question 1>","<question 2>","<question 3>"]}

Answer:
${answer}`;
}

// ---------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------

export class RelevanceParseError extends Error {}

export function parseRelevanceResponse(text: string): string[] {
  const raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new RelevanceParseError(
      `no JSON object in reply: ${raw.slice(0, 120)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new RelevanceParseError(
      `reply is not valid JSON (${(err as Error).message})`,
    );
  }

  const questions = (parsed as { questions?: unknown })?.questions;
  if (!Array.isArray(questions)) {
    throw new RelevanceParseError("reply has no `questions` array");
  }

  const clean = questions.filter(
    (q): q is string => typeof q === "string" && q.trim().length > 0,
  );
  if (clean.length === 0) {
    // An empty list would otherwise average to NaN further down and look like a
    // transport failure. It isn't — it's a model that produced nothing usable,
    // and naming it that way keeps the failure counts honest.
    throw new RelevanceParseError("reply contained no questions");
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Scoring (pure)
// ---------------------------------------------------------------------------

/**
 * Cosine similarity. NaN when either vector has zero magnitude — an undefined
 * angle, not an angle of 90°.
 *
 * The vectors are normalised here rather than assumed to be unit length:
 * gemini-embedding-001 truncated to 768 dimensions does not come back
 * normalised, and skipping this step yields numbers that look like similarities
 * and rank differently.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return NaN;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return NaN;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Mean similarity of the reverse-generated questions to the original. */
export function relevance(
  questionVector: number[],
  generatedVectors: number[][],
): number {
  if (generatedVectors.length === 0) return NaN;
  const scores = generatedVectors.map((v) => cosine(questionVector, v));
  if (scores.some((s) => Number.isNaN(s))) return NaN;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

export function summariseRelevance(
  verdicts: RelevanceVerdict[],
  skippedRefusals: number,
  judgeModel: string,
  embeddingModel: string,
): AnswerRelevanceResult {
  const scored = verdicts.filter((v) => !Number.isNaN(v.score));

  return {
    judgeModel,
    embeddingModel,
    score: scored.length
      ? scored.reduce((sum, v) => sum + v.score, 0) / scored.length
      : NaN,
    judged: scored.length,
    skippedRefusals,
    failed: verdicts.filter((v) => v.error !== null).length,
    lowest: [...scored]
      .sort((a, b) => a.score - b.score)
      .slice(0, LOWEST_SHOWN)
      .map((v) => ({
        question: v.question,
        score: v.score,
        generated: v.generated ?? [],
      })),
  };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

/**
 * Scores one answer. Never throws — a failure is an unscored question, not a
 * reason to abandon the run.
 */
export async function judgeRelevance(input: {
  question: string;
  answer: string;
  generate: (prompt: string) => Promise<string>;
  embed: (text: string) => Promise<number[]>;
}): Promise<RelevanceVerdict> {
  const { question, answer, generate, embed } = input;

  if (answer.trim().length === 0) {
    return {
      question,
      generated: null,
      score: NaN,
      error: "the answer was empty, so there is nothing to compare",
    };
  }

  try {
    const generated = parseRelevanceResponse(
      await generate(buildRelevancePrompt(answer)),
    );
    const [questionVector, ...generatedVectors] = await Promise.all([
      embed(question),
      ...generated.map((g) => embed(g)),
    ]);
    return {
      question,
      generated,
      score: relevance(questionVector, generatedVectors),
      error: null,
    };
  } catch (err) {
    return { question, generated: null, score: NaN, error: (err as Error).message };
  }
}
