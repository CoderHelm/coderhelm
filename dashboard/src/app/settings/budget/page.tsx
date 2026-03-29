"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export default function BudgetPage() {
  const [maxBudget, setMaxBudget] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.getBudget().then((data) => {
      setMaxBudget(data.max_budget_cents > 0 ? (data.max_budget_cents / 100).toString() : "");
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const cents = maxBudget ? Math.round(parseFloat(maxBudget) * 100) : 0;
      await api.updateBudget(cents);
      toast(cents > 0 ? `Budget cap set to $${(cents / 100).toFixed(2)}/mo` : "Budget cap removed");
    } catch {
      toast("Failed to save budget", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Budget</h1>
        <div className="h-32 bg-zinc-900/50 border border-zinc-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">Budget</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Set a cap on monthly overage charges. When reached, Coderhelm will stop picking up new issues and post a comment explaining why.
      </p>

      <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Monthly overage cap
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="No limit"
              value={maxBudget}
              onChange={(e) => setMaxBudget(e.target.value)}
              className="w-full pl-7 pr-16 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">/month</span>
          </div>
          <p className="text-xs text-zinc-600 mt-1.5">
            Caps overage charges only (base subscription not included). Set to 0 or empty for no cap.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-zinc-500">
            {maxBudget && parseFloat(maxBudget) > 0
              ? `Coderhelm will stop after ~${formatTokens(Math.floor(parseFloat(maxBudget) * 100 / 5 * 1000) + 5_000_000)} tokens/month`
              : "No spending limit — usage will continue with overage billing"}
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
