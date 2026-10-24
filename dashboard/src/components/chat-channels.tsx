"use client";

import { useState } from "react";
import {
  api,
  type ChannelsInput,
  type ChatChannel,
  type NotifyDestination,
  type WebhooksView,
} from "@/lib/api";
import { Disclosure } from "./disclosure";
import { Field } from "./field";
import { TeamsHowTo, validTeamsUrl } from "./teams-webhook";
import { focusRing, inputClass, linkButton, secondaryButton } from "./ui";

/** Slack incoming webhooks the API accepts: hooks.slack.com/services/<team>/<bot>/<secret>. */
export function validSlackUrl(url: string): boolean {
  const m = url.trim().match(/^https:\/\/hooks\.slack\.com\/services\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/);
  return !!m && url.trim().length <= 500;
}

export const CHANNEL_LABEL: Record<ChatChannel, string> = { teams: "Microsoft Teams", slack: "Slack" };
const CHANNELS: ChatChannel[] = ["teams", "slack"];
const VALID: Record<ChatChannel, (u: string) => boolean> = { teams: validTeamsUrl, slack: validSlackUrl };
const PLACEHOLDER: Record<ChatChannel, string> = {
  teams: "https://…powerplatform.com/…/workflows/…",
  slack: "https://hooks.slack.com/services/…",
};
const URL_ERROR: Record<ChatChannel, string> = {
  teams: "Paste the address Teams Workflows shows (it ends in powerplatform.com, logic.azure.com or webhook.office.com).",
  slack: "Paste the Incoming Webhook URL Slack shows (https://hooks.slack.com/services/…).",
};

export const NO_WEBHOOKS: WebhooksView = { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } };

/** What the form holds for one channel: on or off, and a new URL (empty = keep the saved one). */
export type ChannelDraft = { on: boolean; url: string };
export type ChannelsDraft = Record<ChatChannel, ChannelDraft>;

/** A form's starting point: each saved channel on, no URL typed. */
export function draftFrom(saved: WebhooksView | undefined): ChannelsDraft {
  const s = saved ?? NO_WEBHOOKS;
  return { teams: { on: s.teams.set, url: "" }, slack: { on: s.slack.set, url: "" } };
}

/** Whether a channel's part of the form can be saved: off, or on with a valid new URL or a saved one. */
function channelOk(d: ChannelDraft, kind: ChatChannel, saved: WebhooksView): boolean {
  if (!d.on) return true;
  const url = d.url.trim();
  return url ? VALID[kind](url) : saved[kind].set;
}

/** The form can be saved: every channel is fine and, when `needOne`, at least one is on. */
export function draftValid(draft: ChannelsDraft, saved: WebhooksView | undefined, needOne: boolean): boolean {
  const s = saved ?? NO_WEBHOOKS;
  return CHANNELS.every((k) => channelOk(draft[k], k, s)) && (!needOne || CHANNELS.some((k) => draft[k].on));
}

/** The form differs from what is saved. */
export function draftDirty(draft: ChannelsDraft, saved: WebhooksView | undefined): boolean {
  const s = saved ?? NO_WEBHOOKS;
  return CHANNELS.some((k) => draft[k].on !== s[k].set || draft[k].url.trim() !== "");
}

/** The request part: a new URL, a clear, or nothing (keep). URLs are never sent back. */
export function channelsPayload(draft: ChannelsDraft, saved: WebhooksView | undefined): ChannelsInput {
  const s = saved ?? NO_WEBHOOKS;
  const out: ChannelsInput = {};
  for (const k of CHANNELS) {
    const d = draft[k];
    const key = k === "teams" ? "teams_webhook" : "slack_webhook";
    if (!d.on) {
      if (s[k].set) out[key] = { clear: true };
    } else if (d.url.trim()) {
      out[key] = { url: d.url.trim() };
    }
  }
  return out;
}

type TestState = { state: "idle" } | { state: "sending" } | { state: "sent" } | { state: "failed"; message: string };

/** How to make a Slack incoming webhook, as a short list. */
export function SlackHowTo() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-400">
      <li>
        Go to <span className="text-zinc-300">api.slack.com/apps</span> and create an app &ldquo;From scratch&rdquo; in your workspace
        (or open one your team already uses for Coderhelm).
      </li>
      <li>Open Incoming Webhooks and turn them on.</li>
      <li>Choose &ldquo;Add New Webhook&rdquo;, pick the channel, and allow it.</li>
      <li>Copy the webhook URL it shows (it starts with https://hooks.slack.com/services/).</li>
    </ol>
  );
}

function ChannelRow({
  idPrefix,
  kind,
  draft,
  saved,
  onChange,
  disabled,
  destination,
}: {
  idPrefix: string;
  kind: ChatChannel;
  draft: ChannelDraft;
  saved: WebhooksView;
  onChange: (d: ChannelDraft) => void;
  disabled?: boolean;
  destination: NotifyDestination;
}) {
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const [replacing, setReplacing] = useState(false);
  const label = CHANNEL_LABEL[kind];
  const id = `${idPrefix}-${kind}`;
  const url = draft.url.trim();
  const isSaved = saved[kind].set;
  const showInput = !isSaved || replacing || url !== "";
  const urlError = url !== "" && !VALID[kind](url);
  const canTest = draft.on && !disabled && (url ? VALID[kind](url) : isSaved) && test.state !== "sending";

  const send = async () => {
    setTest({ state: "sending" });
    try {
      const r = await api.testNotify({ ...destination, channel: kind, url: url || undefined });
      setTest(r.ok ? { state: "sent" } : { state: "failed", message: r.error ? `${label} refused it: ${r.error}` : `${label} refused the message.` });
    } catch {
      setTest({ state: "failed", message: `That is not a ${label} webhook address.` });
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3">
      <label className="inline-flex min-h-6 items-center gap-2 text-sm font-semibold text-zinc-100">
        <input
          type="checkbox"
          checked={draft.on}
          disabled={disabled}
          onChange={(e) => {
            onChange({ ...draft, on: e.target.checked });
            setTest({ state: "idle" });
          }}
          className={`h-4 w-4 accent-emerald-500 ${focusRing}`}
        />
        {label}
      </label>
      {draft.on && (
        <>
          {isSaved && !showInput && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
              <span className="min-w-0 wrap-anywhere">
                Saved webhook: <span className="font-mono text-xs text-zinc-300">{saved[kind].hint}</span>
              </span>
              <button type="button" onClick={() => setReplacing(true)} disabled={disabled} className={linkButton}>
                Replace
              </button>
            </p>
          )}
          {showInput && (
            <Field
              id={id}
              label={`${label} webhook address`}
              helper={isSaved ? "Leave empty to keep the saved webhook." : undefined}
              error={urlError ? URL_ERROR[kind] : undefined}
            >
              {(props) => (
                <input
                  {...props}
                  value={draft.url}
                  disabled={disabled}
                  onChange={(e) => {
                    onChange({ ...draft, url: e.target.value });
                    setTest({ state: "idle" });
                  }}
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={PLACEHOLDER[kind]}
                  className={`${inputClass} min-w-0 font-mono text-xs disabled:opacity-60`}
                />
              )}
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={send} disabled={!canTest} className={`${secondaryButton} shrink-0`}>
              {test.state === "sending" ? "Sending…" : "Send test message"}
            </button>
            <p aria-live="polite" className="min-w-0 text-sm">
              {test.state === "sent" && <span className="text-emerald-400">Test message sent. Check the channel.</span>}
              {test.state === "failed" && <span className="text-red-400">{test.message}</span>}
            </p>
          </div>
          <Disclosure summary={`How to get a ${label} webhook address`}>{kind === "teams" ? <TeamsHowTo /> : <SlackHowTo />}</Disclosure>
        </>
      )}
    </div>
  );
}

/**
 * "Where to post": Microsoft Teams, Slack or both. Saved webhooks show only
 * as a hint; a new address replaces one, unticking a channel removes it.
 */
export function ChannelPicker({
  idPrefix,
  legend = "Where to post",
  draft,
  saved,
  onChange,
  disabled,
  destination,
  only,
}: {
  idPrefix: string;
  legend?: string;
  draft: ChannelsDraft;
  saved: WebhooksView | undefined;
  onChange: (d: ChannelsDraft) => void;
  disabled?: boolean;
  /** Whose saved webhook "Send test message" uses when no new address is typed. */
  destination: NotifyDestination;
  /** Show only these channels; the others keep what is saved. */
  only?: ChatChannel[];
}) {
  const s = saved ?? NO_WEBHOOKS;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" data-testid={`${idPrefix}-channels`}>
      <legend className="mb-1.5 text-sm font-semibold text-zinc-100">{legend}</legend>
      {CHANNELS.filter((k) => !only || only.includes(k)).map((k) => (
        <ChannelRow
          key={k}
          idPrefix={idPrefix}
          kind={k}
          draft={draft[k]}
          saved={s}
          onChange={(d) => onChange({ ...draft, [k]: d })}
          disabled={disabled}
          destination={destination}
        />
      ))}
    </fieldset>
  );
}

/** "Teams", "Slack", "Teams and Slack" or "" for what a destination posts to. */
export function channelsSummary(w: WebhooksView | undefined): string {
  const on = CHANNELS.filter((k) => w?.[k]?.set).map((k) => (k === "teams" ? "Teams" : "Slack"));
  return on.join(" and ");
}
