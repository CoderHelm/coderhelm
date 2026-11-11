"use client";

// Setup's opinion on a settings page: beside a setting, a quiet
// "Recommended" when its value is what Setup recommends for this repo, or
// "Custom" when someone changed it by hand after Setup applied it; and one
// link to review the repo in Setup. Read from the team's latest Setup run.
// With no run yet, or a server without Setup, the page shows nothing extra.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { linkButton } from "./ui";
import { sameValue, setupApi, type PlanItem } from "@/lib/setup";

export type SetupMark = "recommended" | "custom" | null;

interface Loaded {
  /** setting id, then repo, then the plan item. */
  items: Map<string, Map<string, PlanItem>>;
  has: boolean;
}

let once: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  once ??= setupApi
    .home()
    .then(async (home) => {
      const items = new Map<string, Map<string, PlanItem>>();
      const id = home.last_run?.run_id;
      if (id) {
        const run = await setupApi.run(id);
        for (const r of run.repos) {
          for (const it of r.items) {
            if (!items.has(it.setting_id)) items.set(it.setting_id, new Map());
            items.get(it.setting_id)!.set(r.repo, it);
          }
        }
      }
      return { items, has: home.repos.length > 0 };
    })
    .catch(() => {
      once = null;
      return { items: new Map(), has: false };
    });
  return once;
}

/**
 * `mark("reviewer.enabled", value)`: the mark for that setting on `repo`
 * (or, for a team setting, on any repo). Several ids may be given; the first
 * that Setup knows wins.
 */
export function useSetupMarks(repo: string | null | undefined) {
  const [data, setData] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    load().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  const mark = useCallback(
    (ids: string | string[], value: unknown): SetupMark => {
      if (!data) return null;
      for (const id of Array.isArray(ids) ? ids : [ids]) {
        const byRepo = data.items.get(id);
        if (!byRepo) continue;
        const it = (repo ? byRepo.get(repo) : undefined) ?? (repo ? undefined : byRepo.values().next().value);
        if (!it) continue;
        if (it.custom && !sameValue(value, it.recommended)) return "custom";
        return sameValue(value, it.recommended) ? "recommended" : null;
      }
      return null;
    },
    [data, repo],
  );
  return { mark, available: !!data?.has };
}

/** One quiet line under a settings page's header: where the marks come from, and the way back to Setup. */
export function ReviewInSetup({ repo, available }: { repo?: string | null; available: boolean }) {
  if (!available) return null;
  const href = repo ? `/setup/run?repos=${encodeURIComponent(repo)}` : "/setup";
  return (
    <p className="mt-3 text-sm text-zinc-400" data-testid="review-in-setup">
      Setup marks the values it recommends.{" "}
      <Link href={href} className={`${linkButton} !text-sm`}>
        Review in Setup
      </Link>
    </p>
  );
}
