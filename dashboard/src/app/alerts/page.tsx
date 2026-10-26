"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { api, type AlertEvent } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { primaryButton, secondaryButton } from "@/components/ui";
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
import { KIND_LABEL, OUTCOMES, OUTCOME_GROUPS, humanize, outcomeDetail, outcomeLook } from "./outcome";

export default function AlertsHistoryGuarded() {
  return (
    <RoleGuard need="view_alerts">
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
        lead="Alerts from your monitoring tools, and what Coderhelm did with each one."
        actions={
          <Link href="/settings/alerts" className={secondaryButton}>
            Alert routes
          </Link>
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
          <ListEmpty
            title="No alerts yet"
            action={
              <Link href="/settings/alerts" className={primaryButton}>
                Set up alert routes
              </Link>
            }
          >
            When one of your monitoring tools sends an alert to Coderhelm, it shows up here with what Coderhelm did about it.
          </ListEmpty>
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
                  title={a.title || <span className="italic text-zinc-400">Alert with no title</span>}
                  titleText={a.title || undefined}
                  href={`/alerts/detail?id=${a.id}`}
                  meta={[a.kind ? KIND_LABEL[a.kind] ?? humanize(a.kind) : null, !repo ? a.repo || null : null]}
                  summary={outcomeDetail(a.outcome)}
                  chips={
                    <span title={look.hover}>
                      <StatusText look={look} />
                    </span>
                  }
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
