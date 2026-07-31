import test from "node:test";
import assert from "node:assert/strict";
import type { ReactElement, ReactNode } from "react";
import { renderMarkdown, type Citation } from "@/components/AnswerMarkdown";

const CITATIONS: Citation[] = [
  { sourceTitle: "IRCC — CRS grid", sourceUrl: "https://example.invalid/grid" },
  { sourceTitle: "IRCC — Language", sourceUrl: "https://example.invalid/lang" },
];

// Walk the tree and collect every key at each sibling level, the way React does
// when it warns about duplicates.
function duplicateKeys(node: ReactNode, found: string[] = []): string[] {
  const children = Array.isArray(node) ? node : [node];
  const keys: string[] = [];

  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const el = child as ReactElement<{ children?: ReactNode }>;
    if (el.key != null) {
      if (keys.includes(el.key)) found.push(el.key);
      keys.push(el.key);
    }
    if (el.props?.children) duplicateKeys(el.props.children, found);
  }
  return found;
}

test("citations on both sides of a bold span don't collide", () => {
  // The original bug: renderPlain restarted its key counter per segment, so the
  // citation before **bold** and the one after were both keyed "c0".
  const text = "CLB 7 is required [1] but **strong French** unlocks more [2].";
  assert.deepEqual(duplicateKeys(renderMarkdown(text, CITATIONS)), []);
});

test("multiple citations across several bold spans stay unique", () => {
  const text =
    "**Impact:** worth 50 points [1], and **note** the cap [2] applies [1] too [2].";
  assert.deepEqual(duplicateKeys(renderMarkdown(text, CITATIONS)), []);
});

test("citations inside a bold span don't collide with ones outside it", () => {
  const text = "Before [1] **bold with [2] inside** after [1].";
  assert.deepEqual(duplicateKeys(renderMarkdown(text, CITATIONS)), []);
});

test("multi-line answers with bullets and numbers stay unique", () => {
  const text = [
    "Here is the summary [1].",
    "1. **Language:** raise to CLB 9 [2] for more points [1].",
    "- A bullet with [1] and **bold** and [2].",
    "- Another [2] bullet [1].",
  ].join("\n");
  assert.deepEqual(duplicateKeys(renderMarkdown(text, CITATIONS)), []);
});

test("an unmatched citation marker stays literal text", () => {
  // [9] has no matching source — it must not become a link.
  const nodes = renderMarkdown("Unknown source [9] here.", CITATIONS);
  assert.deepEqual(duplicateKeys(nodes), []);
  assert.ok(JSON.stringify(nodes).includes("[9]"));
});
