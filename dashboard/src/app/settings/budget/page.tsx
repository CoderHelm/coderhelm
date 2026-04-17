"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export default function TokenLimitPage() {
  const [maxTokens, setMaxTokens] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.getBudget().then((data) => {
      setMaxTokens(data.max_tokens > 0 ? (data.max_tokens / 1_000_000).toString() : "");
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tokens = maxTokens ? Math.round(parseFloat(maxTokens) * 1_000_000) : 0;
      await api.updateBudget(tokens);
      toast(tokens > 0 ? `Token limit set to ${formatTokens(tokens)}/month` : "Token limit removed (unlimited)");
    } catch {
      toast("Failed to save token limit", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Token Limit</h1>
        <div className="h-32 bg-zinc-900/50 border border-zinc-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">Token Limit</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Set a monthly token limit. When reached, new runs will be paused until the next month. Leave empty for unlimited usage.
      </p>

      <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Monthly token limit
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="Unlimited"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              className="w-full pl-3 pr-24 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">M tokens/month</span>
          </div>
          <p className="text-xs text-zinc-600 mt-1.5">
            Set to 0 or empty for unlimited usage.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-zinc-500">
            {maxTokens && parseFloat(maxTokens) > 0
              ? `Runs will pause after ${formatTokens(Math.round(parseFloat(maxTokens) * 1_000_000))} tokens this month`
              : "No limit — runs will continue without restriction"}
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
