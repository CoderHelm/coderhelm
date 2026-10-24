"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { List, ListEmpty, ListError, ListRow, ListSkeleton, Chip, type Tone } from "@/components/list";
import { Callout } from "@/components/callout";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { useCan } from "@/hooks/use-can";
import { primaryButton, smallDangerButton, smallSecondaryButton } from "@/components/ui";
import {
  fileSize,
  knowledgeApi,
  uploadProblem,
  uploadToSignedUrl,
  type BaseInput,
  type FileStatus,
  type KnowledgeBase,
  type KnowledgeFile,
  type KnowledgeLimits,
} from "@/lib/brain";
import { BaseForm } from "../base-form";

// One knowledge base: its files with where each one is (uploading,
// processing, ready, or failed with the reason), uploads and new versions,
// and its settings. Admins change it; everyone who may read it sees it.

export default function BasePage() {
  return (
    <Suspense fallback={<Page><p className="text-sm text-zinc-500">Loading…</p></Page>}>
      <Base />
    </Suspense>
  );
}

const STATUS: Record<FileStatus, { tone: Tone; word: string }> = {
  uploading: { tone: "waiting", word: "Uploading" },
  processing: { tone: "live", word: "Processing" },
  ready: { tone: "success", word: "Ready" },
  failed: { tone: "danger", word: "Failed" },
};

interface LocalUpload {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

function Base() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [base, setBase] = useState<KnowledgeBase | null>(null);
  const [files, setFiles] = useState<KnowledgeFile[] | null>(null);
  const [limits, setLimits] = useState<KnowledgeLimits | null>(null);
  // Managing bases is the knowledge_manage capability (built-in or custom role).
  const { can } = useCan();
  const canManage = can("knowledge_manage");
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    knowledgeApi
      .get(id)
      .then((r) => {
        setBase(r.base);
        setFiles(r.files);
        setLimits(r.limits);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the knowledge base"));
  }, [id]);
  useEffect(load, [load]);

  // While anything is being read, check again every few seconds.
  const busy = (files ?? []).some((f) => f.status === "processing" || f.status === "uploading");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  const upload = async (list: File[], replace?: string) => {
    if (!limits) return;
    const bad: string[] = [];
    for (const file of list) {
      const problem = uploadProblem(file, limits);
      if (problem) {
        bad.push(problem);
        continue;
      }
      const key = `${file.name}-${Math.random()}`;
      setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
      try {
        const r = await knowledgeApi.startUpload(id, { name: file.name, size: file.size, replace });
        load();
        await uploadToSignedUrl(r.upload, file, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))));
        await knowledgeApi.finishUpload(id, r.file.id);
        setUploads((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        const msg = `${file.name}: ${e instanceof Error ? e.message : "upload failed"}`;
        bad.push(msg);
        setUploads((u) => u.filter((x) => x.key !== key));
      }
      load();
    }
    setProblems(bad);
  };

  const removeFile = async (f: KnowledgeFile) => {
    const ok = await confirm({
      title: `Delete ${f.name}?`,
      message: "The file and every passage read from it are removed. Answers can no longer cite it.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await knowledgeApi.removeFile(id, f.id);
      toast("File deleted");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete it", "error");
    }
  };

  const removeBase = async () => {
    if (!base) return;
    const ok = await confirm({
      title: `Delete ${base.name}?`,
      message: "Every file in it and every passage read from them are removed. This can't be undone.",
      confirmLabel: "Delete knowledge base",
      destructive: true,
    });
    if (!ok) return;
    try {
      await knowledgeApi.remove(base.id);
      toast("Knowledge base deleted");
      router.push("/brain/knowledge");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete it", "error");
    }
  };

  const save = async (v: BaseInput) => {
    setSaving(true);
    try {
      const r = await knowledgeApi.update(id, v);
      setBase(r.base);
      toast("Saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (error && !base) {
    return (
      <Page>
        <PageHeader detail title="Knowledge base" />
        <ListError title="Couldn't open this knowledge base" onRetry={load}>
          {error}
        </ListError>
      </Page>
    );
  }

  return (
    <Page testId="knowledge-base-page">
      <PageHeader
        detail
        title={base?.name ?? "Knowledge base"}
        eyebrow="Knowledge base"
        status={base?.authoritative ? <Chip tone="success">Source of truth</Chip> : undefined}
        lead={base?.description || undefined}
        actions={
          canManage ? (
            <button type="button" onClick={() => fileRef.current?.click()} className={primaryButton} disabled={!limits}>
              Upload files
            </button>
          ) : undefined
        }
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Upload files"
        data-testid="upload-input"
        accept={(limits?.extensions ?? []).map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          upload(list);
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        className="hidden"
        aria-label="Upload a new version"
        data-testid="replace-input"
        accept={(limits?.extensions ?? []).map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (replacing.current) upload(list.slice(0, 1), replacing.current);
          replacing.current = null;
        }}
      />

      {problems.length > 0 && (
        <div className="mt-4" data-testid="upload-problems">
          <Callout variant="error" title="Some files weren't uploaded">
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      <Section
        title="Files"
        description={limits ? `PDF, Word, Markdown, text, CSV, Excel or HTML, up to ${Math.round(limits.max_file_bytes / (1024 * 1024))} MB each. Files are stored encrypted in your team's space.` : undefined}
      >
        {uploads.length > 0 && (
          <ul className="mb-3 space-y-1.5" aria-label="Uploading">
            {uploads.map((u) => (
              <li key={u.key} className={`${cardClass} flex min-w-0 items-center gap-3 py-2`} data-testid="upload-progress">
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{u.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">{Math.round(u.progress * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
        {files === null ? (
          <ListSkeleton rows={3} label="Loading files" />
        ) : files.length === 0 ? (
          <ListEmpty title="No files yet">{canManage ? "Upload documents and they'll be read, split into passages and made searchable." : "An admin can upload documents here."}</ListEmpty>
        ) : (
          <List label="Files">
            {files.map((f) => {
              const s = STATUS[f.status] ?? STATUS.processing;
              return (
                <ListRow
                  key={f.id}
                  testId="file-row"
                  data={{ status: f.status }}
                  status={{ tone: s.tone, live: f.status === "processing" || f.status === "uploading" }}
                  title={f.name}
                  meta={[
                    fileSize(f.size),
                    f.status === "ready" ? `${f.chunks} passages` : null,
                    f.as_of ? `as of ${f.as_of.slice(0, 10)}` : null,
                    f.version > 1 ? `version ${f.version}` : null,
                    f.uploaded_by || null,
                  ]}
                  summary={
                    f.status === "failed"
                      ? `${f.error}${f.searchable ? " The previous version is still searchable." : ""}`
                      : f.truncated
                        ? "Very long: only the first passages are searchable."
                        : undefined
                  }
                  summaryTone={f.status === "failed" ? "danger" : "waiting"}
                  chips={<Chip tone={s.tone}>{s.word}</Chip>}
                  actions={
                    canManage ? (
                      <>
                        <button
                          type="button"
                          className={smallSecondaryButton}
                          onClick={() => {
                            replacing.current = f.id;
                            replaceRef.current?.click();
                          }}
                        >
                          New version
                        </button>
                        <button type="button" className={smallDangerButton} onClick={() => removeFile(f)}>
                          Delete
                        </button>
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </List>
        )}
      </Section>

      {canManage && base && limits && (
        <Section title="Settings" description="Who can read it in the brain chat, and which agents search it while they work.">
          <div className={cardClass}>
            <BaseForm
              key={base.updated_at}
              initial={{
                name: base.name,
                description: base.description,
                read_role: base.read_role,
                attach_team: base.attach_team,
                agents: base.agents,
                authoritative: base.authoritative,
              }}
              limits={limits}
              saving={saving}
              submitLabel="Save"
              onSubmit={save}
            />
          </div>
          <div className="mt-4">
            <button type="button" onClick={removeBase} className={smallDangerButton}>
              Delete knowledge base
            </button>
          </div>
        </Section>
      )}
    </Page>
  );
}
