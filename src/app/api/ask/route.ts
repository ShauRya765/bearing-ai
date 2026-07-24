import { NextRequest } from "next/server";
import { askRulesStream } from "@/lib/rag/retrieve";
import { checkRateLimit } from "@/lib/rate-limit";

// RAG hits Supabase + Gemini — needs the Node runtime, not Edge.
export const runtime = "nodejs";

const MAX_QUESTION_LENGTH = 2000;
const RATE_LIMIT = 20; // requests
const RATE_WINDOW_MS = 60_000; // per minute, per client

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

export async function POST(req: NextRequest) {
  const limit = checkRateLimit(`ask:${clientKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return json(
      { error: "Too many requests. Please wait a moment and try again." },
      429,
      { "Retry-After": String(limit.retryAfter) },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const raw = (payload as { question?: unknown })?.question;
  const question = typeof raw === "string" ? raw.trim() : "";
  if (!question) {
    return json({ error: "A question is required." }, 400);
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return json(
      { error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).` },
      400,
    );
  }

  let meta: Awaited<ReturnType<typeof askRulesStream>>["meta"];
  let stream: Awaited<ReturnType<typeof askRulesStream>>["stream"];
  try {
    ({ meta, stream } = await askRulesStream(question));
  } catch (err) {
    // Retrieval or embedding failed (Supabase/Gemini down, bad key, etc.).
    // Log server-side; return a clean message without leaking internals.
    console.error("[/api/ask] retrieval failed:", err);
    return json(
      { error: "Couldn't reach the rules service. Please try again shortly." },
      502,
    );
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      // First line: metadata (citations) as JSON, newline-delimited.
      controller.enqueue(encoder.encode(JSON.stringify(meta) + "\n"));
      // Then: answer text as it streams.
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("[/api/ask] stream interrupted:", err);
        controller.enqueue(encoder.encode("\n[stream interrupted]"));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
