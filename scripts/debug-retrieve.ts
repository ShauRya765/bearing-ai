import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function main() {
  const question = process.argv[2] ?? "how much Canadian work do I need for CEC?";

  const emb = await genAI.models.embedContent({
    model: "gemini-embedding-001",
    contents: question,
    config: { outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" },
  });

  const { data, error } = await supabase.rpc("match_rule_chunks", {
    query_embedding: emb.embeddings![0].values!,
    match_count: 10,
  });
  if (error) throw error;

  console.log(`\nQ: ${question}\n`);
  console.log(`Returned ${data.length} chunks:\n`);
  for (const c of data) {
    console.log(`  ${c.similarity.toFixed(4)}  ${c.source_title}`);
  }
}

main().catch((e) => console.error(e.message));