// The API keys page: the team's keys for calling the Coderhelm API from its
// own programs. The gateway keeps only a hash of each key; the key itself is
// in the create answer and nowhere else.

import { apiBase, apiOrigin } from "./runtime-config";

/** Where the public API is documented. */
export const API_DOCS_URL = "https://docs.coderhelm.com/api";

export interface ApiKey {
  id: string;
  name: string;
  /** The start and end of the key, to tell keys apart. */
  hint: string;
  scopes: string[];
  rate_limit_per_minute: number;
  created_at: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  status: "active" | "expired" | "revoked";
  /**
   * Set while two-factor sign-in is required, on a live key made before the
   * rule: a key never signs in, so the rule doesn't hold it back.
   */
  two_factor_review?: KeyTwoFactorReview;
}

export interface KeyTwoFactorReview {
  made_before_rule: boolean;
  /** Whether the person who made it is still on the team. */
  maker_on_team: boolean;
  /** The second factor the person who made it has now. */
  maker_two_factor: "cognito" | "app" | null;
}

/** What to say about a key made before two-factor sign-in was required. */
export function reviewText(r: KeyTwoFactorReview): string {
  if (!r.maker_on_team) return "Made before two-factor sign-in was required, by someone no longer on the team";
  if (!r.maker_two_factor) return "Made before two-factor sign-in was required, by someone who still has no second factor";
  return "Made before two-factor sign-in was required";
}

export interface ApiKeyScope {
  key: string;
  label: string;
  /** Every key holds it. */
  always: boolean;
  /** Whether the signed-in person may give it (their own role holds it). */
  allowed: boolean;
}

export interface ApiKeyLimits {
  default_rate_per_minute: number;
  min_rate_per_minute: number;
  max_rate_per_minute: number;
  max_expiry_days: number;
  max_keys: number;
}

export interface ApiKeyList {
  keys: ApiKey[];
  scopes: ApiKeyScope[];
  limits: ApiKeyLimits;
}

export interface NewApiKey {
  name: string;
  scopes: string[];
  expires_in_days: number | null;
  rate_limit_per_minute: number;
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

export const apiKeysApi = {
  list: () => request<ApiKeyList>("/api/api-keys"),
  create: (body: NewApiKey) =>
    request<{ key: ApiKey; token: string }>("/api/api-keys", { method: "POST", body: JSON.stringify(body) }),
  revoke: (id: string) => request<{ status: string; id: string }>(`/api/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/** A first request to try a new key with. */
export function curlExample(token: string): string {
  return `curl ${apiOrigin()}/api/me \\\n  -H "Authorization: Bearer ${token}"`;
}
