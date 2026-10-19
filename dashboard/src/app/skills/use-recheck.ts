"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { skillsApi, type SkillWithBody } from "@/lib/skills";

/** How long a page waits on a re-check before it stops looking. */
const WAIT_MS = 180_000;

/**
 * An item page's Re-check (asks the worker, then reloads until the check
 * lands) and its "use the translated version" switch.
 */
export function useRecheck(
  item: SkillWithBody | null,
  setItem: (i: SkillWithBody) => void,
  load: () => Promise<SkillWithBody>,
) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"" | "recheck" | "translated">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const recheck = async () => {
    if (!item) return;
    const before = item.compat?.at ?? "";
    setBusy("recheck");
    try {
      await skillsApi.recheck(item.repo, item.path);
      toast(`Checking ${item.name} again. This takes about a minute.`);
      const started = Date.now();
      const poll = () => {
        timer.current = setTimeout(async () => {
          try {
            const now = await load();
            if ((now.compat?.at ?? "") !== before) {
              toast(`${item.name} checked`);
              return;
            }
          } catch {
            // A blip: look again on the next tick.
          }
          if (Date.now() - started < WAIT_MS) poll();
        }, 5_000);
      };
      poll();
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const chooseTranslated = async (on: boolean) => {
    if (!item) return;
    setBusy("translated");
    try {
      const r = await skillsApi.setUseTranslated(item.repo, item.path, on);
      setItem({ ...item, use_translated: r.use_translated, translated_by: "you", translated_at: new Date().toISOString() });
      toast(r.use_translated ? `Agents now read the translated ${item.name}` : `Agents now read ${item.name} as written`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setBusy("");
    }
  };

  return { busy, recheck, chooseTranslated };
}
