"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { Code } from "@/components/settings/code";
import { Select } from "@/components/select";
import { buttonClass, focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import {
  KB_ARN,
  KIND_LABEL,
  READ_SENTENCE,
  connectProblem,
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
  type BedrockStart,
  type ConnectProblem,
  type Connector,
  type Item,
  type KnowledgeLimits,
  type S3Place,
  type Selected,
  type Source,
  type SourceInput,
  type SourceKind,
  type Via,
  type WebhookSetup,
} from "@/lib/knowledge";
import { useCan } from "@/hooks/use-can";
import { SourceLogo } from "./logos";
import { HybridAppChoice, useHybridChoice, type Choice } from "@/components/hybrid-app-choice";
import { Picker, continueLabel } from "./picker";
import { ARCHIVE_WARNING, ArchiveStep, BedrockImportStep, ImportProblem, McpStep, S3Step, WHOLE_BUCKET, type ImportPlan, type McpChoice } from "./import-steps";
import { ReadersEditor } from "./readers";
import { AskAdmin, ConfluenceSteps, ConnectLoading, IntegrationsLink, NoTokenPath, NotionSteps, TokenForm } from "./token-connect";

// The one way to add to Knowledge, for a new knowledge base or an existing
// one: pick an app (or files), connect it with one click if it isn't yet,
// tick what to bring in, then watch it arrive. A new knowledge base is named
// from what was picked, and who can read it is one plain sentence.
//
// Sanity connects by signing in with your own Sanity account, in a small
// window that hands back to the flow (nothing to set up, no key to paste).
// The team's API token is the second choice; it adds instant updates.
//
// Choosing an app goes straight to that app's step. Which step that is
// (connect or pick) depends on what the team has connected, so until that
// has loaded the app's step shows a placeholder and decides when it arrives:
// the list of apps never shows again in between. Without the app's sign-in
// on this install, Notion and Confluence connect with a pasted token right
// here (admins and owners), and Google Drive says its sign-in isn't set up
// and who can set it up (with the steps for a platform admin).
//
// A Bedrock knowledge base is connected in place, only as a new knowledge
// base: paste its ARN (a self-hosted install also lists its own account's),
// name it, and one test search runs before anything is saved. It is then
// searched live in the team's AWS account; nothing is copied.

type Step = "choose" | "connect" | "pick" | "upload" | "bedrock" | "mcp" | "s3" | "bedrock_import" | "archive" | "name" | "progress";

/** Kinds with a step of their own (no app connection to make first). */
const OWN_STEP: Partial<Record<AddKind, Step>> = {
  upload: "upload",
  bedrock_kb: "bedrock",
  mcp: "mcp",
  s3: "s3",
  bedrock_import: "bedrock_import",
  archive: "archive",
};

export type FlowMode = { kind: "create" } | { kind: "add"; base: Base };

/** Sources a self-hosted install can reach through Coderhelm's app or its own (lib/hybrid.ts). */
const HYBRID_KINDS = new Set<SourceKind>(["notion", "confluence", "google_drive"]);

const TILES: SourceKind[] = ["notion", "confluence", "google_drive", "sanity", "github", "web"];

/** An app connected through its sign-in or key, picked from in the tree picker. */
function isApp(k: AddKind | null): k is SourceKind {
  return !!k && (TILES as string[]).includes(k);
}

/** Kinds connected in place: a new knowledge base only, searched live. */
const IN_PLACE = new Set<AddKind>(["bedrock_kb", "mcp"]);

const PICK_TITLE: Partial<Record<SourceKind, string>> = {
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
  /** An app was chosen before the connections loaded: decide its step when they arrive. */
  const [deciding, setDeciding] = useState(false);
  const [tokenNote, setTokenNote] = useState("");
  const [arn, setArn] = useState("");
  const [arnName, setArnName] = useState("");
  const [problem, setProblem] = useState<ConnectProblem | null>(null);
  const [mcp, setMcp] = useState<McpChoice | null>(null);
  const [s3, setS3] = useState<S3Place>({ account: "", bucket: "", region: "" });
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [archive, setArchive] = useState<File | null>(null);
  const [readers, setReaders] = useState<string[]>([]);
  const { can, me } = useCan();
  const canSaveToken = can("integrations");
  const installAdmin = me?.platform_admin === true;

  // Fresh each time it opens, set during render (not in an effect) so the
  // first frame is already the right step: never the previous run's, and
  // never the list of apps when it opens at one app.
  const openKey = open ? `${startWith ?? ""}` : null;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (openKey !== seenKey) {
    setSeenKey(openKey);
    if (openKey !== null) {
      const first = startWith ?? null;
      setStep(first === null ? "choose" : (OWN_STEP[first] ?? "connect"));
      setKind(first);
      setDeciding(first !== null && !OWN_STEP[first]);
      setConnectors(null);
      setLoadError(null);
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
      setTokenNote("");
      setArn("");
      setArnName("");
      setProblem(null);
      setMcp(null);
      setS3({ account: "", bucket: "", region: "" });
      setPlan(null);
      setArchive(null);
      setReaders([]);
    }
  }

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

  // What the team has connected, loaded once per opening.
  useEffect(() => {
    if (openKey === null) return;
    loadConnectors();
  }, [openKey, loadConnectors]);

  /** The step an app starts at, from what the team has connected. */
  const stepFor = (c: Connector | undefined): Step =>
    // An app you sign in to with your own account always asks first: your
    // sign-in, or the team's token.
    c?.member_sign_in ? "connect" : c?.connected ? "pick" : "connect";

  // Chosen while loading: go on once the connections are here.
  useEffect(() => {
    if (!deciding || !connectors || !kind || !isApp(kind)) return;
    setDeciding(false);
    setStep(stepFor(connectors.find((x) => x.kind === kind)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deciding, connectors, kind]);

  const choose = (k: AddKind) => {
    setKind(k);
    setPicked([]);
    setError(null);
    setTokenNote("");
    const own = OWN_STEP[k];
    if (own) {
      setProblem(null);
      setStep(own);
      return;
    }
    setVia("team");
    // The app's own step at once; a placeholder there until we know which.
    if (!connectors) {
      setDeciding(true);
      setStep("connect");
      return;
    }
    setStep(stepFor(connectors.find((x) => x.kind === k)));
  };

  // A token was checked and saved: on to the pages.
  const tokenSaved = async (warning: string) => {
    setTokenNote(warning);
    await loadConnectors();
    continueWith("team");
  };

  // Signs in with your own account in a small window, then shows who you're
  // connected as. The flow stays where it is.
  const memberSignIn = async () => {
    if (!kind || !isApp(kind)) return;
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
    if (!kind || !isApp(kind)) return;
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
    if (!named) setName(defaultName());
    setProblem(null);
    setStep("name");
  };

  /** What a new knowledge base is called until someone names it. */
  const defaultName = (): string => {
    if (!kind) return "";
    if (kind === "bedrock_kb") return arnName || KIND_LABEL.bedrock_kb;
    if (kind === "mcp") return mcp?.server.name ?? KIND_LABEL.mcp;
    if (kind === "s3") return picked.length && picked[0].id !== WHOLE_BUCKET ? suggestName(kind, picked) : s3.bucket || KIND_LABEL.s3;
    if (kind === "bedrock_import") return plan?.info.name ?? "Imported knowledge base";
    if (kind === "archive") return archive ? archive.name.replace(/\.zip$/i, "") : KIND_LABEL.archive;
    return suggestName(kind, picked, files.map((f) => f.file));
  };

  /** The base's who-can-read settings, as the create call takes them. */
  const baseFields = (fallback: string) => ({
    name: name.trim() || fallback,
    description: "",
    read_role: readRole,
    attach_team: true,
    agents: [] as string[],
    authoritative: false,
    ...(readers.length ? { readers } : {}),
  });

  // Connected in place: one test search, then the base exists and opens.
  const connectBedrock = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await knowledge.create({
        ...baseFields(arnName || KIND_LABEL.bedrock_kb),
        connect:
          kind === "mcp" && mcp
            ? { provider: "mcp", target: mcp.server.id, search_tool: mcp.search_tool || undefined, fetch_tool: mcp.fetch_tool || undefined }
            : { provider: "bedrock_kb", target: arn.trim() },
      });
      onOpenChange(false);
      onDone(r.base.id);
    } catch (e) {
      setProblem(connectProblem(e, "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
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

  /** The sources an import makes: one S3 source, or one per data source of a Bedrock knowledge base. */
  const importSources = (): SourceInput[] => {
    if (kind === "s3") return [{ kind: "s3", selection: picked, options: { ...s3 } }];
    if (kind === "bedrock_import" && plan) {
      return plan.chosen.map((d) => ({
        kind: "s3" as const,
        name: d.name,
        options: { account: d.bucket_account || plan.info.account, bucket: d.bucket, region: plan.info.region },
        selection: d.prefixes.length
          ? d.prefixes.map((p) => ({ id: p, title: p, kind: "prefix", path: [], include_children: true }))
          : [{ id: WHOLE_BUCKET, title: d.bucket, kind: "prefix", path: [], include_children: true }],
      }));
    }
    return [];
  };

  // An S3 import (or a Bedrock knowledge base's data sources): the first
  // source makes the base, the rest join it.
  const finishImport = async () => {
    const list = importSources();
    if (!list.length) return;
    setBusy(true);
    setProblem(null);
    try {
      let baseId: string;
      let first: { id: string } | null;
      let rest = list;
      if (mode.kind === "create") {
        const r = await knowledge.create({ ...baseFields(defaultName()), source: list[0] });
        baseId = r.base.id;
        first = r.source;
        rest = list.slice(1);
      } else {
        baseId = mode.base.id;
        first = null;
      }
      for (const src of rest) {
        const r = await knowledge.addSource(baseId, src);
        first = first ?? r.source;
      }
      setMade({ baseId, sourceId: first?.id ?? null, setup: null });
      setStep("progress");
    } catch (e) {
      setProblem(connectProblem(e, "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };

  // An archive: the base (when new), then the source and its upload, then
  // the import starts.
  const finishArchive = async () => {
    if (!archive) return;
    setBusy(true);
    setError(null);
    try {
      const baseId = mode.kind === "create" ? (await knowledge.create(baseFields(defaultName()))).base.id : mode.base.id;
      const r = await knowledge.startArchive(baseId, { name: archive.name, size: archive.size });
      setMade({ baseId, sourceId: r.source.id, setup: null });
      setStep("progress");
      setFiles([{ key: "archive", file: archive, progress: 0 }]);
      await uploadToSignedUrl(r.upload, archive, (p) => setFiles((cur) => cur.map((x) => ({ ...x, progress: p }))));
      await knowledge.finishArchive(baseId, r.source.id);
      setFiles((cur) => cur.map((x) => ({ ...x, progress: 1, done: true })));
    } catch (e) {
      const why = errorMessage(e, "The archive didn't upload.");
      setFiles((cur) => (cur.length ? cur.map((x) => ({ ...x, error: why })) : cur));
      setError(why);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!kind) return;
    if (IN_PLACE.has(kind)) return connectBedrock();
    if (kind === "s3" || kind === "bedrock_import") return finishImport();
    if (kind === "archive") return finishArchive();
    setBusy(true);
    setError(null);
    try {
      const source = !isApp(kind) ? undefined : { kind, selection: picked, ...(via === "sign_in" ? { via: "sign_in" as const } : {}) };
      if (mode.kind === "create") {
        const r = await knowledge.create({
          ...baseFields(suggestName(kind, picked, files.map((f) => f.file))),
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
        ? deciding
          ? label
          : `Connect ${label}`
        : step === "pick" && kind && isApp(kind)
          ? PICK_TITLE[kind]
          : step === "upload"
            ? "Upload files"
            : step === "bedrock"
              ? "Connect a Bedrock knowledge base"
            : step === "mcp"
              ? "Connect a search tool"
            : step === "s3"
              ? "Import from Amazon S3"
            : step === "bedrock_import"
              ? "Import a Bedrock knowledge base"
            : step === "archive"
              ? "Upload an archive"
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
    setDeciding(false);
    setProblem(null);
    if (step === "name") setStep((kind && OWN_STEP[kind]) || "pick");
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
            {kind === "web" ? "Continue" : continueLabel(picked)}
          </button>
        )}
        {step === "upload" && (
          <button type="button" onClick={afterPick} className={primaryButton} disabled={!files.length} data-testid="flow-continue">
            Continue
          </button>
        )}
        {step === "bedrock" && (
          <button type="button" onClick={afterPick} className={primaryButton} disabled={!KB_ARN.test(arn.trim())} data-testid="flow-continue">
            Continue
          </button>
        )}
        {(step === "mcp" || step === "s3" || step === "bedrock_import" || step === "archive") && (
          <button
            type="button"
            onClick={afterPick}
            className={primaryButton}
            disabled={step === "mcp" ? !mcp?.search_tool : step === "s3" ? !picked.length : step === "bedrock_import" ? !plan?.chosen.length : !archive}
            data-testid="flow-continue"
          >
            Continue
          </button>
        )}
        {step === "name" && (
          <button type="button" onClick={finish} className={primaryButton} disabled={busy || (creating && !name.trim())} data-testid="flow-finish">
            {busy
              ? kind && IN_PLACE.has(kind)
                ? "Checking the connection…"
                : kind === "s3" || kind === "bedrock_import"
                  ? "Checking access…"
                  : "Working…"
              : kind && IN_PLACE.has(kind)
                ? kind === "mcp"
                  ? "Connect search tool"
                  : "Connect knowledge base"
                : creating
                  ? "Create knowledge base"
                  : "Add to knowledge base"}
          </button>
        )}
      </div>
    );

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} wide={step === "pick" && kind !== "web" ? "xl" : true} footer={footer} testId="add-flow">
      <div data-step={step} data-testid="flow-step" className="animate-[kn-fade_160ms_ease-out] motion-reduce:animate-none">
        {step === "choose" && (
          <ChooseStep connectors={connectors} loadError={loadError} onRetry={loadConnectors} onChoose={(k) => choose(k)} creating={creating} />
        )}

        {step === "connect" && kind && isApp(kind) && deciding && <ConnectLoading kind={kind} error={loadError} onRetry={loadConnectors} />}

        {step === "connect" && kind && isApp(kind) && !deciding && conn?.member_sign_in && (
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

        {step === "connect" && kind && isApp(kind) && !deciding && !conn?.member_sign_in && (
          <ConnectStep
            kind={kind}
            conn={conn}
            busy={busy}
            error={error}
            onConnect={signIn}
            canSaveToken={canSaveToken}
            installAdmin={installAdmin}
            onTokenSaved={tokenSaved}
            onChoiceChanged={loadConnectors}
          />
        )}

        {step === "pick" && kind && isApp(kind) && tokenNote && (
          <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200" role="status" data-testid="token-note">
            {tokenNote}
          </p>
        )}
        {step === "pick" && kind && isApp(kind) && <Picker kind={kind} value={picked} onChange={setPicked} via={via} />}

        {step === "bedrock" && (
          <BedrockStep
            arn={arn}
            onArn={(v, listedName) => {
              setArn(v);
              setArnName(listedName ?? "");
              setNamed(false);
            }}
          />
        )}

        {step === "mcp" && <McpStep value={mcp} onChange={(c) => {
          setMcp(c);
          setNamed(false);
        }} />}
        {step === "s3" && <S3Step place={s3} onPlace={setS3} picked={picked} onPicked={setPicked} />}
        {step === "bedrock_import" && <BedrockImportStep plan={plan} onPlan={setPlan} onUseInstead={(k) => choose(k)} />}
        {step === "archive" && <ArchiveStep limits={limits} file={archive} onFile={setArchive} />}

        {step === "upload" && <UploadStep limits={limits} files={files} onAdd={addFiles} onRemove={(k) => setFiles((f) => f.filter((x) => x.key !== k))} error={error} />}

        {step === "name" && kind && (
          <div className="space-y-6" data-testid="name-step">
            <div className="flex items-center gap-3">
              <SourceLogo kind={kind} size="lg" />
              <p className="min-w-0 text-sm text-zinc-300">
                {kind === "bedrock_kb" ? (
                  <span className="block wrap-anywhere" data-testid="connect-summary">
                    Connected in place: searched live in your AWS account, nothing copied.
                    <span className="mt-1 block text-xs">
                      <Code>{arn.trim()}</Code>
                    </span>
                  </span>
                ) : kind === "mcp" ? (
                  <span className="block wrap-anywhere" data-testid="connect-summary">
                    Connected in place: searched live through {mcp?.server.name}, nothing copied.
                  </span>
                ) : kind === "s3" ? (
                  <span className="block wrap-anywhere" data-testid="import-summary">
                    {picked.some((p) => p.id === WHOLE_BUCKET) ? `Everything in s3://${s3.bucket}` : `${picked.length} ${picked.length === 1 ? "item" : "items"} from s3://${s3.bucket}`}, kept in sync
                  </span>
                ) : kind === "bedrock_import" ? (
                  <span className="block wrap-anywhere" data-testid="import-summary">
                    {plan?.chosen.length} data source{plan?.chosen.length === 1 ? "" : "s"} of {plan?.info.name}, read from S3 and indexed here
                  </span>
                ) : kind === "archive" ? (
                  <span className="block wrap-anywhere" data-testid="import-summary">
                    {archive?.name} ({archive ? fileSize(archive.size) : ""}), unpacked and read here
                  </span>
                ) : kind === "upload" ? (
                  `${files.length} file${files.length === 1 ? "" : "s"} to upload`
                ) : (
                  `${picked.length} ${picked.length === 1 ? "item" : "items"} from ${label}${picked.some((p) => p.include_children) && kind !== "web" ? ", with everything inside" : ""}`
                )}
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
                  <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm text-zinc-300">Who can read it</span>
                    <Select
                      className="w-full"
                      value={readRole}
                      onChange={(r) => setReadRole(r as typeof readRole)}
                      data-testid="read-select"
                      options={[
                        { value: "viewer", label: "Everyone on the team" },
                        { value: "member", label: "Members, admins and owners" },
                        { value: "admin", label: "Only admins and owners" },
                      ]}
                    />
                  </label>
                  <ReadersEditor value={readers} onChange={setReaders} />
                </div>
                )}
              </div>
            )}
            {via === "sign_in" && isApp(kind) && (
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
                <span>
                  {kind === "bedrock_kb"
                    ? "Everyone who can read this knowledge base sees what a search of it returns, even documents they couldn't open where they came from. Agents it is attached to search it for anyone who starts a run."
                    : kind === "mcp"
                      ? mcp?.server.sharing === "personal"
                        ? "Each person's search uses their own sign-in, so they only see what that tool lets them see. Agent runs search as the person who started them; runs nobody started skip it."
                        : "Everyone who can read this knowledge base sees what the team's connection to this tool can see. Agents it is attached to search it for anyone who starts a run."
                      : kind === "archive"
                        ? ARCHIVE_WARNING
                        : note || "Everyone who can read this knowledge base can read what you add, even if they can't open it in the app it comes from."}
                </span>
              </p>
            )}
            {error && (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            {problem && (kind === "s3" || kind === "bedrock_import" ? <ImportProblem problem={problem} /> : <ConnectProblemNote problem={problem} />)}
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
  creating,
}: {
  connectors: Connector[] | null;
  loadError: string | null;
  onRetry: () => void;
  onChoose: (k: AddKind) => void;
  /** A new knowledge base: it can also be a Bedrock one, connected in place. */
  creating: boolean;
}) {
  const wide = (k: AddKind, title: string, blurb: string) => (
    <button
      type="button"
      onClick={() => onChoose(k)}
      data-testid={`tile-${k}`}
      className={`flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition hover:border-zinc-600 hover:bg-zinc-800/60 motion-reduce:transition-none ${focusRing}`}
    >
      <SourceLogo kind={k} size="lg" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-zinc-100">{title}</span>
        <span className="block text-xs text-zinc-400">{blurb}</span>
      </span>
    </button>
  );
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
      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-400">Bring in a knowledge base you already have</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3" data-testid="import-tiles">
        {wide("s3", "Amazon S3", "Documents in a bucket or its folders, kept in sync")}
        {wide("bedrock_import", "Import a Bedrock knowledge base", "Read what it was built from and index it here")}
        {wide("archive", "Archive upload", "A Notion or Confluence export, or a zipped docs folder")}
      </div>
      {creating && <div className="mt-3">{wide("mcp", "Search tool (MCP)", "Your search tool's MCP server, searched live alongside the rest. Nothing copied.")}</div>}
      {creating && (
        <button
          type="button"
          onClick={() => onChoose("bedrock_kb")}
          data-testid="tile-bedrock_kb"
          className={`mt-3 flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left transition hover:border-zinc-600 hover:bg-zinc-800/60 motion-reduce:transition-none ${focusRing}`}
        >
          <SourceLogo kind="bedrock_kb" size="lg" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-zinc-100">Bedrock knowledge base</span>
            <span className="block text-xs text-zinc-400">Already in Amazon Bedrock? Connect it in place: searched live in your AWS account, nothing copied.</span>
          </span>
        </button>
      )}
    </div>
  );
}

/** Paste a knowledge base's ARN, or (self-hosted) pick one of the install account's. */
function BedrockStep({ arn, onArn }: { arn: string; onArn: (arn: string, listedName?: string) => void }) {
  const [start, setStart] = useState<BedrockStart | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    knowledge
      .bedrock()
      .then((r) => !stop && setStart(r))
      .catch((e) => !stop && setLoadError(errorMessage(e, "Couldn't load your AWS accounts.")));
    return () => {
      stop = true;
    };
  }, []);
  const trimmed = arn.trim();
  const bad = trimmed !== "" && !KB_ARN.test(trimmed);
  const taken = !!start?.connected.includes(trimmed);
  const account = KB_ARN.test(trimmed) ? trimmed.split(":")[4] : "";
  const reachable = !account || account === start?.install_account || !!start?.accounts.some((a) => a.account === account);
  return (
    <div className="space-y-5" data-testid="bedrock-step">
      <p className="text-sm leading-relaxed text-zinc-400">
        Coderhelm searches the knowledge base live in your AWS account whenever Chat or an agent needs it. Nothing is copied, and Bedrock does its own search, so its embedding model and vector store don&apos;t matter.
      </p>
      {start?.install && (
        <div data-testid="bedrock-list">
          <p className="mb-2 text-sm font-medium text-zinc-300">In this install&apos;s account ({start.region})</p>
          {start.bases === null ? (
            start.list_error && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200" role="status" data-testid="bedrock-list-error">
                {start.list_error.message} {start.list_error.fix}
              </p>
            )
          ) : start.bases.length === 0 ? (
            <p className="text-sm text-zinc-400" data-testid="bedrock-list-empty">
              No knowledge bases in this account and region. Paste the ARN of one elsewhere below.
            </p>
          ) : (
            <ul className="max-h-60 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800" role="radiogroup" aria-label="Knowledge bases in this account">
              {start.bases.map((b) => {
                const on = trimmed === b.arn;
                const used = start.connected.includes(b.arn);
                return (
                  <li key={b.arn}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={used}
                      onClick={() => onArn(b.arn, b.name)}
                      data-testid="bedrock-option"
                      className={`flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors motion-reduce:transition-none disabled:opacity-50 ${focusRing} ${on ? "bg-zinc-800" : "hover:bg-zinc-800/60"}`}
                    >
                      <span aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 rounded-full border ${on ? "border-emerald-400 bg-emerald-400" : "border-zinc-600"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-100">{b.name}</span>
                        <span className="block truncate text-xs text-zinc-400">{used ? "Already connected" : b.description || b.id}</span>
                      </span>
                      {b.status !== "ACTIVE" && <span className="shrink-0 text-xs text-amber-300">{b.status.toLowerCase()}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-zinc-300">Knowledge base ARN</span>
        <input
          className={`${inputClass} text-sm`}
          value={arn}
          onChange={(e) => onArn(e.target.value)}
          placeholder="arn:aws:bedrock:us-east-1:111122223333:knowledge-base/ABCDE12345"
          spellCheck={false}
          autoComplete="off"
          data-testid="bedrock-arn"
          aria-invalid={bad || taken}
          autoFocus={!start?.install}
        />
        <span className="mt-1.5 block text-xs text-zinc-400">On the knowledge base&apos;s page in the Bedrock console. Its region and account are part of it.</span>
      </label>
      {bad && (
        <p className="text-sm text-amber-300" role="alert" data-testid="bedrock-arn-bad">
          That isn&apos;t a knowledge base ARN. It looks like arn:aws:bedrock:us-east-1:111122223333:knowledge-base/ABCDE12345.
        </p>
      )}
      {taken && (
        <p className="text-sm text-amber-300" role="alert">
          That knowledge base is already connected.
        </p>
      )}
      {start && !reachable && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200" data-testid="bedrock-account-missing">
          AWS account {account} isn&apos;t connected to Coderhelm. Connect it on{" "}
          <Link href="/settings/integrations/aws" className={linkButton} target="_blank" rel="noopener noreferrer">
            Integrations, AWS
          </Link>{" "}
          first: Coderhelm searches with that account&apos;s read-only CoderHelmLogReader role and your team&apos;s private ID.
        </p>
      )}
      {loadError && <p className="text-sm text-amber-300">{loadError}</p>}
    </div>
  );
}

/** Why connecting failed, what to do, and the update that grants the role access when that is all it lacks. */
export function ConnectProblemNote({ problem }: { problem: ConnectProblem }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm leading-relaxed" role="alert" data-testid="connect-problem" data-code={problem.code}>
      <p className="font-medium text-red-200">{problem.message}</p>
      {problem.fix && <p className="mt-1 text-zinc-300">{problem.fix}</p>}
      {problem.grant && (
        <div className="mt-3 space-y-2">
          <a href={problem.grant.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")} data-testid="connect-grant">
            Open the update in AWS
          </a>
          <p className="text-xs text-zinc-400">
            Sign in to AWS account {problem.grant.account} and create the stack {problem.grant.stack_name}. It lets the CoderHelmLogReader role search this knowledge base and the others you connected there, read-only. Then connect again.
          </p>
        </div>
      )}
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
  canSaveToken,
  installAdmin,
  onTokenSaved,
  onChoiceChanged,
}: {
  kind: SourceKind;
  conn: Connector | null;
  busy: boolean;
  error: string | null;
  onConnect: () => void;
  canSaveToken: boolean;
  installAdmin: boolean;
  onTokenSaved: (warning: string) => void;
  /** The app choice changed: what can sign in is read again. */
  onChoiceChanged: () => void;
}) {
  const label = KIND_LABEL[kind];
  const tokenKind = conn?.token_path && (kind === "notion" || kind === "confluence") ? kind : null;
  const [showToken, setShowToken] = useState(false);
  const fetchedChoice = useHybridChoice(kind);
  const [pickedChoice, setPickedChoice] = useState<Choice | null>(null);
  // On a hybrid install: Coderhelm's app means one sign-in button and
  // nothing to fill in; token steps only under "Use my own app" or behind
  // "Use a key instead".
  const choice = HYBRID_KINDS.has(kind) ? (pickedChoice ?? fetchedChoice) : null;
  const viaCoderhelm = choice === "coderhelm";
  const signIn = !!conn?.can_sign_in;
  // Without sign-in, the token is the way in: shown at once (never under
  // Coderhelm's app, where it stays behind "Use a key instead").
  const tokenOpen = !!tokenKind && canSaveToken && (viaCoderhelm ? showToken : !signIn || showToken);
  const state = viaCoderhelm
    ? signIn
      ? "sign-in"
      : "app-not-ready"
    : signIn
      ? "sign-in"
      : tokenKind
        ? canSaveToken
          ? "token"
          : "ask-admin"
        : "no-way";
  return (
    <div className="flex flex-col items-center py-4 text-center" data-testid="connect-step" data-state={state}>
      <SourceLogo kind={kind} size="lg" />
      <h3 className="mt-5 text-lg font-semibold text-zinc-100">
        {conn?.reconnect_reason ? `Reconnect ${label}` : `Connect ${label} to Coderhelm`}
      </h3>
      {!viaCoderhelm && (
      <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
        {conn?.reconnect_reason
          ? `Your ${label} connection stopped working. ${signIn ? "Sign in again" : "Connect it again"} and everything picks up where it left off.`
          : signIn
            ? kind === "notion"
              ? "You'll sign in to Notion and choose which pages Coderhelm can see. Nothing is changed in Notion."
              : `You'll sign in to ${label} and allow Coderhelm to read it. Nothing is changed in ${label}.`
            : tokenKind && !canSaveToken
              ? `${label} sign-in isn't set up on this Coderhelm, so ${label} connects with a token that an admin or owner saves.`
              : tokenKind
              ? kind === "notion"
                ? "Create a read-only Notion connection, share the pages you want with it, and paste its token. It takes about two minutes, and nothing is changed in Notion."
                : "Paste an Atlassian API token for an account that can read the spaces you want. Nothing is changed in Confluence."
              : `Coderhelm reads the folders and files you pick. Nothing is changed in ${label}.`}
      </p>
      )}
      {HYBRID_KINDS.has(kind) && (
        <HybridAppChoice
          id={kind}
          name={label}
          className="mt-5 w-full max-w-md text-left"
          onChanged={(next) => {
            setPickedChoice(next);
            setShowToken(false);
            onChoiceChanged();
          }}
        />
      )}
      {signIn && (
        <button type="button" onClick={onConnect} className={`${buttonClass("primary", "lg")} mt-6`} disabled={busy} data-testid="connect-button">
          {busy ? "Opening…" : `Sign in with ${label}`}
        </button>
      )}
      {viaCoderhelm && !signIn && (
        <p className="mt-6 max-w-md text-sm leading-relaxed text-zinc-400" data-testid="app-not-ready">
          Coderhelm&apos;s {label} app isn&apos;t ready on this install yet. Check it in Settings, Version and updates, Hybrid, or use a key instead.
        </p>
      )}
      {error && (
        <p className="mt-4 max-w-md text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <div className="mt-6 w-full max-w-md text-left">
        {tokenOpen && tokenKind ? (
          <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 sm:p-5" data-testid="token-path">
            {tokenKind === "notion" ? <NotionSteps /> : <ConfluenceSteps />}
            <TokenForm kind={tokenKind} onConnected={onTokenSaved} />
          </div>
        ) : viaCoderhelm ? null : tokenKind && !canSaveToken && !signIn ? (
          <AskAdmin kind={kind} />
        ) : !tokenKind && !signIn ? (
          kind === "google_drive" ? (
            <NoTokenPath kind={kind} installAdmin={installAdmin} />
          ) : (
            <p className="text-sm text-zinc-400">{conn?.hint}</p>
          )
        ) : null}
        {(signIn || viaCoderhelm) && tokenKind && canSaveToken && !showToken && (
          <div className="border-t border-zinc-800 pt-5">
            <button type="button" className={`${linkButton} text-sm`} onClick={() => setShowToken(true)} data-testid="use-token">
              Use a key instead
            </button>
          </div>
        )}
        {tokenOpen && (
          <p className="mt-5 text-sm text-zinc-400">
            Saved tokens are also on the Integrations page. <IntegrationsLink kind={kind} />
          </p>
        )}
      </div>
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
  const archiveFailed = kind === "archive" && files.some((f) => f.error);
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
      {kind === "archive" && files[0] && !files[0].done && (
        <p className="mt-4 text-sm text-zinc-300" data-testid="archive-upload">
          {files[0].error ? files[0].error : `Uploading ${files[0].file.name}: ${Math.round(files[0].progress * 100)}%`}
        </p>
      )}
      {source?.status === "error" && source.error && !archiveFailed && (
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
