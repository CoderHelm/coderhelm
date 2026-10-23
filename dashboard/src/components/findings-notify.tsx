"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type WebhooksView } from "@/lib/api";
import { useToast } from "./toast";
import { Callout } from "./callout";
import { Segmented } from "./segmented";
import { ChannelPicker, channelsPayload, draftDirty, draftFrom, draftValid, NO_WEBHOOKS, type ChannelsDraft } from "./chat-channels";
import { linkButton, primaryButton } from "./ui";

// Where new log findings (and the fix PRs started from them) post: off, the
// team's alert channel, or channels of their own. Lives on the Logs page.

const NOTIFY_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "team", label: "Team channel" },
  { value: "custom", label: "Own channel" },
] as const;

type NotifyMode = (typeof NOTIFY_OPTIONS)[number]["value"];

export function FindingsNotify() {
  const { toast } = useToast();
  const [saved, setSaved] = useState<{ mode: NotifyMode; webhooks: WebhooksView } | null>(null);
  const [mode, setMode] = useState<NotifyMode>("off");
  const [draft, setDraft] = useState<ChannelsDraft>(draftFrom(NO_WEBHOOKS));
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .getRecNotify()
      .then((r) => {
        setSaved({ mode: r.notify_mode, webhooks: r.webhooks });
        setMode(r.notify_mode);
        setDraft(draftFrom(r.webhooks));
      })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(load, [load]);

  const dirty = !!saved && (saved.mode !== mode || (mode === "custom" && draftDirty(draft, saved.webhooks)));
  const valid = mode !== "custom" || draftValid(draft, saved?.webhooks, true);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveRecNotify(mode, mode === "custom" ? channelsPayload(draft, saved?.webhooks) : {});
      toast("Saved where new findings are posted");
      load();
    } catch {
      toast("Could not save. Check the webhook address.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside aria-labelledby="findings-notify-heading" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm">
      <h3 id="findings-notify-heading" className="font-semibold text-zinc-100">Post new findings to chat</h3>
      <p className="mt-1 text-zinc-400">
        After each analysis, new findings post as one message in Microsoft Teams, Slack or both, and so does each fix PR
        opened from a finding. The team channel is the one set in{" "}
        <Link href="/settings/alerts" className={linkButton}>Alert routes</Link>.
      </p>
      {loadError ? (
        <div className="mt-3">
          <Callout variant="error"><p>Could not load this setting. Reload the page to try again.</p></Callout>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="max-w-full"><Segmented label="Where to post new findings" options={[...NOTIFY_OPTIONS]} value={mode} onChange={setMode} disabled={!saved} /></div>
          {mode === "custom" && (
            <ChannelPicker
              idPrefix="findings"
              draft={draft}
              saved={saved?.webhooks}
              onChange={setDraft}
              destination={{ destination: "recommendations" }}
            />
          )}
          <div>
            <button type="button" onClick={save} disabled={!dirty || !valid || saving} className={primaryButton}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
