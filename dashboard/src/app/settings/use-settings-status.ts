"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatTokens, LIMIT_LABELS, limitsTone, usageBreakdown, usageLimits, usageTotal } from "@/lib/usage";
import { can } from "@/lib/capabilities";
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
  capabilities?: string[];
  custom_role?: { id: string; name: string } | null;
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
    const limits = usageLimits(u);
    if (limits.length === 0) return { text: `No limit · ${formatTokens(used)} used this month`, tone: "neutral", title };
    // One limit: its count against it. Several: the one closest to its limit.
    const closest = limits.reduce((a, b) => (b.used / b.max > a.used / a.max ? b : a));
    const name = limits.length > 1 ? `${LIMIT_LABELS[closest.kind]}: ` : "";
    return { text: `${name}${formatTokens(closest.used)} of ${formatTokens(closest.max)} used this month`, tone: limitsTone(limits), title };
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
    if (m.deployment_provider === "bedrock") return { text: "Amazon Bedrock", tone: "success" };
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
      SETTINGS_ITEMS.filter((i) => i.status && can(me, i.view)).map((i) => i.status as SettingsStatusKey),
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
