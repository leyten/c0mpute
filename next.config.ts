import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the build root to this dir — a stray package-lock.json at the workspace
  // root made Turbopack treat the whole workspace as root and scan every sibling
  // project, stalling the build.
  turbopack: {
    root: path.join(__dirname),
  },
  // Enable proper headers for WebLLM model files
  async headers() {
    return [
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.wasm',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
        ],
      },
    ];
  },
  // Ensure large files can be served
  experimental: {
    largePageDataBytes: 128 * 1024 * 1024, // 128MB
  },
};

export default nextConfig;
