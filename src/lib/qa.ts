// Question log + answer feedback — shapes and validation, no I/O.
//
// This is a deliberate widening of what src/lib/metrics.ts refuses to do. That
// file holds counters and nothing else; this one stores the actual question
// text, the answer that came back, and a thumbs up/down with a reason. The
// point is product feedback you can read: "which questions does the corpus
// answer badly", which a counter can never tell you.
//
// What is still NOT stored: no IP, no user agent, no session or visitor id, no
// account link. A row says what was asked and how the answer landed — not who
// asked it. Rows are therefore unattributable to a person, but they are free
// text, so a visitor can type personal details into the box. Treat the table as
// user-submitted content: don't expose it publicly, and say so in the privacy
// note before this ships to real traffic.
//
// Kept free of the Supabase client on purpose so client components can import
// the constants without pulling server env into the browser bundle.

/** The two ratings the UI offers. Stored verbatim in qa_log.rating. */
export const RATINGS = ["great", "bad"] as const;
export type Rating = (typeof RATINGS)[number];

/**
 * Which surface asked the question. Lets you separate "someone typed this on
 * the Rules page" from the canned improvement-suggestions prompt, which is
 * machine-written and would otherwise dominate the log.
 */
export const ASK_SOURCES = ["rules", "how_it_works", "suggestions"] as const;
export type AskSource = (typeof ASK_SOURCES)[number];

/** Long enough for a real complaint, short enough that nobody pastes a novel. */
export const MAX_REASON_LENGTH = 1000;

export function isRating(value: unknown): value is Rating {
  return typeof value === "string" && (RATINGS as readonly string[]).includes(value);
}

export function isAskSource(value: unknown): value is AskSource {
  return (
    typeof value === "string" && (ASK_SOURCES as readonly string[]).includes(value)
  );
}

/** Any UUID version — the ids come from crypto.randomUUID(), which is v4. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isQaId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface Feedback {
  id: string;
  rating: Rating;
  /** Trimmed; null when the visitor didn't write one (only legal for "great"). */
  reason: string | null;
}

export type FeedbackValidation =
  | { ok: true; value: Feedback }
  | { ok: false; error: string };

/**
 * The one rule that matters: a "bad" rating must come with a reason, a "great"
 * one doesn't have to. Enforced here (so both the route and the tests share it)
 * and again as a CHECK constraint in supabase/qa-log.sql, because a rule that
 * only lives in application code eventually gets bypassed by a script.
 */
export function validateFeedback(input: unknown): FeedbackValidation {
  const body = (input ?? {}) as { id?: unknown; rating?: unknown; reason?: unknown };

  if (!isQaId(body.id)) {
    return { ok: false, error: "Unknown answer." };
  }
  if (!isRating(body.rating)) {
    return { ok: false, error: "Rating must be 'great' or 'bad'." };
  }
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") {
    return { ok: false, error: "Reason must be text." };
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (reason.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      error: `Reason is too long (max ${MAX_REASON_LENGTH} characters).`,
    };
  }
  if (body.rating === "bad" && reason.length === 0) {
    return { ok: false, error: "Tell us what was wrong — a reason is required." };
  }

  return {
    ok: true,
    value: { id: body.id, rating: body.rating, reason: reason || null },
  };
}
