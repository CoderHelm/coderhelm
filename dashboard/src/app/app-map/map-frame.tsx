"use client";

// Floorplan's map viewer (vendor/floorplan, MIT) in a sandboxed iframe, so
// none of its code or its layout engine ever enters the dashboard's own
// JavaScript or its page:
// - `sandbox="allow-scripts"` and nothing else: the frame has its own opaque
//   origin (no cookies, no storage, nothing of the dashboard's), and its page
//   (public/app-map/frame.html) allows no network at all;
// - full screen is the page's: its Full screen button (beside the map, on
//   the App map page) puts the map's box on the whole screen in the click
//   itself, and the viewer's own button (added by frame.js) asks the page
//   when the browser won't give full screen to the sandboxed frame;
//   `allow="fullscreen"` lets the frame try first, nothing more;
// - the viewer's title and description are kept off the canvas, where they
//   covered cards: the frame sends them here (`onContext`) and the page shows
//   them above the map;
// - mounted only while this component is on screen, torn down when it
//   leaves; a new map mounts a fresh frame;
// - the map goes in by postMessage once the frame says it is ready, as one
//   JSON string under a size cap, never in the URL;
// - the viewer's layout engine runs in a Web Worker inside the frame.
//
// - on the App map page (`full`), the frame adds CoderHelm's presentation
//   (public/app-map/present.js): the System, Parts and Code levels, Journeys
//   and Screens, a journey played on one board (`flow`), and a step's place
//   in the code, which the frame can't open itself (no popups in the
//   sandbox): it names the file and line and this page opens it on GitHub.
//
// Chat draws an answer's mini map with this same frame (chat/answer-map.tsx),
// loaded only when an answer has one, without the presentation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import type { FloorplanGraph } from "@/lib/api";
import { fileUrl } from "@/lib/skills";

/** Largest map handed to the frame (the frame checks the same). */
export const MAX_MAP_BYTES = 25 * 1024 * 1024;

/** What the viewer shows now (the app, or the part opened), sent by the frame. */
export interface MapContext {
  kind: string;
  name: string;
  desc: string;
}

const safeId = (v?: string) => (v ?? "").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 200);

/**
 * The frame's address: the viewer's own hash settings, never the map.
 * `full`: the App map page's presentation, with no tour (`tour=0`);
 * `flow`: the journey it opens on.
 */
export function frameSrc(focus?: string, opts: { full?: boolean; flow?: string } = {}): string {
  const id = safeId(focus);
  const flow = safeId(opts.flow);
  const parts = ["ask=host"];
  if (opts.full) parts.push("tour=0", "full=1");
  if (flow && opts.full) parts.push(`flow=${encodeURIComponent(flow)}`);
  if (id) parts.push(`s=${encodeURIComponent(id)}`);
  return `/app-map/frame.html#${parts.join("&")}`;
}

/**
 * Where a file of the map is on GitHub, at the commit the map was built
 * from: the map names each repository's folder (`coderhelm.repos`) and its
 * commit (`meta.repos[].head`). Null for a file outside them.
 */
export function sourceUrl(graph: FloorplanGraph, file: unknown, line: unknown): string | null {
  if (typeof file !== "string" || !file || file.length > 1000) return null;
  const segs = file.split("/");
  if (segs.length < 2 || segs.some((s) => !s || s === "." || s === "..")) return null;
  const ch = (graph.coderhelm && typeof graph.coderhelm === "object" ? graph.coderhelm : {}) as { repos?: unknown };
  const repos = (ch.repos && typeof ch.repos === "object" ? ch.repos : {}) as Record<string, unknown>;
  const repo = Object.prototype.hasOwnProperty.call(repos, segs[0]) ? repos[segs[0]] : null;
  if (typeof repo !== "string" || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) return null;
  const meta = (graph.meta && typeof graph.meta === "object" ? graph.meta : {}) as { repos?: unknown };
  const entry = (Array.isArray(meta.repos) ? meta.repos : []).find((r) => r && typeof r === "object" && (r as { path?: unknown }).path === segs[0]) as { head?: unknown } | undefined;
  const sha = typeof entry?.head === "string" && /^[0-9a-f]{7,40}$/.test(entry.head) ? entry.head : "";
  const n = typeof line === "number" && Number.isInteger(line) && line > 0 ? line : 0;
  return `${fileUrl(repo, sha, segs.slice(1).join("/"))}${n ? `#L${n}` : ""}`;
}

/** The browser's full screen calls, with Safari's older names. */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const fullScreenElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;
const fullScreenOffered = () => !!(document.fullscreenEnabled || (document as FsDoc).webkitFullscreenEnabled);

/**
 * Asks the browser to put `el` on the whole screen, or take it off. Called in
 * the person's click (or the frame's, which reaches this page too): a browser
 * grants full screen only then, so nothing is awaited before the call.
 * Resolves false when the browser refuses or offers no full screen at all
 * (a setting, a policy, an embedding page), so the caller can cover the
 * window instead.
 */
function setFullScreen(el: HTMLElement | null, on: boolean): Promise<boolean> {
  if (!el) return Promise.resolve(false);
  const d = document as FsDoc;
  if (!on) {
    if (!fullScreenElement()) return Promise.resolve(true);
    if (document.exitFullscreen) return document.exitFullscreen().then(() => true, () => false);
    d.webkitExitFullscreen?.();
    return Promise.resolve(true);
  }
  if (fullScreenElement() === el) return Promise.resolve(true);
  if (!fullScreenOffered()) return Promise.resolve(false);
  const e = el as FsEl;
  try {
    if (e.requestFullscreen) return e.requestFullscreen().then(() => true, () => false);
    if (e.webkitRequestFullscreen) {
      e.webkitRequestFullscreen();
      return Promise.resolve(true);
    }
  } catch {
    return Promise.resolve(false);
  }
  return Promise.resolve(false);
}

export function MapFrame({
  graph,
  title,
  height,
  onAsk,
  focus,
  onContext,
  full = false,
  flow,
  testId = "app-map-frame",
}: {
  graph: FloorplanGraph;
  title: string;
  /** A fixed height; by default the frame takes the rest of the screen. */
  height?: string;
  /** The viewer's "Ask about this": the cards it names. */
  onAsk?: (items: { id?: string; label?: string; kind?: string }[]) => void;
  /** A part's id: the viewer opens with it selected (its own `s=` address). */
  focus?: string;
  /** What the viewer shows now, each time it changes. */
  onContext?: (c: MapContext) => void;
  /** The App map page's presentation: levels, journeys and screens. */
  full?: boolean;
  /** A journey's id: the viewer opens playing it. */
  flow?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  // The map is on the whole screen either by the browser's full screen
  // (`browserFull`) or, when the browser refuses it, by covering the window
  // (`windowFull`): the button works in every browser either way.
  const [browserFull, setBrowserFull] = useState(false);
  const [windowFull, setWindowFull] = useState(false);
  const isFull = browserFull || windowFull;
  const toggleFull = useCallback((on: boolean) => {
    if (!on) {
      setWindowFull(false);
      void setFullScreen(box.current, false);
      return;
    }
    void setFullScreen(box.current, true).then((granted) => {
      if (!granted) setWindowFull(true);
    });
  }, []);

  useEffect(() => {
    const changed = () => setBrowserFull(!!box.current && fullScreenElement() === box.current);
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("webkitfullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      document.removeEventListener("webkitfullscreenchange", changed);
    };
  }, []);
  // The viewer's own button says the same, and the map fills its new size.
  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ type: "coderhelm:app-map-fullscreen-state", on: isFull }, "*");
  }, [isFull]);
  // Covering the window: Esc leaves, as it does the browser's full screen, and
  // the page behind doesn't scroll.
  useEffect(() => {
    if (!windowFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWindowFull(false);
    };
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [windowFull]);
  const json = useMemo(() => JSON.stringify(graph), [graph]);
  const [problem, setProblem] = useState("");
  const tooBig = json.length > MAX_MAP_BYTES;

  useEffect(() => {
    if (tooBig) return;
    const onMessage = (e: MessageEvent) => {
      const frame = ref.current;
      // Only this frame's own messages.
      if (!frame || e.source !== frame.contentWindow || !e.data || typeof e.data !== "object") return;
      const { type } = e.data as { type?: string };
      if (type === "coderhelm:app-map-frame-ready") {
        // The dashboard is dark: the viewer is drawn dark to match.
        frame.contentWindow?.postMessage({ type: "coderhelm:app-map-graph", json, theme: "dark" }, "*");
      } else if (type === "coderhelm:app-map-frame-error") {
        setProblem(String((e.data as { text?: string }).text || "The map couldn't be shown."));
      } else if (type === "coderhelm:app-map-context" && onContext) {
        const d = e.data as Record<string, unknown>;
        const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
        onContext({ kind: str(d.kind, 80), name: str(d.name, 300), desc: str(d.desc, 2000) });
      } else if (type === "coderhelm:app-map-fullscreen") {
        // The viewer's Full screen button, when the browser won't give the
        // sandboxed frame full screen: the page puts the map's box there.
        toggleFull((e.data as { on?: unknown }).on === true);
      } else if (type === "coderhelm:app-map-source") {
        const d = e.data as { file?: unknown; line?: unknown };
        const url = sourceUrl(graph, d.file, d.line);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      } else if (type === "floorplan:ask" && onAsk) {
        const items = Array.isArray((e.data as { items?: unknown }).items) ? ((e.data as { items: unknown[] }).items.slice(0, 10) as { id?: string; label?: string; kind?: string }[]) : [];
        onAsk(items.filter((i) => i && typeof i === "object"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [json, graph, tooBig, onAsk, onContext, toggleFull]);

  if (tooBig) {
    return <p className="text-sm text-zinc-400">This map is too large to show here.</p>;
  }
  return (
    <div
      ref={box}
      className={windowFull ? "fixed inset-0 z-[1000] flex flex-col gap-2 bg-zinc-950 p-2" : browserFull ? "flex h-full w-full flex-col gap-2 bg-zinc-950 p-2" : "min-w-0"}
      data-testid={testId}
      data-fullscreen={browserFull ? "on" : windowFull ? "window" : "off"}
      role={windowFull ? "dialog" : undefined}
      aria-modal={windowFull ? true : undefined}
      aria-label={windowFull ? title : undefined}
    >
      {full && (
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="app-map-fullscreen"
            aria-pressed={isFull}
            title={isFull ? "Exit full screen (Esc)" : "Show the map on the whole screen"}
            onClick={() => toggleFull(!isFull)}
            className={`${buttonClass("secondary", "sm")} gap-1.5`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={isFull ? "M20 10h-6V4M4 14h6v6M14 10l6-6M10 14l-6 6" : "M14 4h6v6M10 20H4v-6M20 4l-6 6M4 20l6-6"} />
            </svg>
            {isFull ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      )}
      {problem && <p className="mb-2 text-sm text-zinc-400">{problem}</p>}
      <iframe
        ref={ref}
        key={json.length + ":" + json.slice(0, 64) + ":" + (focus ?? "") + ":" + (flow ?? "")}
        title={title}
        // `#ask=host`: the viewer's "Ask about this" comes back to this page;
        // `s=`: the part it opens on; `full=1`, `flow=`: see frameSrc.
        src={frameSrc(focus, { full, flow })}
        sandbox="allow-scripts"
        allow="fullscreen"
        referrerPolicy="no-referrer"
        loading="lazy"
        className={`block w-full rounded-lg border border-zinc-800 bg-zinc-950 ${isFull ? "min-h-0 flex-1" : height ? "" : "h-[max(520px,calc(100dvh-140px))] sm:h-[max(640px,calc(100dvh-180px))]"}`}
        style={height && !isFull ? { height } : undefined}
      />
    </div>
  );
}
