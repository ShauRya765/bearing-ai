import test from "node:test";
import assert from "node:assert/strict";
import { loadBundle } from "@/lib/okf/load";

const bundle = loadBundle("okf");

test("loads all six concepts, skipping index.md", () => {
  assert.equal(bundle.concepts.length, 6);
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

test("every concept has a body and an IRCC resource", () => {
  for (const c of bundle.concepts) {
    assert.ok(c.body.length > 0, `"${c.id}" has an empty body`);
    assert.ok(c.resource?.includes("canada.ca"), `"${c.id}" lacks an IRCC resource`);
  }
});