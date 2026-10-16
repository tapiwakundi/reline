import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAuthorizeTicket, signAuthorizeTicket } from "./request";

const previous = process.env.BETTER_AUTH_SECRET;

describe("authorize ticket", () => {
  it("round-trips a signed consent request", () => {
    process.env.BETTER_AUTH_SECRET = "oauth-test-secret";
    const ticket = signAuthorizeTicket({
      clientId: "reline",
      clientName: "Cursor",
      redirectUri: "http://localhost:8787/callback",
      state: "abc",
      codeChallenge: "a".repeat(43),
      scope: "write",
      resource: "http://localhost:4002/api/mcp",
    });
    const parsed = readAuthorizeTicket(ticket);
    assert.equal(parsed?.clientId, "reline");
    assert.equal(parsed?.clientName, "Cursor");
    assert.equal(parsed?.state, "abc");
    assert.equal(parsed?.scope, "write");
    assert.equal(readAuthorizeTicket(`${ticket}x`), null);
    assert.equal(readAuthorizeTicket(undefined), null);
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  });

  it("rejects an expired ticket", () => {
    process.env.BETTER_AUTH_SECRET = "oauth-test-secret";
    const ticket = signAuthorizeTicket({
      clientId: "reline",
      clientName: "Cursor",
      redirectUri: "http://localhost:8787/callback",
      codeChallenge: "a".repeat(43),
      scope: "write",
      resource: "http://localhost:4002/api/mcp",
      ttlMs: -1,
    });
    assert.equal(readAuthorizeTicket(ticket), null);
    if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previous;
  });
});
