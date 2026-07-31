import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Attachment proxy can receive images/videos up to the video limit.
    serverActions: {
      bodySizeLimit: "110mb",
    },
    proxyClientMaxBodySize: "110mb",
  },
};

export default nextConfig;
