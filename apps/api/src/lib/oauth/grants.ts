import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mcpTokens, oauthCodes, oauthRefreshTokens } from "@/db/schema";
import {
  generateMcpSecret,
  hashMcpSecret,
} from "@/lib/mcp/tokens";
import type { McpScope } from "@/lib/mcp/types";
import { getOAuthClient } from "@/lib/oauth/clients";
import { verifyPkceS256 } from "@/lib/oauth/pkce";
import { canonicalResource } from "@/lib/oauth/urls";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_CODE_TTL_MS = 60 * 1000;

export type IssuedTokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: McpScope;
};

export async function createAuthorizationCode(input: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: McpScope;
  resource: string;
}): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db.insert(oauthCodes).values({
    codeHash: hashMcpSecret(code),
    userId: input.userId,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    resource: canonicalResource(input.resource),
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<IssuedTokens | { error: string; description: string }> {
  const rows = await db
    .select()
    .from(oauthCodes)
    .where(eq(oauthCodes.codeHash, hashMcpSecret(input.code)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { error: "invalid_grant", description: "Unknown authorization code" };
  }
  if (row.consumedAt) {
    return { error: "invalid_grant", description: "Authorization code already used" };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { error: "invalid_grant", description: "Authorization code expired" };
  }
  if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) {
    return { error: "invalid_grant", description: "Authorization code mismatch" };
  }
  if (
    input.resource &&
    canonicalResource(input.resource) !== canonicalResource(row.resource)
  ) {
    return { error: "invalid_grant", description: "Resource mismatch" };
  }
  if (!verifyPkceS256(input.codeVerifier, row.codeChallenge)) {
    return { error: "invalid_grant", description: "PKCE verification failed" };
  }

  const consumed = await db
    .update(oauthCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(oauthCodes.id, row.id), isNull(oauthCodes.consumedAt)))
    .returning({ id: oauthCodes.id });
  if (!consumed.length) {
    return { error: "invalid_grant", description: "Authorization code already used" };
  }

  const scope = row.scope === "read" ? "read" : "write";
  return issueTokenPair({
    userId: row.userId,
    clientId: row.clientId,
    scope,
    resource: row.resource,
    replaceExisting: true,
  });
}

export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  resource?: string;
}): Promise<IssuedTokens | { error: string; description: string }> {
  if (!input.refreshToken.startsWith("relr_")) {
    return { error: "invalid_grant", description: "Unknown refresh token" };
  }
  const rows = await db
    .select()
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.tokenHash, hashMcpSecret(input.refreshToken)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { error: "invalid_grant", description: "Unknown refresh token" };
  }
  if (row.revokedAt) {
    await revokeClientTokens(row.userId, row.clientId);
    return { error: "invalid_grant", description: "Refresh token already used" };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { error: "invalid_grant", description: "Refresh token expired" };
  }
  if (row.clientId !== input.clientId) {
    return { error: "invalid_grant", description: "Refresh token mismatch" };
  }
  if (
    input.resource &&
    canonicalResource(input.resource) !== canonicalResource(row.resource)
  ) {
    return { error: "invalid_grant", description: "Resource mismatch" };
  }

  const revoked = await db
    .update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(oauthRefreshTokens.id, row.id), isNull(oauthRefreshTokens.revokedAt))
    )
    .returning({ id: oauthRefreshTokens.id });
  if (!revoked.length) {
    await revokeClientTokens(row.userId, row.clientId);
    return { error: "invalid_grant", description: "Refresh token already used" };
  }

  const scope = row.scope === "read" ? "read" : "write";
  const access = generateMcpSecret();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const [token] = await db
    .update(mcpTokens)
    .set({
      tokenHash: access.tokenHash,
      tokenPrefix: access.tokenPrefix,
      expiresAt,
      lastUsedAt: new Date(),
      revokedAt: null,
    })
    .where(
      and(
        eq(mcpTokens.id, row.mcpTokenId),
        eq(mcpTokens.userId, row.userId),
        isNull(mcpTokens.revokedAt)
      )
    )
    .returning();
  if (!token) {
    return issueTokenPair({
      userId: row.userId,
      clientId: row.clientId,
      scope,
      resource: row.resource,
      replaceExisting: true,
    });
  }

  const refresh = issueRefreshSecret();
  await db.insert(oauthRefreshTokens).values({
    tokenHash: hashMcpSecret(refresh),
    userId: row.userId,
    clientId: row.clientId,
    mcpTokenId: token.id,
    scope,
    resource: row.resource,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return {
    access_token: access.secret,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope,
  };
}

async function issueTokenPair(input: {
  userId: string;
  clientId: string;
  scope: McpScope;
  resource: string;
  replaceExisting: boolean;
}): Promise<IssuedTokens> {
  if (input.replaceExisting) {
    await revokeClientTokens(input.userId, input.clientId);
  }
  const client = await getOAuthClient(input.clientId);
  const access = generateMcpSecret();
  const [token] = await db
    .insert(mcpTokens)
    .values({
      userId: input.userId,
      name: (client?.name ?? "Cursor").slice(0, 64),
      tokenHash: access.tokenHash,
      tokenPrefix: access.tokenPrefix,
      scope: input.scope,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
      oauthClientId: input.clientId,
    })
    .returning();
  if (!token) throw new Error("Could not issue access token");

  const refresh = issueRefreshSecret();
  await db.insert(oauthRefreshTokens).values({
    tokenHash: hashMcpSecret(refresh),
    userId: input.userId,
    clientId: input.clientId,
    mcpTokenId: token.id,
    scope: input.scope,
    resource: input.resource,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return {
    access_token: access.secret,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope: input.scope,
  };
}

async function revokeClientTokens(userId: string, clientId: string): Promise<void> {
  const now = new Date();
  await db
    .update(oauthRefreshTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(oauthRefreshTokens.userId, userId),
        eq(oauthRefreshTokens.clientId, clientId),
        isNull(oauthRefreshTokens.revokedAt)
      )
    );
  await db
    .update(mcpTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(mcpTokens.userId, userId),
        eq(mcpTokens.oauthClientId, clientId),
        isNull(mcpTokens.revokedAt)
      )
    );
}

function issueRefreshSecret(): string {
  return `relr_${randomBytes(32).toString("base64url")}`;
}
