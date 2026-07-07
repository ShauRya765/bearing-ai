import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { askRules } = await import("../src/lib/rag/retrieve");

  const question = process.argv[2] ?? "Does a provincial nomination affect my CRS score?";
  console.log(`\nQ: ${question}\n`);

  const result = await askRules(question);

  console.log("A:", result.answer);
  console.log(`\nChunks used: ${result.chunksUsed}`);
  console.log("Citations:");
  for (const c of result.citations) {
    console.log(`  - ${c.sourceTitle}\n    ${c.sourceUrl}`);
  }
}

main().catch((err) => {
  console.error("\nRetrieval failed:", err.message);
  process.exit(1);
});