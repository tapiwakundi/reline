import { Hono } from "hono";
import { proxyPostHogRequest } from "@/lib/posthog-proxy";

export const posthogProxyRoutes = new Hono();

async function forward(request: Request) {
  return proxyPostHogRequest(request);
}

posthogProxyRoutes.all("/rline", (c) => forward(c.req.raw));
posthogProxyRoutes.all("/rline/*", (c) => forward(c.req.raw));
