import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mcpTokens, user } from "@/db/schema";
import { HttpError } from "@/lib/context";

const MAX_ACTIVE_TOKENS = 10;
const READ_SCOPE = "read";

export type McpActor = {
  id: string;
  name: string;
  email: string;
};

export type McpTokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: typeof READ_SCOPE;
  createdAt: string;
  lastUsedAt: string | null;
};

export function hashMcpSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateMcpSecret(): {
  secret: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const secret = `rel_${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    tokenHash: hashMcpSecret(secret),
    tokenPrefix: secret.slice(0, 12),
  };
}

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

export async function authenticateMcpToken(
  secret: string
): Promise<McpActor | null> {
  if (!secret.startsWith("rel_") || secret.length < 20) return null;
  const hash = hashMcpSecret(secret);
  const rows = await db
    .select({
      tokenId: mcpTokens.id,
      scope: mcpTokens.scope,
      lastUsedAt: mcpTokens.lastUsedAt,
      userId: user.id,
      name: user.name,
      email: user.email,
    })
    .from(mcpTokens)
    .innerJoin(user, eq(mcpTokens.userId, user.id))
    .where(and(eq(mcpTokens.tokenHash, hash), isNull(mcpTokens.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row || row.scope !== READ_SCOPE) return null;

  const stale =
    !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000;
  if (stale) {
    await db
      .update(mcpTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpTokens.id, row.tokenId));
  }

  return { id: row.userId, name: row.name, email: row.email };
}

export async function listMcpTokens(userId: string): Promise<McpTokenSummary[]> {
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)))
    .orderBy(desc(mcpTokens.createdAt));
  return rows.map(toSummary);
}

export async function createMcpToken(
  userId: string,
  name: string
): Promise<McpTokenSummary & { secret: string }> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 64 || /[\u0000-\u001f]/.test(trimmed)) {
    throw new HttpError(400, "Token name must be 1–64 characters");
  }

  const [{ value }] = await db
    .select({ value: count() })
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)));
  if (Number(value) >= MAX_ACTIVE_TOKENS) {
    throw new HttpError(
      400,
      "You can have at most 10 active tokens. Revoke one to create another."
    );
  }

  const generated = generateMcpSecret();
  const [row] = await db
    .insert(mcpTokens)
    .values({
      userId,
      name: trimmed,
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      scope: READ_SCOPE,
    })
    .returning();
  if (!row) throw new HttpError(500, "Could not create token");
  return { ...toSummary(row), secret: generated.secret };
}

export async function revokeMcpToken(userId: string, tokenId: string): Promise<void> {
  const updated = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpTokens.id, tokenId),
        eq(mcpTokens.userId, userId),
        isNull(mcpTokens.revokedAt)
      )
    )
    .returning({ id: mcpTokens.id });
  if (!updated.length) throw new HttpError(404, "Token not found");
}

function toSummary(row: typeof mcpTokens.$inferSelect): McpTokenSummary {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scope: READ_SCOPE,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}
