// Measures the RAG pipeline and prints a paste-ready report.
//
//   npx tsx --tsconfig tsconfig.json scripts/bench-retrieve.ts [options]
//
//     --reps N          repetitions per question for the latency table (default 3)
//     --full            also measure latency + refusals (costs tokens)
//     --judge           also grade the answers with LLM judges (implies --full)
//     --skip-faithfulness   run only the Claude-judged metrics; skip the Gemini
//                       faithfulness pass (that tile then reads "not measured")
//     --save            write the run to src/lib/eval/runs/ for the /eval dashboard
//
// Default is retrieval-only, because that is the run you want to be able to do
// casually. Recall@k is a property of the retriever alone — making the model
// write an answer to measure it burns tokens and adds seconds for nothing.
//
// --full adds the two things that genuinely need generation: the per-stage
// latency table, and whether out-of-corpus questions actually get refused.
// Refusal is a property of the prompt, not the retriever, so it can only be
// observed by asking for real.
//
// Scoring lives in src/lib/eval/score.ts, not here, so the numbers are unit
// tested against fixed inputs instead of only ever being seen in this output.
//
// Runs are sequential and paced on purpose — running them in parallel would
// measure contention, not latency. Every API call is retried through transient
// failures (see withRetry): a judged run is ~330 calls over half an hour, and one
// 503 in the middle of it should not discard everything before it.
//
// --judge adds four graded metrics, which is why it is a separate flag rather
// than part of --full — it multiplies the model calls several times over.
//
//   faithfulness      (judge.ts)       is every claim supported by the passages
//                                      the model was given?  — judged by Gemini
//   context precision (precision.ts)   were the retrieved chunks relevant at all?
//   answer relevance  (relevance.ts)   does the answer address the question asked?
//   correctness       (correctness.ts) is it RIGHT, per canada.ca — the only one
//                                      graded against something other than okf/
//
// The last three are judged by Claude rather than Gemini, so a mistake both the
// generator and its grader would make the same way has to survive two model
// families. Faithfulness stays on Gemini deliberately: switching its judge would
// make its delta against every already-committed run measure the judges instead
// of the answers. Each module documents what its number does and does not mean.
//
// --save writes the run to src/lib/eval/runs/ as a committed JSON artifact, which
// is what the /eval dashboard renders and diffs. The console output above is for
// the person running the command; the artifact is for everyone after them.
import { config } from "dotenv";
config({ path: ".env.local" });

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { EVAL_QUESTIONS, COVERED, UNCOVERED, HARD } from "@/lib/eval/questions";
import {
  scoreQuestion,
  summarise,
  percentile,
  type QuestionScore,
  type SetScore,
} from "@/lib/eval/score";
import {
  judgeAnswer,
  summariseFaithfulness,
  JUDGE_MODEL,
  type FaithfulnessVerdict,
} from "@/lib/eval/judge";
import {
  RUN_SCHEMA_VERSION,
  runFilename,
  serializeRun,
  type EvalRun,
  type GenerationResult,
  type LatencyStage,
} from "@/lib/eval/run";
import {
  judgePrecision,
  summarisePrecision,
  PRECISION_SCHEMA,
  type PrecisionVerdict,
} from "@/lib/eval/precision";
import {
  judgeRelevance,
  summariseRelevance,
  RELEVANCE_SCHEMA,
  type RelevanceVerdict,
} from "@/lib/eval/relevance";
import {
  judgeCorrectness,
  summariseCorrectness,
  CORRECTNESS_SCHEMA,
  type CorrectnessVerdict,
} from "@/lib/eval/correctness";
import { RUNS_DIR } from "@/lib/eval/runs-store";
import type { RagTimings, RetrievedChunk } from "@/lib/rag/retrieve";

const PACE_MS = 250;

// Transient API failures that are worth waiting out rather than abandoning a run
// for. A judged run is ~330 model calls over half an hour, and a single 503 in
// the middle of it used to discard every call that came before — the shape of
// failure where the harness is more fragile than the thing it measures.
const RETRYABLE = /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|ECONNRESET|ETIMEDOUT|fetch failed/i;

// Backoff schedule, in ms. Deliberately patient: a demand spike on a shared
// model lasts tens of seconds, and waiting a minute is far cheaper than
// re-running everything.
const BACKOFF_MS = [2_000, 5_000, 12_000, 25_000, 45_000];

/**
 * Retries a call through transient failures.
 *
 * Non-retryable errors (a bad model id, a missing key, a malformed request)
 * throw immediately — retrying those just delays a failure you need to see.
 *
 * If the retries are exhausted the error propagates and the run aborts with
 * nothing saved. That is deliberate: a run missing a handful of answers would
 * still produce a refusal rate and a faithfulness score, and those numbers would
 * be quietly computed over a different question set than the one the artifact
 * claims. A missing run is obvious; a silently short one is not.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      if (!RETRYABLE.test(message) || attempt >= BACKOFF_MS.length) throw err;

      const wait = BACKOFF_MS[attempt];
      process.stdout.write(
        `\n  ⚠ ${label}: ${message.slice(0, 90).replace(/\s+/g, " ")}\n` +
          `    retrying in ${wait / 1000}s (attempt ${attempt + 2}/${BACKOFF_MS.length + 1})\n`,
      );
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}

/** Short SHA of the tree the run was made from. Null if git isn't available. */
function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Size of the corpus the run retrieved against. Recorded because recall@k rises
 * trivially as the corpus shrinks — comparing two runs over different corpora
 * without knowing it is the easiest way to celebrate a deletion.
 */
async function corpusSize(): Promise<{ chunks: number; sources: number }> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { count, error } = await supabase
    .from("rule_chunks")
    .select("*", { count: "exact", head: true });
  if (error) throw error;

  const { data, error: titleErr } = await supabase
    .from("rule_chunks")
    .select("source_title");
  if (titleErr) throw titleErr;

  return {
    chunks: count ?? 0,
    sources: new Set((data ?? []).map((r) => r.source_title)).size,
  };
}

// Phrases that mean "the corpus doesn't cover this". Deliberately a small,
// explicit list: if the model starts refusing in wording not covered here the
// refusal rate drops, which is a prompt regression worth seeing rather than
// smoothing over with a fuzzier matcher.
const REFUSAL_MARKERS = [
  "don't have any indexed rules",
  "do not have any indexed rules",
  "outside the current rule set",
  "sources don't contain",
  "sources do not contain",
  "don't contain the answer",
  "do not contain the answer",
  "not contain the answer",
  "cannot answer",
  "can't answer",
  "no information",
  "not addressed in the sources",
  "does not provide",
  "don't provide",
];

function refused(answer: string): boolean {
  const a = answer.toLowerCase();
  return REFUSAL_MARKERS.some((m) => a.includes(m));
}

function ms(n: number): string {
  if (Number.isNaN(n)) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}

/** Writes the run artifact the /eval dashboard reads. */
async function writeRun(input: {
  startedAt: string;
  matchCount: number;
  generationModel: string | null;
  summary: EvalRun["summary"];
  scores: QuestionScore[];
  generation: GenerationResult | null;
}): Promise<void> {
  const { EMBEDDING_MODEL } = await import("@/lib/rag/retrieve");

  const run: EvalRun = {
    meta: {
      schema: RUN_SCHEMA_VERSION,
      startedAt: input.startedAt,
      gitSha: gitSha(),
      embeddingModel: EMBEDDING_MODEL,
      generationModel: input.generationModel,
      matchCount: input.matchCount,
      corpus: await corpusSize(),
      questions: {
        total: EVAL_QUESTIONS.length,
        covered: COVERED.length,
        hard: HARD.length,
        uncovered: UNCOVERED.length,
      },
    },
    summary: input.summary,
    scores: input.scores,
    generation: input.generation,
  };

  mkdirSync(RUNS_DIR, { recursive: true });
  const path = join(RUNS_DIR, runFilename(input.startedAt));
  writeFileSync(path, serializeRun(run));
  console.log(`\nSaved run → ${path.replace(process.cwd() + "/", "")}`);
  console.log(`Commit it to publish these numbers on /eval.`);
}

/** An undefined metric prints as a dash, never as a digit — same rule as format.ts. */
function fmtPct(value: number): string {
  return Number.isNaN(value) ? "—" : `${(value * 100).toFixed(1)}%`;
}

function bar(fraction: number, width = 24): string {
  if (Number.isNaN(fraction)) return "·".repeat(width);
  const filled = Math.round(fraction * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

async function main() {
  const argv = process.argv;
  const flag = (f: string) => argv.includes(f);
  const num = (f: string, d: number) => {
    const i = argv.indexOf(f);
    return i > -1 ? Number(argv[i + 1]) : d;
  };

  const judge = flag("--judge");
  /**
   * Skips the Gemini faithfulness pass, leaving the three Claude-judged metrics.
   *
   * Retrieval and generation still run — they are not metrics, they are the
   * inputs the judges grade, and the committed artifacts store titles rather
   * than chunk text or answers, so neither can be recovered from a previous run.
   * The saving is the faithfulness pass alone.
   *
   * The cost of using it: the artifact this run writes will have NO faithfulness
   * figure, and the dashboard renders the latest run — so that tile reads "not
   * measured" until a run grades it again. It is not carried forward from the
   * previous run on purpose: that run graded different answers.
   */
  const skipFaithfulness = flag("--skip-faithfulness");
  // Judging grades answers, and there are no answers without a generation pass.
  const full = flag("--full") || judge;
  const save = flag("--save");
  const reps = num("--reps", 3);
  if (!Number.isFinite(reps) || reps < 1) throw new Error("--reps must be >= 1");

  // Stamped before any work happens, so the artifact records when the run was
  // measured rather than when the file was written — they differ by minutes on
  // a --full run.
  const startedAt = new Date().toISOString();

  const { retrieveOnly, askRulesStream, MATCH_COUNT, GENERATION_MODEL } =
    await import("@/lib/rag/retrieve");

  console.log(
    `Eval set: ${EVAL_QUESTIONS.length} questions — ${COVERED.length} covered ` +
      `(${HARD.length} marked hard), ${UNCOVERED.length} out-of-corpus\n`,
  );

  // ---------- Retrieval pass (always) ----------
  console.log(`Retrieving ${EVAL_QUESTIONS.length} questions (no generation)...`);
  const saved: (QuestionScore & { embedMs: number; searchMs: number; chunksUsed: number })[] = [];
  for (const [i, item] of EVAL_QUESTIONS.entries()) {
    const r = await withRetry(`retrieve "${item.q.slice(0, 40)}"`, () =>
      retrieveOnly(item.q),
    );
    const score = scoreQuestion(item, {
      titles: r.citations.map((c) => c.sourceTitle),
      chunksUsed: r.chunksUsed,
      embedMs: r.embedMs,
      searchMs: r.searchMs,
    });
    saved.push({
      ...score,
      embedMs: r.embedMs,
      searchMs: r.searchMs,
      chunksUsed: r.chunksUsed,
    });
    process.stdout.write(`\r  ${i + 1}/${EVAL_QUESTIONS.length}`.padEnd(40));
    await new Promise((res) => setTimeout(res, PACE_MS));
  }
  console.log("\n");

  const scores: QuestionScore[] = saved;
  const summary = summarise(
    scores,
    saved.map((s) => ({ embedMs: s.embedMs, searchMs: s.searchMs })),
    MATCH_COUNT,
    saved.filter((s) => !s.covered).map((s) => s.chunksUsed),
  );

  console.log("## Retrieval quality\n");
  const line = (label: string, s: SetScore) =>
    console.log(
      `  ${label.padEnd(18)} ${bar(s.recall)}  ${(s.recall * 100).toFixed(1)}%   ` +
        `${s.allHit}/${s.total} questions got every source`,
    );
  // Derived, never written out: a hardcoded "@5" printed "Recall@5 … 87.3%" for
  // a k=3 run, which is the exact mislabelling recall@k invites.
  line(`Recall@${MATCH_COUNT} overall`, summary.overall);
  line("  easy questions", summary.easy);
  line("  hard questions", summary.hard);

  if (summary.misses.length) {
    console.log("\n  Misses:\n");
    for (const m of summary.misses) {
      console.log(
        `    "${m.question}"\n      missing: ${m.missing.join(", ")}\n` +
          `      got:     ${m.titles.slice(0, 3).join(", ")}…`,
      );
    }
  }

  console.log(
    `\n  Retrieval latency: embed p50 ${ms(summary.latency.embedP50)} / p95 ${ms(summary.latency.embedP95)}` +
      `  ·  search p50 ${ms(summary.latency.searchP50)} / p95 ${ms(summary.latency.searchP95)}`,
  );

  if (summary.uncovered.alwaysFullK) {
    console.log(
      `\n  Note: every query returned ${MATCH_COUNT} chunks, including the ${UNCOVERED.length} out-of-corpus\n` +
        `  ones — the RPC applies no similarity floor, so refusing is entirely the\n` +
        `  prompt's job. Run with --full to measure whether it actually does.`,
    );
  }

  if (!full) {
    console.log(
      `\nSkipped latency + refusal checks (no generation calls made).\n` +
        `Run with --full to measure those — costs ~${EVAL_QUESTIONS.length * reps} model calls.`,
    );
    if (save) {
      await writeRun({
        startedAt,
        matchCount: MATCH_COUNT,
        // No generation calls were made, so naming a generation model here would
        // claim the run measured something it didn't.
        generationModel: null,
        summary,
        scores,
        generation: null,
      });
    }
    return;
  }

  // ---------- Generation pass (--full only) ----------
  const total = EVAL_QUESTIONS.length * reps;
  console.log(`\nGenerating answers: ${EVAL_QUESTIONS.length} x ${reps} = ${total} calls\n`);

  const timings: RagTimings[] = [];
  const answers = new Map<string, string>();
  // The chunks each answer was actually generated from, captured in the same
  // pipeline pass. Re-retrieving them for the judge could return a different set
  // and grade the answer against passages the model never saw.
  const contexts = new Map<string, string[]>();
  // The same chunks with their titles and ranks, for the precision judge. Kept
  // beside `contexts` rather than replacing it: the faithfulness judge must
  // grade against the exact strings the model was given, with no projection in
  // between.
  const retrieved = new Map<string, RetrievedChunk[]>();
  let done = 0;

  for (let rep = 0; rep < reps; rep++) {
    for (const item of EVAL_QUESTIONS) {
      let captured: string[] = [];
      let capturedChunks: RetrievedChunk[] = [];
      // The whole exchange retries as one unit. Retrying only the initial call
      // would leave a half-consumed stream behind and a timings promise that
      // never settles.
      const { answer, t } = await withRetry(
        `generate "${item.q.slice(0, 40)}"`,
        async () => {
          const {
            stream,
            timings,
            contexts: ctx,
            retrieved: chunks,
          } = await askRulesStream(item.q);
          let text = "";
          for await (const piece of stream) text += piece;
          captured = ctx;
          capturedChunks = chunks;
          return { answer: text, t: await timings };
        },
      );
      timings.push(t);
      if (rep === 0) {
        answers.set(item.q, answer);
        contexts.set(item.q, captured);
        retrieved.set(item.q, capturedChunks);
      }

      done++;
      process.stdout.write(`\r  ${done}/${total}  ${item.q.slice(0, 44)}`.padEnd(96));
      await new Promise((res) => setTimeout(res, PACE_MS));
    }
  }
  console.log("\n");

  const stages: [string, (t: RagTimings) => number | null, string][] = [
    ["Embed the question", (t) => t.embedMs, "One API call, 768-dim"],
    // This note is serialised into the artifact and rendered on /eval, so a
    // hardcoded k publishes a wrong one the moment MATCH_COUNT moves.
    ["Vector search", (t) => t.searchMs, `pgvector, top-${MATCH_COUNT}`],
    ["Prompt assembly", (t) => t.promptMs, "In-process, no I/O"],
    ["First token from model", (t) => t.firstTokenMs, "Streaming"],
    ["Full streamed answer", (t) => t.generateMs, "Length-dependent"],
  ];

  // Built once, then both printed and saved — the dashboard and the console must
  // never be able to disagree about the same run.
  const latency: LatencyStage[] = stages.map(([stage, pick, note]) => {
    const vals = timings.map(pick).filter((v): v is number => v !== null);
    return { stage, p50: percentile(vals, 50), p95: percentile(vals, 95), note };
  });
  const totals = timings.map((t) => t.totalMs);
  latency.push({
    stage: "End to end",
    p50: percentile(totals, 50),
    p95: percentile(totals, 95),
    note: "Retrieval + full answer",
  });

  console.log("## Latency\n");
  console.log("| Stage | p50 | p95 | Note |");
  console.log("| --- | --- | --- | --- |");
  for (const s of latency) {
    console.log(`| ${s.stage} | ${ms(s.p50)} | ${ms(s.p95)} | ${s.note} |`);
  }

  const answeredInstead = UNCOVERED.filter(
    (item) => !refused(answers.get(item.q) ?? ""),
  ).map((item) => ({
    question: item.q,
    excerpt: (answers.get(item.q) ?? "").slice(0, 240).replace(/\s+/g, " ").trim(),
  }));
  const refusedCount = UNCOVERED.length - answeredInstead.length;

  console.log(
    `\n## Refusals\n\n  ${refusedCount}/${UNCOVERED.length} out-of-corpus questions declined`,
  );
  for (const miss of answeredInstead) {
    console.log(`\n  ANSWERED instead of refusing: "${miss.question}"`);
    console.log(`    ${miss.excerpt.slice(0, 160)}…`);
  }

  // ---------- Faithfulness pass (--judge only) ----------
  let faithfulness: GenerationResult["faithfulness"] = undefined;

  if (judge && skipFaithfulness) {
    console.log(
      `\n## Faithfulness\n\n  Skipped (--skip-faithfulness). The artifact will ` +
        `record it as NOT MEASURED rather than carrying the previous run's figure\n` +
        `  forward — that run graded different answers.`,
    );
  }

  if (judge && !skipFaithfulness) {
    const { judgeGenerate } = await import("@/lib/eval/judge-gemini");

    // Refusals are skipped, not scored: an answer that asserts nothing about the
    // sources is trivially faithful, and averaging those in as 1.0 would let a
    // system that refuses everything post a perfect score. Out-of-corpus
    // questions that got ANSWERED are judged — that is exactly where invention
    // lives.
    const toJudge = EVAL_QUESTIONS.filter(
      (item) => !refused(answers.get(item.q) ?? ""),
    );
    const skippedRefusals = EVAL_QUESTIONS.length - toJudge.length;

    console.log(
      `\nJudging faithfulness: ${toJudge.length} answers with ${JUDGE_MODEL} ` +
        `(${skippedRefusals} refusals skipped)\n`,
    );

    const verdicts: FaithfulnessVerdict[] = [];
    for (const [i, item] of toJudge.entries()) {
      verdicts.push(
        await judgeAnswer({
          question: item.q,
          answer: answers.get(item.q) ?? "",
          contexts: contexts.get(item.q) ?? [],
          // Retried here rather than inside judgeAnswer, so a demand spike
          // doesn't get recorded as the judge failing to grade an answer.
          generate: (prompt) =>
            withRetry(`judge "${item.q.slice(0, 40)}"`, () => judgeGenerate(prompt)),
        }),
      );
      process.stdout.write(`\r  ${i + 1}/${toJudge.length}`.padEnd(40));
      await new Promise((res) => setTimeout(res, PACE_MS));
    }
    console.log("\n");

    const f = summariseFaithfulness(verdicts, skippedRefusals);
    faithfulness = { judgeModel: JUDGE_MODEL, ...f };

    console.log("## Faithfulness\n");
    console.log(
      `  ${bar(f.score)}  ${Number.isNaN(f.score) ? "—" : (f.score * 100).toFixed(1) + "%"}   ` +
        `${f.clean}/${f.judged} answers fully supported`,
    );
    console.log(
      `\n  Judged ${f.judged}, skipped ${f.skippedRefusals} refusals, ` +
        `${f.failed} judge failures (excluded from the average, NOT scored as 0).`,
    );

    if (f.unsupported.length) {
      console.log(`\n  Unsupported claims (${f.unsupported.length}):\n`);
      for (const u of f.unsupported.slice(0, 20)) {
        console.log(`    "${u.question}"`);
        console.log(`      claim: ${u.claim}`);
        console.log(`      judge: ${u.note}`);
      }
      if (f.unsupported.length > 20) {
        console.log(`    …and ${f.unsupported.length - 20} more (all saved to the artifact).`);
      }
    }
  }

  // ---------- Claude-judged pass (--judge only) ----------
  //
  // A second vendor on purpose. The page already concedes that faithfulness is
  // Gemini grading Gemini, "a system partly marking its own work"; these three
  // are graded by Claude, so a blind spot has to survive two model families.
  // Faithfulness deliberately stays on Gemini — moving it would make its delta
  // against every committed run measure the judges instead of the answers.
  let contextPrecision: GenerationResult["contextPrecision"] = undefined;
  let answerRelevance: GenerationResult["answerRelevance"] = undefined;
  let correctness: GenerationResult["correctness"] = undefined;

  if (judge) {
    const { claudeJudge, CLAUDE_JUDGE_MODEL } = await import("@/lib/eval/judge-claude");
    const { embedQuery, EMBEDDING_MODEL } = await import("@/lib/rag/retrieve");

    // Retry lives out here, wrapping the transport, so a demand spike is never
    // recorded as the judge failing to grade — same reasoning as the
    // faithfulness pass above.
    const graded =
      (label: string, schema: Record<string, unknown>) => (prompt: string) =>
        withRetry(label, () => claudeJudge(prompt, schema));

    // ----- Context precision -----
    console.log(
      `\nJudging context precision: ${EVAL_QUESTIONS.length} questions with ` +
        `${CLAUDE_JUDGE_MODEL}\n`,
    );

    const precisionVerdicts: PrecisionVerdict[] = [];
    for (const [i, item] of EVAL_QUESTIONS.entries()) {
      precisionVerdicts.push(
        await judgePrecision({
          question: item.q,
          covered: item.expect.length > 0,
          chunks: retrieved.get(item.q) ?? [],
          generate: graded(`precision "${item.q.slice(0, 30)}"`, PRECISION_SCHEMA),
        }),
      );
      process.stdout.write(`\r  ${i + 1}/${EVAL_QUESTIONS.length}`.padEnd(40));
      await new Promise((res) => setTimeout(res, PACE_MS));
    }
    console.log("\n");

    const p = summarisePrecision(precisionVerdicts, CLAUDE_JUDGE_MODEL);
    contextPrecision = p;

    console.log("## Context precision\n");
    console.log(
      `  ${bar(p.score)}  ${fmtPct(p.score)}   ${p.judged} covered questions judged`,
    );
    console.log(
      `  ${bar(p.uncoveredScore)}  ${fmtPct(p.uncoveredScore)}   ` +
        `${p.uncoveredJudged} out-of-corpus questions — LOWER is better here`,
    );
    console.log(
      `\n  ${p.failed} judge failures (excluded from the averages, NOT scored as 0).`,
    );
    if (p.topRankIrrelevant.length) {
      console.log(
        `\n  Led with an irrelevant chunk (${p.topRankIrrelevant.length}):\n`,
      );
      for (const t of p.topRankIrrelevant.slice(0, 15)) {
        console.log(`    "${t.question}"`);
        console.log(`      rank 1: ${t.sourceTitle} — ${t.note}`);
      }
    }
    if (p.uncoveredRelevant.length) {
      console.log(
        `\n  Out-of-corpus questions that retrieved something RELEVANT ` +
          `(${p.uncoveredRelevant.length}) — the scope boundary may be leaking:\n`,
      );
      for (const u of p.uncoveredRelevant.slice(0, 15)) {
        console.log(`    "${u.question}" → ${u.sourceTitle} — ${u.note}`);
      }
    }

    // ----- Answer relevance -----
    // Refusals are skipped for the same reason faithfulness skips them: a
    // refusal is the CORRECT answer to an out-of-corpus question and a terrible
    // embedding match for it, so scoring it would punish the system for exactly
    // what the refusal metric rewards.
    const toScore = EVAL_QUESTIONS.filter(
      (item) => !refused(answers.get(item.q) ?? ""),
    );
    const skippedRefusals = EVAL_QUESTIONS.length - toScore.length;

    console.log(
      `\nScoring answer relevance: ${toScore.length} answers ` +
        `(${skippedRefusals} refusals skipped)\n`,
    );

    const relevanceVerdicts: RelevanceVerdict[] = [];
    for (const [i, item] of toScore.entries()) {
      relevanceVerdicts.push(
        await judgeRelevance({
          question: item.q,
          answer: answers.get(item.q) ?? "",
          generate: graded(`relevance "${item.q.slice(0, 30)}"`, RELEVANCE_SCHEMA),
          embed: (text) =>
            withRetry(`embed "${text.slice(0, 30)}"`, () => embedQuery(text)),
        }),
      );
      process.stdout.write(`\r  ${i + 1}/${toScore.length}`.padEnd(40));
      await new Promise((res) => setTimeout(res, PACE_MS));
    }
    console.log("\n");

    const r = summariseRelevance(
      relevanceVerdicts,
      skippedRefusals,
      CLAUDE_JUDGE_MODEL,
      EMBEDDING_MODEL,
    );
    answerRelevance = r;

    console.log("## Answer relevance\n");
    console.log(`  ${bar(r.score)}  ${fmtPct(r.score)}   ${r.judged} answers scored`);
    console.log(
      `\n  Skipped ${r.skippedRefusals} refusals, ${r.failed} failures ` +
        `(excluded from the average, NOT scored as 0).`,
    );
    if (r.lowest.length) {
      console.log(`\n  Weakest answers:\n`);
      for (const l of r.lowest.slice(0, 10)) {
        console.log(`    ${fmtPct(l.score)}  "${l.question}"`);
        console.log(`      answered instead: ${l.generated[0] ?? "—"}`);
      }
    }

    // ----- Correctness (gold subset only) -----
    const gold = EVAL_QUESTIONS.filter((item) => item.gold);
    if (gold.length === 0) {
      console.log(
        `\n## Correctness\n\n  No gold-labelled questions yet — correctness not ` +
          `measured. Add \`gold\` records to src/lib/eval/questions.ts, each cited ` +
          `to canada.ca with the date it was read.`,
      );
    } else {
      console.log(
        `\nGrading correctness: ${gold.length} gold-labelled questions of ` +
          `${COVERED.length} covered\n`,
      );

      const correctnessVerdicts: CorrectnessVerdict[] = [];
      for (const [i, item] of gold.entries()) {
        correctnessVerdicts.push(
          await judgeCorrectness({
            question: item.q,
            answer: answers.get(item.q) ?? "",
            gold: item.gold!,
            generate: graded(
              `correctness "${item.q.slice(0, 30)}"`,
              CORRECTNESS_SCHEMA,
            ),
          }),
        );
        process.stdout.write(`\r  ${i + 1}/${gold.length}`.padEnd(40));
        await new Promise((res) => setTimeout(res, PACE_MS));
      }
      console.log("\n");

      const c = summariseCorrectness(
        correctnessVerdicts,
        new Map(gold.map((item) => [item.q, item.gold!.source])),
        CLAUDE_JUDGE_MODEL,
        COVERED.length,
      );
      correctness = c;

      console.log("## Correctness\n");
      console.log(
        `  ${bar(c.score)}  ${fmtPct(c.score)}   ${c.judged}/${c.gold} gold-labelled ` +
          `questions (of ${c.covered} covered — this figure speaks for the subset only)`,
      );
      console.log(
        `  ${bar(c.factCoverage)}  ${fmtPct(c.factCoverage)}   deterministic fact ` +
          `coverage, the floor under the judged figure`,
      );
      console.log(
        `\n  ${c.failed} judge failures (excluded from the average, NOT scored as wrong).`,
      );
      if (c.contradictions.length) {
        console.log(`\n  WRONG — asserted something the source forbids:\n`);
        for (const w of c.contradictions) {
          console.log(`    "${w.question}"`);
          console.log(`      claimed: ${w.fact}`);
          console.log(`      source:  ${w.source}`);
        }
      }
      if (c.missing.length) {
        console.log(`\n  Gold facts not stated (${c.missing.length}):\n`);
        for (const m of c.missing.slice(0, 15)) {
          console.log(`    "${m.question}"`);
          console.log(`      missing: ${m.fact} — ${m.note}`);
        }
      }
    }
  }

  if (save) {
    await writeRun({
      startedAt,
      matchCount: MATCH_COUNT,
      generationModel: GENERATION_MODEL,
      summary,
      scores,
      generation: {
        reps,
        latency,
        refusals: {
          total: UNCOVERED.length,
          refused: refusedCount,
          answered: answeredInstead,
        },
        // Omitted entirely on an unjudged run, so the dashboard can tell "not
        // measured" from "measured and found nothing". Each metric spreads in
        // independently: a run may measure some and not others, and collapsing
        // an absent one to null would claim it was tried.
        ...(faithfulness ? { faithfulness } : {}),
        ...(contextPrecision ? { contextPrecision } : {}),
        ...(answerRelevance ? { answerRelevance } : {}),
        ...(correctness ? { correctness } : {}),
      },
    });
  }
}

main().catch((err) => {
  console.error("\nBenchmark failed:", err.message);
  process.exit(1);
});
