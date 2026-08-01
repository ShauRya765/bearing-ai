import { NextRequest } from "next/server";
import { askRulesStream } from "@/lib/rag/retrieve";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAskSource, type AskSource } from "@/lib/qa";
import { logQuestion } from "@/lib/qa-log";

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
  // Which surface asked. An unrecognised value is logged as "rules" rather than
  // rejected — a mislabelled row is better than a failed answer.
  const rawSource = (payload as { source?: unknown })?.source;
  const source: AskSource = isAskSource(rawSource) ? rawSource : "rules";
  if (!question) {
    return json({ error: "A question is required." }, 400);
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return json(
      { error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).` },
      400,
    );
  }

  // Minted here so the id can go out with the metadata line — before a single
  // token exists — and come back on /api/feedback naming this exact exchange.
  // Server-side so a client can't rate a row it invented.
  const qaId = crypto.randomUUID();

  let meta: Awaited<ReturnType<typeof askRulesStream>>["meta"];
  let stream: Awaited<ReturnType<typeof askRulesStream>>["stream"];
  try {
    ({ meta, stream } = await askRulesStream(question));
  } catch (err) {
    // Retrieval or embedding failed (Supabase/Gemini down, bad key, etc.).
    // Log server-side; return a clean message without leaking internals.
    console.error("[/api/ask] retrieval failed:", err);
    // Still record the question with a null answer: questions that failed are
    // exactly the ones worth seeing in the log.
    await logQuestion({
      id: qaId,
      source,
      question,
      answer: null,
      chunksUsed: 0,
      citations: [],
    }).catch(() => {});
    return json(
      { error: "Couldn't reach the rules service. Please try again shortly." },
      502,
    );
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      // First line: metadata (citations + the id to rate this answer by) as
      // JSON, newline-delimited.
      controller.enqueue(encoder.encode(JSON.stringify({ ...meta, qaId }) + "\n"));
      // Then: answer text as it streams.
      let answer = "";
      try {
        for await (const chunk of stream) {
          answer += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("[/api/ask] stream interrupted:", err);
        // If the reader went away the controller is already closed and this
        // throws too — which would skip the log write below and surface as an
        // unhandled rejection. A partial answer from an abandoned request is
        // still worth logging, so swallow it.
        try {
          controller.enqueue(encoder.encode("\n[stream interrupted]"));
        } catch {}
      }

      // Awaited before closing, not fired and forgotten: on a serverless host
      // the function can be frozen the moment the response ends, and a row that
      // never lands is feedback that can never be attached. Costs one round
      // trip after the last token, which the reader has already rendered.
      await logQuestion({
        id: qaId,
        source,
        question,
        answer,
        chunksUsed: meta.chunksUsed,
        citations: meta.citations,
      }).catch(() => {});

      try {
        controller.close();
      } catch {
        // Already closed by the reader cancelling. Nothing left to do.
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
