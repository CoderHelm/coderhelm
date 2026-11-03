"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/skeleton";
import { ChevronRightIcon, CloudIcon } from "@/components/icons";
import { focusRing, secondaryButton } from "@/components/ui";
import { SETTINGS_GROUPS, offered, type SettingsItem } from "@/components/settings-items";
import { isSelfHosted } from "@/lib/runtime-config";
import { ROLE_LABEL, whoCan, type Role } from "@/lib/roles";
import { builtInRoleFor, can } from "@/lib/capabilities";
import { useSettingsStatus, type ItemStatus, type Me } from "./use-settings-status";
import { Page, PageHeader, SectionHeading } from "@/components/page";

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState(false);
  const status = useSettingsStatus(me);

  useEffect(() => {
    api.me().then(setMe).catch(() => setLoadError(true));
  }, []);

  const groups = me
    ? SETTINGS_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.navUnder && can(me, i.view) && offered(i, isSelfHosted(), me.platform_admin === true)) })).filter((g) => g.items.length > 0)
    : [];
  const roleLabel = me ? (me.custom_role?.name ?? ROLE_LABEL[me.role as Role] ?? me.role) : null;
  const anyReadOnly = groups.some((g) => g.items.some((i) => !can(me, i.edit)));
  const attention = groups
    .flatMap((g) => g.items)
    .flatMap((item) => {
      const s = item.status ? status[item.status] : undefined;
      return s && (s.tone === "warning" || s.tone === "error") ? [{ item, s }] : [];
    });

  return (
    <Page>
      <div className="mb-8">
        <PageHeader
          title="Settings"
          lead={
            <>
              <p>Everything Coderhelm does for your team, and the settings that are just yours.</p>
              {roleLabel && (
                <p className="mt-2 text-sm text-zinc-400">
                  Your role: <span className="font-medium text-zinc-200">{roleLabel}</span>.
                  {anyReadOnly && " Pages marked View only show the current setup; ask someone with a higher role to change them."}
                </p>
              )}
            </>
          }
        />
      </div>

      {loadError && (
        <Callout variant="error" title="Could not load your settings">
          <p>Check your connection, then reload the page.</p>
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

      {attention.length > 0 && (
        <section aria-labelledby="settings-attention" className="mb-10" data-testid="settings-attention">
          <SectionHeading id="settings-attention" className="mb-3">
            Needs attention
          </SectionHeading>
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-amber-900/60 bg-amber-950/10">
            {attention.map(({ item, s }) => (
              <li key={item.href}>
                <SettingsRow item={item} readOnly={!can(me, item.edit)} status={s} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`settings-group-${group.id}`}>
            <SectionHeading id={`settings-group-${group.id}`} className="mb-2">
              {group.label}
            </SectionHeading>
            <ul className="divide-y divide-zinc-800/80 overflow-hidden rounded-lg border border-zinc-800">
              {group.items.map((item) => (
                <li key={item.href} className="min-w-0">
                  <SettingsRow item={item} readOnly={!can(me, item.edit)} status={item.status ? status[item.status] : undefined} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {me && !isSelfHosted() && <MoveToSelfHost />}

    </Page>
  );
}

function SettingsRow({ item, readOnly, status }: { item: SettingsItem; readOnly: boolean; status?: ItemStatus }) {
  return (
    <Link
      href={item.href}
      className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-900/70 motion-reduce:transition-none ${focusRing}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-zinc-400" aria-hidden="true">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="text-sm font-medium text-zinc-100">{item.title}</span>
          {readOnly && (
            <span title={`Only ${whoCan(builtInRoleFor(item.edit))}, or a role that includes it, can change this`}>
              <StatusPill>View only</StatusPill>
            </span>
          )}
        </span>
        <span className="block text-sm text-zinc-400">{item.description}</span>
        {status && (
          <span className="mt-1.5 flex sm:hidden">
            <span title={status.title} className="min-w-0 max-w-full"><StatusPill tone={status.tone}>{status.text}</StatusPill></span>
          </span>
        )}
      </span>
      {status && (
        <span title={status.title} className="hidden max-w-[45%] shrink-0 sm:flex"><StatusPill tone={status.tone}>{status.text}</StatusPill></span>
      )}
      <span className="shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-200 motion-reduce:transition-none" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </Link>
  );
}

/**
 * Hosted only: moving the team to its own AWS account starts as a support
 * ticket. A person helps plan the move and bring settings and data over.
 */
function MoveToSelfHost() {
  return (
    <section aria-labelledby="move-to-selfhost" className="mt-10" data-testid="move-to-selfhost">
      <SectionHeading id="move-to-selfhost" className="mb-3">
        Hosting
      </SectionHeading>
      <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-4 lg:max-w-[calc(50%-0.375rem)]">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300" aria-hidden="true">
          <CloudIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">Move to your own AWS account</p>
          <p className="mt-0.5 text-sm text-zinc-400">Run Coderhelm in your own AWS account. We&apos;ll help you plan the move and bring your settings and data over.</p>
          <Link href="/support?new=1&type=selfhost" className={`${secondaryButton} mt-3`}>
            Talk to us about moving
          </Link>
        </div>
      </div>
    </section>
  );
}
