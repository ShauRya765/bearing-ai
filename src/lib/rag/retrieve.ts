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
// Exported so a saved eval run records which model produced its vectors —
// comparing recall across embedding models is comparing nothing.
export const EMBEDDING_MODEL = "gemini-embedding-001";
// Also exported for the eval artifact: a refusal rate is a property of one model
// and one prompt, so a saved run has to name the model that produced it.
export const GENERATION_MODEL =
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

// Per-stage wall-clock for one call. Measured with performance.now(), which is
// monotonic — a clock adjustment mid-request can't produce a negative duration.
// Always populated; the cost is a handful of float reads, so there is no flag to
// forget to turn on before benchmarking. scripts/bench-retrieve.ts aggregates
// these into the p50/p95 table.
export interface RagTimings {
  /** Question → 768-dim query vector. One Gemini embedContent call. */
  embedMs: number;
  /** pgvector nearest-neighbour lookup (match_rule_chunks RPC), incl. round trip. */
  searchMs: number;
  /** In-process prompt assembly. No I/O — expected to be sub-millisecond. */
  promptMs: number;
  /** Generation request sent → first token in hand. Null when not streaming. */
  firstTokenMs: number | null;
  /** Generation request sent → last token. */
  generateMs: number;
  /** Whole call, end to end. */
  totalMs: number;
}

export interface RagAnswer {
  answer: string;
  citations: Citation[];
  /**
   * The chunk TEXTS the answer was generated from, in rank order — not just their
   * titles. Carried because a judged eval (faithfulness, context precision) grades
   * the answer against the passages the model actually saw, and re-retrieving them
   * afterwards could return a different set and quietly grade the wrong thing.
   * Same pipeline pass, same chunks.
   */
  contexts: string[];
  chunksUsed: number;
  timings: RagTimings;
}

export interface RagStreamStart {
  citations: Citation[];
  chunksUsed: number;
  /**
   * Server-side retrieval cost, in ms. Sent with the opening metadata line
   * because both stages have already finished by the time streaming starts —
   * unlike generation, which is only known once the stream ends. The client
   * measures first-token and total itself, so nothing here needs a trailer.
   */
  retrieval: { embedMs: number; searchMs: number };
}

// Shape of a row returned by the match_rule_chunks RPC.
interface RuleChunk {
  content: string;
  source_title: string;
  source_url: string;
}

// Exported because the eval reports "every out-of-corpus query still returned k
// chunks" — a claim that has to be made against the real k, not a copy of it.
export const MATCH_COUNT = 5;

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

interface Retrieval {
  chunks: RuleChunk[];
  embedMs: number;
  searchMs: number;
}

async function retrieve(question: string): Promise<Retrieval> {
  const t0 = performance.now();
  const queryEmbedding = await embedQuery(question);
  const t1 = performance.now();
  const { data, error } = await supabase.rpc("match_rule_chunks", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
  });
  const t2 = performance.now();
  if (error) throw error;
  return {
    chunks: (data as RuleChunk[] | null) ?? [],
    embedMs: t1 - t0,
    searchMs: t2 - t1,
  };
}

/**
 * Retrieval without generation — what the eval harness needs to score recall.
 *
 * Recall@k is a property of the retriever alone, so making the model write an
 * answer to measure it burns tokens and adds seconds for nothing. Splitting it
 * out lets the question set grow to hundreds without the eval becoming
 * something you avoid running.
 */
export async function retrieveOnly(question: string): Promise<{
  citations: Citation[];
  chunksUsed: number;
  embedMs: number;
  searchMs: number;
}> {
  const { chunks, embedMs, searchMs } = await retrieve(question);
  return {
    citations: citationsFrom(chunks),
    chunksUsed: chunks.length,
    embedMs,
    searchMs,
  };
}

export async function askRules(question: string): Promise<RagAnswer> {
  const started = performance.now();
  const { chunks, embedMs, searchMs } = await retrieve(question);

  if (chunks.length === 0) {
    return {
      answer: NO_MATCH_MESSAGE,
      citations: [],
      contexts: [],
      chunksUsed: 0,
      timings: {
        embedMs,
        searchMs,
        promptMs: 0,
        firstTokenMs: null,
        generateMs: 0,
        totalMs: performance.now() - started,
      },
    };
  }

  const promptStart = performance.now();
  const prompt = buildPrompt(chunks, question);
  const promptMs = performance.now() - promptStart;

  const genStart = performance.now();
  const response = await genAI.models.generateContent({
    model: GENERATION_MODEL,
    contents: prompt,
    config: GENERATION_CONFIG,
  });
  const generateMs = performance.now() - genStart;

  return {
    answer: response.text ?? "",
    citations: citationsFrom(chunks),
    contexts: chunks.map((c) => c.content),
    chunksUsed: chunks.length,
    timings: {
      embedMs,
      searchMs,
      promptMs,
      firstTokenMs: null,
      generateMs,
      totalMs: performance.now() - started,
    },
  };
}

export interface RagStreamResult {
  meta: RagStreamStart;
  stream: AsyncGenerator<string>;
  /**
   * Resolves once the stream finishes — including when the consumer abandons it
   * early, in which case firstTokenMs may still be null. Await this only after
   * consuming `stream`, or you will wait forever.
   */
  timings: Promise<RagTimings>;
}

// Streams the answer. Yields citations first (retrieval is done by then),
// then answer text chunks as the model produces them.
export async function askRulesStream(
  question: string,
): Promise<RagStreamResult> {
  const started = performance.now();
  const { chunks, embedMs, searchMs } = await retrieve(question);
  const citations = citationsFrom(chunks);

  // The executor runs synchronously, so this is assigned before anyone can await.
  let settle!: (t: RagTimings) => void;
  const timings = new Promise<RagTimings>((resolve) => {
    settle = resolve;
  });

  if (chunks.length === 0) {
    settle({
      embedMs,
      searchMs,
      promptMs: 0,
      firstTokenMs: null,
      generateMs: 0,
      totalMs: performance.now() - started,
    });
    return {
      meta: {
        citations: [],
        chunksUsed: 0,
        retrieval: { embedMs, searchMs },
      },
      stream: (async function* () {
        yield NO_MATCH_MESSAGE;
      })(),
      timings,
    };
  }

  const promptStart = performance.now();
  const prompt = buildPrompt(chunks, question);
  const promptMs = performance.now() - promptStart;

  const genStart = performance.now();
  const response = await genAI.models.generateContentStream({
    model: GENERATION_MODEL,
    contents: prompt,
    config: GENERATION_CONFIG,
  });

  const stream = (async function* () {
    let firstTokenMs: number | null = null;
    try {
      for await (const chunk of response) {
        if (!chunk.text) continue;
        firstTokenMs ??= performance.now() - genStart;
        yield chunk.text;
      }
    } finally {
      // finally (not end-of-loop) so an abandoned stream still reports.
      settle({
        embedMs,
        searchMs,
        promptMs,
        firstTokenMs,
        generateMs: performance.now() - genStart,
        totalMs: performance.now() - started,
      });
    }
  })();

  return {
    meta: {
      citations,
      chunksUsed: chunks.length,
      retrieval: { embedMs, searchMs },
    },
    stream,
    timings,
  };
}
