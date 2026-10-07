import { HttpError } from "@/lib/context";

export type MembershipRemoval = "remove" | "leave";

/**
 * Owners can remove other members. Anyone except the owner can leave.
 * The owner stays so the workspace always has someone who can manage it.
 */
export function membershipRemoval(input: {
  actorId: string;
  actorRole: string;
  targetId: string;
  targetRole: string;
}): MembershipRemoval {
  const self = input.actorId === input.targetId;
  if (input.targetRole === "owner") {
    throw new HttpError(
      400,
      self
        ? "The workspace owner can't leave. Delete the workspace instead."
        : "The workspace owner can't be removed."
    );
  }
  if (self) return "leave";
  if (input.actorRole !== "owner") {
    throw new HttpError(403, "Only the workspace owner can remove members");
  }
  return "remove";
}
