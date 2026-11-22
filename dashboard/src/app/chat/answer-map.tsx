"use client";

// The mini map under an answer that used the app map: the parts it involves,
// drawn by the App map page's own sandboxed frame (app-map/map-frame.tsx).
// Answer views load this file only when an answer has a map (next/dynamic),
// so the frame never mounts for other answers. Floorplan's viewer itself is
// never in a page's JavaScript: the frame loads it as a static file.

import type { FloorplanGraph } from "@/lib/api";
import { MapFrame } from "../app-map/map-frame";

export default function AnswerMapFrame({ graph }: { graph: FloorplanGraph }) {
  return <MapFrame graph={graph} title="The parts this answer involves" height="min(360px, 55dvh)" testId="answer-map-frame" />;
}
