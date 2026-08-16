// Faithfulness judging: is each claim in an answer actually supported by the
// passages the model was given?
//
// This is the metric the /eval page previously said out loud that it did not
// have: recall@k proves the right passage was retrieved, and nothing after that
// graded the prose. A run can retrieve every correct source and still produce an
// answer that adds a number nobody wrote down. Faithfulness is the closing of
// that loop.
//
// The method is the standard one: decompose the answer into atomic claims, then
// judge each claim against the retrieved contexts alone. Faithfulness is the
// fraction of claims that are supported. Decomposing first matters — asking "is
// this answer faithful?" in one shot produces a vibe, whereas a claim list makes
// the verdict inspectable and lets the dashboard publish the exact sentences
// that failed.
//
// Three rules keep the number honest, and each of them is a way the metric could
// otherwise flatter itself:
//
//  1. A judge failure is null, never 0. If the judge call errors or returns
//     unparseable output, that question is UNJUDGED. Scoring it as 0% would
//     invent a hallucination; scoring it as 100% would hide one. The run records
//     how many failed so the denominator is visible.
//  2. Refusals are excluded, not counted as perfect. "I don't have any indexed
//     rules that address that" makes no claim about the sources, so it is
//     trivially faithful and averaging it in as 1.0 would let a system that
//     refuses everything post a perfect faithfulness score. Refusal already has
//     its own metric.
//  3. Out-of-corpus questions that got ANSWERED are judged. That is precisely
//     where invention lives — the model had no supporting passage and wrote
//     something anyway — so excluding them would drop the most informative
//     cases on the floor.
//
// What this does NOT measure: correctness. An answer faithfully derived from a
// retrieved chunk is still wrong if the chunk was the wrong chunk, or if the
// corpus itself is wrong. Faithfulness bounds invention, not truth.

/** One atomic factual claim pulled out of an answer, with the judge's verdict. */
export interface JudgedClaim {
  claim: string;
  supported: boolean;
  /** The judge's one-line reason. Kept for unsupported claims — a score with no
   *  examples is not debuggable, which is the same reason misses are published. */
  note: string;
}

export interface FaithfulnessVerdict {
  question: string;
  /** Null when the judge failed; `error` says why. Never coerced to an empty list. */
  claims: JudgedClaim[] | null;
  /** supported/total, 0–1. NaN when the judge failed or extracted no claims. */
  score: number;
  error: string | null;
}

export interface FaithfulnessSummary {
  /** Mean per-question faithfulness over judged questions, 0–1. NaN if none. */
  score: number;
  /** Questions the judge successfully scored. The denominator of `score`. */
  judged: number;
  /** Answers skipped because they were refusals — see rule 2 above. */
  skippedRefusals: number;
  /** Questions where the judge itself failed. NOT counted as unfaithful. */
  failed: number;
  /** Every claim the judge marked unsupported, with the question it came from. */
  unsupported: { question: string; claim: string; note: string }[];
  /** Questions where every claim was supported. */
  clean: number;
}

// ---------------------------------------------------------------------------
// Prompt (pure)
// ---------------------------------------------------------------------------

/**
 * Builds the judge prompt. Pure and exported so the exact wording is visible in
 * a test and in review — a judged metric is only as trustworthy as the
 * instruction that produced it, and burying that string inside an API call makes
 * it the one part of the pipeline nobody reads.
 */
export function buildJudgePrompt(
  question: string,
  answer: string,
  contexts: string[],
): string {
  const sources = contexts.map((c, i) => `[${i + 1}]\n${c}`).join("\n\n");

  return `You are grading whether an answer is FAITHFUL to the sources it was given.

Faithful means: every factual claim in the answer can be verified from the sources below. You are NOT grading whether the answer is correct in the real world, helpful, or complete. A claim that is true in reality but absent from the sources is UNSUPPORTED.

Do this in two steps.

1. Break the answer into atomic factual claims. One fact per claim. Split compound sentences. Ignore pure pleasantries, hedges, and restatements of the question — they assert nothing.
2. For each claim, decide whether the sources support it.

Rules:
- Numbers must match exactly. "up to 50 points" is not supported by a source saying "up to 25 points".
- A claim that generalises beyond the sources is unsupported, even if it sounds reasonable.
- A claim that the sources do not address the question IS supported, if that is what the sources show.
- Citation markers like [1] are not claims.

Return ONLY a JSON object of this shape, with no markdown fence and no commentary:

{"claims":[{"claim":"<the claim, quoted or closely paraphrased>","supported":true,"note":"<max 15 words: which source supports it, or what is missing>"}]}

If the answer contains no factual claims at all, return {"claims":[]}.

Sources:
${sources}

Question: ${question}

Answer to grade:
${answer}`;
}

// ---------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------

export class JudgeParseError extends Error {}

/**
 * Parses the judge's reply into claims.
 *
 * Tolerant about the wrapper (models add ```json fences and prose around JSON
 * even when told not to), strict about the contents. A malformed claim throws
 * rather than being dropped: silently discarding half the claims would raise
 * faithfulness, since a dropped claim can no longer be unsupported.
 */
export function parseJudgeResponse(text: string): JudgedClaim[] {
  const raw = text.trim();

  // Strip a fenced block if present, then fall back to the outermost {...}.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new JudgeParseError(`no JSON object in judge reply: ${raw.slice(0, 120)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new JudgeParseError(`judge reply is not valid JSON (${(err as Error).message})`);
  }

  const claims = (parsed as { claims?: unknown })?.claims;
  if (!Array.isArray(claims)) {
    throw new JudgeParseError("judge reply has no `claims` array");
  }

  return claims.map((c, i) => {
    const o = c as Record<string, unknown>;
    if (typeof o?.claim !== "string" || typeof o?.supported !== "boolean") {
      throw new JudgeParseError(
        `claim ${i} is malformed (need string \`claim\` and boolean \`supported\`)`,
      );
    }
    return {
      claim: o.claim,
      supported: o.supported,
      note: typeof o.note === "string" ? o.note : "",
    };
  });
}

// ---------------------------------------------------------------------------
// Scoring (pure)
// ---------------------------------------------------------------------------

/**
 * Fraction of claims that are supported. NaN for an empty claim list — an answer
 * asserting nothing has no faithfulness, and calling that 1.0 would reward a
 * model for saying nothing.
 */
export function faithfulness(claims: JudgedClaim[]): number {
  if (claims.length === 0) return NaN;
  return claims.filter((c) => c.supported).length / claims.length;
}

/**
 * Aggregates verdicts. Averages per QUESTION, not per claim, for the same reason
 * scoreSet does: otherwise one verbose answer with thirty claims outweighs ten
 * short ones.
 */
export function summariseFaithfulness(
  verdicts: FaithfulnessVerdict[],
  skippedRefusals: number,
): FaithfulnessSummary {
  const scored = verdicts.filter((v) => !Number.isNaN(v.score));
  const failed = verdicts.filter((v) => v.error !== null).length;

  const unsupported = verdicts.flatMap((v) =>
    (v.claims ?? [])
      .filter((c) => !c.supported)
      .map((c) => ({ question: v.question, claim: c.claim, note: c.note })),
  );

  return {
    score: scored.length
      ? scored.reduce((sum, v) => sum + v.score, 0) / scored.length
      : NaN,
    judged: scored.length,
    skippedRefusals,
    failed,
    unsupported,
    clean: scored.filter((v) => (v.claims ?? []).every((c) => c.supported)).length,
  };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

/**
 * Model that does the grading. Deliberately configurable and recorded in the run
 * artifact: a faithfulness figure is a property of one judge, and comparing two
 * runs graded by different judges is comparing nothing — the same trap the
 * embedding model poses for recall.
 *
 * It defaults to the same family as the generator, which means the system is
 * partly grading itself. That is a real weakness, stated on the dashboard rather
 * than papered over; a different vendor's model here would be stronger evidence.
 */
export const JUDGE_MODEL = process.env.GEMINI_JUDGE_MODEL ?? "gemini-3.6-flash";

/**
 * Judges one answer. Never throws: a judge failure is data (an unjudged
 * question), not a reason to abandon a run that took ten minutes of API calls.
 */
export async function judgeAnswer(input: {
  question: string;
  answer: string;
  contexts: string[];
  generate: (prompt: string) => Promise<string>;
}): Promise<FaithfulnessVerdict> {
  const { question, answer, contexts, generate } = input;

  if (contexts.length === 0) {
    return {
      question,
      claims: null,
      score: NaN,
      error: "no contexts were retrieved, so there is nothing to be faithful to",
    };
  }

  try {
    const reply = await generate(buildJudgePrompt(question, answer, contexts));
    const claims = parseJudgeResponse(reply);
    return { question, claims, score: faithfulness(claims), error: null };
  } catch (err) {
    return { question, claims: null, score: NaN, error: (err as Error).message };
  }
}
