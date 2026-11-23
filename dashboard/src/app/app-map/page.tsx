"use client";

// App map: how the team's app fits together across all its repositories, in
// plain words. It has its own place in the menu, beside Chat and Knowledge.
// The map is made with Floorplan (vendor/floorplan in the platform, MIT): its
// extractor reads every repository side by side and its viewer draws the
// map, here in a sandboxed frame (map-frame.tsx) so its code never touches
// this page. Coderhelm adds its own Recent work (its runs) and Health (its
// security, infrastructure, log and alert findings) into the map's own
// fields. Questions are Chat's: the Ask box asks Chat (the map's lookups
// first) and the chat is kept with the person's others; a part's "Ask about
// this" opens a new chat about it; an answer's "Open in App map" comes back
// here focused on its parts (`?focus=`), and an answer that cites a journey
// opens it (`?flow=`).
//
// The map opens on its System level (the apps, servers, data, cloud and
// outside services), with Journeys and Screens beside it; the frame draws
// them (public/app-map/present.js), see map-frame.tsx.
//
// One build at a time (build-status.tsx): while one runs the page shows its
// steps and time, and offers no way to start another.
//
// Loading (lib/app-map-load.ts): the API answers with the status, where to
// read the map and Coderhelm's overlays; the map is read once per build and
// the overlays laid over it here. Each read gives up after LOAD_TIMEOUT_MS
// and shows Try again, so the page never waits on a request forever. The
// map's own title and description show above it (the viewer drew them over
// the cards), following what the viewer opens.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, type AppMapResponse, type AppMapStatus, type FloorplanGraph } from "@/lib/api";
import { applyOverlays, fetchMapGraph, LOAD_TIMEOUT_MS } from "@/lib/app-map-load";
import { askAboutLink, askBrain, flowOf, focusOf, type ChatMap, type Citation } from "@/lib/brain";
import { AnswerView } from "../chat/answer";
import { useCan } from "@/hooks/use-can";
import { Page, PageHeader, cardClass } from "@/components/page";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { MapIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { buttonClass, inputClass, linkButton } from "@/components/ui";
import { MapFrame, type MapContext } from "./map-frame";
import { Building, BuiltBar, Failed, serverNow } from "./build-status";

const errText = (e: unknown) => (e instanceof Error ? e.message : "The request failed.");

function Toggle({ on, onChange, children, testId }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode; testId: string }) {
  return (
    <button type="button" aria-pressed={on} data-testid={testId} onClick={() => onChange(!on)} className={buttonClass(on ? "primary" : "secondary", "sm")}>
      {children}
    </button>
  );
}

function Credit({ version }: { version?: string }) {
  return (
    <p className="text-sm text-zinc-400" data-testid="app-map-credit">
      Map viewer and extractor from the open-source{" "}
      <a className={linkButton} href="https://github.com/haydenschmitty/floorplan" target="_blank" rel="noreferrer">
        Floorplan
      </a>{" "}
      project, MIT{version ? ` (${version.replace(/^floorplan--/, "")})` : ""}.
    </p>
  );
}

/** The time now, read again every `ms`. */
function useNowMs(ms: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, on]);
  return now;
}

export default function AppMapPage() {
  return (
    <Suspense fallback={<Page testId="app-map-page"><Skeleton className="h-96 w-full" /></Page>}>
      <AppMap />
    </Suspense>
  );
}

function AppMap() {
  const { can } = useCan();
  const router = useRouter();
  const params = useSearchParams();
  const focus = useMemo(() => focusOf(params.get("focus")), [params]);
  const flow = useMemo(() => flowOf(params.get("flow")), [params]);
  const { toast } = useToast();
  const [data, setData] = useState<AppMapResponse | null>(null);
  // When the status was read, so elapsed time follows the server's clock.
  const [readAt, setReadAt] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [recent, setRecent] = useState(true);
  const [health, setHealth] = useState(true);
  const [question, setQuestion] = useState("");
  const [starting, setStarting] = useState(false);
  // What a read is doing now: the status, or the map itself.
  const [loading, setLoading] = useState<"" | "status" | "map">("status");
  // The map as read, per build: the toggles and status checks don't read it again.
  const mapRef = useRef<{ at: number; graph: FloorplanGraph } | null>(null);
  const readSeq = useRef(0);
  const [context, setContext] = useState<MapContext | null>(null);
  const hasMap = !!data?.graph;
  const hasMapRef = useRef(hasMap);
  hasMapRef.current = hasMap;

  const take = useCallback((d: AppMapResponse) => {
    setData(d);
    setReadAt(Date.now());
    setError("");
  }, []);
  const takeStatus = useCallback((status: AppMapStatus) => {
    setData((d) => (d ? { ...d, status } : { status, graph: null }));
    setReadAt(Date.now());
  }, []);
  const load = useCallback(() => {
    const n = ++readSeq.current;
    const live = () => n === readSeq.current;
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, LOAD_TIMEOUT_MS);
    setError("");
    setLoading("status");
    (async () => {
      try {
        const r = await api.getAppMap({ recent, health }, ctl.signal);
        clearTimeout(timer);
        if (!live()) return;
        let graph = r.graph ?? null;
        if (!graph && r.graph_url) {
          const at = r.graph_at ?? 0;
          const kept = mapRef.current;
          if (kept && at > 0 && kept.at === at) {
            graph = kept.graph;
          } else {
            setLoading("map");
            graph = await fetchMapGraph(r, LOAD_TIMEOUT_MS);
            if (graph) mapRef.current = { at, graph };
          }
        }
        if (!live()) return;
        take({ ...r, graph: graph ? applyOverlays(graph, r.overlays) : null });
      } catch (e) {
        if (live()) setError(timedOut ? "The map took too long to load." : errText(e));
      } finally {
        clearTimeout(timer);
        if (live()) setLoading("");
      }
    })();
  }, [recent, health, take]);
  useEffect(() => {
    load();
    // Leaving the page (or reading again): a read still running is ignored.
    const seq = readSeq;
    return () => {
      seq.current++;
    };
  }, [load]);

  // While a build runs, watch its status (not the whole map) and read the
  // map again when it is done.
  const watching = !!data && (data.status.updating || data.status.state === "building");
  useEffect(() => {
    if (!watching) return;
    const t = setInterval(
      () => {
        api
          .getAppMapStatus()
          .then((d) => {
            if (d.graph) return take(d);
            const st = d.status;
            const done = !st.updating && st.state !== "building";
            if (done && (st.state === "ready" || hasMapRef.current)) return load();
            takeStatus(st);
          })
          .catch(() => {});
      },
      hasMap ? 15000 : 5000,
    );
    return () => clearInterval(t);
  }, [watching, hasMap, load, take, takeStatus]);
  const nowMs = useNowMs(15000, watching || hasMap);
  const now = data ? serverNow(data.status, readAt, nowMs) : nowMs / 1000;

  const rebuild = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const r = await api.rebuildAppMap();
      if (r?.status) takeStatus(r.status);
      else load();
      toast("The map is being built again. This page updates by itself.");
    } catch (e) {
      const running = e instanceof ApiError && e.status === 409 ? (e.body?.status as AppMapStatus | undefined) : undefined;
      if (running) {
        takeStatus(running);
        toast("The map is already being built. That build carries on.");
      } else {
        toast(errText(e), "error");
      }
    } finally {
      setStarting(false);
    }
  };

  // The viewer's "Ask about this": a new chat about those parts.
  const onAsk = useCallback(
    (items: { label?: string; id?: string }[]) => {
      const names = items.map((i) => i.label || i.id).filter((n): n is string => !!n).slice(0, 4);
      if (names.length) router.push(askAboutLink(names));
    },
    [router],
  );

  const header = (
    <PageHeader title="App map" lead="How your app fits together across all its repositories: its parts, what calls what, and the outside services it uses, in plain words." />
  );

  if (error && !data) {
    return (
      <Page testId="app-map-page">
        {header}
        <Problem title="The map couldn't be loaded" onRetry={load} details={error}>
          Nothing has changed. Try again in a moment.
        </Problem>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page testId="app-map-page">
        {header}
        <Loading what={loading === "map" ? "Loading the map…" : "Reading where the map is…"} />
      </Page>
    );
  }
  const st = data.status;
  return (
    <Page testId="app-map-page">
      {header}
      <div className="mt-4 space-y-4">
        {!data.graph ? (
          st.state === "failed" ? (
            <Failed status={st} onRetry={rebuild} canRetry={can("repos")} busy={starting} />
          ) : st.state === "empty" ? (
            <EmptyState
              icon={<MapIcon />}
              title="Nothing to map yet"
              testId="app-map-empty"
              action={
                <Link href="/setup" className={buttonClass("primary", "md")}>
                  Turn on repositories
                </Link>
              }
            >
              The map covers the repositories turned on for this team. Turn some on in Setup and the map is built by itself.
            </EmptyState>
          ) : (
            <Building status={st} now={now} />
          )
        ) : (
          <>
            <BuiltBar
              status={st}
              now={now}
              canRebuild={can("repos")}
              busy={starting}
              onRebuild={rebuild}
              hint={
                <>
                  Questions about how it works? Ask below or in{" "}
                  <Link href="/chat" className={linkButton}>
                    Chat
                  </Link>
                  ; answers come from this map.
                </>
              }
            />
            {error && (
              <Problem compact title="The map couldn't be updated" onRetry={load} details={error}>
                This is the map as it was last read.
              </Problem>
            )}
            {loading === "map" && (
              <p role="status" className="text-sm text-zinc-400" data-testid="app-map-loading">
                Loading the new map…
              </p>
            )}
            {focus.length > 0 && <FocusNote graph={data.graph} focus={focus} />}
            {flow && <FlowNote graph={data.graph} flow={flow} />}
            <MapTitle graph={data.graph} context={context} />
            <MapFrame graph={data.graph} title="The app map" onAsk={onAsk} focus={focus[0]} flow={flow} full onContext={setContext} />
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="What the map shows">
              <Toggle on={recent} onChange={setRecent} testId="app-map-recent-toggle">
                Recent work
              </Toggle>
              <Toggle on={health} onChange={setHealth} testId="app-map-health-toggle">
                Health
              </Toggle>
              <span className="text-sm text-zinc-400">Coderhelm&apos;s runs and findings, shown on the parts they concern.</span>
            </div>
            <AskBox question={question} setQuestion={setQuestion} />
          </>
        )}
        <Credit version={st.floorplan} />
      </div>
    </Page>
  );
}

/** While the page reads the status or the map: what it is doing, never a blank wait. */
function Loading({ what }: { what: string }) {
  return (
    <div className="mt-4 space-y-3" data-testid="app-map-loading">
      <p role="status" className="text-sm text-zinc-400">
        {what}
      </p>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

/**
 * The title and description of what the map shows (the app, or the part
 * opened in the viewer), above the map: the viewer drew them over the cards.
 */
function MapTitle({ graph, context }: { graph: NonNullable<AppMapResponse["graph"]>; context: MapContext | null }) {
  const project = (graph.project && typeof graph.project === "object" ? graph.project : {}) as { name?: unknown; summary?: unknown };
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const name = context?.name || str(project.name);
  const desc = context ? context.desc : str(project.summary);
  const kind = context?.kind || "Overview";
  if (!name) return null;
  return (
    <div className="min-w-0" data-testid="app-map-title">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{kind}</p>
      <h2 className="mt-0.5 text-lg font-semibold text-zinc-100 [overflow-wrap:anywhere]">{name}</h2>
      {desc && <p className="mt-1 max-w-3xl text-sm text-zinc-400 [overflow-wrap:anywhere]">{desc}</p>}
    </div>
  );
}

/** Which parts the page opened on, by name. */
function FocusNote({ graph, focus }: { graph: NonNullable<AppMapResponse["graph"]>; focus: string[] }) {
  const nodes = Array.isArray(graph.nodes) ? (graph.nodes as { id?: string; label?: string }[]) : [];
  const names = focus.map((id) => nodes.find((n) => n.id === id)?.label || id);
  return (
    <p className="text-sm text-zinc-400" data-testid="app-map-focus">
      Opened on {names.join(", ")}, from a chat answer.
    </p>
  );
}

/** The journey the page opened on, by name. */
function FlowNote({ graph, flow }: { graph: NonNullable<AppMapResponse["graph"]>; flow: string }) {
  const flows = Array.isArray(graph.flows) ? (graph.flows as { id?: unknown; title?: unknown; hidden?: unknown; visible?: unknown }[]) : [];
  // A journey kept back (below the ship gate) is never shown.
  const found = flows.find((f) => f && f.id === flow && f.hidden !== true && f.visible !== false);
  return (
    <p className="text-sm text-zinc-400" data-testid="app-map-flow">
      {found && typeof found.title === "string" ? `Opened on the journey ${found.title}, from a chat answer.` : "The journey from that answer is not on this map any more."}
    </p>
  );
}

interface Asked {
  question: string;
  text: string;
  citations: Citation[];
  grounded: boolean;
  map: ChatMap | null;
  thread: string;
  done: boolean;
  error: string;
}

/** Ask: the question goes to Chat (the map's lookups first) and is kept in the person's chats. */
function AskBox({ question, setQuestion }: { question: string; setQuestion: (q: string) => void }) {
  const [asked, setAsked] = useState<Asked | null>(null);
  const busy = !!asked && !asked.done;
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setAsked({ question: q, text: "", citations: [], grounded: true, map: null, thread: "", done: false, error: "" });
    const update = (fn: (a: Asked) => Asked) => setAsked((a) => (a ? fn(a) : a));
    try {
      await askBrain({ question: q, mentions: [], attachments: [], origin: "app_map" }, (ev) => {
        switch (ev.type) {
          case "thread":
            update((a) => ({ ...a, thread: ev.id }));
            break;
          case "text_delta":
            update((a) => ({ ...a, text: a.text + ev.text }));
            break;
          case "text_reset":
            update((a) => ({ ...a, text: "" }));
            break;
          case "answer":
            update((a) => ({ ...a, text: ev.text, citations: ev.citations, grounded: ev.grounded, map: ev.map ?? null }));
            break;
          case "error":
            update((a) => ({ ...a, error: ev.message }));
            break;
          case "done":
            update((a) => ({ ...a, done: true }));
            break;
        }
      });
    } catch (x) {
      update((a) => ({ ...a, error: errText(x) }));
    }
    update((a) => ({ ...a, done: true }));
  };
  return (
    <section className={`${cardClass} space-y-3`} data-testid="app-map-ask">
      <form onSubmit={ask} className="flex flex-wrap gap-2">
        <label htmlFor="app-map-ask-input" className="sr-only">
          Ask about the map
        </label>
        <input
          id="app-map-ask-input"
          className={`${inputClass} min-w-0 flex-1 basis-60`}
          placeholder="Ask about the map, like: what happens when someone books a slip?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className={buttonClass("primary", "md")} disabled={busy || !question.trim()}>
          {busy ? "Asking" : "Ask"}
        </button>
      </form>
      <p className="text-sm text-zinc-400">Chat answers from the map and the code, and keeps the question with your chats.</p>
      {asked?.error && (
        <Callout variant="error" title="No answer this time">
          {asked.error}
        </Callout>
      )}
      {asked && !asked.error && (
        <div className="space-y-3" data-testid="app-map-answer">
          <AnswerView text={asked.text} citations={asked.citations} grounded={asked.grounded} streaming={!asked.done} map={asked.map} />
          {asked.thread && asked.done && (
            <Link href={`/chat?thread=${encodeURIComponent(asked.thread)}`} className={`${linkButton} text-sm`} data-testid="app-map-answer-chat">
              Continue in Chat
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
