"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { api, type AlertEvent } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { linkButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import {
  GROUP_LABEL,
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  LoadMore,
  StatusText,
  useListParams,
  usePagedList,
  useTeamRepos,
} from "@/components/list";
import { OUTCOMES, OUTCOME_GROUPS, outcomeLook } from "./outcome";

export default function AlertsHistoryGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<Page><PageHeader title="Alerts" /><div className="mt-6"><ListSkeleton /></div></Page>}>
        <AlertsHistory />
      </Suspense>
    </RoleGuard>
  );
}

function alertMatches(a: AlertEvent, q: string): boolean {
  if (!q) return true;
  const hay = [a.title, a.ticket_id, a.repo, outcomeLook(a.outcome).label].filter(Boolean).join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

function AlertsHistory() {
  const [params, setParams] = useListParams({ q: "", outcome: "all", repo: "" });
  const q = params.q.trim();
  const repo = params.repo;
  const group = OUTCOME_GROUPS.some((g) => g.value === params.outcome) ? params.outcome : "all";
  const teamRepos = useTeamRepos();

  const { items: alerts, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<AlertEvent>(
    (after) => api.listAlerts(after).then((r) => ({ items: r.alerts, next: r.next })),
    [],
  );

  // Search and repo first, so each toggle's count says what it would show.
  const matched = useMemo(() => alerts.filter((a) => alertMatches(a, q) && (!repo || a.repo === repo)), [alerts, q, repo]);
  const shown = group === "all" ? matched : matched.filter((a) => OUTCOMES[a.outcome]?.group === group);
  const filtered = !!(q || repo || group !== "all");
  const clear = () => setParams({ q: "", outcome: "all", repo: "" });

  return (
    <Page>
      <PageHeader
        title="Alerts"
        lead={
          <>
            Every alert Coderhelm received on your alert routes and what it did with it. Open one to share its link.{" "}
            <Link href="/settings/alerts" className={linkButton}>
              Alert routes
            </Link>
          </>
        }
      />

      {!loading && !error && alerts.length > 0 && (
        <ListToolbar
          className="mt-6 mb-4"
          search={{
            value: params.q,
            onChange: (v) => setParams({ q: v }, { replace: true }),
            placeholder: "Search by alert, ticket or repo",
            label: "Search alerts",
          }}
          status={{
            label: "Show alerts",
            value: group,
            onChange: (v) => setParams({ outcome: v }),
            options: [
              { value: "all", label: GROUP_LABEL.all, count: matched.length },
              ...OUTCOME_GROUPS.map((g) => ({
                value: g.value,
                label: g.label,
                tone: g.tone,
                count: matched.filter((a) => OUTCOMES[a.outcome]?.group === g.value).length,
              })),
            ],
          }}
          repo={{ value: repo, onChange: (v) => setParams({ repo: v }), repos: teamRepos }}
          onClear={filtered ? clear : undefined}
        />
      )}

      <div className={alerts.length > 0 && !loading && !error ? "" : "mt-6"}>
        {loading ? (
          <ListSkeleton label="Loading alerts" />
        ) : error ? (
          <ListError title="We couldn't load your alerts" onRetry={reload} />
        ) : alerts.length === 0 ? (
          <ListEmpty title="No alerts yet">Alerts appear here once a topic mapped in Alert routes publishes one.</ListEmpty>
        ) : shown.length === 0 ? (
          <ListEmpty title={q ? `No alerts match “${q}”` : "No alerts here"} onClear={clear}>
            {next ? "Only the alerts loaded so far were searched. Load more to search older ones." : undefined}
          </ListEmpty>
        ) : (
          <List label="Alerts">
            {shown.map((a) => {
              const look = outcomeLook(a.outcome);
              return (
                <ListRow
                  key={a.id}
                  testId="alert-row"
                  data={{ outcome: a.outcome }}
                  status={look}
                  title={a.title || "(untitled alert)"}
                  titleText={a.title || undefined}
                  href={`/alerts/detail?id=${a.id}`}
                  meta={[a.ticket_id || null, !repo ? a.repo || null : null]}
                  chips={<StatusText look={look} />}
                  time={a.received_at}
                />
              );
            })}
          </List>
        )}
        {!loading && !error && <LoadMore hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />}
      </div>
    </Page>
  );
}
