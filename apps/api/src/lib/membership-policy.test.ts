import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "./context";
import { membershipRemoval } from "./membership-policy";

const owner = "owner-1";
const member = "member-1";
const other = "member-2";

test("an owner can remove another member", () => {
  assert.equal(
    membershipRemoval({
      actorId: owner,
      actorRole: "owner",
      targetId: member,
      targetRole: "member",
    }),
    "remove"
  );
});

test("a member can leave", () => {
  assert.equal(
    membershipRemoval({
      actorId: member,
      actorRole: "member",
      targetId: member,
      targetRole: "member",
    }),
    "leave"
  );
});

test("a member cannot remove someone else", () => {
  assert.throws(
    () =>
      membershipRemoval({
        actorId: member,
        actorRole: "member",
        targetId: other,
        targetRole: "member",
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.status === 403 &&
      error.message === "Only the workspace owner can remove members"
  );
});

test("an owner cannot remove another owner", () => {
  assert.throws(
    () =>
      membershipRemoval({
        actorId: owner,
        actorRole: "owner",
        targetId: "owner-2",
        targetRole: "owner",
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.status === 400 &&
      error.message === "The workspace owner can't be removed."
  );
});

test("the owner cannot leave or be removed", () => {
  assert.throws(
    () =>
      membershipRemoval({
        actorId: owner,
        actorRole: "owner",
        targetId: owner,
        targetRole: "owner",
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.status === 400 &&
      error.message ===
        "The workspace owner can't leave. Delete the workspace instead."
  );

  assert.throws(
    () =>
      membershipRemoval({
        actorId: member,
        actorRole: "member",
        targetId: owner,
        targetRole: "owner",
      }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.status === 400 &&
      error.message === "The workspace owner can't be removed."
  );
});
