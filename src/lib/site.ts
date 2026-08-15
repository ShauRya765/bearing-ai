// One source for everything that has to agree across metadata, canonicals, the
// sitemap and the OG image. Duplicating the site URL across those four is how
// canonicals and sitemap entries drift apart and stop being believed.

// The production domain is not chosen yet, so the origin is resolved rather
// than hardcoded:
//   1. NEXT_PUBLIC_SITE_URL — set this to the real origin (no trailing slash)
//      once the domain exists. It is read at build time, not request time.
//   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production hostname, so
//      a deploy before the domain is chosen still emits its own absolute URLs
//      instead of localhost.
//   3. localhost, so dev and tests run.
function resolveSiteUrl(): { url: string; isCanonical: boolean } {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return { url: explicit.replace(/\/$/, ""), isCanonical: true };

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return { url: `https://${vercel}`, isCanonical: false };

  return { url: "http://localhost:3000", isCanonical: false };
}

const resolved = resolveSiteUrl();

export const SITE_URL = resolved.url;

// Whether this build knows its real public origin. Until it does, every page is
// marked noindex and robots.txt disallows everything — an indexed preview or
// localhost canonical is far more expensive to undo than to prevent, since the
// wrong host can outrank the real one and needs a migration to unpick.
// Setting NEXT_PUBLIC_SITE_URL is what switches indexing on.
export const IS_INDEXABLE = resolved.isCanonical;

export const SITE_NAME = "True Bearing";

export const SITE_DESCRIPTION =
  "A Canadian Express Entry CRS calculator that computes every point from IRCC's published tables, cites its sources, and never benchmarks you against a draw you aren't eligible for.";

// The routes that should be indexed. API routes are excluded deliberately —
// they return JSON and have nothing to rank.
export const PUBLIC_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/assessment", changeFrequency: "weekly", priority: 0.9 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.7 },
  { path: "/rules", changeFrequency: "weekly", priority: 0.7 },
  // Changes only when a new eval run is committed, which is a deliberate act.
  { path: "/eval", changeFrequency: "monthly", priority: 0.5 },
] as const;

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
