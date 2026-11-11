"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Page, PageHeader, Section } from "@/components/page";
import { Chip, ListError } from "@/components/list";
import { Modal } from "@/components/modal";
import { Code } from "@/components/settings/code";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { useCan } from "@/hooks/use-can";
import { buttonClass, primaryButton, secondaryButton } from "@/components/ui";
import { AddFlow, ConnectProblemNote } from "@/components/knowledge/add-flow";
import { SourceLogo } from "@/components/knowledge/logos";
import { Picker } from "@/components/knowledge/picker";
import { ConnectionRow, type ConnectionActions } from "@/components/knowledge/connections";
import { Content } from "@/components/knowledge/content";
import { Access, PageNav, ProblemsBanner, StatusChip, Tiles, overallStatus } from "@/components/knowledge/base-parts";
import { kbPage, missingRoute, type ItemState, type PageBase, type PageItem, type PageSource } from "@/lib/knowledge-page";
import { errorMessage } from "@/lib/data-sources";
import {
  KIND_LABEL,
  connectProblem,
  connectedInPlace,
  itemWord,
  knowledge,
  rememberReturn,
  signInWindow,
  uploadProblem,
  uploadToSignedUrl,
  type AddKind,
  type Base,
  type BaseInput,
  type ConnectProblem,
  type KnowledgeLimits,
  type Selected,
  type SourceKind,
} from "@/lib/knowledge";
import { BaseForm } from "../base-form";
import { ARCHIVE_WARNING, archiveProblem } from "@/components/knowledge/import-steps";

// One knowledge base, in the order people ask about it: is it healthy (one
// status, four tiles, a banner only when something is wrong), how each
// source connects, what's in it (a tree the gateway pages and searches),
// and who reads it. Drop files anywhere to add them. While anything syncs
// the page polls only the sources and the counts, never every item.
//
// A base connected in place (a Bedrock knowledge base, a search tool) has
// no files here: it says where it lives and how it is reached, and can
// check its connection with one test search.

export default function BasePage() {
  return (
    <Suspense fallback={null}>
      <BaseView />
    </Suspense>
  );
}

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
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<{ ok: true; at: string } | { ok: false; problem: ConnectProblem } | null>(null);
  const [base, setBase] = useState<PageBase | null>(null);
  const [files, setFiles] = useState<PageItem[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sources, setSources] = useState<PageSource[]>([]);
  const [visibilityNote, setVisibilityNote] = useState("");
  const [version, setVersion] = useState(0);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [wantStatus, setWantStatus] = useState<{ status: ItemState | ""; at: number } | null>(null);
  const [limits, setLimits] = useState<KnowledgeLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<{ open: boolean; start: AddKind | null }>({ open: false, start: null });
  const [settings, setSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ source: PageSource; picked: Selected[] } | null>(null);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const archiveRef = useRef<HTMLInputElement>(null);
  const archiveFor = useRef<PageSource | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    kbPage
      .base(id)
      .then((r) => {
        setBase(r.base);
        // An older gateway sends every item with the base: the page then
        // pages and filters them here.
        setFiles(r.files ? (r.files as PageItem[]) : null);
        setSources(r.sources ?? []);
        setLimits(r.limits);
        setVisibilityNote(r.visibility_note ?? "");
        setLoaded(true);
        setVersion((v) => v + 1);
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
    sources.some((s) => s.status === "syncing" || s.status === "queued") || (base?.processing ?? 0) > 0 || (files ?? []).some((f) => f.status === "processing" || f.status === "uploading");
  // While anything syncs: only the sources and the counts, every 3 seconds.
  // When a source finishes (or uploads are read), the items are read again.
  const pollKey = useRef("");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      kbPage
        .poll(id)
        .then((r) => {
          setBase(r.base);
          setSources(r.sources);
          const key = r.sources.map((s) => `${s.id}:${s.status}:${s.items}:${s.failed_items}`).join(",") + `|${r.base.ready}|${r.base.failed}|${r.base.processing}`;
          if (key !== pollKey.current) {
            pollKey.current = key;
            setVersion((v) => v + 1);
          }
        })
        .catch((e) => {
          if (missingRoute(e)) load();
        });
    }, 3000);
    return () => clearInterval(t);
  }, [busy, id, load]);

  // Files dropped before the base (and its upload limits) loaded wait here,
  // then go through once it has: nothing a person drops is lost.
  const waiting = useRef<{ list: File[]; replace?: string }[]>([]);
  const upload = async (list: File[], replace?: string) => {
    if (!list.length) return;
    if (!limits) {
      waiting.current.push({ list, replace });
      return;
    }
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


  useEffect(() => {
    if (!limits || !waiting.current.length) return;
    const queued = waiting.current;
    waiting.current = [];
    for (const q of queued) void upload(q.list, q.replace);
    // upload reads the limits that just arrived; it changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limits]);
  const reconnect = async (s: PageSource) => {
    try {
      rememberReturn({ path: `/knowledge/base/?id=${encodeURIComponent(id)}`, kind: s.kind, kbId: id });
      const r = await knowledge.connect(s.kind);
      window.location.assign(r.authorize_url);
    } catch (e) {
      toast(errorMessage(e, `Couldn't start the ${KIND_LABEL[s.kind]} sign-in.`), "error");
    }
  };

  // "Sign in again": the source switches to your own sign-in. When you're
  // already signed in it happens at once; otherwise a small window signs
  // you in first and the page carries on.
  const needsSignIn = sources.some((s) => s.error?.action === "sign_in");
  const [signedIn, setSignedIn] = useState<Partial<Record<SourceKind, boolean>>>({});
  useEffect(() => {
    if (!needsSignIn || !canManage) return;
    knowledge
      .connectors()
      .then((r) => setSignedIn(Object.fromEntries(r.connectors.map((c) => [c.kind, !!c.signed_in]))))
      .catch(() => {});
  }, [needsSignIn, canManage]);

  const signInAgain = async (s: PageSource) => {
    try {
      // Known before the click, so the sign-in window opens inside it.
      if (!signedIn[s.kind]) {
        const ok = await signInWindow(async () => {
          rememberReturn({ path: `/knowledge/base/?id=${encodeURIComponent(id)}`, kind: s.kind, kbId: id });
          const r = await knowledge.signIn(s.kind);
          return r.signed_in ? null : (r.authorize_url ?? null);
        });
        if (!ok) return;
      }
      const r = await knowledge.signInSource(id, s.id);
      if (r.source) {
        setSources((cur) => cur.map((x) => (x.id === s.id ? r.source! : x)));
        toast(`Signed in. Checking ${KIND_LABEL[s.kind]} for changes now.`);
      }
    } catch (e) {
      toast(errorMessage(e, `Couldn't sign in to ${KIND_LABEL[s.kind]}.`), "error");
    }
  };

  // A newer export of an archive source: warned first, then the same source
  // reads it (unchanged pages kept, changed read again, missing removed).
  const pickArchive = async (s: PageSource) => {
    const ok = await confirm({ title: "Upload a newer export?", message: ARCHIVE_WARNING, confirmLabel: "Choose the archive" });
    if (!ok) return;
    archiveFor.current = s;
    archiveRef.current?.click();
  };
  const replaceArchive = async (s: PageSource, f: File) => {
    const bad = archiveProblem(f, limits);
    if (bad) {
      toast(bad, "error");
      return;
    }
    try {
      const r = await knowledge.startArchive(id, { name: f.name, size: f.size, replace: s.id });
      setSources((cur) => cur.map((x) => (x.id === s.id ? r.source : x)));
      await uploadToSignedUrl(r.upload, f, () => {});
      const done = await knowledge.finishArchive(id, s.id);
      setSources((cur) => cur.map((x) => (x.id === s.id ? done.source : x)));
      toast("Uploaded. Reading the newer export now.");
    } catch (e) {
      toast(errorMessage(e, "The archive didn't upload."), "error");
    }
  };

  const sync = async (s: PageSource) => {
    try {
      const r = await knowledge.syncSource(id, s.id);
      setSources((cur) => cur.map((x) => (x.id === s.id ? r.source : x)));
    } catch (e) {
      toast(errorMessage(e, "Couldn't check for changes."), "error");
    }
  };

  const pause = async (s: PageSource, paused: boolean) => {
    try {
      const r = await knowledge.updateSource(id, s.id, { paused });
      setSources((cur) => cur.map((x) => (x.id === s.id ? r.source : x)));
      toast(paused ? "Updates paused" : "Updates resumed");
    } catch (e) {
      toast(errorMessage(e, "That didn't work."), "error");
    }
  };

  const switchConnection = async (s: PageSource, via: "oauth" | "saved_key") => {
    try {
      const r = await kbPage.switchConnection(id, s.id, via);
      setSources((cur) => cur.map((x) => (x.id === s.id ? r.source : x)));
      toast(via === "saved_key" ? "Switched to the saved API token. Checking for changes now." : `Switched to the team's ${KIND_LABEL[s.kind]} sign-in. Checking for changes now.`);
    } catch (e) {
      toast(errorMessage(e, "Couldn't change the connection."), "error");
    }
  };

  const removeSource = async (s: PageSource) => {
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

  const removeFile = async (f: PageItem) => {
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

  const checkConnection = async () => {
    setChecking(true);
    try {
      const r = await knowledge.check(id);
      setChecked({ ok: true, at: r.checked_at });
    } catch (e) {
      setChecked({ ok: false, problem: connectProblem(e, "Couldn't check the connection.") });
    } finally {
      setChecking(false);
    }
  };

  const removeBase = async () => {
    if (!base) return;
    const ok = await confirm({
      title: `Delete ${base.name}?`,
      message: connectedInPlace(base)
        ? "It is disconnected from Coderhelm: Chat and the agents stop searching it. Nothing changes in your AWS account."
        : "Everything in it is removed from Coderhelm. Nothing changes in the apps it came from. This can't be undone.",
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

  const uploadsCount = base?.uploads ?? 0;
  const inPlace = connectedInPlace(base);
  const status = base ? overallStatus(base, sources) : null;
  // Nothing in it yet and nothing coming: the one thing to do is add.
  const empty = !!base && loaded && sources.length === 0 && (base.files ?? 0) === 0 && uploads.length === 0;
  const nav = [
    { id: "connections", label: "Connections" },
    { id: "content", label: "Content" },
    { id: "access", label: "Access" },
  ];
  const showState = (st: ItemState | "") => {
    setWantStatus({ status: st, at: Date.now() });
    document.getElementById("content")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const fixSource = (s: PageSource) =>
    s.error?.action === "sign_in"
      ? signInAgain(s)
      : s.error?.action === "reconnect"
        ? reconnect(s)
        : s.error?.action === "edit"
          ? s.kind === "archive"
            ? pickArchive(s)
            : setEditing({ source: s, picked: s.selection })
          : sync(s);
  const rowActions: ConnectionActions = {
    onSync: sync,
    onFix: fixSource,
    onEdit: (s) => setEditing({ source: s, picked: s.selection }),
    onReconnect: reconnect,
    onSignIn: signInAgain,
    onSwitch: switchConnection,
    onPause: pause,
    onRemove: removeSource,
    onNewExport: pickArchive,
  };
  // Files go only to bases kept here.
  const canUpload = canManage && !inPlace;

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
    if (canUpload) upload(Array.from(e.dataTransfer.files));
  };

  return (
    <Page testId="knowledge-base-page">
      <div
        onDragEnter={(e) => {
          if (canUpload && e.dataTransfer.types.includes("Files")) setDragging(true);
        }}
        onDragOver={(e) => {
          if (canUpload) e.preventDefault();
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
          status={
            base ? (
              <>
                {status && <StatusChip status={status} />}
                {base.authoritative && <Chip tone="success">Source of truth</Chip>}
              </>
            ) : undefined
          }
          lead={base?.description || undefined}
          actions={
            canUpload ? (
              <button type="button" onClick={() => setFlow({ open: true, start: null })} className={primaryButton} data-testid="add-source">
                Add
              </button>
            ) : undefined
          }
          more={
            canManage
              ? [
                  { label: "Settings", onSelect: () => setSettings(true) },
                  ...(inPlace ? [] : [{ label: "Upload files", onSelect: () => fileRef.current?.click() }]),
                  { label: inPlace ? "Disconnect knowledge base" : "Delete knowledge base", onSelect: removeBase, danger: true },
                ]
              : undefined
          }
        />
        {base && !inPlace && empty && (
          <EmptyBase canManage={canManage} onAdd={() => setFlow({ open: true, start: null })} />
        )}
        {base && !inPlace && !empty && (
          <>
            <PageNav sections={nav} />
            <Tiles
              data={{ searchable: base.ready, failed: base.failed, skipped: base.skipped ?? 0, working: base.processing, passages: base.passages ?? 0 }}
              sources={sources}
              onShow={showState}
            />
            <ProblemsBanner sources={sources} failed={base.failed} canManage={canManage} onFix={fixSource} onShowFailed={() => showState("failed")} />
          </>
        )}

        {!inPlace && (
          <>
        <input
          ref={archiveRef}
          type="file"
          className="hidden"
          aria-label="Upload a newer export"
          data-testid="archive-replace-input"
          accept=".zip,application/zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            const s = archiveFor.current;
            archiveFor.current = null;
            if (f && s) void replaceArchive(s, f);
          }}
        />
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
          </>
        )}

        {problems.length > 0 && (
          <div className="mt-6 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 text-sm text-orange-200" data-testid="upload-problems" role="alert">
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {inPlace && base && (
          <Section title="Connection" id="connections">
            <ConnectedCard base={base} canManage={canManage} checking={checking} checked={checked} onCheck={checkConnection} />
          </Section>
        )}

        {!inPlace && base && !empty && (
          <>
            <Section title="Connections" id="connections" description="Where its pages come from, how each one connects, and whether it is up to date.">
              <ul className="min-w-0 divide-y divide-zinc-800/80 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40" data-testid="sources">
                {sources.map((s) => (
                  <ConnectionRow
                    key={s.id}
                    kbId={id}
                    source={s}
                    canManage={canManage}
                    limits={limits}
                    open={openRow === s.id}
                    onToggle={() => setOpenRow((o) => (o === s.id ? null : s.id))}
                    actions={rowActions}
                  />
                ))}
                {(uploadsCount > 0 || uploads.length > 0) && (
                  <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5" data-testid="uploads-card">
                    <SourceLogo kind="upload" size="md" />
                    <div className="min-w-0 flex-1 basis-40">
                      <h3 className="text-sm font-semibold text-zinc-100">Uploaded files</h3>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {itemWord("upload", uploadsCount)} · {canManage ? "drop files anywhere on this page" : "files people uploaded"}
                      </p>
                      {uploads.length > 0 && (
                        <ul className="mt-2 space-y-1" aria-label="Uploading">
                          {uploads.map((u) => (
                            <li key={u.key} className="flex min-w-0 items-center gap-2 text-xs" data-testid="upload-progress">
                              <span className="min-w-0 flex-1 truncate text-zinc-300">{u.name}</span>
                              <span className="shrink-0 text-zinc-500">{Math.round(u.progress * 100)}%</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {canManage && (
                      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => fileRef.current?.click()} disabled={!limits} data-testid="upload-button">
                        Upload files
                      </button>
                    )}
                  </li>
                )}
              </ul>
            </Section>

            <Section title="Content" id="content" description="Every page, grouped by where it lives. Titles open the original.">
              {loaded && (
                <Content
                  kbId={id}
                  sources={sources}
                  files={files}
                  canManage={canManage}
                  version={version}
                  wantStatus={wantStatus}
                  onReplace={(f) => {
                    replacing.current = f.id;
                    replaceRef.current?.click();
                  }}
                  onDelete={removeFile}
                />
              )}
            </Section>
          </>
        )}

        {base && (
          <Section title="Access" id="access">
            <Access base={base} limits={limits} visibilityNote={visibilityNote} canManage={canManage} onChange={() => setSettings(true)} />
          </Section>
        )}

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

      {canUpload && base && (
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
              readers: base.readers ?? [],
            }}
            agentNote={base.agent_access_note}
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
          wide={editing.source.kind === "web" ? true : "xl"}
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
          <Picker
            kind={editing.source.kind}
            via={editing.source.connection === "sign_in" ? "sign_in" : "team"}
            value={editing.picked}
            onChange={(picked) => setEditing((e) => (e ? { ...e, picked } : e))}
          />
        </Modal>
      )}
    </Page>
  );
}

/** A base with nothing in it yet: what it is for, and the one thing to do. */
function EmptyBase({ canManage, onAdd }: { canManage: boolean; onAdd: () => void }) {
  return (
    <div className="mt-8 flex min-w-0 flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900/40 px-6 py-12 text-center" data-testid="empty-base">
      <div className="flex items-center gap-2" aria-hidden="true">
        {(["confluence", "notion", "google_drive", "github", "upload"] as const).map((k) => (
          <SourceLogo key={k} kind={k} size="md" />
        ))}
      </div>
      <h2 className="mt-5 text-base font-semibold text-zinc-100">Add where this knowledge lives</h2>
      <p className="mt-1 max-w-md text-sm text-zinc-400">
        Connect an app, import a bucket or an export, or upload files. Chat and the agents you pick search it once the first pages are in.
      </p>
      {canManage ? (
        <button type="button" className={`${primaryButton} mt-5`} onClick={onAdd} data-testid="empty-add">
          Add
        </button>
      ) : (
        <p className="mt-5 text-sm text-zinc-500">Ask an admin to add what it should hold.</p>
      )}
    </div>
  );
}

/** A base connected in place: where it lives, how it is reached, and a check of the connection. */
function ConnectedCard({
  base,
  canManage,
  checking,
  checked,
  onCheck,
}: {
  base: Base & { backend: Extract<NonNullable<Base["backend"]>, { kind: "remote" }> };
  canManage: boolean;
  checking: boolean;
  checked: { ok: true; at: string } | { ok: false; problem: ConnectProblem } | null;
  onCheck: () => void;
}) {
  const b = base.backend;
  const check = canManage && (
    <div className="mt-4 space-y-3">
      <button type="button" className={buttonClass("secondary", "sm")} onClick={onCheck} disabled={checking} data-testid="check-connection">
        {checking ? "Checking…" : "Check connection"}
      </button>
      {checked?.ok && (
        <p className="text-sm text-emerald-300" role="status" data-testid="check-ok">
          Searched it just now. The connection works.
        </p>
      )}
      {checked && !checked.ok && <ConnectProblemNote problem={checked.problem} />}
    </div>
  );
  if (b.provider === "mcp") {
    return (
      <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5" data-testid="connected-in-place" data-provider="mcp">
        <div className="flex items-start gap-3">
          <SourceLogo kind="mcp" size="md" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100">{b.label}</h3>
            <p className="mt-0.5 text-sm text-emerald-300" data-testid="connected-line">
              Connected in place: searched live through {b.server_name}, nothing copied
            </p>
          </div>
        </div>
        <dl className="mt-4 grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-zinc-500">Server</dt>
          <dd className="min-w-0 text-zinc-300">{b.server_name}</dd>
          <dt className="text-zinc-500">Searches with</dt>
          <dd className="min-w-0 text-xs leading-5">
            <Code>{b.search_tool}</Code>
            {b.fetch_tool && (
              <>
                {" "}
                and reads results with <Code>{b.fetch_tool}</Code>
              </>
            )}
          </dd>
          <dt className="text-zinc-500">Whose access</dt>
          <dd className="text-zinc-300" data-testid="connected-access">
            {b.per_person ? "Each person's own sign-in" : "The team's one connection"}
          </dd>
        </dl>
        {b.per_person ? (
          <p className="mt-4 text-sm leading-relaxed text-zinc-400" data-testid="per-person-note">
            Each person&apos;s search uses their own sign-in, so they only see what that tool lets them see. Agent runs search as the person who started them; runs nobody started skip it.
          </p>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            Chat and the agents it is attached to search it whenever they need it, through the team&apos;s connection. Nothing is stored here, and deleting it here changes nothing in the tool.
          </p>
        )}
        {check}
      </div>
    );
  }
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5" data-testid="connected-in-place">
      <div className="flex items-start gap-3">
        <SourceLogo kind="bedrock_kb" size="md" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100">{b.label}</h3>
          <p className="mt-0.5 text-sm text-emerald-300" data-testid="connected-line">
            Connected in place: searched live in your AWS account, nothing copied
          </p>
        </div>
      </div>
      <dl className="mt-4 grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-zinc-500">Knowledge base</dt>
        <dd className="min-w-0 text-xs leading-5" data-testid="connected-arn">
          <Code>{b.target}</Code>
        </dd>
        <dt className="text-zinc-500">Where</dt>
        <dd className="text-zinc-300">
          AWS account {b.account}, {b.region}
        </dd>
        <dt className="text-zinc-500">Searched with</dt>
        <dd className="text-zinc-300" data-testid="connected-access">
          {b.access === "install"
            ? "This install's own role, read-only"
            : "The CoderHelmLogReader role in that account, with your team's private ID, read-only"}
        </dd>
        <dt className="text-zinc-500">Search</dt>
        <dd className="text-zinc-300">{b.hybrid ? "Hybrid: meaning and exact words" : "By meaning (this vector store has no keyword search)"}</dd>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        Chat and the agents it is attached to search it whenever they need it, so documents you add in Bedrock count as soon as Bedrock has them. Nothing is stored here, and deleting it here changes nothing in AWS.
      </p>
      {check}
    </div>
  );
}
