"use client";

// Floorplan's map viewer (vendor/floorplan, MIT) in a sandboxed iframe, so
// none of its code or its layout engine ever enters the dashboard's own
// JavaScript or its page:
// - `sandbox="allow-scripts"` and nothing else: the frame has its own opaque
//   origin (no cookies, no storage, nothing of the dashboard's), and its page
//   (public/app-map/frame.html) allows no network at all;
// - `allow="fullscreen"`: the viewer's Full screen button (added by
//   frame.js) may put the frame on the whole screen, nothing more;
// - the viewer's title and description are kept off the canvas, where they
//   covered cards: the frame sends them here (`onContext`) and the page shows
//   them above the map;
// - mounted only while this component is on screen, torn down when it
//   leaves; a new map mounts a fresh frame;
// - the map goes in by postMessage once the frame says it is ready, as one
//   JSON string under a size cap, never in the URL;
// - the viewer's layout engine runs in a Web Worker inside the frame.
//
// Chat draws an answer's mini map with this same frame (chat/answer-map.tsx),
// loaded only when an answer has one.

import { useEffect, useMemo, useRef, useState } from "react";
import type { FloorplanGraph } from "@/lib/api";

/** Largest map handed to the frame (the frame checks the same). */
export const MAX_MAP_BYTES = 25 * 1024 * 1024;

/** What the viewer shows now (the app, or the part opened), sent by the frame. */
export interface MapContext {
  kind: string;
  name: string;
  desc: string;
}

/** The frame's address: the viewer's own hash settings, never the map. */
export function frameSrc(focus?: string): string {
  const id = (focus ?? "").replace(/[^A-Za-z0-9._:-]/g, "");
  return `/app-map/frame.html#ask=host${id ? `&s=${encodeURIComponent(id)}` : ""}`;
}

export function MapFrame({
  graph,
  title,
  height,
  onAsk,
  focus,
  onContext,
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
  testId?: string;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
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
      } else if (type === "floorplan:ask" && onAsk) {
        const items = Array.isArray((e.data as { items?: unknown }).items) ? ((e.data as { items: unknown[] }).items.slice(0, 10) as { id?: string; label?: string; kind?: string }[]) : [];
        onAsk(items.filter((i) => i && typeof i === "object"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [json, tooBig, onAsk, onContext]);

  if (tooBig) {
    return <p className="text-sm text-zinc-400">This map is too large to show here.</p>;
  }
  return (
    <div className="min-w-0" data-testid={testId}>
      {problem && <p className="mb-2 text-sm text-zinc-400">{problem}</p>}
      <iframe
        ref={ref}
        key={json.length + ":" + json.slice(0, 64) + ":" + (focus ?? "")}
        title={title}
        // `#ask=host`: the viewer's "Ask about this" comes back to this page;
        // `s=`: the part it opens on.
        src={frameSrc(focus)}
        sandbox="allow-scripts"
        allow="fullscreen"
        referrerPolicy="no-referrer"
        loading="lazy"
        className={`block w-full rounded-lg border border-zinc-800 bg-zinc-950 ${height ? "" : "h-[max(520px,calc(100dvh-140px))] sm:h-[max(640px,calc(100dvh-180px))]"}`}
        style={height ? { height } : undefined}
      />
    </div>
  );
}
