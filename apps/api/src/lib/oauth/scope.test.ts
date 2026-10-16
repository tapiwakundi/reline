import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRequestedScope } from "./scope";

describe("OAuth scope", () => {
  it("defaults to write and honors an explicit read request", () => {
    assert.equal(parseRequestedScope(undefined), "write");
    assert.equal(parseRequestedScope(""), "write");
    assert.equal(parseRequestedScope("read"), "read");
    assert.equal(parseRequestedScope("read write"), "write");
    assert.equal(parseRequestedScope("write"), "write");
  });
});
