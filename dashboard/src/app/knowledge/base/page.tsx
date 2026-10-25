"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, PageHeader, Section } from "@/components/page";
import { Chip, ListError, MoreMenu } from "@/components/list";
import { Modal } from "@/components/modal";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { useCan } from "@/hooks/use-can";
import { buttonClass, focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { AddFlow } from "@/components/knowledge/add-flow";
import { SourceLogo } from "@/components/knowledge/logos";
import { Picker } from "@/components/knowledge/picker";
import { SourceCard } from "@/components/knowledge/source-card";
import { errorMessage } from "@/lib/data-sources";
import {
  KIND_LABEL,
  READ_SENTENCE,
  fileSize,
  itemWord,
  knowledge,
  rememberReturn,
  uploadProblem,
  uploadToSignedUrl,
  type AddKind,
  type Base,
  type BaseInput,
  type Item,
  type KnowledgeLimits,
  type Selected,
  type Source,
  type SourceKind,
} from "@/lib/knowledge";
import { BaseForm } from "../base-form";

// One knowledge base: the apps it stays in sync with (each with whether it
// is up to date and the one thing to do when it isn't), its uploaded files,
// and every page in it with a search box. Drop files anywhere to add them.

export default function BasePage() {
  return (
    <Suspense fallback={null}>
      <BaseView />
    </Suspense>
  );
}

const PAGE = 60;

interface LocalUpload {
  key: string;
  name: string;
  progress: number;
}

function BaseView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { can } = useCan();
  const canManage = can("knowledge_manage");
  const [base, setBase] = useState<Base | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [limits, setLimits] = useState<KnowledgeLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<{ open: boolean; start: AddKind | null }>({ open: false, start: null });
  const [settings, setSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ source: Source; picked: Selected[] } | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [shown, setShown] = useState(PAGE);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    knowledge
      .get(id)
      .then((r) => {
        setBase(r.base);
        setItems(r.files ?? []);
        setSources(r.sources ?? []);
        setLimits(r.limits);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, "Couldn't open this knowledge base.")));
  }, [id]);
  useEffect(load, [load]);

  // Back from signing in: a source that needed it checks again; otherwise
  // the add flow carries on at the picker.
  const handled = useRef(false);
  useEffect(() => {
    const connected = params.get("connected") as SourceKind | null;
    if (!connected || !base || handled.current) return;
    handled.current = true;
    router.replace(`/knowledge/base/?id=${encodeURIComponent(id)}`);
    const broken = sources.filter((s) => s.kind === connected && s.status === "error");
    if (broken.length) {
      Promise.all(broken.map((s) => knowledge.syncSource(id, s.id))).finally(load);
      toast(`${KIND_LABEL[connected]} is connected again`);
    } else if (canManage) {
      setFlow({ open: true, start: connected });
    }
  }, [params, base, sources, id, router, canManage, load, toast]);

  const busy =
    sources.some((s) => s.status === "syncing" || s.status === "queued") || (items ?? []).some((f) => f.status === "processing" || f.status === "uploading");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  const upload = async (list: File[], replace?: string) => {
    if (!limits || !list.length) return;
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
        const r = await knowledge.startUpload(id, { name: file.name, size: file.size, replace });
        await uploadToSignedUrl(r.upload, file, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))));
        await knowledge.finishUpload(id, r.file.id);
      } catch (e) {
        bad.push(`${file.name}: ${errorMessage(e, "it didn't upload")}`);
      }
      setUploads((u) => u.filter((x) => x.key !== key));
      load();
    }
    setProblems(bad);
  };

  const reconnect = async (s: Source) => {
    try {
      rememberReturn({ path: `/knowledge/base/?id=${encodeURIComponent(id)}`, kind: s.kind, kbId: id });
      const r = await knowledge.connect(s.kind);
      window.location.assign(r.authorize_url);
    } catch (e) {
      toast(errorMessage(e, `Couldn't start the ${KIND_LABEL[s.kind]} sign-in.`), "error");
    }
  };

  const sync = async (s: Source) => {
    try {
      const r = await knowledge.syncSource(id, s.id);
      setSources((cur) => cur.map((x) => (x.id === s.id ? r.source : x)));
    } catch (e) {
      toast(errorMessage(e, "Couldn't check for changes."), "error");
    }
  };

  const pause = async (s: Source, paused: boolean) => {
    try {
      const r = await knowledge.updateSource(id, s.id, { paused });
      setSources((cur) => cur.map((x) => (x.id === s.id ? r.source : x)));
      toast(paused ? "Updates paused" : "Updates resumed");
    } catch (e) {
      toast(errorMessage(e, "That didn't work."), "error");
    }
  };

  const removeSource = async (s: Source) => {
    const ok = await confirm({
      title: `Remove ${s.name}?`,
      message: `${itemWord(s.kind, s.items)} from ${KIND_LABEL[s.kind]} are removed from this knowledge base. Nothing changes in ${KIND_LABEL[s.kind]}.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await knowledge.removeSource(id, s.id);
      toast(`${s.name} removed`);
      load();
    } catch (e) {
      toast(errorMessage(e, "Couldn't remove it."), "error");
    }
  };

  const saveSelection = async () => {
    if (!editing) return;
    try {
      const r = await knowledge.updateSource(id, editing.source.id, { selection: editing.picked });
      setSources((cur) => cur.map((x) => (x.id === r.source.id ? r.source : x)));
      setEditing(null);
      toast("Saved. Bringing in the changes.");
      load();
    } catch (e) {
      toast(errorMessage(e, "Couldn't save."), "error");
    }
  };

  const removeFile = async (f: Item) => {
    const ok = await confirm({
      title: `Delete ${f.name}?`,
      message: "The file is removed, and answers can no longer cite it.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await knowledge.removeFile(id, f.id);
      toast("File deleted");
      load();
    } catch (e) {
      toast(errorMessage(e, "Couldn't delete it."), "error");
    }
  };

  const removeBase = async () => {
    if (!base) return;
    const ok = await confirm({
      title: `Delete ${base.name}?`,
      message: "Everything in it is removed from Coderhelm. Nothing changes in the apps it came from. This can't be undone.",
      confirmLabel: "Delete knowledge base",
      destructive: true,
    });
    if (!ok) return;
    try {
      await knowledge.remove(base.id);
      toast("Knowledge base deleted");
      router.push("/knowledge/");
    } catch (e) {
      toast(errorMessage(e, "Couldn't delete it."), "error");
    }
  };

  const save = async (v: BaseInput) => {
    setSaving(true);
    try {
      const r = await knowledge.update(id, v);
      setBase(r.base);
      setSettings(false);
      toast("Saved");
    } catch (e) {
      toast(errorMessage(e, "Couldn't save."), "error");
    } finally {
      setSaving(false);
    }
  };

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const kindOf = (f: Item): AddKind => (f.source_id ? (sourceById.get(f.source_id)?.kind ?? (f.kind as SourceKind)) : "upload");
  const filters = useMemo(() => {
    const out: { key: string; label: string; n: number }[] = [];
    for (const s of sources) {
      const n = (items ?? []).filter((f) => f.source_id === s.id).length;
      if (n) out.push({ key: s.id, label: s.name, n });
    }
    const up = (items ?? []).filter((f) => !f.source_id).length;
    if (up) out.push({ key: "upload", label: "Uploaded files", n: up });
    return out;
  }, [sources, items]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items ?? []).filter(
      (f) =>
        (filter === "all" || (filter === "upload" ? !f.source_id : f.source_id === filter)) &&
        (!term || f.name.toLowerCase().includes(term) || (f.path ?? "").toLowerCase().includes(term)),
    );
  }, [items, q, filter]);
  const uploadsCount = (items ?? []).filter((f) => !f.source_id).length;

  if (error && !base) {
    return (
      <Page>
        <PageHeader detail title="Knowledge base" />
        <div className="mt-6">
          <ListError title="Couldn't open this knowledge base" onRetry={load}>
            {error}
          </ListError>
        </div>
      </Page>
    );
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (canManage) upload(Array.from(e.dataTransfer.files));
  };

  return (
    <Page testId="knowledge-base-page">
      <div
        onDragEnter={(e) => {
          if (canManage && e.dataTransfer.types.includes("Files")) setDragging(true);
        }}
        onDragOver={(e) => {
          if (canManage) e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={onDrop}
        className="relative min-w-0"
      >
        <PageHeader
          detail
          title={base?.name ?? "Knowledge base"}
          eyebrow="Knowledge base"
          status={base?.authoritative ? <Chip tone="success">Source of truth</Chip> : undefined}
          lead={base?.description || undefined}
          actions={
            canManage ? (
              <button type="button" onClick={() => setFlow({ open: true, start: null })} className={primaryButton} data-testid="add-source">
                Add
              </button>
            ) : undefined
          }
          more={
            canManage
              ? [
                  { label: "Settings", onSelect: () => setSettings(true) },
                  { label: "Upload files", onSelect: () => fileRef.current?.click() },
                  { label: "Delete knowledge base", onSelect: removeBase, danger: true },
                ]
              : undefined
          }
        />
        {base && (
          <p className="mt-3 text-sm text-zinc-400" data-testid="read-line">
            {READ_SENTENCE[base.read_role] ?? ""}{" "}
            {canManage && (
              <button type="button" className={linkButton} onClick={() => setSettings(true)}>
                Change
              </button>
            )}
          </p>
        )}

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          aria-label="Upload files"
          data-testid="upload-input"
          accept={(limits?.extensions ?? []).map((x) => `.${x}`).join(",")}
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
          accept={(limits?.extensions ?? []).map((x) => `.${x}`).join(",")}
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (replacing.current) upload(list.slice(0, 1), replacing.current);
            replacing.current = null;
          }}
        />

        {problems.length > 0 && (
          <div className="mt-6 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 text-sm text-orange-200" data-testid="upload-problems" role="alert">
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        <Section title="Where it comes from" id="sources">
          <ul className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="sources">
            {sources.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                canManage={canManage}
                onSync={() => sync(s)}
                onFix={() => (s.error?.action === "reconnect" ? reconnect(s) : s.error?.action === "edit" ? setEditing({ source: s, picked: s.selection }) : sync(s))}
                onEdit={() => setEditing({ source: s, picked: s.selection })}
                onPause={(p) => pause(s, p)}
                onRemove={() => removeSource(s)}
              />
            ))}
            {(uploadsCount > 0 || uploads.length > 0 || sources.length === 0) && (
              <li className="flex min-w-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5" data-testid="uploads-card">
                <div className="flex items-start gap-3">
                  <SourceLogo kind="upload" size="md" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-100">Uploaded files</h3>
                    <p className="mt-0.5 text-xs text-zinc-500">{itemWord("upload", uploadsCount)}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-zinc-400">{canManage ? "Drop files anywhere on this page, or choose them." : "Files people uploaded."}</p>
                {uploads.length > 0 && (
                  <ul className="mt-3 space-y-1.5" aria-label="Uploading">
                    {uploads.map((u) => (
                      <li key={u.key} className="flex min-w-0 items-center gap-2 text-xs" data-testid="upload-progress">
                        <span className="min-w-0 flex-1 truncate text-zinc-300">{u.name}</span>
                        <span className="shrink-0 text-zinc-500">{Math.round(u.progress * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (
                  <div className="mt-auto pt-4">
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => fileRef.current?.click()} disabled={!limits} data-testid="upload-button">
                      Upload files
                    </button>
                  </div>
                )}
              </li>
            )}
          </ul>
        </Section>

        <Section title="What's in it" id="items">
          {items === null ? (
            <div className="space-y-2" role="status" aria-label="Loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-900/60 motion-reduce:animate-none" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-2xl border border-zinc-800 bg-zinc-900/30 px-5 py-8 text-center text-sm text-zinc-400" data-testid="items-empty">
              {sources.length ? "Pages appear here as they come in." : canManage ? "Add an app or upload files to fill it." : "Nothing in it yet."}
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block min-w-0 sm:w-80">
                  <span className="sr-only">Search pages</span>
                  <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <input
                    className={`${inputClass} pl-9`}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setShown(PAGE);
                    }}
                    placeholder={`Search ${items.length.toLocaleString()} ${items.length === 1 ? "page" : "pages"}`}
                    data-testid="items-search"
                  />
                </label>
                {filters.length > 1 && (
                  <div className="flex min-w-0 max-w-full flex-wrap gap-2" role="group" aria-label="Show">
                    {[{ key: "all", label: "All", n: items.length }, ...filters].map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        aria-pressed={filter === f.key}
                        onClick={() => {
                          setFilter(f.key);
                          setShown(PAGE);
                        }}
                        className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors motion-reduce:transition-none sm:max-w-[16rem] ${focusRing} ${filter === f.key ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
                      >
                        <span className="min-w-0 truncate">{f.label}</span>
                        <span className="shrink-0 text-zinc-500">{f.n}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {visible.length === 0 ? (
                <p className="mt-6 text-sm text-zinc-400" data-testid="items-none">
                  Nothing matches &ldquo;{q.trim()}&rdquo;.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-zinc-800/80 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30" data-testid="items">
                  {visible.slice(0, shown).map((f) => (
                    <ItemRow
                      key={f.id}
                      f={f}
                      kind={kindOf(f)}
                      canManage={canManage}
                      onReplace={() => {
                        replacing.current = f.id;
                        replaceRef.current?.click();
                      }}
                      onDelete={() => removeFile(f)}
                    />
                  ))}
                </ul>
              )}
              {visible.length > shown && (
                <div className="mt-4 flex justify-center">
                  <button type="button" className={secondaryButton} onClick={() => setShown((s) => s + PAGE)}>
                    Show more ({(visible.length - shown).toLocaleString()} left)
                  </button>
                </div>
              )}
            </>
          )}
        </Section>

        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm" data-testid="drop-overlay">
            <div className="flex flex-col items-center rounded-2xl border border-emerald-400/40 bg-zinc-900 px-10 py-8 text-center shadow-2xl">
              <SourceLogo kind="upload" size="lg" />
              <p className="mt-4 text-base font-semibold text-zinc-100">Drop to add to {base?.name ?? "this knowledge base"}</p>
              <p className="mt-1 text-sm text-zinc-400">{limits ? `Up to ${Math.round(limits.max_file_bytes / (1024 * 1024))} MB each` : ""}</p>
            </div>
          </div>
        )}
      </div>

      {canManage && base && (
        <AddFlow
          open={flow.open}
          onOpenChange={(o) => {
            setFlow((f) => ({ ...f, open: o }));
            if (!o) load();
          }}
          mode={{ kind: "add", base }}
          startWith={flow.start}
          limits={limits}
          onDone={() => load()}
        />
      )}

      {canManage && base && limits && (
        <Modal open={settings} onOpenChange={setSettings} title="Knowledge base settings" wide>
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
            onCancel={() => setSettings(false)}
            onSubmit={save}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={`Choose ${KIND_LABEL[editing.source.kind]} pages`}
          wide
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryButton} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="button" className={primaryButton} onClick={saveSelection} disabled={!editing.picked.length} data-testid="save-selection">
                Save
              </button>
            </div>
          }
        >
          <Picker kind={editing.source.kind} value={editing.picked} onChange={(picked) => setEditing((e) => (e ? { ...e, picked } : e))} />
        </Modal>
      )}
    </Page>
  );
}

function ItemRow({ f, kind, canManage, onReplace, onDelete }: { f: Item; kind: AddKind; canManage: boolean; onReplace: () => void; onDelete: () => void }) {
  const failed = f.status === "failed";
  const working = f.status === "processing" || f.status === "uploading";
  const when = f.as_of ? new Date(`${f.as_of.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const where = [f.path, when ? `Updated ${when}` : null, kind === "upload" ? fileSize(f.size) : null].filter(Boolean).join(" · ");
  return (
    <li className="relative flex min-w-0 items-center gap-3 px-4 py-3" data-testid="item-row" data-status={f.status}>
      <SourceLogo kind={kind} size="sm" />
      <div className="min-w-0 flex-1">
        {f.url ? (
          <a href={f.url} target="_blank" rel="noopener noreferrer" className={`block truncate text-sm text-zinc-100 hover:underline hover:underline-offset-4 ${focusRing} rounded`} data-testid="item-link">
            {f.name}
            <span className="sr-only"> (opens in {KIND_LABEL[kind]})</span>
          </a>
        ) : (
          <span className="block truncate text-sm text-zinc-100">{f.name}</span>
        )}
        <span className={`block truncate text-xs ${failed ? "text-orange-300" : "text-zinc-500"}`}>{failed ? f.error || "Couldn't be read." : where}</span>
      </div>
      {working && <Chip tone="live">Reading</Chip>}
      {failed && <Chip tone="attention">Not read</Chip>}
      {canManage && kind === "upload" && (
        <MoreMenu
          compact
          label={`${f.name} actions`}
          buttonLabel={`More for ${f.name}`}
          items={[
            { label: "Upload a new version", onSelect: onReplace },
            { label: "Delete", onSelect: onDelete, danger: true },
          ]}
        />
      )}
    </li>
  );
}
