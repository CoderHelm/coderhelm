"use client";

import Link from "next/link";
import { useState } from "react";
import { MapIcon } from "@/components/icons";
import { StatusDot } from "@/components/list/status";
import { timeAgo } from "@/components/list/time";
import { useToast } from "@/components/toast";
import { focusRing, linkButton, smallSecondaryButton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { AppMapSource } from "@/lib/knowledge";

// The App map as a source on the Knowledge page. Runs and Chat look things
// up in it directly (its parts, screens, journeys and what calls what), so
// it isn't split into passages like a knowledge base: the card says so,
// shows where the build stands and what the map covers, links to the map,
// and lets admins build it again (one build at a time).

const STATE: Record<AppMapSource["state"], { words: string; tone: "success" | "live" | "attention" | "neutral" }> = {
  built: { words: "Built", tone: "success" },
  building: { words: "Building", tone: "live" },
  rebuilding: { words: "Building again", tone: "live" },
  failed: { words: "The build failed", tone: "attention" },
  not_built: { words: "Not built yet", tone: "neutral" },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function AppMapSourceCard({ source, onChange }: { source: AppMapSource; onChange: (s: AppMapSource) => void }) {
  const { toast } = useToast();
  const [starting, setStarting] = useState(false);
  const st = STATE[source.state] ?? STATE.not_built;
  const running = source.state === "building" || source.state === "rebuilding";
  const cov = source.coverage;
  const apps = cov ? Object.entries(cov.screens).sort((a, b) => b[1] - a[1]) : [];
  const ago = source.built_at > 0 ? timeAgo(new Date(source.built_at * 1000).toISOString()) : "";
  const words = source.state === "built" && ago ? `Built ${ago}` : st.words;

  const rebuild = async () => {
    if (starting || running) return;
    setStarting(true);
    try {
      await api.rebuildAppMap();
      onChange({ ...source, state: source.built_at ? "rebuilding" : "building" });
      toast("The map is being built again.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onChange({ ...source, state: source.built_at ? "rebuilding" : "building" });
        toast("The map is already being built. That build carries on.");
      } else {
        toast(e instanceof Error ? e.message : "The request failed.", "error");
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <section
      aria-labelledby="app-map-source-title"
      data-testid="app-map-source"
      data-state={source.state}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 sm:flex-row sm:items-start"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300" aria-hidden="true">
        <MapIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id="app-map-source-title" className="text-base font-semibold text-zinc-100">
            App map
          </h3>
          <span className="flex items-center gap-2 text-sm" data-testid="app-map-source-state">
            <StatusDot tone={st.tone} live={running} />
            <span className={st.tone === "attention" ? "text-orange-300" : "text-zinc-400"}>{words}</span>
          </span>
          {ago && source.state !== "built" && (
            <span className="text-sm text-zinc-500" data-testid="app-map-source-built">
              Last built {ago}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-400" data-testid="app-map-source-explain">
          {source.explain}
        </p>
        {source.note && (source.state === "failed" || source.last_failed) && (
          <p className="mt-2 text-sm text-orange-300" data-testid="app-map-source-note">
            {source.last_failed ? `The last update didn't finish: ${source.note} The map shown is the one before it.` : source.note}
          </p>
        )}
        {cov && (
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm" data-testid="app-map-source-coverage">
            <div className="min-w-0">
              <dt className="text-zinc-500">Screens</dt>
              <dd className="text-zinc-200 [overflow-wrap:anywhere]">
                {apps.length ? apps.map(([app, n]) => `${plural(n, "screen")} in ${app}`).join(", ") : "None found"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Outside services</dt>
              <dd className="text-zinc-200">{cov.outside_services.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Cloud links</dt>
              <dd className="text-zinc-200">{cov.cloud_links.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Repositories</dt>
              <dd className="text-zinc-200">{cov.repos.toLocaleString()}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Link href={source.href || "/app-map"} className={`${linkButton} ${focusRing}`} data-testid="app-map-source-open">
          Open the App map
        </Link>
        {source.can_rebuild && (
          <button type="button" onClick={rebuild} disabled={starting || running} className={smallSecondaryButton} data-testid="app-map-source-rebuild">
            {running ? "Building" : starting ? "Starting" : "Build again"}
          </button>
        )}
      </div>
    </section>
  );
}
