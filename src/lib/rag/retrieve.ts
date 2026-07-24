import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "@/lib/env";

const supabase = createClient(
  serverEnv.supabaseUrl,
  serverEnv.supabaseServiceRoleKey,
);
const genAI = new GoogleGenAI({ apiKey: serverEnv.geminiApiKey });

// Model ids. Embedding is pinned (must match ingestion, or vectors don't
// compare). Generation defaults to the "-latest" alias because a specific
// pinned id (e.g. gemini-2.5-flash) is gated to existing API projects and 404s
// for newer keys — pin via GEMINI_GENERATION_MODEL only to an id your key can
// actually call (list them with the models.list endpoint first).
const EMBEDDING_MODEL = "gemini-embedding-001";
const GENERATION_MODEL =
  process.env.GEMINI_GENERATION_MODEL ?? "gemini-3.6-flash";

// Cap generation length. Answers are short grounded explanations; this bounds
// worst-case output cost (output is ~8x the input rate) and stops runaways.
//
// gemini-flash-latest is a Gemini 2.5+ thinking model: reasoning tokens count
// against maxOutputTokens. At 1024 a multi-section answer burned the budget
// thinking and truncated mid-sentence (finishReason MAX_TOKENS) with no error.
// We can't reliably disable thinking here — passing thinkingConfig
// { thinkingBudget: 0 } makes the "-latest" alias's current model 400 with
// INVALID_ARGUMENT — so instead give a budget generous enough that thinking
// AND the full visible answer both fit. 4096 is still a hard cost ceiling.
const MAX_OUTPUT_TOKENS = 4096;

const GENERATION_CONFIG = {
  maxOutputTokens: MAX_OUTPUT_TOKENS,
} as const;

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
    config: GENERATION_CONFIG,
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
    config: GENERATION_CONFIG,
  });

  const stream = (async function* () {
    for await (const chunk of response) {
      if (chunk.text) yield chunk.text;
    }
  })();

  return { meta: { citations, chunksUsed: chunks.length }, stream };
}
