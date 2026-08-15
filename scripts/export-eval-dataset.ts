// Exports the eval set as a RAGAS-shaped dataset.
//
//   npx tsx --tsconfig tsconfig.json scripts/export-eval-dataset.ts [options]
//
//     --limit N     only the first N covered questions (default: all)
//     --out PATH    output file (default: src/lib/eval/runs/datasets/<timestamp>.jsonl)
//
// RAGAS is Python and this codebase is TypeScript, so the handoff is a file
// rather than a library call. JSONL: one sample per line, appended as each
// question completes, so a rate-limit failure 60 questions in leaves 60 usable
// samples instead of nothing.
//
// Why this exists at all: bench-retrieve's artifact stores source TITLES, which
// is everything recall@k needs and nothing a judged metric needs. Faithfulness
// grades an answer against the passages it was written from, so the export has
// to carry the chunk texts and the answer together, from one pipeline pass.
//
// Out-of-corpus questions are exported but flagged `covered: false`. They are
// deliberately excluded from judged metrics downstream — see run_ragas.py. A
// correct refusal makes no claims, so "how faithful is it to the context" has no
// meaningful answer, and scoring it as 0 would punish the behaviour we want.
import { config } from "dotenv";
config({ path: ".env.local" });

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { EVAL_QUESTIONS, COVERED, UNCOVERED } from "@/lib/eval/questions";
import { runFilename } from "@/lib/eval/run";
import { RUNS_DIR } from "@/lib/eval/runs-store";

const PACE_MS = 250;

/** One line of the JSONL. Field names match what run_ragas.py maps to RAGAS. */
interface DatasetSample {
  /** RAGAS `user_input`. */
  question: string;
  /** RAGAS `retrieved_contexts` — the chunk texts, in rank order. */
  contexts: string[];
  /** RAGAS `response`. */
  answer: string;
  /** Source titles, for cross-referencing a judged score against recall@k. */
  citations: string[];
  /** Hand-labelled expected sources. Not a reference ANSWER — see the header. */
  expect: string[];
  /** False = out-of-corpus. Excluded from judged metrics downstream. */
  covered: boolean;
  hard: boolean;
}

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

async function main() {
  const argv = process.argv;
  const flagValue = (f: string): string | undefined => {
    const i = argv.indexOf(f);
    return i > -1 ? argv[i + 1] : undefined;
  };

  const limitRaw = flagValue("--limit");
  const limit = limitRaw ? Number(limitRaw) : Infinity;
  if (Number.isNaN(limit) || limit < 1) throw new Error("--limit must be >= 1");

  const startedAt = new Date().toISOString();
  const out =
    flagValue("--out") ??
    join(RUNS_DIR, "datasets", runFilename(startedAt).replace(/\.json$/, ".jsonl"));

  const { askRules, GENERATION_MODEL, EMBEDDING_MODEL, MATCH_COUNT } =
    await import("@/lib/rag/retrieve");

  // Covered questions first so --limit yields a judgeable subset rather than a
  // random mix — the judged metrics only run on covered ones.
  const ordered = [...COVERED, ...UNCOVERED];
  const selected =
    limit === Infinity
      ? ordered
      : [...COVERED.slice(0, limit), ...UNCOVERED.slice(0, Math.ceil(limit / 5))];

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, "");

  // Sidecar metadata. The JSONL stays one-sample-per-line so Python can stream
  // it; anything describing the run as a whole goes here instead of being
  // repeated on all 81 lines.
  const metaPath = out.replace(/\.jsonl$/, ".meta.json");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        startedAt,
        gitSha: gitSha(),
        generationModel: GENERATION_MODEL,
        embeddingModel: EMBEDDING_MODEL,
        matchCount: MATCH_COUNT,
        questionsTotal: EVAL_QUESTIONS.length,
        exported: selected.length,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `Exporting ${selected.length} questions ` +
      `(${selected.filter((q) => q.expect.length > 0).length} covered) ` +
      `— one generation call each.\n`,
  );

  let failures = 0;
  for (const [i, item] of selected.entries()) {
    try {
      const result = await askRules(item.q);
      const sample: DatasetSample = {
        question: item.q,
        contexts: result.contexts,
        answer: result.answer,
        citations: result.citations.map((c) => c.sourceTitle),
        expect: item.expect,
        covered: item.expect.length > 0,
        hard: item.hard === true,
      };
      appendFileSync(out, JSON.stringify(sample) + "\n");
    } catch (err) {
      // Keep going. A partial dataset is useful; an aborted one is not.
      failures++;
      console.error(`\n  FAILED: "${item.q.slice(0, 60)}" — ${(err as Error).message}`);
    }
    process.stdout.write(`\r  ${i + 1}/${selected.length}`.padEnd(40));
    await new Promise((res) => setTimeout(res, PACE_MS));
  }

  console.log(`\n\nWrote ${out.replace(process.cwd() + "/", "")}`);
  console.log(`      ${metaPath.replace(process.cwd() + "/", "")}`);
  if (failures) console.log(`${failures} question(s) failed and were skipped.`);
  console.log(`\nNext: cd evals/ragas && uv run run_ragas.py --dataset ../../${out.replace(process.cwd() + "/", "")}`);
}

main().catch((err) => {
  console.error("\nExport failed:", err.message);
  process.exit(1);
});
