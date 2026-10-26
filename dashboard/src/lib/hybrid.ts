// Hybrid: a self-hosted install that uses Coderhelm's GitHub App, its other
// apps and a name.coderhelm.com address, while the code and the work stay in
// the install's own AWS account. The words for every outcome live here, so
// the System page, the integration pages and the tests agree.

import { useCallback, useEffect, useState } from "react";
import { api, errorStatus, type HybridStatus, type HybridSettingsPatch } from "./api";
import { apiBase, isSelfHosted } from "./runtime-config";

/** Where the trust model is written down. */
export const TRUST_MODEL_URL = "https://docs.coderhelm.com/self-host/hybrid/#trust-model";

/** The Hybrid section on Settings, then System. */
export const HYBRID_HREF = "/settings/system/#hybrid";

/** What came back from GitHub after "Install on GitHub" (?hybrid_github=…), in one sentence and its fix. */
export const GITHUB_OUTCOMES: Record<string, { ok: boolean; title: string; fix: string }> = {
  linked: { ok: true, title: "GitHub is linked.", fix: "Choose which repositories Coderhelm may use below." },
  not_yours: {
    ok: false,
    title: "That GitHub installation belongs to an account you don't manage.",
    fix: "Install the app from an account or organization where you are an owner, or ask its owner to do it.",
  },
  linked_elsewhere: {
    ok: false,
    title: "That GitHub installation is already linked to another install.",
    fix: "Unlink it on the other install first, then press Install on GitHub again.",
  },
  used_by_hosted_team: {
    ok: false,
    title: "That GitHub installation is used by a team on Coderhelm's hosted service.",
    fix: "Remove it from that team, or install the app on a different account.",
  },
  signin_failed: {
    ok: false,
    title: "GitHub didn't confirm who you are.",
    fix: "Press Install on GitHub again and sign in when GitHub asks.",
  },
  github_unreachable: {
    ok: false,
    title: "Coderhelm couldn't reach GitHub just now.",
    fix: "Wait a minute, then press Install on GitHub again.",
  },
  store_failed: {
    ok: false,
    title: "The link couldn't be saved.",
    fix: "Press Install on GitHub again. If it keeps failing, contact support.",
  },
  no_write_access: {
    ok: false,
    title: "Your GitHub account can't push to any repository in that installation, so nothing was linked.",
    fix: "Ask someone who can push to those repositories to press Install on GitHub, or get write access on GitHub and try again.",
  },
  declined: {
    ok: false,
    title: "Nothing was linked: you chose Cancel on Coderhelm's confirmation page.",
    fix: "If you meant to link it, press Install on GitHub again and choose Link.",
  },
  install_off: {
    ok: false,
    title: "Coderhelm doesn't see this install as verified and active, so nothing was linked.",
    fix: "Press Check again below. If it says Coderhelm turned off this install's access, contact support.",
  },
};

/** Why a name can't be used, when the server sent no words of its own. */
export const NAME_CODES: Record<string, string> = {
  ok: "Available.",
  taken: "Someone already uses this name.",
  reserved: "This name is kept back by Coderhelm. Try another.",
  too_short: "Use at least 3 characters.",
  too_long: "Use 40 characters or fewer.",
  bad_characters: "Use only lowercase letters, numbers and hyphens.",
  hyphen_at_edge: "A name can't start or end with a hyphen.",
  double_hyphen: "A name can't have two hyphens in a row.",
  empty: "Type a name.",
};

/** A name as people type it: trimmed and lowercase. */
export function cleanName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.coderhelm\.com$/, "");
}

/** The integrations a person can switch between Coderhelm's app and their own. */
export const HOSTED_CHOICES = ["github", "jira", "notion", "confluence", "google_drive"] as const;

// ── Hosted dashboard hand-offs ─────────────────────────────────────────
//
// A self-hosted install borrows Coderhelm's apps, whose callbacks land on the
// hosted dashboard. The person there usually has no hosted account, so these
// run before sign-in (components/client-shell.tsx) and pass the callback on
// to the hosted API, which sends the browser back to the install.

/** Pages GitHub's app "Setup URL" can land on. */
const GITHUB_SETUP_PATHS = ["/settings/github", "/settings/integrations/github"];
const OAUTH_CALLBACK_PATH = "/settings/integrations/mcp-callback";

const trimPath = (p: string) => p.replace(/\/+$/, "") || "/";

/**
 * The hosted API's address for an install's GitHub setup, when this page is
 * GitHub coming back from installing the app for a hybrid install (its state
 * starts "hyb_"); null otherwise.
 */
export function hybridGithubSetupTarget(loc: { pathname: string; search: string }): string | null {
  if (isSelfHosted()) return null;
  if (!GITHUB_SETUP_PATHS.includes(trimPath(loc.pathname))) return null;
  const q = new URLSearchParams(loc.search);
  const state = q.get("state") ?? "";
  if (!state.startsWith("hyb_")) return null;
  const out = new URLSearchParams();
  out.set("installation_id", q.get("installation_id") ?? "");
  out.set("state", state);
  out.set("setup_action", q.get("setup_action") ?? "");
  return `${apiBase()}/hybrid/github/setup?${out.toString()}`;
}

/** Whether this page is an OAuth callback that may belong to a hybrid install. */
export function maybeHybridOAuthCallback(loc: { pathname: string; search: string }): boolean {
  if (isSelfHosted()) return false;
  if (trimPath(loc.pathname) !== OAUTH_CALLBACK_PATH) return false;
  return !!new URLSearchParams(loc.search).get("state");
}

let oauthHandoff: Promise<boolean> | null = null;

/**
 * Asks the hosted API whether this OAuth callback belongs to a hybrid
 * install. If it does, the browser goes on to the install and the promise
 * never settles (the page is leaving); otherwise it resolves false and the
 * normal flow carries on. Asked once per page load: the shell and the
 * callback page share the answer.
 */
export function hybridOAuthHandoff(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!maybeHybridOAuthCallback(window.location)) return Promise.resolve(false);
  if (oauthHandoff) return oauthHandoff;
  const q = new URLSearchParams(window.location.search);
  oauthHandoff = fetch(`${apiBase()}/hybrid/oauth/callback`, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: q.get("code"), state: q.get("state"), error: q.get("error"), iss: q.get("iss") }),
  })
    .then(async (res) => {
      if (res.status !== 200) return false;
      const body = (await res.json().catch(() => ({}))) as { redirect?: unknown };
      // Only a web address: never a javascript: or data: URL.
      if (typeof body.redirect !== "string" || !/^https?:\/\//i.test(body.redirect)) return false;
      window.location.replace(body.redirect);
      return new Promise<boolean>(() => {});
    })
    .catch(() => false);
  return oauthHandoff;
}

// ── The status, for any page that shows a hybrid choice ────────────────


export interface HybridState {
  /** Null while loading, on a hosted deployment, or when the install has no hybrid (404). */
  status: HybridStatus | null;
  loading: boolean;
  /** The words of a failure other than "not here" (404). */
  error: string;
  reload: (deep?: boolean) => Promise<void>;
  /** Use an answer that carries the whole status (every hybrid write returns one). */
  set: (s: HybridStatus) => void;
  /** PUT /api/system/hybrid/settings, keeping the answer. Throws on failure. */
  save: (patch: HybridSettingsPatch) => Promise<HybridStatus>;
}

/** GET /api/system/hybrid on a self-hosted install; nothing anywhere else. */
export function useHybrid(opts: { deep?: boolean } = {}): HybridState {
  const self = typeof window !== "undefined" && isSelfHosted();
  const [status, setStatus] = useState<HybridStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const deepFirst = !!opts.deep;

  const reload = useCallback(
    async (deep?: boolean) => {
      if (!self) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        setStatus(await api.getHybrid(deep));
        setError("");
      } catch (e) {
        if (errorStatus(e) === 404) setStatus(null);
        else setError(e instanceof Error ? e.message : "The request failed.");
      } finally {
        setLoading(false);
      }
    },
    [self],
  );

  useEffect(() => {
    void reload(deepFirst);
  }, [reload, deepFirst]);

  const save = useCallback(async (patch: HybridSettingsPatch) => {
    const next = await api.setHybridSettings(patch);
    setStatus(next);
    return next;
  }, []);

  return { status, loading, error, reload, set: setStatus, save };
}

/** The hosted-app integrations after switching `id` on or off (GitHub follows its own mode). */
export function hostedIntegrations(status: HybridStatus, id: string, useCoderhelm: boolean): string[] {
  const now = new Set(status.integrations.filter((i) => i.id !== "github" && i.mode === "hosted" && i.uses_coderhelm).map((i) => i.id));
  if (useCoderhelm) now.add(id);
  else now.delete(id);
  return [...now];
}
