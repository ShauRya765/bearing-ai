import type { NextConfig } from "next";

// Baseline security headers applied to every response. A strict
// Content-Security-Policy is intentionally left for a follow-up — it needs
// per-route nonces to coexist with Next's inline runtime — so these cover the
// high-value, low-risk protections for phase 1.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the workspace root — a stray lockfile in a parent directory otherwise
  // makes Next infer the wrong root and warn on every build.
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
