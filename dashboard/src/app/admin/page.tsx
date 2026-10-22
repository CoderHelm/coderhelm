"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, type AdminTeam } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";
import { focusRing, inputClass, primaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import { List, ListEmpty, ListError, ListRow, ListSkeleton, ListToolbar, useListParams } from "@/components/list";

const fmtInt = (n: number) => n.toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SORTS = [
  { value: "busy", label: "Busiest this month" },
  { value: "total", label: "Most runs all time" },
  { value: "new", label: "Newest" },
  { value: "name", label: "Name" },
];

function sortTeams(teams: AdminTeam[], sort: string): AdminTeam[] {
  const out = [...teams];
  if (sort === "total") out.sort((a, b) => b.runs_total - a.runs_total);
  else if (sort === "new") out.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  else if (sort === "name") out.sort((a, b) => (a.name || a.team_id).localeCompare(b.name || b.team_id));
  else out.sort((a, b) => b.runs_month - a.runs_month || b.cost_month_usd - a.cost_month_usd);
  return out;
}

function words(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/** The allowlist gets its own search once it is this long. */
const ALLOWLIST_SEARCH_AT = 6;

export default function AdminPageWithParams() {
  return (
    <Suspense fallback={<Page><ListSkeleton rows={3} /></Page>}>
      <AdminPage />
    </Suspense>
  );
}

function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [allowEmail, setAllowEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [month, setMonth] = useState("");
  const [loadError, setLoadError] = useState("");
  const { toast } = useToast();
  const { confirm } = useConfirm();
  // Team search, status and sort, and the allowlist search, live in the address.
  const [params, setParams] = useListParams({ q: "", status: "all", sort: "busy", aq: "" });
  const teamStatus = params.status === "active" || params.status === "other" ? params.status : "all";
  const searched = useMemo(() => {
    const w = words(params.q);
    return teams.filter((t) => {
      const hay = `${t.name} ${t.team_id}`.toLowerCase();
      return w.every((x) => hay.includes(x));
    });
  }, [teams, params.q]);
  const activeCount = searched.filter((t) => t.status === "active").length;
  const shownTeams = sortTeams(
    searched.filter((t) => teamStatus === "all" || (teamStatus === "active") === (t.status === "active")),
    params.sort,
  );
  const teamsFiltered = !!(params.q || teamStatus !== "all");
  const aWords = words(params.aq);
  const shownEmails = allowlist.filter((e) => aWords.every((x) => e.toLowerCase().includes(x)));

  const loadList = useCallback(() => {
    setListLoading(true);
    setListError("");
    api
      .listAllowlist()
      .then((r) => setAllowlist(r.emails))
      .catch((e: unknown) => setListError(e instanceof Error ? e.message : "The request failed."))
      .finally(() => setListLoading(false));
  }, []);

  // The server decides who is a platform admin: anyone else gets a 403.
  useEffect(() => {
    api
      .adminTeams()
      .then((r) => {
        setTeams(r.teams);
        setMonth(r.month);
        setAuthorized(true);
        loadList();
      })
      .catch((e: unknown) => {
        // 401/403: not a platform admin. Anything else is a real failure to show.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return;
        setLoadError(e instanceof Error ? e.message : "The request failed.");
      })
      .finally(() => setLoading(false));
  }, [loadList]);

  if (loading) {
    return (
      <Page className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <ListSkeleton rows={4} label="Loading the admin page" />
      </Page>
    );
  }

  if (!authorized && loadError) {
    return (
      <Page>
        <ListError title="Couldn't load the admin page" onRetry={() => window.location.reload()}>
          {loadError}
        </ListError>
      </Page>
    );
  }

  if (!authorized) {
    return (
      <Page>
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
          <svg aria-hidden="true" className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Access denied</h1>
        <p className="text-sm text-zinc-500">This page is only for Coderhelm platform administrators.</p>
      </div>
      </Page>
    );
  }

  const handleAdd = () => {
    const value = allowEmail.trim();
    if (!value) return;
    setAdding(true);
    api
      .addToAllowlist(value)
      .then((r) => {
        // The server stores the address in lower case; show what it stored, once.
        const stored = r?.email || value.toLowerCase();
        setAllowlist((prev) => (prev.includes(stored) ? prev : [...prev, stored]));
        setAllowEmail("");
        toast(`Added ${stored}`);
      })
      .catch((e: unknown) => toast(e instanceof Error ? `Could not add: ${e.message}` : "Could not add", "error"))
      .finally(() => setAdding(false));
  };

  const handleRemove = async (email: string) => {
    const ok = await confirm({
      title: "Remove from the allowlist?",
      message: `${email} will no longer be able to create an account. Existing accounts keep working.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setRemoving(email);
    api
      .removeFromAllowlist(email)
      .then(() => {
        setAllowlist((prev) => prev.filter((x) => x !== email));
        toast(`Removed ${email}`);
      })
      .catch((e: unknown) => toast(e instanceof Error ? `Could not remove: ${e.message}` : "Could not remove", "error"))
      .finally(() => setRemoving(null));
  };

  return (
    <Page>
      <PageHeader
        title="Platform admin"
        lead="Internal tools for managing the Coderhelm platform."
        actions={
          <Link href="/admin/tickets" className={primaryButton}>
            Support queue
          </Link>
        }
      />
      <section aria-labelledby="teams-heading" className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 id="teams-heading" className="text-base font-semibold text-zinc-100 mb-1">Teams ({teams.length})</h2>
        <p className="text-sm text-zinc-500 mb-4">Runs all time and in {month || "this month"}, with this month&apos;s model cost.</p>
        <ListToolbar
          className="mb-4"
          search={{
            value: params.q,
            onChange: (v) => setParams({ q: v }, { replace: true }),
            placeholder: "Search by team name or id",
            label: "Search teams",
          }}
          status={{
            label: "Show teams",
            value: teamStatus,
            onChange: (v) => setParams({ status: v }),
            options: [
              { value: "all", label: "All", count: searched.length },
              { value: "active", label: "Active", count: activeCount, tone: "success" },
              { value: "other", label: "Other", count: searched.length - activeCount, tone: "muted" },
            ],
          }}
          sort={{ value: params.sort, onChange: (v) => setParams({ sort: v }), options: SORTS }}
          onClear={teamsFiltered ? () => setParams({ q: "", status: "all" }) : undefined}
        />
        {shownTeams.length === 0 ? (
          <ListEmpty
            title={teams.length === 0 ? "No teams yet" : "No teams match"}
            onClear={teamsFiltered ? () => setParams({ q: "", status: "all" }) : undefined}
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid="admin-teams">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th scope="col" className="py-2 pr-3 font-medium">Team</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Runs this month</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Runs all time</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Reviews this month</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Cost this month</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Members</th>
                <th scope="col" className="py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {shownTeams.map((t) => (
                <tr key={t.team_id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="block text-zinc-100">{t.name || "(no name)"}</span>
                    <span className="block font-mono text-[11px] text-zinc-500">{t.team_id}</span>
                    {t.status !== "active" && <span className="text-xs text-amber-300">{t.status}</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-100">{fmtInt(t.runs_month)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(t.runs_total)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(t.reviews_month)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtUsd(t.cost_month_usd)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(t.members)}</td>
                  <td className="py-2 text-zinc-400">{t.created_at ? new Date(t.created_at).toLocaleDateString() : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
      <section aria-labelledby="allowlist-heading" className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 id="allowlist-heading" className="text-base font-semibold text-zinc-100 mb-1">Signup allowlist</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Only these emails can create accounts. Use <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">*@domain.com</code> to allow a whole domain.
        </p>

        <form
          className="flex flex-col gap-2 mb-4 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <label htmlFor="allow-email" className="sr-only">Email or domain to allow</label>
          <input
            id="allow-email"
            type="text"
            autoComplete="off"
            placeholder="user@example.com or *@company.com"
            value={allowEmail}
            onChange={(e) => setAllowEmail(e.target.value)}
            className={`${inputClass} sm:flex-1`}
          />
          <button type="submit" disabled={adding || !allowEmail.trim()} className={primaryButton}>
            {adding ? "Adding..." : "Add"}
          </button>
        </form>

        {allowlist.length >= ALLOWLIST_SEARCH_AT && !listError && (
          <ListToolbar
            className="mb-3"
            search={{
              value: params.aq,
              onChange: (v) => setParams({ aq: v }, { replace: true }),
              placeholder: "Find an allowed email or domain",
              label: "Search allowed emails",
            }}
          />
        )}
        {listError ? (
          <ListError title="Couldn't load the allowlist" onRetry={loadList}>
            {listError}
          </ListError>
        ) : listLoading ? (
          <ListSkeleton rows={2} label="Loading the allowlist" />
        ) : allowlist.length === 0 ? (
          <p className="text-sm text-zinc-500">No allowed emails yet, so nobody can sign up.</p>
        ) : shownEmails.length === 0 ? (
          <ListEmpty title="No allowed email matches" onClear={() => setParams({ aq: "" })} />
        ) : (
          <List label="Allowed emails">
            {shownEmails.map((email) => (
              <ListRow
                key={email}
                title={email}
                actions={
                  <button
                    type="button"
                    onClick={() => void handleRemove(email)}
                    disabled={removing === email}
                    aria-label={`Remove ${email}`}
                    className={`shrink-0 rounded text-xs text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50 ${focusRing}`}
                  >
                    {removing === email ? "Removing..." : "Remove"}
                  </button>
                }
              />
            ))}
          </List>
        )}
      </section>
    </Page>
  );
}
