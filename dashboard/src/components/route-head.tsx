"use client";

import { usePathname } from "next/navigation";
import { linkPreview, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_NAME } from "@/lib/link-preview";

/**
 * The page's description and link preview tags (lib/link-preview.ts). The
 * shell renders this on every screen, the loading one included, so the tags
 * are in each page's static HTML before any sign-in check or redirect runs.
 * React hoists them into <head>. The tab title stays with the shell, which
 * changes it for the sign-in screens.
 */
export function RouteHead() {
  const p = linkPreview(usePathname());
  return (
    <>
      <meta name="description" content={p.description} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={p.title} />
      <meta property="og:description" content={p.description} />
      <meta property="og:url" content={p.url} />
      <meta property="og:image" content={p.image} />
      <meta property="og:image:secure_url" content={p.image} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
      <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
      <meta property="og:image:alt" content={p.imageAlt} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={p.title} />
      <meta name="twitter:description" content={p.description} />
      <meta name="twitter:image" content={p.image} />
      <meta name="twitter:image:alt" content={p.imageAlt} />
    </>
  );
}
