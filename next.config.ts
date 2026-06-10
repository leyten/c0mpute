import type { NextConfig } from "next";
import path from "path";

// Content Security Policy for Privy production mode.
// Goal: protect the embedded-wallet iframe + block clickjacking (Privy's prod
// requirement) without breaking the app. The security-critical directives are
// tight (frame-src/child-src locked to Privy, frame-ancestors none, object-src
// none, base-uri/form-action self). script/style allow 'unsafe-inline' because
// Next.js App Router injects inline hydration scripts and React inline styles,
// and 'unsafe-eval'/blob: + worker-src blob: because the /worker page runs
// WebLLM (WASM compile + blob web-worker). connect-src/img-src are left
// permissive (https:/wss:) on purpose — the Privy/Reown wallet SDK reaches many
// origins (modal fonts, onramp, chain explorers/RPCs) and a tight allowlist
// there is breakage-prone for zero wallet-iframe-protection benefit.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://use.typekit.net https://p.typekit.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://use.typekit.net https://p.typekit.net https://fonts.reown.com",
  "worker-src 'self' blob:",
  "child-src 'self' blob: https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-src 'self' https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
  "connect-src 'self' https: wss:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Pin the build root to this dir — a stray package-lock.json at the workspace
  // root made Turbopack treat the whole workspace as root and scan every sibling
  // project, stalling the build.
  turbopack: {
    root: path.join(__dirname),
  },
  // 2026-06-10 route renames: /user -> /chat, /worker -> /earn. Old URLs live
  // in docs, the worker README, and open browser-worker tabs — keep them working.
  async redirects() {
    return [
      { source: '/user', destination: '/chat', permanent: true },
      { source: '/worker', destination: '/earn', permanent: true },
    ];
  },
  // Polyfill Buffer for client-side @solana/web3.js (on-chain staking UI).
  // Only affects the webpack build; turbopack ignores this callback.
  webpack: (config, { webpack }) => {
    config.resolve.fallback = { ...config.resolve.fallback, buffer: require.resolve("buffer/") };
    config.plugins.push(new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] }));
    return config;
  },
  // Enable proper headers for WebLLM model files
  async headers() {
    return [
      {
        // Global security headers (Privy production mode: CSP + anti-clickjacking)
        source: '/:path*',
        headers: securityHeaders,
      },
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
