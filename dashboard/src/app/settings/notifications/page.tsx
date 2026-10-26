"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type NotificationPrefs } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { Problem } from "@/components/problem";
import { linkButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import { SettingsRow, SettingsSection, Switch } from "@/components/settings";

type ToggleKey = "email_token_warning" | "email_weekly_summary";

const TOGGLES: { key: ToggleKey; label: string; description: string }[] = [
  {
    key: "email_token_warning",
    label: "Usage warnings",
    description: "Email me when the team has used 80% and 100% of a monthly token limit.",
  },
  { key: "email_weekly_summary", label: "Weekly summary", description: "Every Monday: runs, reviews, alerts and usage from the past week." },
];

/**
 * Your own email settings. Each switch saves the moment it is flipped and
 * says so, with Undo.
 */
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

  const save = async (from: NotificationPrefs, key: ToggleKey, on: boolean, undo = true) => {
    const updated = { ...from, [key]: on };
    setPrefs(updated);
    setSaving(key);
    try {
      await api.updateNotifications(updated);
      const label = TOGGLES.find((t) => t.key === key)?.label ?? "Setting";
      toast(
        `${label} ${on ? "on" : "off"}`,
        "success",
        undo ? { action: { label: "Undo", onClick: () => void save(updated, key, !on, false) } } : undefined,
      );
    } catch {
      setPrefs(from);
      toast("Couldn't save that setting. Check your connection and try again.", "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Page>
      <div className="mb-6">
        <PageHeader title="Notifications" lead="Choose which emails Coderhelm sends you. These settings are yours alone." />
      </div>

      <div className="max-w-3xl space-y-6">
        {failed && (
          <Problem title="Couldn't load your email settings" onRetry={load}>
            Nothing has changed. Check your connection and try again.
          </Problem>
        )}

        {!prefs && !failed && <Skeleton className="h-40 w-full rounded-lg" />}

        {prefs && (
          <SettingsSection id="emails" title="Emails">
            {TOGGLES.map((t) => {
              const on = prefs[t.key] !== false;
              return (
                <SettingsRow
                  key={t.key}
                  label={t.label}
                  help={t.description}
                  layout="toggle"
                  control={(ids) => (
                    <Switch
                      id={ids.inputId}
                      checked={on}
                      labelledBy={ids.labelId}
                      describedBy={ids.helpId}
                      onChange={(next) => save(prefs, t.key, next)}
                      disabled={saving !== null}
                    />
                  )}
                />
              );
            })}
          </SettingsSection>
        )}

        <p className="text-sm text-zinc-400">
          Chat messages for alerts and approvals are set up in{" "}
          <Link href="/settings/alerts" className={linkButton}>
            Alert routes
          </Link>{" "}
          and{" "}
          <Link href="/settings/integrations" className={linkButton}>
            Integrations
          </Link>
          .
        </p>
      </div>
    </Page>
  );
}
