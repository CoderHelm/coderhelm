"use client";

import { useCallback, useState } from "react";
import type { SupportAccess } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader, cardClass } from "@/components/page";
import { SupportAccessControl, SupportAccessLog } from "@/components/support-access";
import { StatusPill } from "@/components/status-pill";
import { ListSkeleton } from "@/components/list";

export default function SupportAccessPageGuarded() {
  return (
    <RoleGuard need="support">
      <SupportAccessPage />
    </RoleGuard>
  );
}

function SupportAccessPage() {
  const [access, setAccess] = useState<SupportAccess | null>(null);
  const onChange = useCallback((a: SupportAccess) => setAccess(a), []);
  return (
    <Page>
      <PageHeader
        title="Support access"
        lead="Let Coderhelm support see your workspace while they help you. It is off unless you turn it on, and it ends on its own."
      />
      <div className="mt-6 max-w-3xl space-y-6">
        <section aria-labelledby="sa-now" className={cardClass}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="sa-now" className="text-sm font-semibold text-zinc-100">
              Support access
            </h2>
            {access && (access.grant?.active ? <StatusPill tone="success">On</StatusPill> : <StatusPill>Off</StatusPill>)}
          </div>
          <SupportAccessControl onChange={onChange} />
        </section>
        <section aria-labelledby="sa-what" className={cardClass}>
          <h2 id="sa-what" className="mb-2 text-sm font-semibold text-zinc-100">
            What support can and cannot do
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
            <li>See your dashboard read only: runs, reviews, releases, plans, alerts and settings.</li>
            <li>Never change anything, start runs or reviews, merge, or send email. Every change is refused.</li>
            <li>Never see passwords, keys or connection secrets.</li>
            <li>Never sign in as anyone on your team. Support looks as Coderhelm support.</li>
            <li>Every page support reads is listed below, with who and when.</li>
          </ul>
        </section>
        <section aria-labelledby="sa-log">
          <h2 id="sa-log" className="mb-3 text-sm font-semibold text-zinc-100">
            Log
          </h2>
          {access ? <SupportAccessLog access={access} /> : <ListSkeleton rows={2} label="Loading the log" />}
        </section>
      </div>
    </Page>
  );
}
