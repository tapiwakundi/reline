import type { NextConfig } from "next";

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
  async rewrites() {
    const api = apiInternalUrl();
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
