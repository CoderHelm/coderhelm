// The API keys page: the team's keys for calling the Coderhelm API from its
// own programs. The gateway keeps only a hash of each key; the key itself is
// in the create answer and nowhere else.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

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
  const res = await fetch(`${API_BASE}${path}`, {
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
  return `curl https://api.coderhelm.com/api/me \\\n  -H "Authorization: Bearer ${token}"`;
}
