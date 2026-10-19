import type { MetadataRoute } from "next";
import { SITE, pages } from "@/content/site";

export const dynamic = "force-static";

// Pages only. Each page links its Markdown twin with rel="alternate", and
// /llms.txt lists the twins for agents.
export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((p) => ({
    url: `${SITE.url}${p.path}`,
    lastModified: SITE.updated,
    changeFrequency: p.kind === "legal" ? "yearly" : "monthly",
    priority: p.slug === "" ? 1 : p.kind === "legal" ? 0.3 : 0.8,
  }));
}
