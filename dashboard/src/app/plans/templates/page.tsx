"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Page, PageHeader } from "@/components/page";
import { useRouter } from "next/navigation";
import { api, type Template } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { TrashIcon } from "@/components/icons";
import { focusRing, linkButton } from "@/components/ui";
import {
  Chip,
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  LoadMore,
  useListParams,
  usePagedList,
} from "@/components/list";

function templateMatches(t: Template, q: string): boolean {
  if (!q) return true;
  const hay = [t.title, t.description, t.category, ...(t.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export default function TemplatesPageWithParams() {
  return (
    <Suspense fallback={<Page><PageHeader title="Plan templates" /><div className="mt-6"><ListSkeleton rows={3} /></div></Page>}>
      <TemplatesPage />
    </Suspense>
  );
}

function TemplatesPage() {
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [params, setParams] = useListParams({ q: "" });
  const q = params.q.trim();
  const { items: templates, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<Template>(
    (cursor) => api.listTemplates({ limit: 50, cursor }).then((d) => ({ items: d.templates, next: d.next_cursor })),
    [],
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const kept = templates.filter((t) => !removed.has(t.template_id));
  const shown = kept.filter((t) => templateMatches(t, q));
  const clear = () => setParams({ q: "" });

  const handleUseTemplate = async (templateId: string) => {
    setUsingTemplate(templateId);
    try {
      const { plan_id } = await api.useTemplate(templateId, {});
      router.push(`/plans/detail?id=${plan_id}`);
    } catch (e) {
      toast(e instanceof Error && e.message.includes("403") ? "Your role can't create plans. Ask an admin." : "Couldn't create a plan from this template", "error");
      setUsingTemplate(null);
    }
  };

  const handleDelete = async (t: Template) => {
    if (!(await confirm({ title: "Delete template", message: `Delete "${t.title}"? Plans already made from it stay.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      await api.deleteTemplate(t.template_id);
      setRemoved((prev) => new Set(prev).add(t.template_id));
      toast("Template deleted");
    } catch {
      toast("Couldn't delete the template", "error");
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={<Link href="/plans" className={`text-zinc-500 hover:text-zinc-300 text-sm rounded ${focusRing}`}>← Plans</Link>}
        title="Plan templates"
        lead="Saved plans you can start again with one click."
      />

      {!loading && !error && kept.length > 0 && (
        <ListToolbar
          className="mt-6 mb-4"
          search={{
            value: params.q,
            onChange: (v) => setParams({ q: v }, { replace: true }),
            placeholder: "Search by title, description, category or tag",
            label: "Search templates",
          }}
          onClear={q ? clear : undefined}
        />
      )}

      <div className={kept.length > 0 && !loading && !error ? "" : "mt-6"}>
        {loading ? (
          <ListSkeleton rows={3} label="Loading templates" />
        ) : error ? (
          <ListError title="Couldn't load your templates" onRetry={reload} />
        ) : kept.length === 0 ? (
          <ListEmpty
            title="No templates yet"
            action={
              <Link href="/plans" className={linkButton}>
                Go to plans
              </Link>
            }
          >
            Open a plan and choose &ldquo;Save as template&rdquo; to reuse it later.
          </ListEmpty>
        ) : shown.length === 0 ? (
          <ListEmpty title={`No templates match “${q}”`} onClear={clear} />
        ) : (
          <List label="Templates">
            {shown.map((t) => (
              <ListRow
                key={t.template_id}
                testId="template-row"
                title={t.title}
                titleText={t.title}
                meta={[
                  `${t.task_count} task${t.task_count === 1 ? "" : "s"}`,
                  `Used ${t.usage_count} time${t.usage_count === 1 ? "" : "s"}`,
                  t.created_by ? `by ${t.created_by}` : null,
                ]}
                summary={t.description || undefined}
                chips={
                  t.category || (t.tags && t.tags.length > 0) ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {t.category && <Chip>{t.category}</Chip>}
                      {t.tags?.map((tag) => (
                        <Chip key={tag} tone="muted">
                          {tag}
                        </Chip>
                      ))}
                    </span>
                  ) : undefined
                }
                actions={
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleUseTemplate(t.template_id)}
                      disabled={usingTemplate === t.template_id}
                      aria-label={`Use template ${t.title}`}
                      className={`min-h-7 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white disabled:opacity-50 ${focusRing}`}
                    >
                      {usingTemplate === t.template_id ? "Creating…" : "Use template"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      aria-label={`Delete template ${t.title}`}
                      title="Delete template"
                      className={`inline-flex min-h-7 items-center rounded-md px-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 ${focusRing}`}
                    >
                      <TrashIcon />
                    </button>
                  </span>
                }
              />
            ))}
          </List>
        )}
        {!loading && !error && <LoadMore hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />}
      </div>
    </Page>
  );
}
