import { createHmac, timingSafeEqual } from "node:crypto";
import { slackOAuthSecret } from "./config";

export type SlackOAuthKind = "install" | "user";

export type SlackOAuthState = {
  workspaceId: string;
  userId: string;
  kind: SlackOAuthKind;
  exp: number;
};

export function signSlackOAuthState(input: {
  workspaceId: string;
  userId: string;
  kind: SlackOAuthKind;
  ttlMs?: number;
}): string {
  const payload: SlackOAuthState = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    kind: input.kind,
    exp: Date.now() + (input.ttlMs ?? 15 * 60 * 1000),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", slackOAuthSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSlackOAuthState(state: string | undefined): SlackOAuthState | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", slackOAuthSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SlackOAuthState;
    if (
      !payload.workspaceId ||
      !payload.userId ||
      (payload.kind !== "install" && payload.kind !== "user") ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
