import assert from "node:assert/strict";
import test from "node:test";
import { mentionSpans, mentionsAdded, resolveMentions } from "./mentions";
import type { Member } from "./types";

const ada: Member = {
  id: "ada",
  name: "Ada Lovelace",
  email: "ada@example.com",
  image: null,
};
const grace: Member = {
  id: "grace",
  name: "Grace Hopper",
  email: "grace@example.com",
  image: null,
};

test("resolveMentions finds names and emails without overlapping shorter hits", () => {
  const found = resolveMentions("Ping @Ada Lovelace and @grace@example.com", [ada, grace]);
  assert.deepEqual(
    found.map((member) => member.id),
    ["ada", "grace"]
  );
});

test("mentionSpans keep the characters that were actually typed", () => {
  const spans = mentionSpans("See @grace@example.com", [ada, grace]);
  assert.equal(spans.length, 1);
  assert.equal(spans[0]?.member.id, "grace");
  assert.equal("See @grace@example.com".slice(spans[0]!.start, spans[0]!.end), "@grace@example.com");
});

test("mentionsAdded only returns people newly tagged", () => {
  const before = "Already asked @Ada Lovelace";
  const after = "Already asked @Ada Lovelace\nAlso @Grace Hopper";
  assert.deepEqual(
    mentionsAdded(before, after, [ada, grace]).map((member) => member.id),
    ["grace"]
  );
  assert.deepEqual(mentionsAdded(before, before, [ada, grace]), []);
});
