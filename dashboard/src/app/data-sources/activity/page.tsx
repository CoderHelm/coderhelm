"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type DataSource } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { ActivityFeed } from "@/components/data-source-activity";
import { linkButton } from "@/components/ui";

export default function DataSourceActivityPageGuarded() {
  return <RoleGuard minRole="admin"><DataSourceActivityPage /></RoleGuard>;
}

function DataSourceActivityPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  useEffect(() => {
    api.listDataSources().then((r) => setSources(r.sources)).catch(() => setSources([]));
  }, []);
  return (
    <div className="max-w-4xl">
      <Link href="/data-sources" className={`${linkButton} text-sm`}>Back to data sources</Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-100 text-balance">Every lookup, as it happens</h1>
      <p className="mt-2 max-w-prose text-sm text-zinc-400">
        Each time Coderhelm or a teammate looks something up in a connected source, it appears here: who asked, what they asked,
        for which pull request, and whether it worked. Only the lookup is kept, never what came back, for 180 days.
      </p>
      <ActivityFeed sources={sources} pageSize={100} />
    </div>
  );
}
