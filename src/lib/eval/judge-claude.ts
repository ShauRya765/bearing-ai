// Transport for the Claude-judged metrics. The sibling of judge-gemini.ts, and
// deliberately the same shape: no logic worth testing lives here, because
// everything that decides a NUMBER — prompts, parsing, arithmetic — is pure and
// unit tested in precision.ts / relevance.ts / correctness.ts, which take a
// `generate` callback so the tests can drive them with a fake.
//
// Why a second vendor at all: /eval already says out loud that faithfulness is
// "a system partly marking its own work" — Gemini grading Gemini, with shared
// blind spots passing unnoticed. The metrics added here are graded by Claude
// instead, so a number both models would read the same wrong way has to survive
// two different models to get through.
//
// Faithfulness deliberately STAYS on Gemini. Moving it would trip the judge-model
// comparability warning in diff.ts and make its delta measure the judges rather
// than the answers, retroactively orphaning every committed run.

import Anthropic from "@anthropic-ai/sdk";

/**
 * Recorded in every run that uses it, for the same reason JUDGE_MODEL is: a
 * judged figure is a property of one judge, and comparing two runs graded by
 * different judges is comparing nothing.
 */
export const CLAUDE_JUDGE_MODEL =
  process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-opus-5";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is required to run the Claude-judged eval metrics.",
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Raised when the model declines. Distinct so callers can record it as its own
 *  outcome rather than as a generic transport error. */
export class JudgeRefusedError extends Error {}

/**
 * Runs one judging prompt and returns the raw text.
 *
 * `schema` constrains the reply to valid JSON at the API level, which removes
 * the malformed-JSON failure mode the Gemini path has to defend against with
 * fence-stripping. The callers still parse strictly: a schema guarantees
 * well-formed JSON, not a well-formed JUDGEMENT, and silently dropping a
 * malformed verdict would raise every score it appears in.
 */
export async function claudeJudge(
  prompt: string,
  schema: Record<string, unknown>,
): Promise<string> {
  const response = await anthropic().messages.create({
    model: CLAUDE_JUDGE_MODEL,
    // Thinking is on by default on this model and max_tokens caps thinking PLUS
    // response text, so a budget sized for the JSON alone truncates mid-verdict.
    max_tokens: 8192,
    output_config: {
      format: { type: "json_schema", schema },
      // Judging is classification against supplied evidence, not open-ended
      // reasoning. Worth a sweep later; not worth `max` by default.
      effort: "medium",
    },
    // No temperature: this model rejects sampling parameters with a 400.
    // Reproducibility comes from the prompt and the schema instead.
    messages: [{ role: "user", content: prompt }],
  });

  // A refusal is a successful HTTP 200 with an empty or partial content array,
  // so reading content[0] first would throw something unrelated. Checked here
  // and raised as its own error, which callers record as a JUDGE failure (NaN)
  // rather than as a score of zero — never invent a finding from a non-answer.
  if (response.stop_reason === "refusal") {
    throw new JudgeRefusedError(
      `judge declined to grade (${response.stop_details?.category ?? "no category"})`,
    );
  }

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
