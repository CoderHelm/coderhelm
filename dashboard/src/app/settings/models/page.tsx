"use client";

import { useEffect, useState } from "react";
import { api, ModelProviderConfig } from "@/lib/api";
import { useToast } from "@/components/toast";

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-haiku-4-5-20250514", label: "Claude Haiku 4.5" },
];

export default function ModelProviderPage() {
  const [config, setConfig] = useState<ModelProviderConfig | null>(null);
  const [provider, setProvider] = useState<"bedrock" | "anthropic">("bedrock");
  const [apiKey, setApiKey] = useState("");
  const [primaryModel, setPrimaryModel] = useState("claude-sonnet-4-20250514");
  const [heavyModel, setHeavyModel] = useState("claude-opus-4-20250514");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.getModelProvider().then((data) => {
      setConfig(data);
      setProvider(data.provider);
      if (data.primary_model) setPrimaryModel(data.primary_model);
      if (data.heavy_model) setHeavyModel(data.heavy_model);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (provider === "anthropic" && !apiKey && !config?.api_key_masked) {
      toast("Please enter your Anthropic API key", "error");
      return;
    }
    setSaving(true);
    try {
      if (provider === "bedrock") {
        await api.deleteModelProvider();
        setConfig({ provider: "bedrock", api_key_masked: null, primary_model: null, heavy_model: null });
        setApiKey("");
        toast("Reverted to AWS Bedrock (default)");
      } else {
        const body: { provider: string; api_key?: string; primary_model: string; heavy_model: string } = {
          provider: "anthropic",
          primary_model: primaryModel,
          heavy_model: heavyModel,
        };
        if (apiKey) body.api_key = apiKey;
        await api.updateModelProvider(body);
        const updated = await api.getModelProvider();
        setConfig(updated);
        setApiKey("");
        toast("Model provider updated to Anthropic");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey && !config?.api_key_masked) {
      toast("Enter an API key to test", "error");
      return;
    }
    setTesting(true);
    try {
      const body: { provider: string; api_key?: string; primary_model: string; heavy_model: string } = {
        provider: "anthropic",
        primary_model: primaryModel,
        heavy_model: heavyModel,
      };
      if (apiKey) body.api_key = apiKey;
      await api.updateModelProvider(body);
      const updated = await api.getModelProvider();
      setConfig(updated);
      setApiKey("");
      toast("API key verified and saved successfully");
    } catch (e) {
      toast(e instanceof Error ? e.message : "API key validation failed", "error");
    } finally {
      setTesting(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await api.deleteModelProvider();
      setConfig({ provider: "bedrock", api_key_masked: null, primary_model: null, heavy_model: null });
      setProvider("bedrock");
      setApiKey("");
      toast("Reverted to AWS Bedrock");
    } catch {
      toast("Failed to reset", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-6">AI Models</h1>
        <div className="h-64 bg-zinc-900/50 border border-zinc-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">AI Models</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Choose how CoderHelm calls Claude. Use AWS Bedrock (default) or bring your own Anthropic API key for direct access.
      </p>

      {/* Provider toggle */}
      <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Provider</label>
          <div className="flex gap-3">
            <button
              onClick={() => setProvider("bedrock")}
              className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                provider === "bedrock"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <span className="block font-semibold">AWS Bedrock</span>
              <span className="block text-xs mt-0.5 opacity-70">Default — uses CoderHelm&apos;s infrastructure</span>
            </button>
            <button
              onClick={() => setProvider("anthropic")}
              className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                provider === "anthropic"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <span className="block font-semibold">Anthropic API</span>
              <span className="block text-xs mt-0.5 opacity-70">Bring your own API key</span>
            </button>
          </div>
        </div>

        {/* Anthropic config */}
        {provider === "anthropic" && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">API Key</label>
              <div className="relative">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={config?.api_key_masked ? `Current: ${config.api_key_masked}` : "sk-ant-api03-..."}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
                {config?.api_key_masked && (
                  <span className="absolute right-3 top-2.5 text-xs text-zinc-500">
                    {config.api_key_masked}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Your key is encrypted at rest with AWS KMS. Only your team can use it.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Primary Model</label>
                <select
                  value={primaryModel}
                  onChange={(e) => setPrimaryModel(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1">Used for analysis, reviews, planning</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Heavy Model</label>
                <select
                  value={heavyModel}
                  onChange={(e) => setHeavyModel(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1">Used for code implementation</p>
              </div>
            </div>

            <button
              onClick={handleTest}
              disabled={testing || (!apiKey && !config?.api_key_masked)}
              className="w-full py-2 px-4 text-sm font-medium rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? "Validating..." : "Test API Key"}
            </button>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 px-4 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {config?.provider === "anthropic" && (
            <button
              onClick={handleReset}
              disabled={saving}
              className="py-2.5 px-4 text-sm font-medium rounded-lg border border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-50 transition-colors"
            >
              Reset to Bedrock
            </button>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="mt-4 p-4 bg-zinc-900/30 border border-zinc-800 rounded-lg">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">How it works</h3>
        <ul className="text-xs text-zinc-500 space-y-1.5">
          <li>• <strong className="text-zinc-400">Bedrock (default)</strong> — runs through CoderHelm&apos;s AWS infrastructure. No setup needed.</li>
          <li>• <strong className="text-zinc-400">Anthropic API</strong> — calls Claude directly with your key. You control billing and rate limits.</li>
          <li>• Your API key is encrypted with AWS KMS and isolated to your team.</li>
          <li>• Switching providers takes effect on the next run. In-progress runs are unaffected.</li>
        </ul>
      </div>
    </div>
  );
}
