"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, PageHeader } from "@/components/page";
import { ListError } from "@/components/list";
import { StatusDot } from "@/components/list/status";
import { useCan } from "@/hooks/use-can";
import { buttonClass, focusRing, primaryButton } from "@/components/ui";
import { AddFlow } from "@/components/knowledge/add-flow";
import { LogoStack, SourceLogo } from "@/components/knowledge/logos";
import { KIND_LABEL, READ_SHORT, baseHealth, itemWord, knowledge, type AddKind, type Base, type KnowledgeLimits, type SourceKind } from "@/lib/knowledge";

// Knowledge: what the team's answers come from. Each knowledge base holds
// pages from the apps the team already uses (kept up to date on their own)
// and uploaded files. Everyone sees the ones their role may read; people who
// manage knowledge add them with one guided flow.

export default function KnowledgePage() {
  return (
    <Suspense fallback={null}>
      <Knowledge />
    </Suspense>
  );
}

const STARTERS: AddKind[] = ["notion", "confluence", "google_drive", "sanity", "upload", "web"];

function Knowledge() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useCan();
  const canManage = can("knowledge_manage");
  const [bases, setBases] = useState<Base[] | null>(null);
  const [limits, setLimits] = useState<KnowledgeLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<{ open: boolean; start: AddKind | null }>({ open: false, start: null });

  const load = useCallback(() => {
    setError(null);
    knowledge
      .list()
      .then((r) => {
        setBases(r.bases);
        setLimits(r.limits);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load Knowledge."));
  }, []);
  useEffect(load, [load]);

  // Back from signing in to an app: carry on at the picker.
  useEffect(() => {
    const connected = params.get("connected");
    if (connected && canManage) {
      setFlow({ open: true, start: connected as SourceKind });
      router.replace("/knowledge/");
    }
  }, [params, canManage, router]);

  // While something is being brought in, look again now and then.
  const busy = (bases ?? []).some((b) => b.processing > 0 || b.sources.some((s) => s.status === "syncing" || s.status === "queued"));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  const start = (k: AddKind | null = null) => setFlow({ open: true, start: k });

  return (
    <Page testId="knowledge-page">
      <PageHeader
        title="Knowledge"
        lead="What your team's answers come from. Bring in pages from the apps you already use, and they stay up to date on their own."
        actions={
          canManage && bases && bases.length > 0 ? (
            <button type="button" onClick={() => start()} className={primaryButton} data-testid="new-knowledge">
              New knowledge base
            </button>
          ) : undefined
        }
      />
      <div className="mt-8">
        {error ? (
          <ListError title="Couldn't load Knowledge" onRetry={load}>
            {error}
          </ListError>
        ) : bases === null ? (
          <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading">
            {[0, 1].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40 motion-reduce:animate-none" />
            ))}
          </div>
        ) : bases.length === 0 ? (
          <Empty canManage={canManage} onStart={start} />
        ) : (
          <ul className="grid min-w-0 gap-4 md:grid-cols-2" aria-label="Knowledge bases">
            {bases.map((b) => (
              <BaseCard key={b.id} b={b} />
            ))}
          </ul>
        )}
      </div>
      {canManage && (
        <AddFlow
          open={flow.open}
          onOpenChange={(o) => {
            setFlow((f) => ({ ...f, open: o }));
            if (!o) load();
          }}
          mode={{ kind: "create" }}
          startWith={flow.start}
          limits={limits}
          onDone={(id) => router.push(`/knowledge/base/?id=${encodeURIComponent(id)}`)}
        />
      )}
    </Page>
  );
}

function Empty({ canManage, onStart }: { canManage: boolean; onStart: (k?: AddKind | null) => void }) {
  return (
    <section className="mx-auto max-w-3xl py-6 text-center sm:py-12" data-testid="knowledge-empty">
      <div className="flex justify-center">
        <LogoStack kinds={["notion", "confluence", "google_drive", "sanity"]} size="lg" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">Bring in what your team already knows</h2>
      <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-zinc-400">
        Pick pages from Notion, Confluence, Google Drive or Sanity, or upload files. Coderhelm keeps them up to date, and Chat answers from them with a link to the page.
      </p>
      {canManage ? (
        <>
          <div className="mt-8">
            <button type="button" onClick={() => onStart(null)} className={`${buttonClass("primary")} !min-h-11 !px-6 !text-base`} data-testid="start-knowledge">
              Add your first source
            </button>
          </div>
          <ul className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Or start with">
            {STARTERS.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onStart(k)}
                  data-testid={`start-${k}`}
                  className={`flex h-full w-full flex-col items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-zinc-600 hover:bg-zinc-800/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:flex-row sm:py-3 sm:text-left ${focusRing}`}
                >
                  <SourceLogo kind={k} size="md" />
                  <span className="min-w-0 text-sm font-medium text-zinc-200">{k === "upload" ? "Upload files" : KIND_LABEL[k]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-6 text-sm text-zinc-500">Someone who manages Knowledge on your team can add the first one.</p>
      )}
    </section>
  );
}

function BaseCard({ b }: { b: Base }) {
  const health = baseHealth(b);
  // Apps first, uploads last.
  const kinds = b.kinds.length ? [...b.kinds.filter((k) => k !== "upload"), ...b.kinds.filter((k) => k === "upload")] : ["upload"];
  const apps = kinds.filter((k) => k !== "upload");
  const size = [b.synced ? itemWord(apps.length === 1 ? apps[0] : "page", b.synced) : "", b.uploads ? itemWord("upload", b.uploads) : ""].filter(Boolean).join(" and ");
  return (
    <li className="min-w-0">
      <Link
        href={`/knowledge/base/?id=${encodeURIComponent(b.id)}`}
        data-testid="knowledge-card"
        className={`group flex h-full min-w-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-700 hover:bg-zinc-900 motion-reduce:transition-none ${focusRing}`}
      >
        <div className="flex items-start justify-between gap-3">
          <LogoStack kinds={kinds} size="md" />
          <span className="shrink-0 rounded-full border border-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">{READ_SHORT[b.read_role] ?? b.read_role}</span>
        </div>
        <h3 className="mt-4 text-base font-semibold text-zinc-100 [overflow-wrap:anywhere]">{b.name}</h3>
        {b.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{b.description}</p>}
        <div className="mt-auto pt-5">
          <p className="text-sm text-zinc-300">{size || "Nothing in it yet"}</p>
          {health && (
            <p className="mt-1.5 flex min-w-0 items-center gap-2 text-sm" data-testid="knowledge-health" data-tone={health.tone}>
              <StatusDot tone={health.tone === "attention" ? "attention" : health.tone === "success" ? "success" : "live"} live={health.tone === "live"} />
              <span className={`truncate ${health.tone === "attention" ? "text-orange-300" : "text-zinc-400"}`}>{health.words}</span>
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
