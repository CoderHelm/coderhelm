"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type Repo } from "@/lib/api";
import type { Approval, ApprovalCan, PolicyView } from "@/lib/agent-policy";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Problem } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";
import { Tabs } from "@/components/tabs";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { ApprovalCard } from "@/components/agent-approval";
import { AgentSwitches, AutonomyAndPresets, PauseBanner, RecentDecisions, RulesTable, SandboxSettings, TestCall, type Undo } from "./sections";

type Tab = "approvals" | "agents" | "advanced";
const TABS: { value: Tab; label: string }[] = [
  { value: "approvals", label: "Approvals" },
  { value: "agents", label: "Agents" },
  { value: "advanced", label: "Advanced" },
];

// Agent permissions: which agents run, what they may do without asking,
// what waits for a person, and the answers waiting now. Everyone on the team
// can see it and test a call; editing needs "agents.permissions" and
// answering a card needs "agents.approve". The gateway checks the same.

export default function AgentPermissionsPage() {
  return (
    <RoleGuard need="view">
      <Suspense fallback={<Page><Skeleton className="h-40" /></Page>}>
        <AgentPermissions />
      </Suspense>
    </RoleGuard>
  );
}

function AgentPermissions() {
  const [view, setView] = useState<PolicyView | null>(null);
  const [failed, setFailed] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [approvalCan, setApprovalCan] = useState<ApprovalCan>({ approve: false, always: false });
  const [reload, setReload] = useState(0);
  const { toast } = useToast();
  const params = useSearchParams();
  const focusId = params.get("approval") ?? "";
  const asked = params.get("tab");
  // A link to one approval opens the Approvals tab.
  const tab: Tab = asked === "agents" || asked === "advanced" ? asked : "approvals";
  const viewRef = useRef<PolicyView | null>(null);
  viewRef.current = view;

  const loadPolicy = useCallback(() => {
    setFailed("");
    api
      .getAgentPolicy()
      .then(setView)
      .catch((e) => setFailed(e instanceof Error ? e.message || " " : " "));
  }, []);

  useEffect(() => {
    loadPolicy();
    api.listRepos().then((r) => setRepos(r.repos.filter((x) => x.enabled))).catch(() => {});
  }, [loadPolicy]);

  const loadApprovals = useCallback(() => {
    api
      .listApprovals({ status: "pending" })
      .then((r) => {
        setApprovals(Array.isArray(r?.approvals) ? r.approvals : []);
        if (r?.can) setApprovalCan(r.can);
      })
      .catch(() => {});
  }, []);
  useEffect(loadApprovals, [loadApprovals, reload]);

  // A card opened from Slack, Teams or email that's no longer pending still shows.
  useEffect(() => {
    if (!focusId || approvals.some((a) => a.id === focusId)) return;
    api
      .getApproval(focusId)
      .then((r) => setApprovals((prev) => (prev.some((a) => a.id === r.approval.id) ? prev : [r.approval, ...prev])))
      .catch(() => {});
  }, [focusId, approvals]);

  /**
   * Runs a change and shows the policy it returns, or says why it failed.
   * A change that can be taken back passes `undo`, which runs against the
   * policy version current when Undo is pressed.
   */
  const change = useCallback(
    async (what: Promise<PolicyView>, done?: string, undo?: Undo): Promise<boolean> => {
      try {
        const next = await what;
        setView(next);
        if (done) {
          toast(
            done,
            "success",
            undo
              ? {
                  action: {
                    label: "Undo",
                    onClick: () => {
                      const v = viewRef.current?.policy.version;
                      if (v !== undefined) void change(undo(v), "Change undone.");
                    },
                  },
                }
              : undefined,
          );
        }
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "That change wasn't saved.", "error");
        // Someone else saved meanwhile: show what's there now.
        api.getAgentPolicy().then(setView).catch(() => {});
        return false;
      }
    },
    [toast],
  );

  if (failed) {
    return (
      <Page>
        <div className="mb-6">
          <PageHeader title="Agent permissions" />
        </div>
        <Problem title="Couldn't load agent permissions" onRetry={loadPolicy} details={failed.trim() || undefined}>
          Nothing has changed. Check your connection and try again.
        </Problem>
      </Page>
    );
  }
  if (!view) {
    return (
      <Page>
        <PageHeader title="Agent permissions" lead="What Coderhelm's agents may do on their own, and what waits for a person." />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      </Page>
    );
  }

  const edit = view.can.edit;
  const pending = approvals.filter((a) => a.status === "pending").length;
  const href = (t: Tab) => (t === "approvals" ? "/settings/agents" : `/settings/agents?tab=${t}`);
  return (
    <Page testId="agent-permissions-page">
      <PageHeader
        title="Agent permissions"
        lead="Every agent asks before each thing it does: allow runs it, ask waits for a person, deny stops it. Rules decide; with no rule, reads run and everything else asks."
      />
      <div className="mt-6 space-y-4">
        <PauseBanner view={view} edit={edit} onChange={change} />
        {!edit && (
          <Callout variant="neutral" live={false}>
            <p>You can see these settings and test a call. Changing them needs permission to edit agent permissions.</p>
          </Callout>
        )}
      </div>

      <Tabs
        label="Agent permissions"
        value={tab}
        items={TABS.map((t) => ({
          value: t.value,
          label: t.label,
          href: href(t.value),
          count: t.value === "approvals" && pending > 0 ? <span className="rounded-full bg-amber-500/15 px-1.5 text-xs tabular-nums text-amber-200">{pending}</span> : undefined,
          countText: t.value === "approvals" && pending > 0 ? `${pending} waiting` : undefined,
        }))}
      />

      <div className="mt-6 space-y-10" data-testid={`agents-tab-${tab}`}>
        {tab === "approvals" && (
          <>
            <section aria-labelledby="approvals-heading" className="space-y-3" data-testid="approval-queue">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="approvals-heading" className="text-base font-semibold text-zinc-100">
                  Waiting for approval
                </h2>
                <span className="text-sm text-zinc-400">{pending} waiting</span>
              </div>
              {approvals.length === 0 ? (
                <EmptyState title="Nothing is waiting">
                  When an agent asks, the card shows here, on the run and in your Slack or Teams channel.
                </EmptyState>
              ) : (
                approvals.map((a) => (
                  <ApprovalCard
                    key={a.id}
                    approval={a}
                    can={approvalCan}
                    via={a.id === focusId && (params.get("via") === "slack" || params.get("via") === "teams") ? (params.get("via") as "slack" | "teams") : "settings"}
                    focus={a.id === focusId}
                    onDecided={() => {
                      setReload((n) => n + 1);
                      api.getAgentPolicy().then(setView).catch(() => {});
                    }}
                  />
                ))
              )}
            </section>
            <RecentDecisions reload={reload} />
          </>
        )}
        {tab === "agents" && (
          <>
            <AgentSwitches view={view} edit={edit} repos={repos} onChange={change} />
            <AutonomyAndPresets view={view} edit={edit} onChange={change} />
          </>
        )}
        {tab === "advanced" && (
          <>
            <RulesTable view={view} edit={edit} repos={repos} onChange={change} />
            <TestCall view={view} repos={repos} />
            <SandboxSettings view={view} edit={edit} repos={repos} onChange={change} />
          </>
        )}
      </div>
    </Page>
  );
}
