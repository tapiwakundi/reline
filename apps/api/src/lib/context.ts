import type { memberships, workspaces } from "@/db/schema";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type WorkspaceContext = {
  user: AuthUser;
  membership: typeof memberships.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}
