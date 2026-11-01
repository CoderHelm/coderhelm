// Analytics for the hosted docs, kept apart from the page so it can be tested
// without a browser (scripts/analytics.test.mjs runs this file with Node's
// type stripping: erasable TypeScript only, no imports).
//
// What is sent: anonymous page views (origin and path only) and a few named
// events with fixed, non-identifying fields. Never a query string or
// fragment (the install guide keeps progress ids there), never anything
// typed into a page, never an email, name, region or install name.
//
// Google's tag can add its own automatic events (outbound clicks with the
// full link, form submissions, site search, history page views), set in
// Google Analytics rather than here. So every hit the tag sends passes
// through scrubHit() on its way out: URLs lose their query and fragment,
// search terms, form fields and anything that looks like an email are
// dropped, and page views this code did not send are dropped too.

/** The coderhelm.com property, so the site, the docs and the install guide are one funnel. */
export const GA_ID = 'G-T14Q1LDRC0';

/** The only hostname analytics runs on: never localhost, previews or self-hosted builds of the docs. */
export const ANALYTICS_HOST = 'docs.coderhelm.com';

/** Domains whose links carry the visitor across (coderhelm.com and the docs are one session). */
export const LINKER_DOMAINS = ['coderhelm.com', 'docs.coderhelm.com'];

/** Marks the page views this code sends, so the tag's own history page views can be told apart. */
export const PAGE_VIEW_MARK = 'ch_pv';

/** The hosts Google's tag sends to and loads from (the docs CSP allows exactly these). */
export const GA_HOSTS = ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'];

export function shouldLoad(hostname: string): boolean {
  return hostname === ANALYTICS_HOST;
}

/** An AWS region name (eu-west-1, us-gov-west-1, ap-southeast-2). */
const REGION = /\b(?:us|eu|ap|sa|ca|me|af|il|mx)(?:-gov|-iso[a-z]?)?-(?:north|south|east|west|central|northeast|southeast|northwest|southwest)-\d\b/gi;

/** Region names taken out: the AWS console's host names the region the reader picked. */
export function dropRegions(s: string): string {
  return s.replace(new RegExp(`${REGION.source}\\.`, 'gi'), '').replace(REGION, '');
}

/** Origin and path only, with no AWS region in it. Anything that is not an http(s) URL gives null. */
export function cleanUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return dropRegions(`${url.origin}${url.pathname}`);
  } catch {
    return null;
  }
}

/** True for a URL Google's tag sends hits to. */
export function isCollectUrl(u: string): boolean {
  try {
    const url = new URL(u);
    const host = url.hostname;
    const ga = host === 'google-analytics.com' || host.endsWith('.google-analytics.com') || host === 'analytics.google.com' || host.endsWith('.analytics.google.com') || host === 'www.googletagmanager.com';
    return ga && /\/collect$/.test(url.pathname);
  } catch {
    return false;
  }
}

const EMAIL = /[^\s@/?#&=]+@[^\s@/?#&=]+\.[a-z]{2,}/i;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;
/** Event fields never sent, whatever their value. */
const DROP = /^(ep|epn)\.(search_term|form_id|form_name|form_destination|form_length|form_submit_text|link_text|link_id|link_classes|file_name|video_url|video_title)$/;

/**
 * One hit's fields (a query string, or one line of a batched body) with
 * URLs reduced to origin and path, and forbidden fields dropped. Returns
 * null for a page view this code did not send (Google's own history page
 * views would count the install guide again on every address bar change).
 */
export function scrubParams(qs: string, opts: { requireMark?: boolean } = {}): string | null {
  const params = new URLSearchParams(qs);
  const out = new URLSearchParams();
  let ours = false;
  for (const [k, v] of params) {
    if (k === `ep.${PAGE_VIEW_MARK}` || k === `epn.${PAGE_VIEW_MARK}`) {
      ours = true;
      continue;
    }
    if (DROP.test(k)) continue;
    if (URL_LIKE.test(v)) {
      const clean = cleanUrl(v);
      if (clean) out.append(k, clean);
      continue;
    }
    if (EMAIL.test(v)) continue;
    out.append(k, dropRegions(v));
  }
  if (opts.requireMark && out.get('en') === 'page_view' && !ours) return null;
  return out.toString();
}

/**
 * A whole hit: the URL's query and each line of the body. The URL carries
 * the shared fields (dl, dr, dt) and, for a single event, the event itself.
 * A null body line is a page view to drop; if every event is dropped the
 * hit is not sent (null).
 */
export function scrubHit(url: string, body: string | null | undefined): { url: string; body: string | null } | null {
  const u = new URL(url);
  const lines = body ? body.split('\n').filter((l) => l.length > 0) : [];
  const head = scrubParams(u.search.slice(1), { requireMark: lines.length === 0 });
  if (head === null) return null;
  u.search = head;
  if (!lines.length) return { url: u.toString(), body: body ?? null };
  const kept = lines.map((l) => scrubParams(l, { requireMark: true })).filter((l): l is string => l !== null);
  if (!kept.length) return null;
  return { url: u.toString(), body: kept.join('\n') };
}

/** Where a link goes, as a host only, when it leaves this site; null otherwise. */
export function outboundHost(href: string, here: string): string | null {
  try {
    const url = new URL(href, here);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.host === new URL(here).host ? null : dropRegions(url.host);
  } catch {
    return null;
  }
}

export type DocsEvent =
  | { name: 'docs_search' }
  | { name: 'copy_markdown' }
  | { name: 'copy_code' }
  | { name: 'outbound_click'; link_domain: string }
  | { name: 'install_step'; step: string };

/** What a click on this element means, from the button's own words; null for most clicks. */
export function clickEvent(text: string | null | undefined): DocsEvent | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (/^Cop(y|ied) Markdown$/.test(t)) return { name: 'copy_markdown' };
  if (/^Cop(y|ied) Text$/.test(t)) return { name: 'copy_code' };
  return null;
}

/** The install guide's step names (lib/install/core.ts StepId); anything else is not sent. */
const STEP_NAMES = new Set(['start', 'aws', 'data', 'domain', 'address', 'github', 'models', 'jira', 'ready']);
export function installStepEvent(step: string): DocsEvent | null {
  return STEP_NAMES.has(step) ? { name: 'install_step', step } : null;
}

/**
 * What the install guide says it talks to, kept beside the code that makes
 * it true (e2e/analytics.spec.ts holds the page to it). The hybrid line adds
 * CoderHelm's name check, so it cannot say nothing typed leaves the page.
 */
export const GUIDE_TRUST = {
  private:
    'This page talks to AWS, GitHub and your own CoderHelm, and counts anonymous page views with Google Analytics. Nothing you type and nothing about your install is sent to CoderHelm or Google.',
  hybrid:
    "This page talks to AWS, GitHub, your own CoderHelm and CoderHelm's API (to check a name is free), and counts anonymous page views with Google Analytics. Your install, not this page, registers with CoderHelm.",
};
