import { NextRequest } from "next/server";
import { askRulesStream } from "@/lib/rag/retrieve";

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  if (!question?.trim()) {
    return new Response(JSON.stringify({ error: "A question is required." }), {
      status: 400,
    });
  }

  const { meta, stream } = await askRulesStream(question.trim());

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
      } catch {
        controller.enqueue(encoder.encode("\n[stream interrupted]"));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}