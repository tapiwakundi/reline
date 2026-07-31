import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating Next.js route indicator in development.
  devIndicators: false,
  experimental: {
    // Attachment proxy can receive images/videos up to the video limit.
    serverActions: {
      bodySizeLimit: "110mb",
    },
    proxyClientMaxBodySize: "110mb",
    // Keep dynamic RSC payloads briefly so tab switches feel instant.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
