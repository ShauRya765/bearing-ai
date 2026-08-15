import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, absoluteUrl } from "@/lib/site";
import { ruleset_2026_08 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-08";

// lastModified tracks the newest draw in the ruleset, not the build time. Every
// page here is a view onto the same rules, so a rebuild that changed nothing
// shouldn't claim the content is new — that is how a sitemap trains crawlers to
// stop trusting its dates. Max rather than [0] so this holds even if recentDraws
// is ever reordered.
const lastModified = new Date(
  Math.max(...ruleset.recentDraws.map((d) => Date.parse(d.date))),
);

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
