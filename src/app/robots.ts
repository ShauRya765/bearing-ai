import type { MetadataRoute } from "next";
import { IS_INDEXABLE, absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // No production domain configured yet — keep the whole deploy out of the
  // index rather than let a preview host rank. See IS_INDEXABLE in lib/site.
  if (!IS_INDEXABLE) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /api/* returns JSON and costs a Gemini call per /api/ask hit. Nothing
      // to index, and no reason to let a crawler spend the quota.
      disallow: "/api/",
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
