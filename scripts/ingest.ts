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

  // Embed everything BEFORE touching the table.
  //
  // This used to delete first and insert as it went. When the insert failed —
  // an expired key, a permissions change, a network blip — the delete had
  // already committed, so a run that should have been a no-op left the corpus
  // empty and the app answering from nothing. Embedding first means the only
  // work left after the delete is a single write we already know the shape of.
  const rows: {
    content: string;
    source_url: string;
    source_title: string;
    embedding: number[];
  }[] = [];

  for (const concept of bundle.concepts) {
    rows.push({
      content: concept.body,
      source_url: concept.resource ?? "",
      source_title: concept.title ?? concept.id,
      embedding: await embed(concept.body),
    });
    console.log(`  embedded  ${concept.id}`);
  }

  // Verify we can write at all before destroying anything. A publishable key
  // passes every read and fails every write, which is exactly the shape of
  // failure that emptied the table before.
  const probe = { ...rows[0], source_title: "__ingest_write_probe__" };
  const { error: probeErr } = await supabase.from("rule_chunks").insert(probe);
  if (probeErr) {
    throw new Error(
      `Write check failed, so nothing was deleted — the corpus is untouched.\n` +
        `  ${probeErr.message}\n` +
        `  If this mentions row-level security, SUPABASE_SERVICE_ROLE_KEY is probably ` +
        `a publishable key (sb_publishable_… / anon). Ingestion needs the secret ` +
        `service key from Supabase → Project Settings → API Keys.`,
    );
  }
  await supabase
    .from("rule_chunks")
    .delete()
    .eq("source_title", "__ingest_write_probe__");

  const { error: delErr } = await supabase
    .from("rule_chunks")
    .delete()
    .neq("id", 0);
  if (delErr) throw delErr;

  const { error: insErr } = await supabase.from("rule_chunks").insert(rows);
  if (insErr) {
    throw new Error(
      `Insert failed AFTER the delete — the table may now be empty. ` +
        `Re-run this script once the cause is fixed; okf/ is the source of ` +
        `truth, so nothing is lost.\n  ${insErr.message}`,
    );
  }

  // Confirm what actually landed rather than trusting the absence of an error.
  const { count, error: countErr } = await supabase
    .from("rule_chunks")
    .select("*", { count: "exact", head: true });
  if (countErr) throw countErr;

  if (count !== rows.length) {
    throw new Error(
      `Expected ${rows.length} rows after ingest but the table holds ${count}.`,
    );
  }

  console.log(`\nDone. ${count} concepts embedded and verified in the table.`);
}

main().catch((err) => {
  console.error("\nIngestion failed:", err.message);
  process.exit(1);
});