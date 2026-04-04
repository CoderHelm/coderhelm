"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type Template } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { TrashIcon } from "@/components/icons";
import { TableSkeleton } from "@/components/skeleton";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    api.listTemplates({ limit: 50 })
      .then((data) => {
        setTemplates(data.templates);
        setNextCursor(data.next_cursor ?? undefined);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    api.listTemplates({ limit: 50, cursor: nextCursor })
      .then((data) => {
        setTemplates((prev) => [...prev, ...data.templates]);
        setNextCursor(data.next_cursor ?? undefined);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore]);

  const handleUseTemplate = async (templateId: string) => {
    setUsingTemplate(templateId);
    try {
      const { plan_id } = await api.useTemplate(templateId, {});
      router.push(`/plans/detail?id=${plan_id}`);
    } catch {
      toast("Failed to create plan from template", "error");
      setUsingTemplate(null);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!(await confirm({ title: "Delete Template", message: "Delete this template? This cannot be undone.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await api.deleteTemplate(templateId);
      setTemplates((prev) => prev.filter((t) => t.template_id !== templateId));
      toast("Template deleted");
    } catch {
      toast("Failed to delete template", "error");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/plans" className="text-zinc-500 hover:text-zinc-300 text-sm">← Plans</Link>
          <h1 className="text-2xl font-bold mt-1">Plan Templates</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Reusable plan templates to quickly spin up new plans.
          </p>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : error ? (
        <div className="text-red-400 border border-red-500/20 bg-red-500/5 rounded-lg p-8 text-center">
          <p className="text-sm">Failed to load templates. Please refresh.</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-12 text-center text-zinc-500">
          <p className="text-lg mb-2">No templates yet</p>
          <p className="text-sm mb-4">
            Save a plan as a template to get started.
          </p>
          <Link href="/plans" className="text-zinc-300 underline text-sm">
            Go to Plans
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <div
                key={t.template_id}
                className="group relative rounded-lg border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-700 transition-colors"
              >
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-zinc-100 truncate">{t.title}</h3>
                  {t.description && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{t.description}</p>
                  )}
                </div>

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

                <div className="flex items-center gap-3 text-xs text-zinc-600 mb-4">
                  <span>{t.task_count} tasks</span>
                  <span>Used {t.usage_count}×</span>
                  <span className="truncate">{t.created_by}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUseTemplate(t.template_id)}
                    disabled={usingTemplate === t.template_id}
                    className="flex-1 px-3 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-xs font-semibold hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {usingTemplate === t.template_id ? "Creating..." : "Use Template"}
                  </button>
                  <button
                    onClick={() => handleDelete(t.template_id)}
                    className="px-2 py-2 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete template"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {nextCursor && (
            <div className="mt-6 text-center">
              <button onClick={loadMore} disabled={loadingMore} className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50">
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
