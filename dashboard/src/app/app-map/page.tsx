"use client";

// App map: how the team's app fits together across all its repositories, in
// plain words. The map is made with Floorplan (vendor/floorplan in the
// platform, MIT): its extractor reads every repository side by side and its
// viewer draws the map, here in a sandboxed frame (map-frame.tsx) so its code
// never touches this page. Coderhelm adds its own Recent work (its runs) and
// Health (its security, infrastructure, log and alert findings) into the
// map's own fields. Questions are Chat's: the Ask box asks Chat (the map's
// lookups first) and the chat is kept with the person's others; a part's
// "Ask about this" opens a new chat about it; an answer's "Open in App map"
// comes back here focused on its parts (`?focus=`).

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type AppMapResponse } from "@/lib/api";
import { askAboutLink, askBrain, focusOf, type ChatMap, type Citation } from "@/lib/brain";
import { AnswerView } from "../chat/answer";
import { useCan } from "@/hooks/use-can";
import { Page, PageHeader, cardClass } from "@/components/page";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { GraphIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { buttonClass, inputClass, linkButton } from "@/components/ui";
import { MapFrame } from "./map-frame";

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
  const { toast } = useToast();
  const [data, setData] = useState<AppMapResponse | null>(null);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState(true);
  const [health, setHealth] = useState(true);
  const [question, setQuestion] = useState("");

  const load = useCallback(() => {
    api
      .getAppMap({ recent, health })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(errText(e)));
  }, [recent, health]);
  useEffect(load, [load]);
  // While the first map builds, look again now and then.
  const building = data?.status.state === "building";
  useEffect(() => {
    if (!building) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [building, load]);

  const rebuild = async () => {
    try {
      await api.rebuildAppMap();
      toast("The map is being built again.");
      load();
    } catch (e) {
      toast(errText(e), "error");
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
    <PageHeader
      title="App map"
      lead="How your app fits together across its repositories, in plain words: its parts, what calls what, the screens and what is behind them, and the outside services it uses."
      more={can("repos") ? [{ label: "Build the map again", onSelect: rebuild }] : undefined}
    />
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
        <Skeleton className="h-96 w-full" />
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
            <Problem title="The map couldn't be built" onRetry={rebuild} details={st.note}>
              Coderhelm keeps what it has; try again in a moment.
            </Problem>
          ) : st.state === "empty" ? (
            <EmptyState icon={<GraphIcon />} title="Nothing to map yet" testId="app-map-empty">
              The map covers the repositories turned on for this team. Turn some on in Setup and it is built.
            </EmptyState>
          ) : (
            <div data-testid="app-map-building">
              <EmptyState icon={<GraphIcon />} title="Building your app map">
                Coderhelm is reading every repository side by side and describing each part in plain words. A first map takes a few minutes; this page updates by
                itself.{st.step ? ` Now: ${st.step}.` : ""}
              </EmptyState>
            </div>
          )
        ) : (
          <>
            {st.updating && (
              <Callout variant="info" title="Updating">
                The map is being brought up to date{st.step ? ` (${st.step.toLowerCase()})` : ""}; what you see is the last version.
              </Callout>
            )}
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="What the map shows">
              <Toggle on={recent} onChange={setRecent} testId="app-map-recent-toggle">
                Recent work
              </Toggle>
              <Toggle on={health} onChange={setHealth} testId="app-map-health-toggle">
                Health
              </Toggle>
              <span className="text-sm text-zinc-400">Coderhelm&apos;s runs and findings, shown on the parts they concern.</span>
            </div>
            {focus.length > 0 && <FocusNote graph={data.graph} focus={focus} />}
            <MapFrame graph={data.graph} title="The app map" onAsk={onAsk} focus={focus[0]} />
            <AskBox question={question} setQuestion={setQuestion} />
          </>
        )}
        <Credit version={st.floorplan} />
      </div>
    </Page>
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
