"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, type DataSource } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { ActivitySummaryStrip } from "@/components/activity-summary";
import { ActivityFeed, feedFiltersFrom, type FeedFilters } from "@/components/data-source-activity";
import { ListSkeleton } from "@/components/list";
import { Page, PageHeader } from "@/components/page";
import { linkButton } from "@/components/ui";

export default function DataSourceActivityPageGuarded() {
  return (
    <RoleGuard need="data_sources">
      <Suspense fallback={<Page><PageHeader title="Every lookup, as it happens" /><div className="mt-8"><ListSkeleton rows={4} label="Loading lookups" /></div></Page>}>
        <DataSourceActivityPage />
      </Suspense>
    </RoleGuard>
  );
}

function DataSourceActivityPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramString = params.toString();
  // The feed's own filters lead and the address follows; only a change to
  // the address from outside (a summary link, back) starts the feed over.
  const [initial, setInitial] = useState(() => feedFiltersFrom(new URLSearchParams(paramString)));
  const written = useRef(new Set<string>());
  useEffect(() => {
    if (written.current.has(paramString)) return;
    written.current.clear();
    setInitial(feedFiltersFrom(new URLSearchParams(paramString)));
  }, [paramString]);

  useEffect(() => {
    api.listDataSources().then((r) => setSources(r.sources)).catch(() => setSources([]));
  }, []);

  // Keep the filters in the address, so a filtered view can be shared or reloaded.
  const keepInAddress = useCallback(
    (f: FeedFilters) => {
      const q = new URLSearchParams();
      if (f.source !== "all") q.set("source", f.source);
      if (f.who !== "all") q.set("who", f.who);
      if (f.outcome !== "all") q.set("outcome", f.outcome);
      if (f.range !== "all") q.set("range", f.range);
      if (f.q.trim()) q.set("q", f.q.trim());
      const s = q.toString();
      written.current.add(s);
      router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <Page>
      <PageHeader
        title="Activity"
        lead={
          <>
            Each time Coderhelm or a teammate looks something up in a connected source, it appears here: who asked, what they asked,
            for which pull request or run, and whether it worked. Only the lookup is kept, never what came back, for 180 days.
          </>
        }
      />
      <ActivitySummaryStrip />
      <ActivityFeed sources={sources} pageSize={100} initialFilters={initial} onFiltersChange={keepInAddress} />
      <p className="mt-6 text-xs text-zinc-500">
        Looking for skills and team agents? Their reads and asks are on the{" "}
        <Link href="/skills/?tab=activity" className={`${linkButton} text-xs`}>Skills activity</Link> tab.
      </p>
    </Page>
  );
}
