import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { loadBundle } from "../src/lib/okf/load";

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
  const bundle = loadBundle("okf");
  console.log(`Ingesting ${bundle.concepts.length} OKF concepts...\n`);

  const { error: delErr } = await supabase
    .from("rule_chunks")
    .delete()
    .neq("id", 0);
  if (delErr) throw delErr;

  for (const concept of bundle.concepts) {
    const embedding = await embed(concept.body);

    const { error } = await supabase.from("rule_chunks").insert({
      content: concept.body,
      source_url: concept.resource ?? "",
      source_title: concept.title ?? concept.id,
      embedding,
    });

    if (error) throw error;
    console.log(`  ✓ ${concept.id}`);
  }

  console.log(`\nDone. ${bundle.concepts.length} concepts embedded.`);
}

main().catch((err) => {
  console.error("\nIngestion failed:", err.message);
  process.exit(1);
});