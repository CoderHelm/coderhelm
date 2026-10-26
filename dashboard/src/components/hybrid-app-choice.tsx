"use client";

import Link from "next/link";
import { useState } from "react";
import { HYBRID_HREF, hostedIntegrations, useHybrid } from "@/lib/hybrid";
import { Segmented } from "./segmented";
import { useToast } from "./toast";
import { linkButton } from "./ui";

type Choice = "coderhelm" | "own";

/**
 * On a self-hosted install: whether this integration uses Coderhelm's app
 * (easiest) or the install's own (fully private). Reads and saves the same
 * settings as Settings, then System, Hybrid. Shows nothing on the hosted
 * service, on an install without hybrid, or where there is no choice.
 */
export function HybridAppChoice({ id, name, className = "" }: { id: string; name: string; className?: string }) {
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
          <Link href={HYBRID_HREF} className={linkButton}>Set it up in Settings, System, Hybrid</Link>
        </p>
      </div>
    );
  }

  const integration = s.integrations.find((i) => i.id === id);
  if (id !== "github" && integration?.mode !== "hosted") return null;
  const value: Choice = id === "github" ? (s.github.mode === "hosted" ? "coderhelm" : "own") : integration?.uses_coderhelm ? "coderhelm" : "own";

  const change = async (next: Choice) => {
    if (next === value || busy) return;
    setBusy(true);
    try {
      await hybrid.save(id === "github" ? { github_mode: next === "coderhelm" ? "hosted" : "own" } : { integrations: hostedIntegrations(s, id, next === "coderhelm") });
      toast(next === "coderhelm" ? `${name} now uses Coderhelm's app` : `${name} now uses your own app`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  };

  const note =
    value === "coderhelm"
      ? integration?.through_coderhelm || "Events reach your install through Coderhelm."
      : integration?.stays_with_you || "Everything goes straight to your install. Nothing passes through Coderhelm.";

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
        <Link href={HYBRID_HREF} className={`${linkButton} text-sm`}>More in Settings, System, Hybrid</Link>
      </p>
    </div>
  );
}
