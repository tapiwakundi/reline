import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIssueRef, splitIssueKey } from "./parse-link";

describe("parseIssueRef", () => {
  it("reads a workspace issue URL", () => {
    assert.deepEqual(
      parseIssueRef("https://app.example.com/acme/issue/REL-42"),
      { slug: "acme", identifier: "REL-42" }
    );
  });

  it("ignores query strings and trailing slashes", () => {
    assert.deepEqual(
      parseIssueRef("http://localhost:4000/acme/issue/rel-42/?tab=comments"),
      { slug: "acme", identifier: "rel-42" }
    );
  });

  it("decodes path segments", () => {
    assert.deepEqual(
      parseIssueRef("https://app.example.com/acme%20team/issue/REL-7"),
      { slug: "acme team", identifier: "REL-7" }
    );
  });

  it("accepts a bare issue key", () => {
    assert.deepEqual(parseIssueRef("  REL-42  "), { identifier: "REL-42" });
    assert.deepEqual(splitIssueKey("FOO-BAR-12"), { prefix: "FOO-BAR", number: 12 });
  });

  it("rejects other paths and non-http URLs", () => {
    assert.equal(parseIssueRef("https://app.example.com/acme/board"), null);
    assert.equal(parseIssueRef("https://app.example.com/acme/issue/REL-42/edit"), null);
    assert.equal(parseIssueRef("javascript:alert(1)"), null);
    assert.equal(parseIssueRef("REL-"), null);
    assert.equal(parseIssueRef(""), null);
    assert.equal(splitIssueKey("REL-0"), null);
  });
});
