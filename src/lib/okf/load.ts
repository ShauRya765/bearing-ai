import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";

// Loads an OKF bundle from disk into typed objects. Per the spec:
// concept ID = file path minus .md; `type` is the only required field;
// unknown frontmatter keys are preserved. Our typed edges (requires,
// feeds_into, boosts) are producer-defined keys the spec permits.

export interface OkfConcept {
  id: string;                 // "programs/cec"
  type: string;               // required by spec
  title?: string;
  description?: string;
  resource?: string;          // canonical IRCC URL — our citation source
  tags?: string[];
  timestamp?: string;
  requires?: string[];        // typed edges (producer-defined)
  feeds_into?: string[];
  boosts?: string[];
  body: string;               // the rule text — what RAG embeds
}

export interface OkfBundle {
  concepts: OkfConcept[];
  byId: Map<string, OkfConcept>;
}

function walkMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkMarkdownFiles(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

export function loadBundle(rootDir: string): OkfBundle {
  const concepts: OkfConcept[] = [];

  for (const file of walkMarkdownFiles(rootDir)) {
    const id = relative(rootDir, file).replace(/\.md$/, "");

    // index.md files are reserved navigation docs, not concepts.
    if (id === "index" || id.endsWith("/index")) continue;

    const { data, content } = matter(readFileSync(file, "utf-8"));

    // Spec conformance: a concept without a non-empty type is not valid.
    if (!data.type || typeof data.type !== "string") {
      throw new Error(`OKF concept "${id}" is missing the required "type" field.`);
    }

    concepts.push({
      id,
      type: data.type,
      title: data.title,
      description: data.description,
      resource: data.resource,
      tags: data.tags,
      timestamp: data.timestamp ? String(data.timestamp) : undefined,
      requires: data.requires,
      feeds_into: data.feeds_into,
      boosts: data.boosts,
      body: content.trim(),
    });
  }

  return { concepts, byId: new Map(concepts.map((c) => [c.id, c])) };
}