"use client";

// Floorplan's map viewer (vendor/floorplan, MIT) in a sandboxed iframe, so
// none of its code or its layout engine ever enters the dashboard's own
// JavaScript or its page:
// - `sandbox="allow-scripts"` and nothing else: the frame has its own opaque
//   origin (no cookies, no storage, nothing of the dashboard's), and its page
//   (public/app-map/frame.html) allows no network at all;
// - mounted only while this component is on screen, torn down when it
//   leaves; a new map mounts a fresh frame;
// - the map goes in by postMessage once the frame says it is ready, as one
//   JSON string under a size cap, never in the URL;
// - the viewer's layout engine runs in a Web Worker inside the frame.

import { useEffect, useMemo, useRef, useState } from "react";
import type { FloorplanGraph } from "@/lib/api";

/** Largest map handed to the frame (the frame checks the same). */
export const MAX_MAP_BYTES = 25 * 1024 * 1024;

export function MapFrame({
  graph,
  title,
  height = "70vh",
  onAsk,
  testId = "app-map-frame",
}: {
  graph: FloorplanGraph;
  title: string;
  height?: string;
  /** The viewer's "Ask about this": the cards it names. */
  onAsk?: (items: { id?: string; label?: string; kind?: string }[]) => void;
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
        frame.contentWindow?.postMessage({ type: "coderhelm:app-map-graph", json }, "*");
      } else if (type === "coderhelm:app-map-frame-error") {
        setProblem(String((e.data as { text?: string }).text || "The map couldn't be shown."));
      } else if (type === "floorplan:ask" && onAsk) {
        const items = Array.isArray((e.data as { items?: unknown }).items) ? ((e.data as { items: unknown[] }).items.slice(0, 10) as { id?: string; label?: string; kind?: string }[]) : [];
        onAsk(items.filter((i) => i && typeof i === "object"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [json, tooBig, onAsk]);

  if (tooBig) {
    return <p className="text-sm text-zinc-400">This map is too large to show here.</p>;
  }
  return (
    <div className="min-w-0" data-testid={testId}>
      {problem && <p className="mb-2 text-sm text-zinc-400">{problem}</p>}
      <iframe
        ref={ref}
        key={json.length + ":" + json.slice(0, 64)}
        title={title}
        // `#ask=host`: the viewer's "Ask about this" comes back to this page.
        src="/app-map/frame.html#ask=host"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        className="block w-full rounded-lg border border-zinc-800 bg-zinc-950"
        style={{ height }}
      />
    </div>
  );
}
