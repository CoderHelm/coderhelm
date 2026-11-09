"use client";

import Link from "next/link";
import { useState } from "react";
import { HYBRID_HREF, appsModeOf, canUseCoderhelm, useHybrid } from "@/lib/hybrid";
import { Segmented } from "./segmented";
import { useToast } from "./toast";
import { linkButton } from "./ui";

export type Choice = "coderhelm" | "own";

/**
 * Which app this install uses for `id` right now, when there is a choice:
 * "coderhelm" or "own". `null` on the hosted service, without hybrid, before
 * it's registered, or when Coderhelm's app isn't available for `id`.
 */
export function useHybridChoice(id: string): Choice | null {
  const s = useHybrid().status;
  if (!s || !s.available || !s.registered) return null;
  if (id === "github") return s.github.mode === "hosted" ? "coderhelm" : "own";
  const integration = s.integrations.find((i) => i.id === id);
  if (!canUseCoderhelm(integration)) return null;
  return integration?.uses_coderhelm ? "coderhelm" : "own";
}

/**
 * On a self-hosted install: which app this integration uses. GitHub has its
 * own choice, made here or in Settings, then System, Hybrid. Every other
 * tool follows the install's one Other apps choice, set in Hybrid, so it
 * shows nothing there. Nothing on the hosted service, on an install without
 * hybrid, or where Coderhelm has no app for it.
 */
export function HybridAppChoice({
  id,
  name,
  className = "",
  onChanged,
}: {
  id: string;
  name: string;
  className?: string;
  /** After GitHub's choice is saved. */
  onChanged?: (next: Choice) => void;
}) {
  const hybrid = useHybrid();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const s = hybrid.status;
  if (!s || !s.available) return null;

  const box = `min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 ${className}`;

  if (!s.registered) {
    return (
      <div className={box} data-testid="hybrid-app-choice" data-state="unregistered">
        <p className="text-sm text-zinc-300">
          Skip creating your own {name} app: use Coderhelm&apos;s instead, with your code still in your AWS account.{" "}
          <Link href={HYBRID_HREF} className={linkButton}>Set it up in Settings, Version and updates, Hybrid</Link>
        </p>
      </div>
    );
  }

  const integration = s.integrations.find((i) => i.id === id);
  // Not hosted, or Coderhelm's app for it isn't set up: there is no choice.
  if (id !== "github" && !canUseCoderhelm(integration)) return null;

  // Every other tool follows the install's one choice, made in Settings,
  // Version and updates, Hybrid: nothing to say on each tool's own page.
  if (id !== "github") return null;

  const value: Choice = s.github.mode === "hosted" ? "coderhelm" : "own";
  const change = async (next: Choice) => {
    if (next === value || busy) return;
    setBusy(true);
    try {
      await hybrid.save({ github_mode: next === "coderhelm" ? "hosted" : "own" });
      toast(next === "coderhelm" ? `${name} now uses Coderhelm's app` : `${name} now uses your own app`);
      onChanged?.(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  };

  const note =
    value === "coderhelm"
      ? integration?.through_coderhelm || "Events reach your install through Coderhelm."
      : "Everything goes straight to your install. Nothing passes through Coderhelm.";

  return (
    <div className={box} data-testid="hybrid-app-choice" data-state={value}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium text-zinc-100">App</span>
        <Segmented<Choice>
          label={`Which ${name} app to use`}
          value={value}
          disabled={busy}
          onChange={(v) => void change(v)}
          options={[
            { value: "coderhelm", label: "Use Coderhelm's app (easiest)" },
            { value: "own", label: "Use my own app (fully private)" },
          ]}
        />
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        {note}{" "}
        <Link href={HYBRID_HREF} className={`${linkButton} text-sm`}>More in Settings, Version and updates, Hybrid</Link>
      </p>
    </div>
  );
}
