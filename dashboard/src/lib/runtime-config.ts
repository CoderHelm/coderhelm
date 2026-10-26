/**
 * Where this dashboard's API is, read when the page runs rather than when it
 * is built, so one build serves any deployment.
 *
 * A self-hosted deployment serves `/runtime-config.js` next to the pages
 * (written by the platform's web stack). It sets `window.__CODERHELM_CONFIG__`
 * before the app starts; there the API is on the same hostname, so `apiUrl`
 * is "" and calls go to `/api/...`. The hosted build ships an empty config
 * (public/runtime-config.js) and uses NEXT_PUBLIC_API_URL, then the hosted
 * defaults.
 */

export interface RuntimeConfig {
  /** The API's base URL; "" for the dashboard's own hostname. */
  apiUrl?: string;
  /** The chat stream's base URL; "" for the dashboard's own hostname. */
  streamUrl?: string;
  /** A self-hosted deployment (no hosted terms, site links or support). */
  selfHosted?: boolean;
  /** Where security and support questions go. */
  supportEmail?: string;
  /** A website to link to, or null. */
  siteUrl?: string | null;
  /** This install's release, commit and release date (self-hosted). */
  version?: string | null;
  commit?: string | null;
  releasedAt?: string | null;
}

declare global {
  interface Window {
    __CODERHELM_CONFIG__?: RuntimeConfig;
  }
}

const HOSTED_API = "https://api.coderhelm.com";
const HOSTED_STREAM = "https://stream.coderhelm.com";
const HOSTED_SITE = "https://coderhelm.com";
const HOSTED_SECURITY_EMAIL = "security@coderhelm.com";

export function runtimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") return {};
  return window.__CODERHELM_CONFIG__ ?? {};
}

const trim = (u: string) => u.replace(/\/+$/, "");

/** The API base for fetch calls ("" means this hostname). */
export function apiBase(): string {
  const c = runtimeConfig();
  if (typeof c.apiUrl === "string") return trim(c.apiUrl);
  return trim(process.env.NEXT_PUBLIC_API_URL || HOSTED_API);
}

/** The chat stream base ("" means this hostname). */
export function streamBase(): string {
  const c = runtimeConfig();
  if (typeof c.streamUrl === "string") return trim(c.streamUrl);
  return trim(process.env.NEXT_PUBLIC_STREAM_URL || HOSTED_STREAM);
}

/** The API's full URL, for addresses people copy (webhooks, curl lines). */
export function apiOrigin(): string {
  const base = apiBase();
  if (base) return base;
  return typeof window === "undefined" ? "" : window.location.origin;
}

/**
 * This deployment's GitHub App on GitHub: the gateway redirects to its own
 * app (a self-hosted install's app, not the hosted one). `state` starts a new
 * installation; `installationId` opens that installation's settings.
 */
export function githubAppUrl(opts: { state?: string; installationId?: number | string } = {}): string {
  const q = new URLSearchParams();
  if (opts.state) q.set("state", opts.state);
  if (opts.installationId !== undefined && opts.installationId !== "") q.set("installation_id", String(opts.installationId));
  const qs = q.toString();
  return `${apiOrigin()}/auth/github/app${qs ? `?${qs}` : ""}`;
}

export function isSelfHosted(): boolean {
  return runtimeConfig().selfHosted === true;
}

/** The website for terms and privacy links; null when there is none. */
export function siteUrl(): string | null {
  const c = runtimeConfig();
  if (c.selfHosted) return c.siteUrl ? trim(c.siteUrl) : null;
  return HOSTED_SITE;
}

/** Where security questions go. */
export function securityEmail(): string {
  return runtimeConfig().supportEmail || HOSTED_SECURITY_EMAIL;
}
