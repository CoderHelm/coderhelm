"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type Repo } from "@/lib/api";
import type { Approval, ApprovalCan, PolicyView } from "@/lib/agent-policy";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { ApprovalCard } from "@/components/agent-approval";
import { AgentSwitches, AutonomyAndPresets, PauseBanner, RecentDecisions, RulesTable, SandboxSettings, TestCall } from "./sections";

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

  useEffect(() => {
    api
      .getAgentPolicy()
      .then(setView)
      .catch((e) => setFailed(e instanceof Error ? e.message : "Couldn't load agent permissions."));
    api.listRepos().then((r) => setRepos(r.repos.filter((x) => x.enabled))).catch(() => {});
  }, []);

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

  /** Runs a change and shows the policy it returns, or says why it failed. */
  const change = useCallback(
    async (what: Promise<PolicyView>, done?: string) => {
      try {
        const next = await what;
        setView(next);
        if (done) toast(done);
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
        <PageHeader title="Agent permissions" />
        <Callout variant="error" title="Couldn't load agent permissions">
          <p>{failed}</p>
        </Callout>
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
  return (
    <Page testId="agent-permissions-page">
      <PageHeader
        title="Agent permissions"
        lead="Every agent asks before each thing it does: allow runs it, ask waits for a person, deny stops it. Rules decide; with no rule, reads run and everything else asks."
      />
      <div className="mt-6 space-y-8">
        <PauseBanner view={view} edit={edit} onChange={change} />

        {!edit && (
          <Callout variant="info" live={false}>
            <p>You can see these settings and test a call. Changing them needs permission to edit agent permissions.</p>
          </Callout>
        )}

        <section aria-labelledby="approvals-heading" className="space-y-3" data-testid="approval-queue">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="approvals-heading" className="text-base font-semibold text-zinc-100">
              Waiting for approval
            </h2>
            <span className="text-xs text-zinc-500">{approvals.filter((a) => a.status === "pending").length} waiting</span>
          </div>
          {approvals.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing is waiting. When an agent asks, the card shows here, on the run and in your Slack or Teams channel.</p>
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

        <AgentSwitches view={view} edit={edit} repos={repos} onChange={change} />
        <AutonomyAndPresets view={view} edit={edit} onChange={change} />
        <RulesTable view={view} edit={edit} repos={repos} onChange={change} />
        <TestCall view={view} repos={repos} />
        <SandboxSettings view={view} edit={edit} repos={repos} onChange={change} />
        <RecentDecisions reload={reload} />
      </div>
    </Page>
  );
}
