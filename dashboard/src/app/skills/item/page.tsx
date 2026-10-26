"use client";

import { useCan } from "@/hooks/use-can";
import { ANY_CHANGE } from "@/lib/capabilities";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Page, PageHeader } from "@/components/page";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { Switch } from "@/components/settings/switch";
import { SettingsRow } from "@/components/settings";
import { EmptyState } from "@/components/empty-state";
import { ExternalLinkIcon } from "@/components/icons";
import { secondaryButton } from "@/components/ui";
import { KIND_LABEL, ago, fileUrl, skillsApi, type SkillRepo, type SkillWithBody } from "@/lib/skills";
import { ItemActivity } from "../skill-activity";
import { CompatSection } from "../compat";
import { useRecheck } from "../use-recheck";
import { AlwaysApplySection } from "../always-apply";

export default function ItemPageGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <ItemPage />
      </Suspense>
    </RoleGuard>
  );
}

/** A skill's or a command's page: what it is, how Coderhelm runs it, its
 * text and every read of it. Agents have their own page. */
function ItemPage() {
  const params = useSearchParams();
  const repoName = params.get("repo") ?? "";
  const path = params.get("path") ?? "";
  const { toast } = useToast();
  const [item, setItem] = useState<SkillWithBody | null>(null);
  const [repo, setRepo] = useState<SkillRepo | null>(null);
  // Skills are managed with data sources and team tools.
  const { can } = useCan();
  const canManage = can("data_sources");
  const [missing, setMissing] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    const [it, list] = await Promise.all([skillsApi.item(repoName, path), skillsApi.list()]);
    setItem(it);
    setRepo(list.repos.find((r) => r.repo === it.repo) ?? null);
    return it;
  }, [repoName, path]);

  useEffect(() => {
    if (!repoName || !path) {
      setMissing(true);
      return;
    }
    load().catch(() => setMissing(true));
  }, [repoName, path, load]);

  const { busy, recheck, chooseTranslated } = useRecheck(item, setItem, load);

  const toggle = async () => {
    if (!item) return;
    setSwitching(true);
    try {
      const r = await skillsApi.setEnabled(item.repo, item.path, !item.enabled);
      setItem({ ...item, enabled: r.enabled, switched_by: "you", switched_at: new Date().toISOString() });
      toast(r.enabled ? `${item.name} is on` : `${item.name} is off`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The request failed.", "error");
    } finally {
      setSwitching(false);
    }
  };

  if (missing) {
    return (
      <Page>
        <EmptyState
          title="Skill not found"
          action={
            <Link href="/skills" className={secondaryButton}>
              All skills
            </Link>
          }
        >
          It may have been removed from its repository, or the repository was disconnected.
        </EmptyState>
      </Page>
    );
  }

  if (!item) {
    return (
      <Page>
        <div className="space-y-4" role="status" aria-label="Loading the skill">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    );
  }

  const kindWord = KIND_LABEL[item.kind].replace(/s$/, "").toLowerCase();

  return (
    <Page>
      <PageHeader
        detail
        crumb={item.name}
        eyebrow={<span className="capitalize">{kindWord}</span>}
        title={<span className="[overflow-wrap:anywhere]">{item.name}</span>}
        lead={item.description || undefined}
        actions={
          <a href={fileUrl(item.repo, item.sha, item.path)} target="_blank" rel="noreferrer" className={`${secondaryButton} gap-1.5`}>
            Open on GitHub
            <ExternalLinkIcon />
          </a>
        }
      />
      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
        <SettingsRow
          label={`Use this ${kindWord}`}
          help="Turning it off doesn't change the file in your repo."
          layout="toggle"
          control={(ids) =>
            canManage ? (
              <Switch id={ids.inputId} checked={item.enabled} labelledBy={ids.labelId} describedBy={ids.helpId} disabled={switching} onChange={() => void toggle()} />
            ) : (
              <StatusPill tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "On" : "Off"}</StatusPill>
            )
          }
        />
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="skill-facts">
        <dt className="text-zinc-400">From</dt>
        <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">
          {item.repo} · {item.path}
          {repo?.synced_at && <span className="text-zinc-400"> · synced {ago(repo.synced_at)}</span>}
        </dd>
        <dt className="text-zinc-400">Read</dt>
        <dd className="text-zinc-200">
          {item.uses > 0 ? `${item.uses} time${item.uses === 1 ? "" : "s"}, last by the ${item.last_used_by} ${ago(item.last_used_at)}` : "Not read yet"}
        </dd>
        {item.files.length > 0 && (
          <>
            <dt className="text-zinc-400">Files with it</dt>
            <dd className="min-w-0">
              <ul className="space-y-0.5 text-zinc-200">
                {item.files.map((f) => (
                  <li key={f} className="[overflow-wrap:anywhere]">{f}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      {!item.enabled && (
        <div className="mt-4">
          <Callout variant="neutral" title="Switched off">
            <p>Coderhelm&apos;s agents can&apos;t read {item.name} until an admin switches it on.</p>
          </Callout>
        </div>
      )}

      <div className="mt-8">
        <CompatSection item={item} canManage={canManage} busy={busy} onRecheck={recheck} onUseTranslated={chooseTranslated} />
      </div>

      <AlwaysApplySection item={item} canManage={canManage} onSaved={(a) => setItem({ ...item, always_apply: a })} />


      <div className="mt-10">
        <ItemActivity item={item} heading="Every read" />
      </div>
    </Page>
  );
}
