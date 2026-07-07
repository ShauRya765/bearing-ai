import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { RULE_SOURCES } from "../src/lib/rag/sources";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiKey) {
  throw new Error(
    "Missing env vars. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY in .env.local",
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenAI({ apiKey: geminiKey });

async function embed(text: string): Promise<number[]> {
  const result = await genAI.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: {
      outputDimensionality: 768,
      taskType: "RETRIEVAL_DOCUMENT",
    },
  });
  return result.embeddings![0].values!;
}
async function main() {
  console.log(`Ingesting ${RULE_SOURCES.length} rule chunks...\n`);

  // Clear existing rows so re-running is idempotent, not duplicative.
  const { error: delErr } = await supabase
    .from("rule_chunks")
    .delete()
    .neq("id", 0);
  if (delErr) throw delErr;

  for (const source of RULE_SOURCES) {
    const embedding = await embed(source.content);

    const { error } = await supabase.from("rule_chunks").insert({
      content: source.content,
      source_url: source.sourceUrl,
      source_title: source.sourceTitle,
      embedding,
    });

    if (error) throw error;
    console.log(`  ✓ ${source.sourceTitle}`);
  }

  console.log(`\nDone. ${RULE_SOURCES.length} chunks embedded and stored.`);
}

main().catch((err) => {
  console.error("\nIngestion failed:", err.message);
  process.exit(1);
});