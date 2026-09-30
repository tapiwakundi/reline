import type { NextConfig } from "next";

function apiInternalUrl() {
  const raw = process.env.API_INTERNAL_URL ?? "http://localhost:4001";
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
