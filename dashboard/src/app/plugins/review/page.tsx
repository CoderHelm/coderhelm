"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { DRAFT_STATUS, draftHref, pluginsApi, PluginError, type Draft } from "@/lib/plugins";
import { DraftStatusChip, PluginsGate } from "@/components/plugins";
import { Page, PageHeader } from "@/components/page";
import { List, ListEmpty, ListError, ListRow, ListSkeleton, ListToolbar, useListParams } from "@/components/list";

// The review queue: drafts plugins wrote that wait for a person. Approving
// binds to the exact version shown; editing a draft makes a new version
// that needs its own approval.

export default function ReviewPageGated() {
  return (
    <PluginsGate title="Review">
      <Suspense fallback={<Page><PageHeader title="Review" /><div className="mt-8"><ListSkeleton rows={3} label="Loading drafts" /></div></Page>}>
        <ReviewPage />
      </Suspense>
    </PluginsGate>
  );
}

function ReviewPage() {
  const [params, setParams] = useListParams({ status: "in_review" });
  const status = params.status === "all" ? "all" : "in_review";
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await pluginsApi.drafts(status);
      setDrafts(r.drafts);
      setError("");
    } catch (e) {
      setError(e instanceof PluginError || e instanceof Error ? e.message : "The request failed.");
      setDrafts((prev) => prev ?? []);
    }
  }, [status]);

  useEffect(() => {
    setDrafts(null);
    load();
  }, [load]);

  const list = drafts ?? [];
  return (
    <Page>
      <PageHeader
        title="Review"
        lead="Drafts your plugins wrote. Read one, edit it if needed, then approve it to go out now or at a time you pick. The person who asked for a draft can't approve it."
      />
      {error && (
        <div className="mt-6">
          <ListError title="We couldn't load the drafts" onRetry={load}>
            {error}
          </ListError>
        </div>
      )}
      <div className="mt-8">
        <ListToolbar
          className="mb-3"
          status={{
            label: "Show drafts",
            value: status,
            onChange: (v) => setParams({ status: v }),
            options: [
              { value: "in_review", label: "Waiting for review", tone: "waiting" },
              { value: "all", label: "All" },
            ],
          }}
        />
        {drafts === null ? (
          <ListSkeleton rows={3} label="Loading drafts" />
        ) : list.length === 0 ? (
          <ListEmpty title={status === "in_review" ? "Nothing waiting for review" : "No drafts yet"}>
            Drafts show up here when a plugin run writes them.
          </ListEmpty>
        ) : (
          <List label="Drafts">
            {list.map((d) => (
              <ListRow
                key={d.id}
                testId="draft-row"
                data={{ status: d.status }}
                status={{ tone: DRAFT_STATUS[d.status]?.tone ?? "neutral" }}
                title={d.title}
                href={draftHref(d.id)}
                meta={[d.plugin_name, d.kind, `version ${d.version}`, `asked by ${d.requested_by}`, d.publish_at ? `goes out ${new Date(d.publish_at).toLocaleString()}` : null]}
                chips={<DraftStatusChip status={d.status} />}
                time={d.versions[d.versions.length - 1]?.created_at}
              />
            ))}
          </List>
        )}
      </div>
    </Page>
  );
}
