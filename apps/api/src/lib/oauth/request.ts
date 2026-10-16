import { createHmac, timingSafeEqual } from "node:crypto";
import type { McpScope } from "@/lib/mcp/types";

const REQUEST_TTL_MS = 10 * 60 * 1000;

export type AuthorizeTicket = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  scope: McpScope;
  resource: string;
  exp: number;
};

function signingSecret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is not set");
  return value;
}

export function signAuthorizeTicket(
  input: Omit<AuthorizeTicket, "exp"> & { ttlMs?: number }
): string {
  const payload: AuthorizeTicket = {
    clientId: input.clientId,
    clientName: input.clientName,
    redirectUri: input.redirectUri,
    state: input.state,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    resource: input.resource,
    exp: Date.now() + (input.ttlMs ?? REQUEST_TTL_MS),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readAuthorizeTicket(
  value: string | undefined
): AuthorizeTicket | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", signingSecret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as AuthorizeTicket;
    if (
      !payload.clientId ||
      !payload.clientName ||
      !payload.redirectUri ||
      !payload.codeChallenge ||
      (payload.scope !== "read" && payload.scope !== "write") ||
      !payload.resource ||
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
