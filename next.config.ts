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
  // A dev server can then run beside the built preview without clobbering the
  // build it is serving: NEXT_DIST_DIR=.next-dev next dev -p 3011
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
  // /roadmap is a self-contained static page (panzoom board) served from
  // public/roadmap-clone/, kept outside the React app so it can be iterated
  // on as plain HTML/CSS/JS.
  async rewrites() {
    return [
      { source: '/roadmap', destination: '/roadmap-clone/index.html' },
      // /network embeds the shard map (public/network-map/), which polls its
      // feed as a relative network.json. Proxy it same-origin to the live feed.
      { source: '/network-map/network.json', destination: 'https://shard.compute.tech/network.json' },
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
        // The live map is a static page with no auth or wallet surface, framed by
        // /network. Same-origin framing only; the last match wins per key.
        source: '/network-map/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
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
