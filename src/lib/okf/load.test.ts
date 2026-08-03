import test from "node:test";
import assert from "node:assert/strict";
import { loadBundle } from "@/lib/okf/load";

const bundle = loadBundle("okf");

// Bump this when adding a concept — it is what catches a file being silently
// dropped by the walker (wrong extension, unreadable dir) rather than failing loudly.
test("loads every concept, skipping index.md", () => {
  assert.equal(bundle.concepts.length, 16);
  assert.equal(bundle.byId.get("index"), undefined);
});

test("concept ID is the file path minus .md", () => {
  const cec = bundle.byId.get("programs/cec");
  assert.ok(cec);
  assert.equal(cec.type, "program");
  assert.equal(cec.title, "Canadian Experience Class");
});

test("typed edges are parsed as arrays", () => {
  const cec = bundle.byId.get("programs/cec")!;
  assert.deepEqual(cec.requires, ["requirements/clb7"]);
  assert.deepEqual(cec.feeds_into, ["programs/express-entry"]);
});

test("every edge points at a real concept — no dangling links", () => {
  for (const c of bundle.concepts) {
    for (const target of [...(c.requires ?? []), ...(c.feeds_into ?? []), ...(c.boosts ?? [])]) {
      assert.ok(bundle.byId.has(target), `"${c.id}" links to missing "${target}"`);
    }
  }
});

// Federal rules cite IRCC. Provincial nominee streams have no IRCC page that
// states their criteria, so the province's own site is the canonical source —
// but only an official government one, never a consultant's summary.
const OFFICIAL_SOURCE_HOSTS = ["canada.ca", "ontario.ca"];

test("every concept has a body and an official government resource", () => {
  for (const c of bundle.concepts) {
    assert.ok(c.body.length > 0, `"${c.id}" has an empty body`);
    const host = c.resource ? new URL(c.resource).hostname : "";
    assert.ok(
      OFFICIAL_SOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)),
      `"${c.id}" lacks an official government resource (got "${c.resource}")`,
    );
  }
});