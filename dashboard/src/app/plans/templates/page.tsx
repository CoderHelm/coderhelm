"use client";

import { useState } from "react";
import Link from "next/link";
import { Page, PageHeader } from "@/components/page";
import { useRouter } from "next/navigation";
import { api, type Template } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { TrashIcon } from "@/components/icons";
import { TableSkeleton } from "@/components/skeleton";
import { Callout } from "@/components/callout";
import { usePagedList, LoadMoreButton } from "@/components/load-more";
import { focusRing, linkButton } from "@/components/ui";

export default function TemplatesPage() {
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { items: templates, next, loading, loadingMore, error, loadMore, reload } = usePagedList<Template>(
    (cursor) => api.listTemplates({ limit: 50, cursor }).then((d) => ({ items: d.templates, next: d.next_cursor })),
    [],
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const shown = templates.filter((t) => !removed.has(t.template_id));

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

      <div className="mt-6">
      {loading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : error ? (
        <Callout variant="error" title="Couldn't load your templates">
          <button type="button" onClick={reload} className={linkButton}>
            Try again
          </button>
        </Callout>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 sm:p-12 text-center text-zinc-500">
          <p className="text-lg mb-2 text-zinc-300">No templates yet</p>
          <p className="text-sm mb-4">
            Open a plan and choose &ldquo;Save as template&rdquo; to reuse it later.
          </p>
          <Link href="/plans" className={linkButton}>
            Go to plans
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((t) => (
              <li
                key={t.template_id}
                className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors min-w-0"
              >
                <div className="mb-3 min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-100 break-words">{t.title}</h2>
                  {t.description && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{t.description}</p>
                  )}
                </div>

                {(t.category || (t.tags && t.tags.length > 0)) && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {t.category && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 border border-zinc-700 text-zinc-300">
                        {t.category}
                      </span>
                    )}
                    {t.tags?.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-zinc-800/50 text-zinc-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mb-4">
                  <span>{t.task_count} task{t.task_count === 1 ? "" : "s"}</span>
                  <span>Used {t.usage_count} time{t.usage_count === 1 ? "" : "s"}</span>
                  {t.created_by && <span className="truncate max-w-full">by {t.created_by}</span>}
                </div>

                <div className="mt-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUseTemplate(t.template_id)}
                    disabled={usingTemplate === t.template_id}
                    className={`flex-1 min-h-9 px-3 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-xs font-semibold hover:bg-white transition-colors disabled:opacity-50 ${focusRing}`}
                  >
                    {usingTemplate === t.template_id ? "Creating…" : "Use template"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    aria-label={`Delete template ${t.title}`}
                    title="Delete template"
                    className={`min-h-9 px-2 py-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors ${focusRing}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <LoadMoreButton hasMore={!!next} loading={loadingMore} onClick={loadMore} />
        </>
      )}
      </div>
    </Page>
  );
}
