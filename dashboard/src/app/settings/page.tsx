"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/skeleton";
import { ChevronRightIcon } from "@/components/icons";
import { dangerButton, focusRing, inputClass, secondaryButton } from "@/components/ui";
import { Modal, modalActions } from "@/components/modal";
import { SETTINGS_GROUPS, type SettingsItem } from "@/components/settings-items";
import { isSelfHosted } from "@/lib/runtime-config";
import { ROLE_LABEL, whoCan, type Role } from "@/lib/roles";
import { builtInRoleFor, can } from "@/lib/capabilities";
import { useSettingsStatus, type ItemStatus, type Me } from "./use-settings-status";
import { Page, PageHeader } from "@/components/page";

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState(false);
  const status = useSettingsStatus(me);

  useEffect(() => {
    api.me().then(setMe).catch(() => setLoadError(true));
  }, []);

  const groups = me
    ? SETTINGS_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can(me, i.view) && (!i.selfHostOnly || (isSelfHosted() && me.platform_admin === true))) })).filter((g) => g.items.length > 0)
    : [];
  const roleLabel = me ? (me.custom_role?.name ?? ROLE_LABEL[me.role as Role] ?? me.role) : null;

  return (
    <Page>
      <div className="mb-8">
        <PageHeader
          title="Settings"
          lead={
            <>
              <p>How Coderhelm works for your team, and the settings that are just yours.</p>
              {roleLabel && (
                <p className="text-xs text-zinc-500 mt-3">
                  Your role: <span className="text-zinc-300 font-medium">{roleLabel}</span>. Pages marked View only show the
                  current setup; ask someone with a higher role to change them.
                </p>
              )}
            </>
          }
        />
      </div>

      {loadError && (
        <Callout variant="error" title="Could not load your settings">
          <p>Reload the page to try again.</p>
        </Callout>
      )}

      {!me && !loadError && (
        <div className="space-y-8" aria-busy="true" aria-label="Loading settings">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-32 mb-3" />
              <Skeleton className="h-36 w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`settings-group-${group.id}`}>
            <h2 id={`settings-group-${group.id}`} className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
              {group.label}
            </h2>
            <ul className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800 overflow-hidden">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SettingsRow item={item} readOnly={!can(me, item.edit)} status={item.status ? status[item.status] : undefined} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {me && can(me, "reset") && <DangerZone />}
    </Page>
  );
}

function SettingsRow({ item, readOnly, status }: { item: SettingsItem; readOnly: boolean; status?: ItemStatus }) {
  return (
    <Link
      href={item.href}
      className={`group flex items-start gap-3 sm:gap-4 px-4 py-4 hover:bg-zinc-800/40 transition-colors motion-reduce:transition-none ${focusRing} focus-visible:-outline-offset-2`}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300" aria-hidden="true">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-zinc-100">{item.title}</span>
          {readOnly && (
            <span title={`Only ${whoCan(builtInRoleFor(item.edit))}, or a role that includes it, can change this`}>
              <StatusPill>View only</StatusPill>
            </span>
          )}
        </span>
        <span className="block text-sm text-zinc-400 mt-0.5">{item.description}</span>
        {status && (
          <span className="mt-2 flex">
            <span title={status.title}><StatusPill tone={status.tone}>{status.text}</StatusPill></span>
          </span>
        )}
      </span>
      <span className="mt-2 shrink-0 text-zinc-600 group-hover:text-zinc-300 transition-colors motion-reduce:transition-none" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </Link>
  );
}

function DangerZone() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();

  const handleReset = async () => {
    if (confirmText !== "DELETE") return;
    setResetting(true);
    try {
      await api.resetAccount();
      setOpen(false);
      toast("All data has been cleared. Refreshing...");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast("Failed to reset account", "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <section aria-labelledby="danger-zone" className="mt-12 rounded-lg border border-red-500/20 p-5">
      <h2 id="danger-zone" className="text-sm font-semibold text-red-400 mb-1">Danger zone</h2>
      <p className="text-sm text-zinc-400 mb-4">
        Delete every run, plan, repository, setting and Jira connection for this team. Your sign in stays; everything else is gone for good.
      </p>
      <button
        type="button"
        onClick={() => { setOpen(true); setConfirmText(""); }}
        className={`${secondaryButton} !bg-red-500/10 !border-red-500/30 !text-red-400 hover:!bg-red-500/20`}
      >
        Reset all data
      </button>

      <Modal
        open={open}
        onOpenChange={(v) => !resetting && setOpen(v)}
        title="Reset all data"
        description="This permanently deletes runs, plans, repositories, settings and the Jira connection. It cannot be undone."
        testId="reset-dialog"
        initialFocus="#reset-confirm"
        onSubmit={(e) => {
          e.preventDefault();
          handleReset();
        }}
        footer={
          <div className={modalActions}>
            <button type="button" onClick={() => setOpen(false)} disabled={resetting} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" disabled={confirmText !== "DELETE" || resetting} className={dangerButton}>
              {resetting ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        }
      >
        <label htmlFor="reset-confirm" className="mb-1.5 block text-sm text-zinc-400">
          Type <span className="font-mono font-semibold text-red-400">DELETE</span> to confirm
        </label>
        <input
          id="reset-confirm"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          className={inputClass}
        />
      </Modal>
    </section>
  );
}
