import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "@/lib/env";

const supabase = createClient(
  serverEnv.supabaseUrl,
  serverEnv.supabaseServiceRoleKey,
);
const genAI = new GoogleGenAI({ apiKey: serverEnv.geminiApiKey });

// Pinned model ids — NOT the "-latest" alias — so cost and behaviour stay
// predictable and don't shift under us when Google rolls the alias forward.
// Bump these deliberately (and re-ingest if the embedding model changes).
const EMBEDDING_MODEL = "gemini-embedding-001";
const GENERATION_MODEL = "gemini-2.5-flash";

// Cap generation length. Answers are short grounded explanations; this bounds
// worst-case output cost (output is ~8x the input rate) and stops runaways.
const MAX_OUTPUT_TOKENS = 1024;

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

// Shape of a row returned by the match_rule_chunks RPC.
interface RuleChunk {
  content: string;
  source_title: string;
  source_url: string;
}

const MATCH_COUNT = 5;

function citationsFrom(chunks: RuleChunk[]): Citation[] {
  return chunks.map((c) => ({
    sourceTitle: c.source_title,
    sourceUrl: c.source_url,
  }));
}

function buildPrompt(chunks: RuleChunk[], question: string): string {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.source_title}\n${c.content}`)
    .join("\n\n");

  return `You are an assistant for Canadian immigration consultants. Answer the question using ONLY the numbered sources below. If the sources don't contain the answer, say so plainly — do not use outside knowledge. Be precise and concise. Cite sources inline like [1], [2].

Sources:
${context}

Question: ${question}

Answer:`;
}

const NO_MATCH_MESSAGE =
  "I don't have any indexed rules that address that. This may be outside the current rule set.";

// Same model + dimension as ingestion — non-negotiable, or vectors don't compare.
// Note the task type: RETRIEVAL_QUERY here, vs RETRIEVAL_DOCUMENT at ingestion.
async function embedQuery(question: string): Promise<number[]> {
  const result = await genAI.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: question,
    config: { outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" },
  });
  return result.embeddings![0].values!;
}

async function retrieve(question: string): Promise<RuleChunk[]> {
  const queryEmbedding = await embedQuery(question);
  const { data, error } = await supabase.rpc("match_rule_chunks", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
  });
  if (error) throw error;
  return (data as RuleChunk[] | null) ?? [];
}

export async function askRules(question: string): Promise<RagAnswer> {
  const chunks = await retrieve(question);

  if (chunks.length === 0) {
    return { answer: NO_MATCH_MESSAGE, citations: [], chunksUsed: 0 };
  }

  const response = await genAI.models.generateContent({
    model: GENERATION_MODEL,
    contents: buildPrompt(chunks, question),
    config: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  });

  return {
    answer: response.text ?? "",
    citations: citationsFrom(chunks),
    chunksUsed: chunks.length,
  };
}

// Streams the answer. Yields citations first (retrieval is done by then),
// then answer text chunks as the model produces them.
export async function askRulesStream(question: string) {
  const chunks = await retrieve(question);
  const citations = citationsFrom(chunks);

  if (chunks.length === 0) {
    return {
      meta: { citations: [], chunksUsed: 0 },
      stream: (async function* () {
        yield NO_MATCH_MESSAGE;
      })(),
    };
  }

  const response = await genAI.models.generateContentStream({
    model: GENERATION_MODEL,
    contents: buildPrompt(chunks, question),
    config: { maxOutputTokens: MAX_OUTPUT_TOKENS },
  });

  const stream = (async function* () {
    for await (const chunk of response) {
      if (chunk.text) yield chunk.text;
    }
  })();

  return { meta: { citations, chunksUsed: chunks.length }, stream };
}
