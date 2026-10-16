import { Hono } from "hono";
import { HttpError } from "@/lib/context";
import { getSessionFromHeaders } from "@/lib/session";
import {
  getOAuthClient,
  isRegisteredRedirect,
  registerOAuthClient,
} from "@/lib/oauth/clients";
import { OAUTH_CORS_HEADERS, oauthCorsPreflight } from "@/lib/oauth/cors";
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  rotateRefreshToken,
  type IssuedTokens,
} from "@/lib/oauth/grants";
import { isValidCodeChallenge } from "@/lib/oauth/pkce";
import {
  isLoopbackRedirect,
  redirectHost,
  withOAuthQuery,
} from "@/lib/oauth/redirect";
import { readAuthorizeTicket, signAuthorizeTicket } from "@/lib/oauth/request";
import { parseRequestedScope } from "@/lib/oauth/scope";
import {
  mcpIssuer,
  mcpResourceUrl,
  resourceMatches,
} from "@/lib/oauth/urls";

export const oauthRoutes = new Hono();

oauthRoutes.options("/oauth/token", () => oauthCorsPreflight());
oauthRoutes.options("/oauth/register", () => oauthCorsPreflight());

oauthRoutes.get("/oauth/authorize", async (c) => {
  const clientId = c.req.query("client_id")?.trim();
  const redirectUri = c.req.query("redirect_uri")?.trim();
  const state = c.req.query("state") ?? undefined;
  const client = await getOAuthClient(clientId);
  if (!client || !redirectUri || !isRegisteredRedirect(client, redirectUri)) {
    return c.redirect(consentErrorUrl("invalid_request"));
  }

  const fail = (error: string, description?: string) =>
    c.redirect(
      withOAuthQuery(redirectUri, {
        error,
        error_description: description,
        state,
      })
    );

  if (c.req.query("response_type") !== "code") {
    return fail("unsupported_response_type");
  }
  if (c.req.query("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE S256 is required");
  }
  const codeChallenge = c.req.query("code_challenge") ?? "";
  if (!isValidCodeChallenge(codeChallenge)) {
    return fail("invalid_request", "Invalid code_challenge");
  }
  const resource = c.req.query("resource") ?? mcpResourceUrl();
  if (!resourceMatches(resource)) {
    return fail("invalid_request", "Unknown resource");
  }

  const ticket = signAuthorizeTicket({
    clientId: client.id,
    clientName: client.name,
    redirectUri,
    state,
    codeChallenge,
    scope: parseRequestedScope(c.req.query("scope") ?? undefined),
    resource,
  });
  const consentPath = `/oauth/consent?request=${encodeURIComponent(ticket)}`;
  const session = await getSessionFromHeaders(c.req.raw.headers);
  if (!session) {
    return c.redirect(
      `${mcpIssuer()}/login?next=${encodeURIComponent(consentPath)}`
    );
  }
  return c.redirect(`${mcpIssuer()}${consentPath}`);
});

oauthRoutes.get("/oauth/consent", async (c) => {
  const session = await getSessionFromHeaders(c.req.raw.headers);
  if (!session) throw new HttpError(401, "Unauthorized");
  const ticket = readAuthorizeTicket(c.req.query("request") ?? undefined);
  if (!ticket) {
    throw new HttpError(
      400,
      "This authorization request expired. Go back to Cursor and try again."
    );
  }
  const client = await getOAuthClient(ticket.clientId);
  if (!client || !isRegisteredRedirect(client, ticket.redirectUri)) {
    throw new HttpError(400, "Unknown client");
  }
  return c.json({
    clientName: ticket.clientName,
    redirectUri: ticket.redirectUri,
    redirectHost: redirectHost(ticket.redirectUri),
    loopback: isLoopbackRedirect(ticket.redirectUri),
    scope: ticket.scope,
  });
});

oauthRoutes.post("/oauth/authorize", async (c) => {
  if (!isAppBrowserPost(c.req.raw.headers)) {
    throw new HttpError(403, "Forbidden");
  }
  const fields = await readFields(c.req.raw);
  const ticket = readAuthorizeTicket(fields.request);
  if (!ticket) return c.redirect(consentErrorUrl("invalid_request"));

  const session = await getSessionFromHeaders(c.req.raw.headers);
  if (!session) {
    const next = `/oauth/consent?request=${encodeURIComponent(fields.request)}`;
    return c.redirect(`${mcpIssuer()}/login?next=${encodeURIComponent(next)}`);
  }

  const deny = () =>
    c.redirect(
      withOAuthQuery(ticket.redirectUri, {
        error: "access_denied",
        state: ticket.state,
      })
    );
  if (fields.decision !== "allow") return deny();

  const client = await getOAuthClient(ticket.clientId);
  if (!client || !isRegisteredRedirect(client, ticket.redirectUri)) {
    return c.redirect(consentErrorUrl("invalid_request"));
  }
  if (!resourceMatches(ticket.resource)) {
    return deny();
  }

  const code = await createAuthorizationCode({
    userId: session.user.id,
    clientId: ticket.clientId,
    redirectUri: ticket.redirectUri,
    codeChallenge: ticket.codeChallenge,
    scope: ticket.scope,
    resource: ticket.resource,
  });
  return c.redirect(
    withOAuthQuery(ticket.redirectUri, { code, state: ticket.state })
  );
});

oauthRoutes.post("/oauth/token", async (c) => {
  const fields = await readFields(c.req.raw);
  const clientId = fields.client_id?.trim();
  const client = await getOAuthClient(clientId);
  if (!client) {
    return oauthError(401, "invalid_client", "Unknown client");
  }

  if (fields.grant_type === "authorization_code") {
    if (!fields.code || !fields.redirect_uri || !fields.code_verifier) {
      return oauthError(
        400,
        "invalid_request",
        "code, redirect_uri, and code_verifier are required"
      );
    }
    const issued = await exchangeAuthorizationCode({
      code: fields.code,
      clientId: client.id,
      redirectUri: fields.redirect_uri,
      codeVerifier: fields.code_verifier,
      resource: fields.resource,
    });
    return tokenResult(issued);
  }

  if (fields.grant_type === "refresh_token") {
    if (!fields.refresh_token) {
      return oauthError(400, "invalid_request", "refresh_token is required");
    }
    const issued = await rotateRefreshToken({
      refreshToken: fields.refresh_token,
      clientId: client.id,
      resource: fields.resource,
    });
    return tokenResult(issued);
  }

  return oauthError(400, "unsupported_grant_type", "Unsupported grant type");
});

oauthRoutes.post("/oauth/register", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== "object") {
    return oauthError(400, "invalid_client_metadata", "JSON body required");
  }
  try {
    const client = await registerOAuthClient({
      name: body.client_name,
      redirectUris: body.redirect_uris,
    });
    return corsJson(
      {
        client_id: client.id,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return oauthError(error.status, "invalid_redirect_uri", error.message);
    }
    throw error;
  }
});

function consentErrorUrl(error: string): string {
  return `${mcpIssuer()}/oauth/consent?error=${encodeURIComponent(error)}`;
}

function isAppBrowserPost(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true;
  return origin.replace(/\/$/, "") === mcpIssuer();
}

async function readFields(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return {};
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (typeof value === "string") fields[key] = value;
    }
    return fields;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

function tokenResult(
  issued: IssuedTokens | { error: string; description: string }
): Response {
  if ("access_token" in issued) {
    return corsJson({
      access_token: issued.access_token,
      token_type: issued.token_type,
      expires_in: issued.expires_in,
      refresh_token: issued.refresh_token,
      scope: issued.scope,
    });
  }
  return oauthError(400, issued.error, issued.description);
}

function oauthError(status: number, error: string, description: string): Response {
  return corsJson({ error, error_description: description }, status);
}

function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...OAUTH_CORS_HEADERS,
    },
  });
}
