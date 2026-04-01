"use client";

import { useEffect, useState } from "react";
import { api, type PluginDef, type EnabledPlugin } from "@/lib/api";
import { useToast } from "@/components/toast";

const CATEGORY_COLORS: Record<string, string> = {
  Design: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Monitoring: "bg-red-500/10 text-red-400 border-red-500/20",
  "Project Management": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Documentation: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Communication: "bg-green-500/10 text-green-400 border-green-500/20",
  Database: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Deployment: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Payments: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  Analytics: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  Security: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Feature Flags": "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  CMS: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Source Control": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

const TIER_LABELS: Record<number, string> = {
  1: "Popular",
  2: "Recommended",
  3: "Available",
};

const BRAND_ICONS: Record<string, { label: string; bg: string; fg: string }> = {
  figma: { label: "Fi", bg: "bg-purple-600", fg: "text-white" },
  sentry: { label: "Se", bg: "bg-rose-700", fg: "text-white" },
  linear: { label: "Li", bg: "bg-indigo-600", fg: "text-white" },
  notion: { label: "No", bg: "bg-zinc-100", fg: "text-zinc-900" },
  vercel: { label: "Ve", bg: "bg-zinc-100", fg: "text-zinc-900" },
  stripe: { label: "St", bg: "bg-violet-600", fg: "text-white" },
  cloudflare: { label: "Cf", bg: "bg-orange-500", fg: "text-white" },
  posthog: { label: "Ph", bg: "bg-blue-600", fg: "text-white" },
  gitlab: { label: "Gl", bg: "bg-orange-600", fg: "text-white" },
  neon: { label: "Ne", bg: "bg-emerald-600", fg: "text-white" },
  turso: { label: "Tu", bg: "bg-teal-600", fg: "text-white" },
  snyk: { label: "Sn", bg: "bg-purple-800", fg: "text-white" },
  launchdarkly: { label: "Ld", bg: "bg-zinc-800", fg: "text-white" },
  mongodb: { label: "Mg", bg: "bg-green-700", fg: "text-white" },
  grafana: { label: "Gr", bg: "bg-orange-600", fg: "text-white" },
  redis: { label: "Re", bg: "bg-red-600", fg: "text-white" },
  upstash: { label: "Up", bg: "bg-emerald-700", fg: "text-white" },
  sanity: { label: "Sa", bg: "bg-red-500", fg: "text-white" },
};

export default function PluginsPage() {
  const [catalog, setCatalog] = useState<PluginDef[]>([]);
  const [enabled, setEnabled] = useState<Map<string, EnabledPlugin>>(new Map());
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([api.getPluginCatalog(), api.listEnabledPlugins()])
      .then(([c, e]) => {
        setCatalog(c.plugins);
        const map = new Map<string, EnabledPlugin>();
        for (const p of e.plugins) map.set(p.plugin_id, p);
        setEnabled(map);
      })
      .catch(() => toast("Failed to load MCP servers", "error"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (pluginId: string, currentlyEnabled: boolean) => {
    setToggling(pluginId);
    try {
      if (currentlyEnabled) {
        await api.disablePlugin(pluginId);
        setEnabled((prev) => {
          const next = new Map(prev);
          next.delete(pluginId);
          return next;
        });
        toast("Plugin disabled");
      } else {
        await api.enablePlugin(pluginId);
        setEnabled((prev) => {
          const next = new Map(prev);
          next.set(pluginId, { plugin_id: pluginId, enabled: true, has_credentials: false, enabled_at: new Date().toISOString(), custom_prompt: null });
          return next;
        });
        toast("Plugin enabled");
      }
    } catch {
      toast("Failed to update plugin", "error");
    } finally {
      setToggling(null);
    }
  };

  const openConfigure = (plugin: PluginDef) => {
    setConfiguring(plugin.id);
    const empty: Record<string, string> = {};
    for (const f of plugin.credential_fields) empty[f.key] = "";
    setCredentials(empty);
    const ep = enabled.get(plugin.id);
    setCustomPrompt(ep?.custom_prompt || plugin.default_prompt);
  };

  const handleSavePrompt = async (pluginId: string) => {
    setSavingPrompt(true);
    try {
      await api.updatePluginPrompt(pluginId, customPrompt);
      setEnabled((prev) => {
        const next = new Map(prev);
        const ep = next.get(pluginId);
        if (ep) next.set(pluginId, { ...ep, custom_prompt: customPrompt });
        return next;
      });
      toast("Prompt saved");
    } catch {
      toast("Failed to save prompt", "error");
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleSaveCredentials = async (pluginId: string) => {
    setSaving(true);
    try {
      const result = await api.updatePluginCredentials(pluginId, credentials);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setEnabled((prev) => {
        const next = new Map(prev);
        const existing = next.get(pluginId);
        if (existing) next.set(pluginId, { ...existing, has_credentials: true });
        return next;
      });
      setConfiguring(null);
      toast("Credentials saved");
    } catch {
      toast("Failed to save credentials", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">MCP Servers</h1>
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          Loading servers...
        </div>
      </div>
    );
  }

  const categories = Array.from(new Set(catalog.map((p) => p.category))).sort();
  const tiers = [1, 2, 3];

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">MCP Servers</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Connect MCP servers to give Coderhelm access to third-party tools during runs.
        </p>
      </div>

      {/* Security notice */}
      <div className="mb-6 px-4 py-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-xs text-yellow-300 font-medium">Security Notice</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Use read-only tokens and minimal scopes when configuring credentials. MCP servers should not be granted write or delete access unless required.
              Contact <a href="mailto:security@coderhelm.com" className="text-yellow-400 hover:underline">security@coderhelm.com</a> with questions.
            </p>
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
            !categoryFilter ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
              categoryFilter === cat
                ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {tiers.map((tier) => {
        const plugins = catalog.filter((p) => p.tier === tier && (!categoryFilter || p.category === categoryFilter));
        if (plugins.length === 0) return null;

        return (
          <div key={tier} className="mb-8">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              {TIER_LABELS[tier]}
            </h2>
            <div className="space-y-2">
              {plugins.map((plugin) => {
                const ep = enabled.get(plugin.id);
                const isEnabled = !!ep?.enabled;
                const hasCreds = !!ep?.has_credentials;
                const isToggling = toggling === plugin.id;

                return (
                  <div
                    key={plugin.id}
                    className={`border rounded-lg px-4 py-3 transition-colors ${
                      isEnabled
                        ? "bg-zinc-900/80 border-zinc-700"
                        : "bg-zinc-900/30 border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {(() => {
                          const brand = BRAND_ICONS[plugin.icon];
                          return brand ? (
                            <span className={`w-8 h-8 rounded-md ${brand.bg} ${brand.fg} flex items-center justify-center text-xs font-bold shrink-0`}>
                              {brand.label}
                            </span>
                          ) : (
                            <span className="text-xl shrink-0" role="img">{plugin.icon}</span>
                          );
                        })()}
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-100">
                              {plugin.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${
                                isEnabled
                                  ? "bg-zinc-100/10 text-zinc-300 border-zinc-600"
                                  : "bg-zinc-800 text-zinc-500 border-zinc-700"
                              }`}
                            >
                              {plugin.category}
                            </span>
                            {isEnabled && hasCreds && (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                                Connected
                              </span>
                            )}
                            {isEnabled && !hasCreds && (
                              <span className="text-[10px] text-yellow-400">
                                Needs credentials
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {plugin.description}
                          </p>
                          <a
                            href={plugin.repo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors mt-0.5 inline-block"
                          >
                            {plugin.repo_url.replace("https://github.com/", "").replace("https://", "")} →
                          </a>
                          {plugin.recommended_permissions && (
                            <p className="text-xs text-zinc-400 mt-1">
                              <span className="text-zinc-500 font-medium">Permissions:</span> {plugin.recommended_permissions}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        {isEnabled && (
                          <button
                            onClick={() => openConfigure(plugin)}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-md hover:bg-zinc-700 transition-colors"
                          >
                            Configure
                          </button>
                        )}
                        <button
                          onClick={() => handleToggle(plugin.id, isEnabled)}
                          disabled={isToggling}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            isEnabled ? "bg-emerald-600" : "bg-zinc-700"
                          } ${isToggling ? "opacity-50" : ""}`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              isEnabled ? "left-[23px]" : "left-[2px]"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Credentials form */}
                    {configuring === plugin.id && (
                      <div className="mt-3 pt-3 border-t border-zinc-800">
                        {hasCreds && !Object.values(credentials).some((v) => v !== "") ? (
                          <div className="flex items-center justify-between mb-3 px-3 py-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                            <div className="flex items-center gap-2">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><path d="M20 6L9 17l-5-5" /></svg>
                              <span className="text-sm text-emerald-400 font-medium">Credentials saved</span>
                            </div>
                            <button
                              onClick={() => {
                                const empty: Record<string, string> = {};
                                for (const f of plugin.credential_fields) empty[f.key] = " ";
                                setCredentials(empty);
                              }}
                              className="px-3 py-1 text-xs font-medium text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-md hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
                            >
                              Update credentials
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {plugin.credential_fields.map((field) => (
                            <div key={field.key}>
                              <label className="block text-xs text-zinc-400 mb-1">
                                {field.label}
                              </label>
                              <input
                                type={field.secret ? "password" : "text"}
                                placeholder={field.placeholder}
                                value={credentials[field.key] || ""}
                                onChange={(e) =>
                                  setCredentials((prev) => ({
                                    ...prev,
                                    [field.key]: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                              />
                            </div>
                          ))}
                        </div>
                        )}
                        {/* Custom prompt */}
                        <div className="mt-4">
                          <label className="block text-xs text-zinc-400 mb-1">System prompt</label>
                          <textarea
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            rows={4}
                            maxLength={4000}
                            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono resize-y"
                          />
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-zinc-600">{customPrompt.length}/4000</span>
                            <button
                              onClick={() => handleSavePrompt(plugin.id)}
                              disabled={savingPrompt}
                              className="px-4 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-900 border border-zinc-100 rounded-md hover:bg-white disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {savingPrompt ? "Saving..." : "Save prompt"}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-3">
                            <a
                              href={plugin.docs_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              API docs
                            </a>
                            <a
                              href={plugin.repo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              Source
                            </a>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setConfiguring(null)}
                              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveCredentials(plugin.id)}
                              disabled={saving}
                              className="px-4 py-1.5 text-xs font-medium bg-white text-zinc-900 rounded-md hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
