"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Page, PageHeader } from "@/components/page";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { formatDate } from "@/components/list/time";
import { Results } from "@/components/knowledge/builtin";
import { builtinBases, type SharedView } from "@/lib/builtin-bases";

// A shared search from one of the team's built-in bases. The link holds the
// search, never its results: opening it runs the search again as the person
// looking, so they see only what they may read themselves.

export default function SharedPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Shared />
    </Suspense>
  );
}

function Loading() {
  return (
    <Page narrow>
      <div className="space-y-3" aria-busy="true" aria-label="Loading the shared search">
        <Skeleton className="h-8 w-2/3 rounded" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </Page>
  );
}

function Shared() {
  const id = useSearchParams().get("id") || "";
  const [view, setView] = useState<SharedView | null>(null);
  const [error, setError] = useState(id ? "" : "This link is missing its id. Ask whoever shared it for the link again.");

  useEffect(() => {
    if (!id) return;
    let live = true;
    builtinBases
      .shared(id)
      .then((v) => live && setView(v))
      .catch((e) => live && setError(e instanceof Error ? e.message : "This link couldn't be opened."));
    return () => {
      live = false;
    };
  }, [id]);

  if (error) {
    return (
      <Page narrow testId="shared">
        <PageHeader title="Shared search" />
        <div className="mt-6">
          <Problem title="This link can't be opened" testId="shared-problem">
            {error}
          </Problem>
        </div>
      </Page>
    );
  }
  if (!view) return <Loading />;

  return (
    <Page narrow testId="shared">
      <PageHeader
        title={`“${view.query}” in ${view.base_name}`}
        lead={
          <p>
            Shared by {view.created_by}. The link works until {formatDate(view.expires_at)}. What you see is what you may read yourself, searched again now.
          </p>
        }
      />
      <div className="mt-6">
        {view.open ? (
          <Results found={{ results: view.results, withheld: view.withheld ?? { count: 0, by_base: {}, kinds_not_open_to_you: [], reason: "access" } }} />
        ) : (
          <Problem title="This was shared with you, but you can't open it" testId="shared-closed">
            {view.why ?? `${view.base_name} isn't open to you. Ask an admin for access.`}
          </Problem>
        )}
      </div>
    </Page>
  );
}
