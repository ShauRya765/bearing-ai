// Reads the committed eval runs off disk.
//
// SERVER ONLY. This uses node:fs and must never be imported from a Client
// Component — the /eval page is a Server Component and passes plain data down.
//
// Runs are files in git rather than rows in a database, on purpose:
//
//  - every number on the dashboard is attributable to a commit,
//  - a regression shows up in code review as a diff,
//  - and the page prerenders at build time, so the dashboard costs nothing to
//    serve and makes zero API calls to render.
//
// The directory is read at module scope during the build. Adding a run means
// committing a file and redeploying, which is the correct coupling: a published
// eval number should be a deliberate act, not whatever the last ad-hoc run
// happened to produce.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseRun, type EvalRun } from "@/lib/eval/run";

/** Where scripts/bench-retrieve.ts --save writes. Resolved from the repo root. */
export const RUNS_DIR = join(process.cwd(), "src", "lib", "eval", "runs");

/**
 * Every saved run, newest first. Filenames are ISO-derived (see runFilename), so
 * a reverse string sort is a reverse chronological sort — no date parsing, and
 * no dependence on filesystem ordering, which readdirSync does not guarantee.
 *
 * A malformed or wrong-schema file throws. That's deliberate: the alternative is
 * a dashboard that quietly drops a run and shows a delta against the wrong
 * baseline, which is worse than a failed build.
 */
export function loadRuns(): EvalRun[] {
  let filenames: string[];
  try {
    filenames = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    // No runs directory yet — a fresh clone that has never benchmarked. The page
    // renders an empty state telling you which command to run.
    return [];
  }

  return filenames
    .sort()
    .reverse()
    .map((f) => parseRun(readFileSync(join(RUNS_DIR, f), "utf8"), f));
}

export interface RunHistory {
  latest: EvalRun | null;
  previous: EvalRun | null;
  /** Newest first, including latest. */
  all: EvalRun[];
}

export function loadHistory(): RunHistory {
  const all = loadRuns();
  return { latest: all[0] ?? null, previous: all[1] ?? null, all };
}
