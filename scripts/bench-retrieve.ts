// Measures the RAG pipeline and prints a paste-ready report.
//
//   npx tsx --tsconfig tsconfig.json scripts/bench-retrieve.ts [options]
//
//     --reps N          repetitions per question for the latency table (default 3)
//     --full            also measure latency + refusals (costs tokens)
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
// measure contention, not latency.
import { config } from "dotenv";
config({ path: ".env.local" });

import { EVAL_QUESTIONS, COVERED, UNCOVERED, HARD } from "@/lib/eval/questions";
import {
  scoreQuestion,
  summarise,
  percentile,
  type QuestionScore,
  type SetScore,
} from "@/lib/eval/score";
import type { RagTimings } from "@/lib/rag/retrieve";

const PACE_MS = 250;

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

  const full = flag("--full");
  const reps = num("--reps", 3);
  if (!Number.isFinite(reps) || reps < 1) throw new Error("--reps must be >= 1");

  const { retrieveOnly, askRulesStream, MATCH_COUNT } = await import(
    "@/lib/rag/retrieve"
  );

  console.log(
    `Eval set: ${EVAL_QUESTIONS.length} questions — ${COVERED.length} covered ` +
      `(${HARD.length} marked hard), ${UNCOVERED.length} out-of-corpus\n`,
  );

  // ---------- Retrieval pass (always) ----------
  console.log(`Retrieving ${EVAL_QUESTIONS.length} questions (no generation)...`);
  const saved: (QuestionScore & { embedMs: number; searchMs: number; chunksUsed: number })[] = [];
  for (const [i, item] of EVAL_QUESTIONS.entries()) {
    const r = await retrieveOnly(item.q);
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
  line("Recall@5 overall", summary.overall);
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
    return;
  }

  // ---------- Generation pass (--full only) ----------
  const total = EVAL_QUESTIONS.length * reps;
  console.log(`\nGenerating answers: ${EVAL_QUESTIONS.length} x ${reps} = ${total} calls\n`);

  const timings: RagTimings[] = [];
  const answers = new Map<string, string>();
  let done = 0;

  for (let rep = 0; rep < reps; rep++) {
    for (const item of EVAL_QUESTIONS) {
      const { stream, timings: t } = await askRulesStream(item.q);
      let answer = "";
      for await (const piece of stream) answer += piece;
      timings.push(await t);
      if (rep === 0) answers.set(item.q, answer);

      done++;
      process.stdout.write(`\r  ${done}/${total}  ${item.q.slice(0, 44)}`.padEnd(96));
      await new Promise((res) => setTimeout(res, PACE_MS));
    }
  }
  console.log("\n");

  const stages: [string, (t: RagTimings) => number | null, string][] = [
    ["Embed the question", (t) => t.embedMs, "One API call, 768-dim"],
    ["Vector search", (t) => t.searchMs, "pgvector, top-5"],
    ["Prompt assembly", (t) => t.promptMs, "In-process, no I/O"],
    ["First token from model", (t) => t.firstTokenMs, "Streaming"],
    ["Full streamed answer", (t) => t.generateMs, "Length-dependent"],
  ];

  console.log("## Latency\n");
  console.log("| Stage | p50 | p95 | Note |");
  console.log("| --- | --- | --- | --- |");
  for (const [name, pick, note] of stages) {
    const vals = timings.map(pick).filter((v): v is number => v !== null);
    console.log(`| ${name} | ${ms(percentile(vals, 50))} | ${ms(percentile(vals, 95))} | ${note} |`);
  }
  const totals = timings.map((t) => t.totalMs);
  console.log(
    `| **End to end** | **${ms(percentile(totals, 50))}** | **${ms(percentile(totals, 95))}** | Retrieval + full answer |`,
  );

  const refusedCount = UNCOVERED.filter((item) =>
    refused(answers.get(item.q) ?? ""),
  ).length;
  console.log(
    `\n## Refusals\n\n  ${refusedCount}/${UNCOVERED.length} out-of-corpus questions declined`,
  );
  for (const item of UNCOVERED) {
    const a = answers.get(item.q) ?? "";
    if (!refused(a)) {
      console.log(`\n  ANSWERED instead of refusing: "${item.q}"`);
      console.log(`    ${a.slice(0, 160).replace(/\n/g, " ")}…`);
    }
  }

}

main().catch((err) => {
  console.error("\nBenchmark failed:", err.message);
  process.exit(1);
});
