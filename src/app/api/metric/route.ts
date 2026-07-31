import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { isMetricName, METRIC_NAMES } from "@/lib/metrics";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Generous enough that no real person hits it, low enough that a script can't
// run the numbers up quickly. Counters are best-effort, not audited figures.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function supabase() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey);
}

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "anonymous";
}

// POST /api/metric  { name }  → increment by one.
//
// The IP is used for rate limiting and then discarded. Nothing about the caller
// is written anywhere; the only side effect is one integer going up.
export async function POST(req: NextRequest) {
  const limit = checkRateLimit(
    `metric:${clientKey(req)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  // Silently accept when over the limit. A counter is not worth telling a
  // scraper it found a boundary, and the client ignores the response anyway.
  if (!limit.ok) return new Response(null, { status: 204 });

  let name: unknown;
  try {
    name = (await req.json())?.name;
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!isMetricName(name)) return new Response(null, { status: 400 });

  const { error } = await supabase().rpc("increment_metric", {
    metric_name: name,
  });
  // Analytics must never break the page or surface an error to the visitor.
  if (error) console.error("[/api/metric] increment failed:", error);

  return new Response(null, { status: 204 });
}

// GET /api/metric → current counts.
//
// Gated behind METRICS_TOKEN because traffic numbers are yours, not the
// public's. Without the env var set, the endpoint stays closed.
export async function GET(req: NextRequest) {
  const expected = process.env.METRICS_TOKEN;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(req.url).searchParams.get("token");

  if (!expected || provided !== expected) {
    return new Response(null, { status: 404 });
  }

  const { data, error } = await supabase()
    .from("metrics")
    .select("name, count");

  if (error) {
    console.error("[/api/metric] read failed:", error);
    return Response.json({ error: "Could not read metrics." }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const name of METRIC_NAMES) counts[name] = 0;
  for (const row of data ?? []) counts[row.name] = Number(row.count);

  return Response.json(counts, {
    headers: { "Cache-Control": "no-store" },
  });
}
