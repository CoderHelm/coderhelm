"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Page, PageHeader } from "@/components/page";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { ToolSwitch } from "@/components/tools";
import { focusRing } from "@/components/ui";
import { KIND_LABEL, ago, fileUrl, skillsApi, type SkillRepo, type SkillWithBody } from "@/lib/skills";
import { ItemActivity } from "../skill-activity";
import { CompatSection } from "../compat";
import { useRecheck } from "../use-recheck";
import { AlwaysApplySection } from "../always-apply";

export default function ItemPageGuarded() {
  return (
    <RoleGuard minRole="member">
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
  const [canManage, setCanManage] = useState(false);
  const [missing, setMissing] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    const [it, list] = await Promise.all([skillsApi.item(repoName, path), skillsApi.list()]);
    setItem(it);
    setRepo(list.repos.find((r) => r.repo === it.repo) ?? null);
    setCanManage(list.can_manage);
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
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
          <p className="mb-2 text-lg">Skill not found</p>
          <p className="text-sm">
            It may have been removed from its repository, or the repository was disconnected.{" "}
            <Link href="/skills" className="underline">
              All skills
            </Link>
          </p>
        </div>
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
        breadcrumb={
          <Link href="/skills" className={`text-sm text-zinc-400 hover:text-zinc-200 rounded ${focusRing}`}>
            ← Skills
          </Link>
        }
        eyebrow={<span className="capitalize">{kindWord}</span>}
        title={<span className="font-mono [overflow-wrap:anywhere]">{item.name}</span>}
        lead={item.description || undefined}
        actions={
          <div className="flex flex-col items-start gap-1 sm:items-end">
            {canManage ? (
              <ToolSwitch on={item.enabled} label={`Let Coderhelm read ${item.name}`} busy={switching} onToggle={toggle} />
            ) : (
              <StatusPill tone={item.enabled ? "success" : "neutral"}>{item.enabled ? "On" : "Off"}</StatusPill>
            )}
            <p className="max-w-56 text-xs text-zinc-500 sm:text-right">A Coderhelm setting. It doesn&apos;t change the file.</p>
          </div>
        }
      />
      <p className="mt-2 text-xs text-zinc-500 [overflow-wrap:anywhere]">
        From <span className="font-mono text-zinc-400">{item.repo}</span> · {item.path}
        {item.sha && (
          <>
            {" "}
            at <span className="font-mono">{item.sha.slice(0, 7)}</span>
          </>
        )}
        {repo?.synced_at && <> · synced {ago(repo.synced_at)}</>}
        {" · "}
        {item.uses > 0 ? `read ${item.uses} time${item.uses === 1 ? "" : "s"}, last by the ${item.last_used_by} ${ago(item.last_used_at)}` : "not read yet"}
        {" · "}
        <a href={fileUrl(item.repo, item.sha, item.path)} target="_blank" rel="noreferrer" className={`underline underline-offset-2 hover:text-zinc-300 rounded ${focusRing}`}>
          Open on GitHub
        </a>
      </p>

      {!item.enabled && (
        <div className="mt-4">
          <Callout variant="info" title="Switched off">
            <p>Coderhelm&apos;s agents can&apos;t read {item.name} until an admin switches it on.</p>
          </Callout>
        </div>
      )}

      <div className="mt-8">
        <CompatSection item={item} canManage={canManage} busy={busy} onRecheck={recheck} onUseTranslated={chooseTranslated} />
      </div>

      <AlwaysApplySection item={item} canManage={canManage} onSaved={(a) => setItem({ ...item, always_apply: a })} />

      {item.files.length > 0 && (
        <p className="mt-3 text-xs text-zinc-500 [overflow-wrap:anywhere]">Files with it, which agents can read: {item.files.join(", ")}</p>
      )}

      <div className="mt-10">
        <ItemActivity item={item} heading="Every read" />
      </div>
    </Page>
  );
}
