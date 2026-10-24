"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page, PageHeader } from "@/components/page";
import { List, ListEmpty, ListError, ListRow, ListSkeleton, Chip } from "@/components/list";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useCan } from "@/hooks/use-can";
import { primaryButton } from "@/components/ui";
import { knowledgeApi, type KnowledgeBase, type KnowledgeLimits } from "@/lib/brain";
import { BaseForm, EMPTY_BASE } from "./base-form";

// Knowledge bases: the documents the brain chat and the team's agents
// search. Everyone sees the ones their role may read; admins add them.

const READ_WORDS: Record<string, string> = { viewer: "Everyone", member: "Members", admin: "Admins" };

export default function KnowledgePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [bases, setBases] = useState<KnowledgeBase[] | null>(null);
  // Managing bases is the knowledge_manage capability (built-in or custom role).
  const { can } = useCan();
  const canManage = can("knowledge_manage");
  const [limits, setLimits] = useState<KnowledgeLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    knowledgeApi
      .list()
      .then((r) => {
        setBases(r.bases);
        setLimits(r.limits);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load knowledge bases"));
  }, []);
  useEffect(load, [load]);

  const agentWords = (b: KnowledgeBase) => {
    if (b.attach_team) return "All agents";
    if (!b.agents.length) return "Brain chat only";
    return b.agents.map((a) => limits?.agents.find((x) => x.key === a)?.label ?? a).join(", ");
  };

  return (
    <Page testId="knowledge-page">
      <PageHeader
        title="Knowledge bases"
        lead="Documents your team uploads. The brain chat cites them, and the agents you pick search them while they work."
        actions={
          canManage ? (
            <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
              New knowledge base
            </button>
          ) : undefined
        }
      />
      <div className="mt-6">
        {error ? (
          <ListError title="Couldn't load knowledge bases" onRetry={load}>
            {error}
          </ListError>
        ) : bases === null ? (
          <ListSkeleton rows={3} label="Loading knowledge bases" />
        ) : bases.length === 0 ? (
          <ListEmpty
            title="No knowledge bases yet"
            action={
              canManage ? (
                <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
                  New knowledge base
                </button>
              ) : undefined
            }
          >
            {canManage ? "Create one, then upload PDFs, Word documents, Markdown, text, spreadsheets or web pages." : "An admin can create one and upload your team's documents."}
          </ListEmpty>
        ) : (
          <List label="Knowledge bases">
            {bases.map((b) => (
              <ListRow
                key={b.id}
                testId="knowledge-row"
                title={b.name}
                href={`/brain/knowledge/base?id=${encodeURIComponent(b.id)}`}
                summary={b.description || undefined}
                meta={[`${b.ready} of ${b.files} files ready`, `Read by: ${READ_WORDS[b.read_role] ?? b.read_role}`, agentWords(b)]}
                chips={
                  <>
                    {b.authoritative && <Chip tone="success">Source of truth</Chip>}
                    {b.processing > 0 && <Chip tone="waiting">{b.processing} processing</Chip>}
                    {b.failed > 0 && <Chip tone="danger">{b.failed} failed</Chip>}
                  </>
                }
              />
            ))}
          </List>
        )}
      </div>
      <Modal open={creating} onOpenChange={setCreating} title="New knowledge base">
        <BaseForm
          initial={EMPTY_BASE}
          limits={limits}
          saving={saving}
          submitLabel="Create"
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            setSaving(true);
            try {
              const r = await knowledgeApi.create(v);
              toast("Knowledge base created");
              router.push(`/brain/knowledge/base?id=${encodeURIComponent(r.base.id)}`);
            } catch (e) {
              toast(e instanceof Error ? e.message : "Couldn't create it", "error");
            } finally {
              setSaving(false);
            }
          }}
        />
      </Modal>
    </Page>
  );
}
