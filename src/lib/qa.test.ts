import test from "node:test";
import assert from "node:assert/strict";
import { validateFeedback, MAX_REASON_LENGTH } from "@/lib/qa";

const ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

test("a bad rating without a reason is rejected", () => {
  for (const reason of [undefined, null, "", "   ", "\n\t "]) {
    const result = validateFeedback({ id: ID, rating: "bad", reason });
    assert.equal(result.ok, false, `reason ${JSON.stringify(reason)} should fail`);
  }
});

test("a bad rating with a reason is accepted and trimmed", () => {
  const result = validateFeedback({ id: ID, rating: "bad", reason: "  wrong points  " });
  assert.ok(result.ok);
  assert.deepEqual(result.value, { id: ID, rating: "bad", reason: "wrong points" });
});

test("a great rating needs no reason", () => {
  const result = validateFeedback({ id: ID, rating: "great" });
  assert.ok(result.ok);
  assert.equal(result.value.reason, null);
});

test("a great rating keeps a reason when one is given", () => {
  const result = validateFeedback({ id: ID, rating: "great", reason: "clear and cited" });
  assert.ok(result.ok);
  assert.equal(result.value.reason, "clear and cited");
});

test("blank-only reasons on a great rating normalise to null, not empty string", () => {
  const result = validateFeedback({ id: ID, rating: "great", reason: "   " });
  assert.ok(result.ok);
  assert.equal(result.value.reason, null);
});

test("unknown ratings are rejected — no free-text rating values", () => {
  for (const rating of ["good", "GREAT", "", 1, null, undefined]) {
    assert.equal(validateFeedback({ id: ID, rating, reason: "x" }).ok, false);
  }
});

test("the id must be a uuid", () => {
  for (const id of ["", "not-a-uuid", 42, null, `${ID} `]) {
    assert.equal(validateFeedback({ id, rating: "great" }).ok, false);
  }
});

test("an over-long reason is rejected", () => {
  const reason = "x".repeat(MAX_REASON_LENGTH + 1);
  assert.equal(validateFeedback({ id: ID, rating: "bad", reason }).ok, false);
  assert.equal(
    validateFeedback({ id: ID, rating: "bad", reason: reason.slice(1) }).ok,
    true,
  );
});

test("a non-string reason is rejected rather than coerced", () => {
  assert.equal(validateFeedback({ id: ID, rating: "great", reason: { a: 1 } }).ok, false);
  assert.equal(validateFeedback({ id: ID, rating: "bad", reason: 5 }).ok, false);
});

test("garbage bodies don't throw", () => {
  for (const body of [null, undefined, "", 0, [], "string"]) {
    assert.equal(validateFeedback(body).ok, false);
  }
});
