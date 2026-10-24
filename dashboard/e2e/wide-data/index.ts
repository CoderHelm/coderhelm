import type { Page, Route } from "@playwright/test";
import { EMAIL, LONG_URL, ORG, TOKEN } from "./long";
import { runsData } from "./runs";
import { reviewData } from "./review";
import { settingsData } from "./settings";
import { logsData } from "./logs";
import { pluginsData } from "./plugins";

// An invented backend whose records are full of long, unbroken strings
// (long.ts), for the no-sideways-scroll spec. Each file answers one part of
// the API; a GET nobody answers is recorded so the spec can fail and name it,
// which is how a new page's data gets added here.

export interface Req {
  method: string;
  path: string;
  url: URL;
}

/** Answers a request with a JSON body, or returns undefined to pass it on. */
export type Handler = (req: Req) => unknown | undefined;

const base: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/me") return { user_id: "u_self", team_id: "t_1", github_login: "dana-developer-with-a-long-login", email: EMAIL, avatar_url: "", role: "owner", mfa_enabled: false, platform_admin: true };
  // All three limits set, so the sidebar draws its three bars.
  if (path === "/api/usage") {
    return {
      month: "2026-01", total_tokens: 61_200_000, tokens_in: 700_000, tokens_out: 500_000, cache_read_tokens: 52_000_000, cache_write_tokens: 8_000_000,
      new_tokens: 1_200_000, total_runs: 4, max_tokens: 0, limits_legacy: false,
      limits: [
        { kind: "new_tokens", max: 10_000_000, used: 1_200_000 },
        { kind: "cache_read", max: 60_000_000, used: 52_000_000 },
        { kind: "cache_write", max: 8_000_000, used: 8_000_000 },
      ],
    };
  }
  if (path === "/api/settings/budget") return { max_new_tokens: 10_000_000, max_cache_read_tokens: 60_000_000, max_cache_write_tokens: 8_000_000, legacy: false, max_tokens: 0, limit_counts_cache: false };
  // A shell banner on every page, with an unbroken token and a long link.
  if (path === "/api/banners") return { banners: [{ id: "b_wide", type: "warning", dismissible: true, message: `Scheduled maintenance for ${TOKEN}`, link_text: LONG_URL, link_url: LONG_URL }] };
  if (path === "/api/teams") return { teams: [{ team_id: "t_1", org: ORG, status: "active", current: true }] };
  return undefined;
};

const HANDLERS: Handler[] = [base, runsData, reviewData, settingsData, logsData, pluginsData];

/** Mocks the whole API. Returns the list of GETs no handler answered. */
export async function mockWideApi(page: Page): Promise<{ unanswered: string[] }> {
  const unanswered: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const req: Req = { method: route.request().method(), path: url.pathname, url };
    for (const h of HANDLERS) {
      const body = h(req);
      if (body !== undefined) return json(route, body);
    }
    if (req.method === "GET") unanswered.push(`${req.path}${url.search}`);
    return json(route, { error: `Not mocked: ${req.method} ${req.path}` }, 404);
  });
  return { unanswered };
}
