"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { Code } from "@/components/settings/code";
import { buttonClass, focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import {
  KIND_LABEL,
  READ_SENTENCE,
  fileSize,
  itemWord,
  knowledge,
  rememberReturn,
  signInWindow,
  sourceHealth,
  suggestName,
  uploadProblem,
  uploadToSignedUrl,
  type AddKind,
  type Base,
  type Connector,
  type Item,
  type KnowledgeLimits,
  type Selected,
  type Source,
  type SourceKind,
  type Via,
  type WebhookSetup,
} from "@/lib/knowledge";
import { SourceLogo } from "./logos";
import { HybridAppChoice } from "@/components/hybrid-app-choice";
import { Picker } from "./picker";

// The one way to add to Knowledge, for a new knowledge base or an existing
// one: pick an app (or files), connect it with one click if it isn't yet,
// tick what to bring in, then watch it arrive. A new knowledge base is named
// from what was picked, and who can read it is one plain sentence.
//
// Sanity connects by signing in with your own Sanity account, in a small
// window that hands back to the flow (nothing to set up, no key to paste).
// The team's API token is the second choice; it adds instant updates.

type Step = "choose" | "connect" | "pick" | "upload" | "name" | "progress";

export type FlowMode = { kind: "create" } | { kind: "add"; base: Base };

/** Sources a self-hosted install can reach through Coderhelm's app or its own (lib/hybrid.ts). */
const HYBRID_KINDS = new Set<SourceKind>(["notion", "confluence", "google_drive"]);

const TILES: SourceKind[] = ["notion", "confluence", "google_drive", "sanity", "github", "web"];

const PICK_TITLE: Record<SourceKind, string> = {
  notion: "Choose Notion pages",
  confluence: "Choose Confluence spaces or pages",
  google_drive: "Choose Drive folders or files",
  sanity: "Choose what to bring in from Sanity",
  github: "Choose repositories or folders",
  web: "Add website pages",
};

interface LocalUpload {
  key: string;
  file: File;
  progress: number;
  error?: string;
  done?: boolean;
}

export function AddFlow({
  open,
  onOpenChange,
  mode,
  startWith,
  limits,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: FlowMode;
  /** Open straight at this app (coming back from a sign-in, or a tile on the page). */
  startWith?: AddKind | null;
  limits: KnowledgeLimits | null;
  /** The knowledge base that was made or added to. */
  onDone: (baseId: string) => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [kind, setKind] = useState<AddKind | null>(null);
  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [note, setNote] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Selected[]>([]);
  const [files, setFiles] = useState<LocalUpload[]>([]);
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const [readRole, setReadRole] = useState<"viewer" | "member" | "admin">("viewer");
  const [changingRead, setChangingRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ baseId: string; sourceId: string | null; setup: WebhookSetup | null } | null>(null);
  const [finished, setFinished] = useState(false);
  const [via, setVia] = useState<Via>("team");
  const [waiting, setWaiting] = useState(false);
  const started = useRef<string | null>(null);

  const conn = useMemo(() => connectors?.find((c) => c.kind === kind) ?? null, [connectors, kind]);
  const label = kind ? KIND_LABEL[kind] : "";
  const creating = mode.kind === "create";

  const loadConnectors = useCallback(() => {
    setLoadError(null);
    return knowledge
      .connectors()
      .then((r) => {
        setConnectors(r.connectors);
        setNote(r.visibility_note);
        return r.connectors;
      })
      .catch((e) => {
        setLoadError(errorMessage(e, "Couldn't load your connected apps."));
        return null;
      });
  }, []);

  // Fresh each time it opens.
  useEffect(() => {
    if (!open) {
      started.current = null;
      return;
    }
    const key = `${startWith ?? ""}`;
    if (started.current === key) return;
    started.current = key;
    setStep("choose");
    setKind(null);
    setPicked([]);
    setFiles([]);
    setName("");
    setNamed(false);
    setReadRole("viewer");
    setChangingRead(false);
    setError(null);
    setMade(null);
    setFinished(false);
    setVia("team");
    setWaiting(false);
    loadConnectors().then((list) => {
      if (startWith) choose(startWith, list ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startWith]);

  const choose = (k: AddKind, list: Connector[] = connectors ?? []) => {
    setKind(k);
    setPicked([]);
    setError(null);
    if (k === "upload") {
      setStep("upload");
      return;
    }
    const c = list.find((x) => x.kind === k);
    setVia("team");
    // An app you sign in to with your own account always asks first: your
    // sign-in, or the team's token.
    setStep(c?.member_sign_in ? "connect" : c?.connected ? "pick" : "connect");
  };

  // Signs in with your own account in a small window, then shows who you're
  // connected as. The flow stays where it is.
  const memberSignIn = async () => {
    if (!kind || kind === "upload") return;
    setError(null);
    setWaiting(true);
    try {
      const ok = await signInWindow(async () => {
        const path = mode.kind === "add" ? `/knowledge/base/?id=${encodeURIComponent(mode.base.id)}` : "/knowledge/";
        rememberReturn({ path, kind, kbId: mode.kind === "add" ? mode.base.id : undefined });
        const r = await knowledge.signIn(kind);
        return r.signed_in ? null : (r.authorize_url ?? null);
      });
      if (ok) await loadConnectors();
    } catch (e) {
      setError(errorMessage(e, `Couldn't start the ${label} sign-in.`));
    } finally {
      setWaiting(false);
    }
  };

  const continueWith = (v: Via) => {
    setVia(v);
    setPicked([]);
    setError(null);
    setStep("pick");
  };

  const signIn = async () => {
    if (!kind || kind === "upload") return;
    setBusy(true);
    setError(null);
    try {
      const path = mode.kind === "add" ? `/knowledge/base/?id=${encodeURIComponent(mode.base.id)}` : "/knowledge/";
      rememberReturn({ path, kind, kbId: mode.kind === "add" ? mode.base.id : undefined });
      const r = await knowledge.connect(kind);
      window.location.assign(r.authorize_url);
    } catch (e) {
      setError(errorMessage(e, `Couldn't start the ${label} sign-in.`));
      setBusy(false);
    }
  };

  const afterPick = () => {
    if (!kind) return;
    if (!named) setName(suggestName(kind, picked, files.map((f) => f.file)));
    setStep("name");
  };

  const addFiles = (list: File[]) => {
    const bad: string[] = [];
    const ok: LocalUpload[] = [];
    for (const f of list) {
      const p = limits ? uploadProblem(f, limits) : null;
      if (p) bad.push(p);
      else ok.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, progress: 0 });
    }
    setFiles((cur) => [...cur, ...ok]);
    setError(bad.length ? bad.join(" ") : null);
  };

  const uploadAll = async (baseId: string, list: LocalUpload[]) => {
    for (const u of list) {
      try {
        const r = await knowledge.startUpload(baseId, { name: u.file.name, size: u.file.size });
        await uploadToSignedUrl(r.upload, u.file, (p) => setFiles((cur) => cur.map((x) => (x.key === u.key ? { ...x, progress: p } : x))));
        await knowledge.finishUpload(baseId, r.file.id);
        setFiles((cur) => cur.map((x) => (x.key === u.key ? { ...x, progress: 1, done: true } : x)));
      } catch (e) {
        setFiles((cur) => cur.map((x) => (x.key === u.key ? { ...x, error: errorMessage(e, "It didn't upload.") } : x)));
      }
    }
  };

  const finish = async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      const source = kind === "upload" ? undefined : { kind, selection: picked, ...(via === "sign_in" ? { via: "sign_in" as const } : {}) };
      if (mode.kind === "create") {
        const r = await knowledge.create({
          name: name.trim() || suggestName(kind, picked, files.map((f) => f.file)),
          description: "",
          read_role: readRole,
          attach_team: true,
          agents: [],
          authoritative: false,
          source,
        });
        setMade({ baseId: r.base.id, sourceId: r.source?.id ?? null, setup: r.setup });
        setStep("progress");
        if (kind === "upload") uploadAll(r.base.id, files);
      } else {
        if (source) {
          const r = await knowledge.addSource(mode.base.id, source);
          setMade({ baseId: mode.base.id, sourceId: r.source.id, setup: r.setup });
        } else {
          setMade({ baseId: mode.base.id, sourceId: null, setup: null });
          uploadAll(mode.base.id, files);
        }
        setStep("progress");
      }
    } catch (e) {
      setError(errorMessage(e, "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === "choose"
      ? creating
        ? "New knowledge base"
        : `Add to ${mode.kind === "add" ? mode.base.name : "Knowledge"}`
      : step === "connect"
        ? `Connect ${label}`
        : step === "pick" && kind && kind !== "upload"
          ? PICK_TITLE[kind]
          : step === "upload"
            ? "Upload files"
            : step === "name"
              ? creating
                ? "Name your knowledge base"
                : "Ready to add"
              : finished
                ? kind === "upload"
                  ? "Your files are in"
                  : "Your pages are in"
                : kind === "upload"
                  ? "Uploading your files"
                  : "Bringing in your pages";

  const back = () => {
    setError(null);
    if (step === "name") setStep(kind === "upload" ? "upload" : "pick");
    else if (step === "pick" && conn?.member_sign_in) setStep("connect");
    else setStep("choose");
  };

  const footer =
    step === "choose" || step === "progress" ? null : (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={back} className={secondaryButton} disabled={busy}>
          Back
        </button>
        {step === "pick" && (
          <button type="button" onClick={afterPick} className={primaryButton} disabled={!picked.length} data-testid="flow-continue">
            Continue
          </button>
        )}
        {step === "upload" && (
          <button type="button" onClick={afterPick} className={primaryButton} disabled={!files.length} data-testid="flow-continue">
            Continue
          </button>
        )}
        {step === "name" && (
          <button type="button" onClick={finish} className={primaryButton} disabled={busy || (creating && !name.trim())} data-testid="flow-finish">
            {busy ? "Working…" : creating ? "Create knowledge base" : "Add to knowledge base"}
          </button>
        )}
      </div>
    );

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} wide footer={footer} testId="add-flow">
      <div data-step={step} data-testid="flow-step" className="animate-[kn-fade_160ms_ease-out] motion-reduce:animate-none">
        {step === "choose" && (
          <ChooseStep connectors={connectors} loadError={loadError} onRetry={loadConnectors} onChoose={(k) => choose(k)} />
        )}

        {step === "connect" && kind && kind !== "upload" && conn?.member_sign_in && (
          <SignInStep
            kind={kind}
            conn={conn}
            waiting={waiting}
            error={error}
            onSignIn={memberSignIn}
            onCancel={() => setWaiting(false)}
            onContinue={() => continueWith("sign_in")}
            onUseToken={() => continueWith("team")}
          />
        )}

        {step === "connect" && kind && kind !== "upload" && !conn?.member_sign_in && (
          <ConnectStep kind={kind} conn={conn} busy={busy} error={error} onConnect={signIn} />
        )}

        {step === "pick" && kind && kind !== "upload" && <Picker kind={kind} value={picked} onChange={setPicked} via={via} />}

        {step === "upload" && <UploadStep limits={limits} files={files} onAdd={addFiles} onRemove={(k) => setFiles((f) => f.filter((x) => x.key !== k))} error={error} />}

        {step === "name" && kind && (
          <div className="space-y-6" data-testid="name-step">
            <div className="flex items-center gap-3">
              <SourceLogo kind={kind} size="lg" />
              <p className="text-sm text-zinc-300">
                {kind === "upload"
                  ? `${files.length} file${files.length === 1 ? "" : "s"} to upload`
                  : `${picked.length} ${picked.length === 1 ? "item" : "items"} from ${label}${picked.some((p) => p.include_children) && kind !== "web" ? ", with everything inside" : ""}`}
              </p>
            </div>
            {creating && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">Name</span>
                <input
                  className={`${inputClass} !py-3 !text-lg font-semibold`}
                  value={name}
                  maxLength={80}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNamed(true);
                  }}
                  data-testid="flow-name"
                  autoFocus
                />
              </label>
            )}
            {creating && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4" data-testid="read-sentence">
                {!changingRead ? (
                  <p className="text-sm text-zinc-200">
                    {READ_SENTENCE[readRole]}{" "}
                    <button type="button" className={linkButton} onClick={() => setChangingRead(true)} data-testid="change-read">
                      Change
                    </button>
                  </p>
                ) : (
                  <label className="block">
                    <span className="mb-2 block text-sm text-zinc-300">Who can read it</span>
                    <select className={inputClass} value={readRole} onChange={(e) => setReadRole(e.target.value as typeof readRole)} data-testid="read-select">
                      <option value="viewer">Everyone on the team</option>
                      <option value="member">Members, admins and owners</option>
                      <option value="admin">Only admins and owners</option>
                    </select>
                  </label>
                )}
              </div>
            )}
            {via === "sign_in" && kind !== "upload" && (
              <p className="text-sm leading-relaxed text-zinc-400" data-testid="signin-note">
                It stays up to date through your {label} sign-in, checking for changes every 15 minutes. If your sign-in stops working, any admin can sign in again.
              </p>
            )}
            {kind !== "upload" && (
              <p className="flex gap-2.5 text-sm leading-relaxed text-zinc-400" data-testid="visibility-note">
                <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8h.01M11 12h1v4h1" />
                </svg>
                <span>{note || "Everyone who can read this knowledge base can read what you add, even if they can't open it in the app it comes from."}</span>
              </p>
            )}
            {error && (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {step === "progress" && made && kind && (
          <ProgressStep
            kind={kind}
            made={made}
            files={files}
            onFinished={() => setFinished(true)}
            onOpen={() => {
              onOpenChange(false);
              onDone(made.baseId);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function ChooseStep({
  connectors,
  loadError,
  onRetry,
  onChoose,
}: {
  connectors: Connector[] | null;
  loadError: string | null;
  onRetry: () => void;
  onChoose: (k: AddKind) => void;
}) {
  return (
    <div data-testid="choose-step">
      <p className="text-sm text-zinc-400">Pick where your team&apos;s knowledge lives. You can add more places later.</p>
      {loadError && (
        <p className="mt-3 text-sm text-amber-300">
          {loadError}{" "}
          <button type="button" className={linkButton} onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TILES.map((k) => {
          const c = connectors?.find((x) => x.kind === k);
          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => onChoose(k)}
                data-testid={`tile-${k}`}
                className={`group flex h-full w-full flex-col items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-zinc-600 hover:bg-zinc-800/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${focusRing}`}
              >
                <SourceLogo kind={k} size="lg" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-100">{KIND_LABEL[k]}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-400">{c?.blurb ?? " "}</span>
                </span>
                {c?.connected && (
                  <span className="mt-auto inline-flex items-center gap-1.5 text-xs text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Connected
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => onChoose("upload")}
        data-testid="tile-upload"
        className={`mt-3 flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition hover:border-zinc-600 hover:bg-zinc-800/60 motion-reduce:transition-none ${focusRing}`}
      >
        <SourceLogo kind="upload" size="lg" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-100">Upload files</span>
          <span className="block text-xs text-zinc-400">PDF, Word, Markdown, text, spreadsheets or web pages</span>
        </span>
      </button>
    </div>
  );
}

function SignInStep({
  kind,
  conn,
  waiting,
  error,
  onSignIn,
  onCancel,
  onContinue,
  onUseToken,
}: {
  kind: SourceKind;
  conn: Connector;
  waiting: boolean;
  error: string | null;
  onSignIn: () => void;
  onCancel: () => void;
  onContinue: () => void;
  onUseToken: () => void;
}) {
  const label = KIND_LABEL[kind];
  const [showToken, setShowToken] = useState(false);
  const state = conn.signed_in ? "connected" : waiting ? "signing-in" : "choose";
  return (
    <div className="flex flex-col items-center py-4 text-center" data-testid="signin-step" data-state={state}>
      <SourceLogo kind={kind} size="lg" />
      {conn.signed_in ? (
        <>
          <h3 className="mt-5 text-lg font-semibold text-zinc-100">You&apos;re signed in to {label}</h3>
          <p className="mt-2 inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200" data-testid="signed-in-as">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span className="min-w-0 wrap-anywhere">Connected as {conn.signed_in_as || "you"}</span>
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
            Coderhelm reads what you pick with this sign-in. Nothing is changed in {label}.
          </p>
          <button type="button" onClick={onContinue} className={`${buttonClass("primary", "lg")} mt-6`} data-testid="signin-continue" autoFocus>
            Continue
          </button>
        </>
      ) : waiting ? (
        <>
          <h3 className="mt-5 text-lg font-semibold text-zinc-100">Finish signing in to {label}</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400" role="status">
            A {label} window is open. Sign in there and allow Coderhelm to read your content. This page carries on when you&apos;re done.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-400 motion-reduce:animate-none" />
            <span className="text-sm text-zinc-300">Waiting for {label}…</span>
          </div>
          <button type="button" onClick={onCancel} className={`${linkButton} mt-4 text-sm`} data-testid="signin-cancel">
            Cancel
          </button>
        </>
      ) : (
        <>
          <h3 className="mt-5 text-lg font-semibold text-zinc-100">Connect {label}</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
            Sign in with your {label} account and choose what to bring in. There&apos;s nothing to set up and no key to copy. Nothing is changed in {label}.
          </p>
          {HYBRID_KINDS.has(kind) && <HybridAppChoice id={kind} name={label} className="mt-5 w-full max-w-md text-left" />}
          <button type="button" onClick={onSignIn} className={`${buttonClass("primary", "lg")} mt-6`} data-testid="signin-button">
            Sign in with {label}
          </button>
        </>
      )}
      {error && (
        <p className="mt-4 max-w-sm text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {!waiting && (
        <div className="mt-8 w-full max-w-sm border-t border-zinc-800 pt-5 text-left" data-testid="token-option">
          {conn.has_saved_key ? (
            <button type="button" className={`${linkButton} text-sm`} onClick={onUseToken} data-testid="use-token">
              Use the team&apos;s API token instead (adds instant updates)
            </button>
          ) : !showToken ? (
            <button type="button" className={`${linkButton} text-sm`} onClick={() => setShowToken(true)} data-testid="use-token">
              Use an API token instead (adds instant updates)
            </button>
          ) : (
            <div className="text-sm leading-relaxed text-zinc-300" data-testid="token-help">
              <p>
                An admin saves a {label} API token (Viewer is enough) and the project id on the Integrations page. With a token, changes arrive the moment they&apos;re published.
              </p>
              <p className="mt-3">
                <Link href="/settings/integrations/#integration-sanity" className={linkButton} target="_blank" rel="noopener noreferrer">
                  Open Integrations in a new tab
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectStep({
  kind,
  conn,
  busy,
  error,
  onConnect,
}: {
  kind: SourceKind;
  conn: Connector | null;
  busy: boolean;
  error: string | null;
  onConnect: () => void;
}) {
  const label = KIND_LABEL[kind];
  return (
    <div className="flex flex-col items-center py-6 text-center" data-testid="connect-step">
      <SourceLogo kind={kind} size="lg" />
      <h3 className="mt-5 text-lg font-semibold text-zinc-100">
        {conn?.reconnect_reason ? `Reconnect ${label}` : `Connect ${label} to Coderhelm`}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
        {conn?.reconnect_reason
          ? `Your ${label} connection stopped working. Sign in again and everything picks up where it left off.`
          : kind === "notion"
            ? "You'll sign in to Notion and choose which pages Coderhelm can see. Nothing is changed in Notion."
            : `You'll sign in to ${label} and allow Coderhelm to read it. Nothing is changed in ${label}.`}
      </p>
      {HYBRID_KINDS.has(kind) && <HybridAppChoice id={kind} name={label} className="mt-5 w-full max-w-md text-left" />}
      {conn?.can_sign_in ? (
        <button type="button" onClick={onConnect} className={`${buttonClass("primary", "lg")} mt-6`} disabled={busy} data-testid="connect-button">
          {busy ? "Opening…" : `Connect ${label}`}
        </button>
      ) : (
        <div className="mt-6 max-w-sm rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-left text-sm text-zinc-300" data-testid="connect-hint">
          <p>{conn?.hint || `${label} isn't connected yet.`}</p>
          <p className="mt-3">
            <Link href="/settings/integrations/" className={linkButton}>
              Open Connected apps
            </Link>
          </p>
        </div>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function UploadStep({
  limits,
  files,
  onAdd,
  onRemove,
  error,
}: {
  limits: KnowledgeLimits | null;
  files: LocalUpload[];
  onAdd: (f: File[]) => void;
  onRemove: (key: string) => void;
  error: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div data-testid="upload-step">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onAdd(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-center rounded-xl border px-6 py-10 text-center transition-colors motion-reduce:transition-none ${over ? "border-emerald-400/60 bg-emerald-500/5" : "border-zinc-800 bg-zinc-950/40"}`}
      >
        <SourceLogo kind="upload" size="lg" />
        <p className="mt-4 text-sm font-medium text-zinc-100">Drop files here</p>
        <p className="mt-1 text-xs text-zinc-400">
          {limits ? `Up to ${Math.round(limits.max_file_bytes / (1024 * 1024))} MB each` : "PDF, Word, Markdown, text, spreadsheets"}
        </p>
        <button type="button" className={`${secondaryButton} mt-4`} onClick={() => input.current?.click()}>
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          data-testid="flow-upload-input"
          aria-label="Choose files"
          accept={(limits?.extensions ?? []).map((x) => `.${x}`).join(",")}
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-3 text-sm text-amber-300">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-800 rounded-xl border border-zinc-800">
          {files.map((f) => (
            <li key={f.key} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{f.file.name}</span>
              <span className="shrink-0 text-xs text-zinc-400">{fileSize(f.file.size)}</span>
              <button type="button" className={`${buttonClass("ghost", "sm")}`} onClick={() => onRemove(f.key)} aria-label={`Remove ${f.file.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgressStep({
  kind,
  made,
  files,
  onFinished,
  onOpen,
}: {
  kind: AddKind;
  made: { baseId: string; sourceId: string | null; setup: WebhookSetup | null };
  files: LocalUpload[];
  onFinished: () => void;
  onOpen: () => void;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (kind === "upload") return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await knowledge.get(made.baseId);
        if (stop) return;
        setSource(r.sources.find((s) => s.id === made.sourceId) ?? null);
        setItems(r.files.filter((f) => f.source_id === made.sourceId));
      } catch {
        // Keep the last view; the next tick tries again.
      }
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [kind, made.baseId, made.sourceId]);

  const allUploaded = kind === "upload" && files.length > 0 && files.every((f) => f.done || f.error);
  const imported = source?.status === "ready";
  useEffect(() => {
    if (allUploaded || imported) onFinished();
  }, [allUploaded, imported, onFinished]);

  if (kind === "upload") {
    const done = files.filter((f) => f.done).length;
    return (
      <div data-testid="progress-step">
        <ProgressBar value={files.length ? done / files.length : 0} />
        <p className="mt-3 text-sm text-zinc-300">
          {done === files.length ? "All files uploaded. They're being read now and will be ready in a minute." : `Uploading ${done + 1} of ${files.length}`}
        </p>
        <ul className="mt-4 space-y-2">
          {files.map((f) => (
            <li key={f.key} className="flex min-w-0 items-center gap-3 text-sm">
              <Tick done={!!f.done} failed={!!f.error} />
              <span className="min-w-0 flex-1 truncate text-zinc-200">{f.file.name}</span>
              <span className="shrink-0 text-xs text-zinc-400">{f.error ? f.error : f.done ? "Uploaded" : `${Math.round(f.progress * 100)}%`}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end">
          <button type="button" className={primaryButton} onClick={onOpen} data-testid="flow-open">
            Open knowledge base
          </button>
        </div>
      </div>
    );
  }

  const p = source?.progress;
  const total = p?.phase === "fetching" ? p.total : 0;
  const fraction = source?.status === "ready" ? 1 : total ? p!.done / total : 0;
  const health = source ? sourceHealth(source) : { tone: "live" as const, words: "Getting started" };
  const ready = items.filter((i) => i.status === "ready");
  return (
    <div data-testid="progress-step">
      <div className="flex items-center gap-3">
        <SourceLogo kind={kind} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100" data-testid="progress-words">
            {source?.status === "ready" ? `Done. ${itemWord(kind, source.items)} ready.` : health.words}
          </p>
          <p className="text-xs text-zinc-400">You can close this. It keeps going, and stays up to date on its own.</p>
        </div>
      </div>
      <div className="mt-5">
        <ProgressBar value={fraction} indeterminate={source?.status !== "ready" && !total} />
      </div>
      {source?.status === "error" && source.error && (
        <p className="mt-4 text-sm text-amber-300" role="alert">
          {source.error.fix}
        </p>
      )}
      {ready.length > 0 && (
        <ul className="mt-5 space-y-2" aria-label="Arrived so far" data-testid="arrived">
          {ready.slice(0, 6).map((i) => (
            <li key={i.id} className="flex min-w-0 items-center gap-3 text-sm animate-[kn-fade_200ms_ease-out] motion-reduce:animate-none">
              <Tick done failed={false} />
              <span className="min-w-0 flex-1 truncate text-zinc-200">{i.name}</span>
            </li>
          ))}
          {ready.length > 6 && <li className="pl-7 text-xs text-zinc-400">and {ready.length - 6} more</li>}
        </ul>
      )}
      {made.setup && (
        <details className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-300" data-testid="instant-setup">
          <summary className="cursor-pointer font-medium text-zinc-100">Optional: get changes instantly</summary>
          <p className="mt-2 text-zinc-400">
            Changes in Sanity are brought in every hour. To bring them in the moment they&apos;re published, add this address in Sanity (API, then Webhooks) with the secret below.
          </p>
          <p className="mt-3 text-xs text-zinc-400">Address</p>
          <p className="mt-1">
            <Code className="block px-2 py-1.5 text-xs">{made.setup.url}</Code>
          </p>
          <p className="mt-3 text-xs text-zinc-400">Secret</p>
          <p className="mt-1">
            <Code className="block px-2 py-1.5 text-xs">{made.setup.secret}</Code>
          </p>
        </details>
      )}
      <div className="mt-6 flex justify-end">
        <button type="button" className={primaryButton} onClick={onOpen} data-testid="flow-open">
          Open knowledge base
        </button>
      </div>
    </div>
  );
}

function Tick({ done, failed }: { done: boolean; failed: boolean }) {
  if (failed) return <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs text-red-300">!</span>;
  return (
    <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800"}`}>
      {done && (
        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </span>
  );
}

export function ProgressBar({ value, indeterminate = false }: { value: number; indeterminate?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}>
      {indeterminate ? (
        <div className="h-full w-1/3 animate-[kn-slide_1.4s_ease-in-out_infinite] rounded-full bg-sky-400/80 motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-40" />
      ) : (
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.max(4, Math.round(value * 100))}%` }} />
      )}
    </div>
  );
}
