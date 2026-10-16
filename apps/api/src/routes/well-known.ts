import { Hono } from "hono";
import { OAUTH_CORS_HEADERS, oauthCorsPreflight } from "@/lib/oauth/cors";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from "@/lib/oauth/urls";

export const wellKnownRoutes = new Hono();

function metadata(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=60",
      ...OAUTH_CORS_HEADERS,
    },
  });
}

wellKnownRoutes.options("/.well-known/oauth-protected-resource", () =>
  oauthCorsPreflight()
);
wellKnownRoutes.options("/.well-known/oauth-protected-resource/api/mcp", () =>
  oauthCorsPreflight()
);
wellKnownRoutes.options("/.well-known/oauth-protected-resource/*", () =>
  oauthCorsPreflight()
);
wellKnownRoutes.options("/.well-known/oauth-authorization-server", () =>
  oauthCorsPreflight()
);
wellKnownRoutes.options("/.well-known/openid-configuration", () =>
  oauthCorsPreflight()
);

wellKnownRoutes.get("/.well-known/oauth-protected-resource", () =>
  metadata(protectedResourceMetadata())
);
wellKnownRoutes.get("/.well-known/oauth-protected-resource/api/mcp", () =>
  metadata(protectedResourceMetadata())
);
wellKnownRoutes.get("/.well-known/oauth-protected-resource/*", () =>
  metadata(protectedResourceMetadata())
);
wellKnownRoutes.get("/.well-known/oauth-authorization-server", () =>
  metadata(authorizationServerMetadata())
);
wellKnownRoutes.get("/.well-known/openid-configuration", () =>
  metadata(authorizationServerMetadata())
);
