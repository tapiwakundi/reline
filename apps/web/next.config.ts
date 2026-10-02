import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";
import { normalizePostHogHost, posthogRewrites } from "./src/lib/posthog-config";

function apiInternalUrl() {
  const raw = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4001";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }
  return `http://${raw}`;
}

const nextConfig: NextConfig = {
  // Hide the floating Next.js route indicator in development.
  devIndicators: false,
  transpilePackages: ["@reline/shared"],
  experimental: {
    proxyClientMaxBodySize: "110mb",
    // Firefox reports transferSize 0 while a dev response is still streaming.
    // Next's debug channel treats that as a cache hit and calls location.reload()
    // forever on slow pages (the board). Chrome is unaffected.
    reactDebugChannel: false,
    // Keep dynamic RSC payloads briefly so tab switches feel instant.
    staleTimes: {
      dynamic: 30,
    },
  },
  // PostHog's ingest API uses trailing slashes. Redirecting them strips the slash
  // and drops the event.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const api = apiInternalUrl();
    const ingest = normalizePostHogHost(process.env.NEXT_PUBLIC_POSTHOG_HOST);
    return [
      ...posthogRewrites(ingest),
      { source: "/api/:path*", destination: `${api}/api/:path*` },
    ];
  },
};

const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const envId = process.env.POSTHOG_ENV_ID;

export default personalApiKey && envId
  ? withPostHogConfig(nextConfig, {
      personalApiKey,
      envId,
      host: normalizePostHogHost(process.env.NEXT_PUBLIC_POSTHOG_HOST),
      sourcemaps: {
        enabled: true,
        project: "reline",
        deleteAfterUpload: true,
      },
    })
  : nextConfig;
