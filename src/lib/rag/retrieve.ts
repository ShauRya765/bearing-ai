import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface Citation {
  sourceTitle: string;
  sourceUrl: string;
}

export interface RagAnswer {
  answer: string;
  citations: Citation[];
  chunksUsed: number;
}

export interface RagStreamStart {
  citations: Citation[];
  chunksUsed: number;
}


// Same model + dimension as ingestion — non-negotiable, or vectors don't compare.
// Note the task type: RETRIEVAL_QUERY here, vs RETRIEVAL_DOCUMENT at ingestion.
async function embedQuery(question: string): Promise<number[]> {
  const result = await genAI.models.embedContent({
    model: "gemini-embedding-001",
    contents: question,
    config: { outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" },
  });
  return result.embeddings![0].values!;
}

export async function askRules(question: string): Promise<RagAnswer> {
  // 1. Turn the question into a vector.
  const queryEmbedding = await embedQuery(question);

  // 2. Find the nearest rule chunks.
  const { data: chunks, error } = await supabase.rpc("match_rule_chunks", {
    query_embedding: queryEmbedding,
    match_count: 5,
  });
  if (error) throw error;
  if (!chunks || chunks.length === 0) {
    return {
      answer:
        "I don't have any indexed rules that address that. This may be outside the current rule set.",
      citations: [],
      chunksUsed: 0,
    };
  }

  // 3. Build a grounded prompt. The model may ONLY use these chunks.
  const context = chunks
    .map(
      (c: any, i: number) =>
        `[${i + 1}] ${c.source_title}\n${c.content}`,
    )
    .join("\n\n");

  const prompt = `You are an assistant for Canadian immigration consultants. Answer the question using ONLY the numbered sources below. If the sources don't contain the answer, say so plainly — do not use outside knowledge. Be precise and concise. Cite sources inline like [1], [2].

Sources:
${context}

Question: ${question}

Answer:`;

  // 4. Generate the grounded answer.
  const response = await genAI.models.generateContent({
    model: "gemini-flash-latest",
    contents: prompt,
  });
  const answer = response.text ?? "";

  // 5. Return citations for every chunk retrieved, so they're verifiable.
  const citations: Citation[] = chunks.map((c: any) => ({
    sourceTitle: c.source_title,
    sourceUrl: c.source_url,
  }));

  return { answer, citations, chunksUsed: chunks.length };
}

// Streams the answer. Yields citations first (retrieval is done by then),
// then answer text chunks as the model produces them.
export async function askRulesStream(question: string) {
  const queryEmbedding = await embedQuery(question);

  const { data: chunks, error } = await supabase.rpc("match_rule_chunks", {
    query_embedding: queryEmbedding,
    match_count: 5,
  });
  if (error) throw error;

  const citations: Citation[] =
    chunks?.map((c: any) => ({
      sourceTitle: c.source_title,
      sourceUrl: c.source_url,
    })) ?? [];

  if (!chunks || chunks.length === 0) {
    return {
      meta: { citations: [], chunksUsed: 0 },
      stream: (async function* () {
        yield "I don't have any indexed rules that address that. This may be outside the current rule set.";
      })(),
    };
  }

  const context = chunks
    .map((c: any, i: number) => `[${i + 1}] ${c.source_title}\n${c.content}`)
    .join("\n\n");

  const prompt = `You are an assistant for Canadian immigration consultants. Answer the question using ONLY the numbered sources below. If the sources don't contain the answer, say so plainly — do not use outside knowledge. Be precise and concise. Cite sources inline like [1], [2].

Sources:
${context}

Question: ${question}

Answer:`;

  const response = await genAI.models.generateContentStream({
    model: "gemini-flash-latest",
    contents: prompt,
  });

  const stream = (async function* () {
    for await (const chunk of response) {
      if (chunk.text) yield chunk.text;
    }
  })();

  return { meta: { citations, chunksUsed: chunks.length }, stream };
}