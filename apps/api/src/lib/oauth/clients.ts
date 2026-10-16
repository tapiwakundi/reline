import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { oauthClients } from "@/db/schema";
import { HttpError } from "@/lib/context";
import {
  STATIC_OAUTH_CLIENT_ID,
  STATIC_OAUTH_CLIENT_NAME,
  STATIC_REDIRECT_URIS,
  filterRedirectUris,
} from "@/lib/oauth/redirect";

export type OAuthClient = {
  id: string;
  name: string;
  redirectUris: string[];
};

export function isRegisteredRedirect(
  client: OAuthClient,
  redirectUri: string
): boolean {
  return client.redirectUris.includes(redirectUri);
}

export async function getOAuthClient(
  clientId: string | undefined
): Promise<OAuthClient | null> {
  if (!clientId) return null;
  if (clientId === STATIC_OAUTH_CLIENT_ID) {
    return {
      id: STATIC_OAUTH_CLIENT_ID,
      name: STATIC_OAUTH_CLIENT_NAME,
      redirectUris: [...STATIC_REDIRECT_URIS],
    };
  }
  const rows = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, clientId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    redirectUris: row.redirectUris,
  };
}

export function sanitizeClientName(value: unknown): string {
  if (typeof value !== "string") return STATIC_OAUTH_CLIENT_NAME;
  const trimmed = value.trim().replace(/[\u0000-\u001f]/g, "");
  if (!trimmed) return STATIC_OAUTH_CLIENT_NAME;
  return trimmed.slice(0, 64);
}

export async function registerOAuthClient(input: {
  name: unknown;
  redirectUris: unknown;
}): Promise<OAuthClient> {
  const redirectUris = filterRedirectUris(input.redirectUris);
  if (!redirectUris.length) {
    throw new HttpError(400, "No supported redirect URIs");
  }
  const name = sanitizeClientName(input.name);
  const [row] = await db
    .insert(oauthClients)
    .values({
      id: nanoid(),
      name,
      redirectUris,
    })
    .returning();
  if (!row) throw new HttpError(500, "Could not register client");
  return {
    id: row.id,
    name: row.name,
    redirectUris: row.redirectUris,
  };
}
