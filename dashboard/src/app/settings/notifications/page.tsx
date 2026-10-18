"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type NotificationPrefs } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { focusRing, secondaryButton } from "@/components/ui";

type ToggleKey = "email_token_warning" | "email_weekly_summary";

const TOGGLES: { key: ToggleKey; label: string; description: string }[] = [
  { key: "email_token_warning", label: "Token usage warnings", description: "Email when the team reaches 80% and 100% of its monthly token limit." },
  { key: "email_weekly_summary", label: "Weekly summary", description: "A weekly digest of activity across your repositories." },
];

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<ToggleKey | null>(null);
  const { toast } = useToast();

  const load = useCallback(() => {
    setFailed(false);
    api.getNotifications().then(setPrefs).catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const toggle = async (key: ToggleKey) => {
    if (!prefs) return;
    const before = prefs;
    const updated = { ...prefs, [key]: !(prefs[key] !== false) };
    setPrefs(updated);
    setSaving(key);
    try {
      await api.updateNotifications(updated);
    } catch {
      setPrefs(before);
      toast("Could not save that preference", "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <p className="text-sm text-zinc-400 mt-1 mb-6">Choose which emails Coderhelm sends you. These settings are yours alone.</p>

      {failed && (
        <Callout variant="error" title="Could not load your email settings">
          <p className="pt-1">
            <button type="button" onClick={load} className={secondaryButton}>
              Try again
            </button>
          </p>
        </Callout>
      )}

      {!prefs && !failed && <Skeleton className="h-40 w-full rounded-lg" />}

      {prefs && (
        <ul className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
          {TOGGLES.map((t) => {
            const on = prefs[t.key] !== false;
            return (
              <li key={t.key} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p id={`${t.key}-label`} className="text-sm font-medium text-zinc-100">{t.label}</p>
                  <p id={`${t.key}-desc`} className="text-sm text-zinc-400 mt-0.5">{t.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={`${t.key}-label`}
                  aria-describedby={`${t.key}-desc`}
                  onClick={() => toggle(t.key)}
                  disabled={saving !== null}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors motion-reduce:transition-none disabled:opacity-50 ${focusRing} ${on ? "bg-emerald-500" : "bg-zinc-700"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform motion-reduce:transition-none ${on ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
