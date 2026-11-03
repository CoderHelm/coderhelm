"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type EmailSender, type EmailTransport } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { inputClass, secondaryButton } from "@/components/ui";
import { SaveBar, SettingsRow, SettingsSection, useDirtyForm } from "@/components/settings";

type Values = { sender_name: string; organization: string };
const EMPTY: Values = { sender_name: "", organization: "" };

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const length = (s: string) => [...tidy(s)].length;

// Line breaks and other control characters, and the invisible ones that turn
// text around; quotes and angle brackets would break the From header. The
// server refuses the same.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;
const HEADER = /["\\<>]/;
const AWS = /cloudfront\.net|amazonaws\.com|awsapps\.com/i;

/** Why a sender name can't be saved, or null. */
export function senderNameProblem(v: string, max: number): string | null {
  if (CONTROL.test(v)) return "Use one line, without control characters.";
  if (HEADER.test(v)) return "Leave out quotes, backslashes and angle brackets.";
  if (length(v) > max) return `Use at most ${max} characters.`;
  if (AWS.test(v)) return "Use a name, not an AWS address.";
  return null;
}

/** Why an organization name can't be saved, as far as the page can tell (the server checks the rest). */
function organizationProblem(v: string, max: number): string | null {
  if (CONTROL.test(v)) return "Use one line, without control characters.";
  if (length(v) > max) return `Use at most ${max} characters.`;
  if (v.trim() && !/^[\p{L}\p{N} .&'-]+$/u.test(v.trim())) return "Use letters, digits, spaces and - . & ' only.";
  return null;
}

/** A name with the product name dropped from its end: "Acme" for "Acme <suffix>". */
function withoutSuffix(name: string, suffix: string): string {
  const t = tidy(name);
  const lower = t.toLowerCase();
  const s = suffix.toLowerCase();
  if (lower === s) return "";
  return lower.endsWith(` ${s}`) ? t.slice(0, -(s.length + 1)).trim() : t;
}

/**
 * How the From name and a subject read. Saved values come from the server,
 * which applies every rule; while editing, the page works them out the same
 * way and the server has the last word on save.
 */
function readNames(d: EmailSender, v: Values, editing: boolean) {
  if (!editing) {
    return {
      ses: { name: d.ses.display_name, prefix: d.ses.subject_prefix },
      relay: { name: d.relay.display_name, prefix: d.relay.subject_prefix },
    };
  }
  const name = tidy(v.sender_name);
  const org = tidy(v.organization);
  const label = org || withoutSuffix(name, d.suffix);
  return {
    ses: {
      name: name || (org ? `${org} ${d.suffix}` : d.fallback.ses_display_name),
      prefix: label ? `${label} ${d.suffix}: ` : d.fallback.ses_subject_prefix,
    },
    relay: {
      name: label ? `${label} ${d.suffix}` : d.fallback.relay_display_name,
      prefix: label ? `${label} ${d.suffix}: ` : d.fallback.relay_subject_prefix,
    },
  };
}

const SAMPLE_SUBJECT = "update to v0.9.0 needs your OK";

/**
 * Settings, Emails, Sender name: who the install's email says it is from,
 * with a preview of the From line and a subject for the way it sends now.
 */
export function SenderName({ transport }: { transport: EmailTransport }) {
  const { toast } = useToast();
  const [data, setData] = useState<EmailSender | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const form = useDirtyForm<Values>(EMPTY, { disabled: !data });
  const { reset } = form;

  const load = useCallback(() => {
    setFailed(false);
    api
      .getEmailSender()
      .then((d) => {
        setData(d);
        reset({ sender_name: d.sender_name, organization: d.organization });
      })
      .catch(() => setFailed(true));
  }, [reset]);
  // Again when the way email leaves changes: the relay's name comes with it.
  useEffect(load, [load, transport]);

  const section = (children: ReactNode) => (
    <SettingsSection
      id="sender"
      title="Sender name"
      description="Who your install's email says it is from. Empty fields use the names in this install's config."
    >
      {children}
    </SettingsSection>
  );

  if (failed) {
    return section(
      <div className="px-4 py-4">
        <Callout variant="error" title="Couldn't load the sender name">
          <button type="button" onClick={load} className={`mt-2 ${secondaryButton}`}>Try again</button>
        </Callout>
      </div>,
    );
  }
  if (!data) {
    return section(
      <div className="px-4 py-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-24 w-full" />
      </div>,
    );
  }

  const v = form.values;
  const nameProblem = senderNameProblem(v.sender_name, data.max.sender_name);
  const orgProblem = organizationProblem(v.organization, data.max.organization);
  const relay = transport === "coderhelm";
  const names = readNames(data, v, form.dirty);
  const shown = relay ? names.relay : names.ses;
  const address = relay ? data.relay.from_address : data.ses.from_address;

  const save = async () => {
    if (nameProblem || orgProblem) {
      setProblem(nameProblem ?? orgProblem);
      return;
    }
    setSaving(true);
    setProblem(null);
    const change: Partial<Values> = {};
    for (const k of form.dirtyKeys) change[k] = tidy(v[k]);
    try {
      const next = await api.setEmailSender(change);
      setData(next);
      reset({ sender_name: next.sender_name, organization: next.organization });
      toast("Saved", "success");
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : "Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="sender-name">
      {section(
        <>
          <SettingsRow
            label="Sender name"
            help="The whole From name on email sent through your own Amazon SES, as you type it."
            unsaved={form.isDirty("sender_name")}
            controlClassName="sm:w-80"
            testId="sender-name-field"
            control={(ids) => (
              <>
                <input
                  id={ids.inputId}
                  aria-describedby={[ids.helpId, nameProblem ? `${ids.inputId}-error` : ""].filter(Boolean).join(" ") || undefined}
                  aria-invalid={nameProblem ? true : undefined}
                  className={inputClass}
                  value={v.sender_name}
                  placeholder={data.fallback.ses_display_name}
                  disabled={saving}
                  onChange={(e) => form.set("sender_name", e.target.value)}
                />
                {nameProblem && (
                  <p id={`${ids.inputId}-error`} role="alert" className="mt-1.5 text-sm text-red-300">{nameProblem}</p>
                )}
              </>
            )}
          />
          <SettingsRow
            label="Organization name"
            help="Names your install on email sent through Coderhelm and starts its subjects. Left empty, the sender name is used."
            unsaved={form.isDirty("organization")}
            controlClassName="sm:w-80"
            testId="sender-organization-field"
            control={(ids) => (
              <>
                <input
                  id={ids.inputId}
                  aria-describedby={[ids.helpId, orgProblem ? `${ids.inputId}-error` : ""].filter(Boolean).join(" ") || undefined}
                  aria-invalid={orgProblem ? true : undefined}
                  className={inputClass}
                  value={v.organization}
                  placeholder="Acme"
                  disabled={saving}
                  onChange={(e) => form.set("organization", e.target.value)}
                />
                {orgProblem && (
                  <p id={`${ids.inputId}-error`} role="alert" className="mt-1.5 text-sm text-red-300">{orgProblem}</p>
                )}
              </>
            )}
          />
          <div className="min-w-0 px-4 py-4" data-testid="sender-preview">
            <p className="text-sm font-medium text-zinc-100">
              Preview{relay ? ", through Coderhelm" : ", through your own Amazon SES"}
            </p>
            <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
              <dt className="text-zinc-400">From</dt>
              <dd className="min-w-0 wrap-anywhere text-zinc-100" data-testid="sender-preview-from">
                {shown.name}
                {address ? <span className="text-zinc-400"> &lt;{address}&gt;</span> : null}
              </dd>
              <dt className="text-zinc-400">Subject</dt>
              <dd className="min-w-0 wrap-anywhere text-zinc-100" data-testid="sender-preview-subject">
                {shown.prefix}
                {SAMPLE_SUBJECT}
              </dd>
            </dl>
            {relay ? (
              <p className="mt-2 max-w-prose text-sm text-zinc-400" data-testid="sender-relay-note">
                Through Coderhelm the name always ends in &ldquo;{data.suffix}&rdquo;, so people can tell Coderhelm&apos;s mail service sent it for your install. Coderhelm checks the organization name on every email, and one that reads as Coderhelm&apos;s own mail (Support, Billing, Security and similar) is refused.
                {!form.dirty && !data.relay.organization_used && (data.organization || data.sender_name)
                  ? " The name you set isn't one Coderhelm uses, so your install's address names it."
                  : ""}
              </p>
            ) : (
              <p className="mt-2 max-w-prose text-sm text-zinc-400">
                Update notices start their subject like this; other emails keep their usual subjects.
              </p>
            )}
          </div>
        </>,
      )}
      <SaveBar
        count={form.count}
        onSave={save}
        onDiscard={() => {
          form.discard();
          setProblem(null);
        }}
        saving={saving}
        problem={problem}
        context="the sender name"
        testId="sender-save-bar"
      />
    </div>
  );
}
