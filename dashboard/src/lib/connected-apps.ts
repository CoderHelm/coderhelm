// Apps people connect to Coderhelm's MCP server (Claude, Cursor, VS Code and
// other MCP clients): the consent page an app sends someone to, and the list
// of apps connected in Settings. The gateway keeps the rules
// (services/gateway/src/mcp_oauth.rs); every call an app makes runs as the
// person who connected it, with their role.

import { apiBase } from "./runtime-config";

/** Where the docs explain adding Coderhelm to an app. */
export const MCP_DOCS_URL = "https://docs.coderhelm.com/mcp";

export interface ConsentScope {
  key: string;
  label: string;
  /** The app asked for it. */
  requested: boolean;
  /** Always given: reading. */
  always: boolean;
}

export interface ConsentRequest {
  client_id: string;
  /** The name the app gave itself. Coderhelm can't check it. */
  client_name: string;
  client_uri: string | null;
  /** Where the browser goes back to after the answer. */
  redirect_host: string;
  registered_at: string;
  scopes: ConsentScope[];
  email: string;
  team_id: string;
  /** The person's role can start runs or ask for reviews. */
  can_act: boolean;
  mcp_url: string;
}

export interface Connection {
  id: string;
  client_name: string;
  redirect_host: string;
  scopes: string[];
  email: string;
  /** Connected by the person looking. */
  mine: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  status: "active" | "expired" | "revoked";
}

export interface ConnectionList {
  connections: Connection[];
  /** The person sees everyone's connections (they manage API keys). */
  team_wide: boolean;
  mcp_url: string;
  scopes: { key: string; label: string }[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const msg = typeof body.error === "string" && body.error ? body.error : `The request failed (${res.status}).`;
    throw new Error(msg);
  }
  return body as T;
}

export const connectedAppsApi = {
  describe: (requestToken: string) =>
    request<ConsentRequest>("/api/mcp/authorize/describe", { method: "POST", body: JSON.stringify({ request: requestToken }) }),
  decide: (requestToken: string, approve: boolean, allowWrite: boolean, allowKnowledge = false) =>
    request<{ redirect_to: string }>("/api/mcp/authorize", {
      method: "POST",
      body: JSON.stringify({ request: requestToken, approve, allow_write: allowWrite, allow_knowledge: allowKnowledge }),
    }),
  list: () => request<ConnectionList>("/api/mcp/connections"),
  revoke: (id: string) => request<{ status: string; id: string }>(`/api/mcp/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/** The scope that lets an app act (start runs, ask for reviews). */
export const WRITE_SCOPE = "runs:write";
/** The scope that lets an app search the knowledge bases the person can read in Chat. */
export const KNOWLEDGE_SCOPE = "knowledge:read";

// ── Coming back to the consent page after signing in ────────────────
//
// Someone sent to the consent page while signed out signs in first. A
// password sign-in happens on the page itself; Google and GitHub sign-in come
// back to the dashboard's start page, so the consent link is kept for this tab
// and the shell goes back to it once signed in.

const RETURN_KEY = "ch_consent_return";
const CONSENT_PATH = "/authorize/";

/** A consent page query (`?request=<signed request>`), nothing else. */
function isConsentQuery(q: string): boolean {
  return /^\?request=[A-Za-z0-9._~%-]{20,4000}$/.test(q);
}

/** Keep the consent link while someone signs in. */
export function rememberConsentReturn(loc: Pick<Location, "pathname" | "search">): void {
  if (!loc.pathname.replace(/\/+$/, "").endsWith("/authorize") || !isConsentQuery(loc.search)) return;
  try {
    sessionStorage.setItem(RETURN_KEY, loc.search);
  } catch {
    // No storage: a Google or GitHub sign-in lands on the start page, and the app asks again.
  }
}

/** Where to go back to once signed in, if a consent link was kept. Read once. */
export function takeConsentReturn(loc: Pick<Location, "pathname">): string | null {
  let kept: string | null = null;
  try {
    kept = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    return null;
  }
  if (!kept || !isConsentQuery(kept)) return null;
  // Already there.
  if (loc.pathname.replace(/\/+$/, "").endsWith("/authorize")) return null;
  return `${CONSENT_PATH}${kept}`;
}
