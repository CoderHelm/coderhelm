"use client";

// App map: how the team's app fits together across all its repositories, in
// plain words. The map is made with Floorplan (vendor/floorplan in the
// platform, MIT): its extractor reads every repository side by side and its
// viewer draws the map, here in a sandboxed frame (map-frame.tsx) so its code
// never touches this page. Coderhelm adds its own Recent work (its runs) and
// Health (its security, infrastructure, log and alert findings) into the
// map's own fields, and Ask, answered by Chat's agent from the map.

import { useCallback, useEffect, useState } from "react";
import { api, type AppMapAnswer, type AppMapResponse } from "@/lib/api";
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
  const { can } = useCan();
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

  const onAsk = useCallback((items: { label?: string; id?: string }[]) => {
    const names = items.map((i) => i.label || i.id).filter(Boolean).slice(0, 4);
    if (names.length) setQuestion(`Tell me about ${names.join(", ")}: what it does and what it connects to.`);
    document.getElementById("app-map-ask-input")?.focus();
  }, []);

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
            <AskBox question={question} setQuestion={setQuestion} />
            <MapFrame graph={data.graph} title="The app map" onAsk={onAsk} />
          </>
        )}
        <Credit version={st.floorplan} />
      </div>
    </Page>
  );
}

function AskBox({ question, setQuestion }: { question: string; setQuestion: (q: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AppMapAnswer | null>(null);
  const [err, setErr] = useState("");
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      setAnswer(await api.askAppMap(question.trim()));
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${cardClass} space-y-3`} data-testid="app-map-ask">
      <form onSubmit={ask} className="flex flex-wrap gap-2">
        <label htmlFor="app-map-ask-input" className="sr-only">
          Ask the map
        </label>
        <input
          id="app-map-ask-input"
          className={`${inputClass} min-w-0 flex-1 basis-60`}
          placeholder="Ask the map, like: what happens when someone books a slip?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className={buttonClass("primary", "md")} disabled={busy || !question.trim()}>
          {busy ? "Asking" : "Ask"}
        </button>
      </form>
      {err && (
        <Callout variant="error" title="No answer this time">
          {err}
        </Callout>
      )}
      {answer && (
        <div className="space-y-3" data-testid="app-map-answer">
          {answer.steps.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-200">
              {answer.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-zinc-200">{answer.answer}</p>
          )}
          {answer.graph && <MapFrame graph={answer.graph} title="The parts this answer involves" height="40vh" testId="app-map-answer-frame" />}
        </div>
      )}
    </section>
  );
}
