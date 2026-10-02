import assert from "node:assert/strict";
import test from "node:test";
import { HTTPException } from "hono/http-exception";
import { HttpError } from "./context";
import { isReportableApiError } from "./posthog-error";

test("isReportableApiError ignores expected client errors", () => {
  assert.equal(isReportableApiError(new HttpError(401, "Unauthorized")), false);
  assert.equal(isReportableApiError(new HttpError(404, "No workspace")), false);
  assert.equal(isReportableApiError(new HTTPException(413, { message: "Too large" })), false);
  assert.equal(isReportableApiError(new HttpError(500, "Unavailable")), true);
  assert.equal(isReportableApiError(new HTTPException(500, { message: "Down" })), true);
  assert.equal(isReportableApiError(new Error("query failed")), true);
});
