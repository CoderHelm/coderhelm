"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatTokens, usageBreakdown, usageTone, usageTotal } from "@/lib/usage";
import { hasRole } from "@/lib/roles";
import { SETTINGS_ITEMS, type SettingsStatusKey } from "@/components/settings-items";

export type StatusTone = "neutral" | "success" | "warning" | "error";

export interface ItemStatus {
  text: string;
  tone: StatusTone;
  /** More detail on hover (the token limit's four parts). */
  title?: string;
}

export interface Me {
  role: string;
  auth_provider?: string;
  github_login: string | null;
  mfa_enabled?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One small request per value, each on its own: a slow or failing one leaves
// its line empty and never holds up the page or the other lines.
const LOADERS: Record<SettingsStatusKey, (me: Me) => Promise<ItemStatus | null>> = {
  usage: async () => {
    const u = await api.getUsage();
    // All four parts (new input, read from cache, written to cache, output).
    const used = usageTotal(u);
    const title = usageBreakdown(u);
    if (u.max_tokens <= 0) return { text: `No limit · ${formatTokens(used)} used this month`, tone: "neutral", title };
    return { text: `${formatTokens(used)} of ${formatTokens(u.max_tokens)} used this month`, tone: usageTone(used, u.max_tokens), title };
  },
  repos: async () => {
    const { repos } = await api.listRepos();
    const on = repos.filter((r) => r.enabled).length;
    if (repos.length === 0) return { text: "No repositories yet", tone: "warning" };
    return { text: `${on} of ${plural(repos.length, "repository", "repositories")} on`, tone: on > 0 ? "success" : "neutral" };
  },
  team: async () => {
    const { users } = await api.listUsers();
    return { text: plural(users.length, "person", "people"), tone: "neutral" };
  },
  alerts: async () => {
    const { routes } = await api.listAlertRoutes();
    const on = routes.filter((r) => r.enabled).length;
    return routes.length === 0 ? { text: "No routes yet", tone: "neutral" } : { text: `${plural(routes.length, "route")}, ${on} on`, tone: on > 0 ? "success" : "neutral" };
  },
  dataSources: async () => {
    const { sources } = await api.listDataSources();
    return sources.length === 0 ? { text: "None connected", tone: "neutral" } : { text: `${sources.length} connected`, tone: "success" };
  },
  integrations: async () => {
    const { items } = await api.getIntegrations();
    const connected = items.filter((i) => i.status === "connected").length;
    const needs = items.filter((i) => i.status === "needs_credentials").length;
    const broken = items.filter((i) => i.status === "error").length;
    if (broken > 0) return { text: `${plural(broken, "integration")} not working`, tone: "error" };
    if (needs > 0) return { text: `${needs} need${needs === 1 ? "s" : ""} credentials · ${connected} connected`, tone: "warning" };
    return { text: `${connected} connected`, tone: connected > 0 ? "success" : "neutral" };
  },
  models: async () => {
    const m = await api.getModelProvider();
    return m.api_key_masked ? { text: "Your own API key", tone: "success" } : { text: "Coderhelm's key", tone: "neutral" };
  },
  security: async (me) => {
    if (me.auth_provider && me.auth_provider !== "email") {
      return { text: `Signs in with ${me.auth_provider === "github" ? "GitHub" : "Google"}`, tone: "neutral" };
    }
    if (!me.auth_provider && me.github_login) return { text: "Signs in with GitHub", tone: "neutral" };
    return me.mfa_enabled ? { text: "Two step sign in on", tone: "success" } : { text: "Two step sign in off", tone: "warning" };
  },
};

/** The at a glance line for each hub item the person can open. */
export function useSettingsStatus(me: Me | null): Partial<Record<SettingsStatusKey, ItemStatus>> {
  const [status, setStatus] = useState<Partial<Record<SettingsStatusKey, ItemStatus>>>({});

  useEffect(() => {
    if (!me) return;
    let live = true;
    const keys = new Set(
      SETTINGS_ITEMS.filter((i) => i.status && hasRole(me.role, i.view)).map((i) => i.status as SettingsStatusKey),
    );
    for (const key of keys) {
      LOADERS[key](me)
        .then((s) => {
          if (live && s) setStatus((prev) => ({ ...prev, [key]: s }));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [me]);

  return status;
}
