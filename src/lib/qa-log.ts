// Server-side writes for the question log. Schema: supabase/qa-log.sql.
//
// Every function here is best-effort: a logging failure must never turn a good
// answer into an error in front of a visitor. Failures are logged to the server
// console and swallowed. The one exception is saveFeedback, which reports back
// so the UI can tell someone their reason didn't save.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { AskSource, Feedback } from "@/lib/qa";

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  // Lazy so a missing env var fails on the request that needs it, matching
  // src/lib/env.ts, rather than at module load.
  client ??= createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey);
  return client;
}

// PostgrestError's fields are non-enumerable, so logging the object itself
// prints "{}" and tells you nothing. Pull the useful parts out by hand.
function describe(error: { message?: string; code?: string; details?: string }): string {
  return [error.code, error.message, error.details].filter(Boolean).join(" | ");
}

export interface QaLogEntry {
  id: string;
  source: AskSource;
  question: string;
  /** Null when retrieval failed before generation. */
  answer: string | null;
  chunksUsed: number;
  citations: { sourceTitle: string; sourceUrl: string }[];
}

/**
 * Records one asked question. Called once the answer has finished streaming, so
 * a single row holds both sides of the exchange.
 */
export async function logQuestion(entry: QaLogEntry): Promise<void> {
  const { error } = await supabase().from("qa_log").insert({
    id: entry.id,
    source: entry.source,
    question: entry.question,
    answer: entry.answer,
    chunks_used: entry.chunksUsed,
    citations: entry.citations,
  });
  if (error) console.error("[qa-log] insert failed:", describe(error));
}

export type SaveResult = "saved" | "not_found" | "error";

/**
 * Attaches a rating to an existing row. Re-rating overwrites: someone who hits
 * Great and then adds a note produces one row, not two, and changing their mind
 * to Bad replaces the earlier verdict rather than double-counting it.
 */
export async function saveFeedback(feedback: Feedback): Promise<SaveResult> {
  const { data, error } = await supabase()
    .from("qa_log")
    .update({
      rating: feedback.rating,
      reason: feedback.reason,
      rated_at: new Date().toISOString(),
    })
    .eq("id", feedback.id)
    .select("id");

  if (error) {
    console.error("[qa-log] feedback update failed:", describe(error));
    return "error";
  }
  // An id that matches nothing is a stale tab or a made-up uuid, not a bug.
  return data && data.length > 0 ? "saved" : "not_found";
}

export interface FeedbackRow {
  id: string;
  asked_at: string;
  source: string;
  question: string;
  rating: string | null;
  reason: string | null;
  chunks_used: number | null;
}

export interface FeedbackReport {
  totals: { asked: number; great: number; bad: number };
  /** Rated rows, newest first — the ones actually worth reading. */
  rated: FeedbackRow[];
}

/** Backs the token-gated GET on /api/feedback. */
export async function readFeedback(limit: number): Promise<FeedbackReport | null> {
  const db = supabase();

  const [asked, great, bad, rated] = await Promise.all([
    db.from("qa_log").select("id", { count: "exact", head: true }),
    db.from("qa_log").select("id", { count: "exact", head: true }).eq("rating", "great"),
    db.from("qa_log").select("id", { count: "exact", head: true }).eq("rating", "bad"),
    db
      .from("qa_log")
      .select("id, asked_at, source, question, rating, reason, chunks_used")
      .not("rating", "is", null)
      .order("asked_at", { ascending: false })
      .limit(limit),
  ]);

  const failure = [asked, great, bad, rated].find((r) => r.error);
  if (failure?.error) {
    console.error("[qa-log] read failed:", describe(failure.error));
    return null;
  }

  return {
    totals: {
      asked: asked.count ?? 0,
      great: great.count ?? 0,
      bad: bad.count ?? 0,
    },
    rated: (rated.data ?? []) as FeedbackRow[],
  };
}
