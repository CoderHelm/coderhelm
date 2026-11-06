// What a link to a dashboard page shows when it is pasted into Teams, Slack,
// iMessage, LinkedIn, X or an email: the page's name, one line on what it is
// and a picture with the section's name. All of it comes from lib/routes.ts.
//
// The tags are in each page's static HTML (components/route-head.tsx), so an
// unfurler reads them without signing in and without running any script. That
// HTML is public to anyone with the link, so a preview only ever describes the
// page: never a team, a run, a ticket or anything else from the API.
//
// Absolute URLs. Open Graph needs the image as an absolute URL, and the same
// build serves the hosted dashboard and every self-hosted install, each on
// its own domain (which, for an install on CloudFront's own address, is only
// known after its first deploy). So the build writes one origin:
//
//   NEXT_PUBLIC_DASHBOARD_URL, when set (the hosted deploy sets it);
//   otherwise PLACEHOLDER_ORIGIN, a reserved `.invalid` name.
//
// A self-hosted install's web stack swaps the placeholder for the install's
// own address when it uploads the pages (coderhelm-platform,
// infra/lib/web-stack.ts), so every preview points at the install itself and
// nothing in it ever names the hosted service. A build left with the
// placeholder previews without a picture rather than loading one from
// somewhere else.

import { ROUTES, routeFor, type RouteInfo } from "./routes";

/** The origin a build without NEXT_PUBLIC_DASHBOARD_URL writes; replaced at upload. */
export const PLACEHOLDER_ORIGIN = "https://coderhelm-install.invalid";

export const SITE_NAME = "Coderhelm";

/** The dashboard's background (zinc-950): the browser's bar on a phone. */
export const THEME_COLOR = "#09090b";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const FALLBACK_DESCRIPTION = "Coderhelm turns tickets and issues into reviewed pull requests, then keeps watching the code after the merge.";

/** The origin every absolute URL in a preview starts with, without a trailing slash. */
export function previewOrigin(): string {
  const set = (process.env.NEXT_PUBLIC_DASHBOARD_URL || "").trim().replace(/\/+$/, "");
  if (set) return set;
  // In the browser the page knows where it is: the same address the upload
  // wrote into its HTML, so React finds the tags it hydrates unchanged.
  if (typeof window !== "undefined") return window.location.origin;
  return PLACEHOLDER_ORIGIN;
}

/** The top-level page a route sits under ("/settings/team" is under "/settings"). */
function sectionOf(path: string): string {
  const seen = new Set<string>();
  let at = path;
  while (ROUTES[at]?.parent && !seen.has(at)) {
    seen.add(at);
    at = ROUTES[at].parent!;
  }
  return at;
}

/** "/" is Runs; "/data-sources" is "data-sources". */
function slugOf(section: string): string {
  return section === "/" ? "runs" : section.replace(/^\/+/, "").replace(/\//g, "-");
}

export interface ImageSection {
  /** The file under /og/, without ".png". */
  slug: string;
  /** The section's name, written on the picture. */
  name: string;
  /** The section's own one line, written under the name. */
  description: string;
}

/** Every picture the build makes: one per top-level page. */
export function imageSections(): ImageSection[] {
  const out = new Map<string, ImageSection>();
  for (const path of Object.keys(ROUTES)) {
    const section = sectionOf(path);
    const slug = slugOf(section);
    if (out.has(slug)) continue;
    const info = ROUTES[section];
    out.set(slug, { slug, name: info.tab ?? info.label, description: info.description });
  }
  return [...out.values()];
}

export interface LinkPreview {
  /** "Releases · Coderhelm": the tab title and the preview's title. */
  title: string;
  description: string;
  /** This page's absolute address (no query: a run's id stays out of it). */
  url: string;
  image: string;
  imageAlt: string;
}

function titleOf(info: RouteInfo | undefined): string {
  const name = info ? info.tab ?? info.label : "";
  return name ? `${name} · ${SITE_NAME}` : SITE_NAME;
}

/** The preview for a page, from its path alone. */
export function linkPreview(pathname: string | null | undefined): LinkPreview {
  const origin = previewOrigin();
  const found = routeFor(pathname);
  // An address no page answers (the 404 page) previews as the dashboard.
  const path = found ? found.path : "/";
  const section = found ? sectionOf(found.path) : "/";
  const sectionInfo = ROUTES[section];
  return {
    title: titleOf(found?.info),
    description: found?.info.description ?? FALLBACK_DESCRIPTION,
    url: `${origin}${path === "/" ? "/" : `${path}/`}`,
    image: `${origin}/og/${slugOf(section)}.png`,
    imageAlt: `${SITE_NAME}: ${sectionInfo.tab ?? sectionInfo.label}`,
  };
}
