import { NextRequest } from "next/server";
import { validateFeedback } from "@/lib/qa";
import { readFeedback, saveFeedback } from "@/lib/qa-log";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Higher than a person can click but low enough that nobody floods the table
// with free text. Re-rating the same answer costs a request, hence not 5.
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

const MAX_ROWS = 200;

function json(body: unknown, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "anonymous";
}

// POST /api/feedback  { id, rating, reason? }
//
// `id` is the qaId the answer stream handed the browser. A "bad" rating without
// a reason is a 400 here and a constraint violation in Postgres — the reason
// requirement is the whole point of the feature, so it is checked twice.
export async function POST(req: NextRequest) {
  const limit = checkRateLimit(
    `feedback:${clientKey(req)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!limit.ok) {
    return json({ error: "Too many requests. Please wait a moment." }, 429, {
      "Retry-After": String(limit.retryAfter),
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = validateFeedback(payload);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const result = await saveFeedback(parsed.value);
  if (result === "not_found") {
    // The answer this refers to was never logged (stale tab, or the insert
    // failed). Nothing to attach the rating to.
    return json({ error: "That answer is no longer available to rate." }, 404);
  }
  if (result === "error") {
    return json({ error: "Couldn't save your feedback. Please try again." }, 502);
  }

  return json({ ok: true }, 200);
}

// GET /api/feedback → totals + the rated questions, newest first.
//
// Same gate as /api/metric: these are your product signals and, unlike the
// counters, they contain visitor-typed text. Without METRICS_TOKEN set the
// endpoint stays shut and answers 404 rather than advertising itself.
export async function GET(req: NextRequest) {
  const expected = process.env.METRICS_TOKEN;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(req.url).searchParams.get("token");

  if (!expected || provided !== expected) {
    return new Response(null, { status: 404 });
  }

  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), MAX_ROWS)
      : 50;

  const report = await readFeedback(limit);
  if (!report) {
    return json({ error: "Could not read feedback." }, 500);
  }

  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
