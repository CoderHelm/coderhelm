// Reading the App map: the build status and the overlays come from the API,
// and the map itself from where the API says it is.
//
// The server writes the page's copy of the map when it builds it and answers
// `GET /api/app-map` with a short-lived signed address for it (`graph_url`,
// gzipped JSON the browser unzips) and CoderHelm's Recent work and Health as
// a small payload (`overlays`). The page reads the map once per build and lays
// the overlays over it here, the same way the server's
// `common::app_map::apply_overlays` does. Where the bucket can't be reached
// from the browser, the same bytes come through the API (`graph_fallback`).
// An older server still sends the map itself (`graph`); that is used as it is.

import type { AppMapResponse, FloorplanGraph } from "./api";
import { apiBase } from "./runtime-config";

/** How long the page waits for the status or the map before it says so. */
export const LOAD_TIMEOUT_MS = 20_000;

/** CoderHelm's overlays for a map, laid over it on the page. */
export interface AppMapOverlays {
  /** The map's Recent work; `null`: none. Absent: leave the map's own. */
  recent?: Record<string, unknown> | null;
  /** CoderHelm's findings to add, Floorplan checks to drop (by id), and Health's counts. */
  health?: { add: unknown[]; drop: string[]; summary: Record<string, number> } | null;
}

type Issue = { id?: unknown; source?: unknown };

/** The map with CoderHelm's overlays in Floorplan's own fields (a new object; `graph` is untouched). */
export function applyOverlays(graph: FloorplanGraph, o: AppMapOverlays | undefined): FloorplanGraph {
  if (!o) return graph;
  const out: FloorplanGraph = { ...graph };
  if ("recent" in o) {
    if (o.recent == null) delete out.recent;
    else out.recent = o.recent;
  }
  const h = o.health;
  if (h && typeof h === "object") {
    const drop = new Set(Array.isArray(h.drop) ? h.drop : []);
    const health = (graph.health && typeof graph.health === "object" ? graph.health : {}) as Record<string, unknown>;
    const issues = (Array.isArray(health.issues) ? (health.issues as Issue[]) : []).filter(
      (i) => !(i && i.source === "floorplan" && typeof i.id === "string" && drop.has(i.id)),
    );
    out.health = { ...health, issues: [...issues, ...(Array.isArray(h.add) ? h.add : [])], summary: h.summary };
  }
  return out;
}

/** Why a read of the map stopped, in plain words. */
export class MapLoadError extends Error {}

/** `fetch` that gives up after `ms`, or when `outer` is aborted. */
export async function fetchWithin(url: string, init: RequestInit, ms: number, outer?: AbortSignal): Promise<Response> {
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  const t = setTimeout(stop, ms);
  outer?.addEventListener("abort", stop);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if (outer?.aborted) throw e;
    if (ctl.signal.aborted) throw new MapLoadError("The map took too long to load.");
    throw e;
  } finally {
    clearTimeout(t);
    outer?.removeEventListener("abort", stop);
  }
}

async function readGraph(res: Response): Promise<FloorplanGraph> {
  if (!res.ok) throw new MapLoadError(`The map couldn't be read (HTTP ${res.status}).`);
  const g = (await res.json()) as FloorplanGraph | null;
  if (!g || g.schema !== "floorplan/graph@1") throw new MapLoadError("The map couldn't be read.");
  return g;
}

/**
 * The page's copy of the map an answer points to: from the bucket, else
 * through the API. `null` when the answer has no map.
 */
export async function fetchMapGraph(r: AppMapResponse, ms = LOAD_TIMEOUT_MS, signal?: AbortSignal): Promise<FloorplanGraph | null> {
  if (r.graph) return r.graph;
  if (!r.graph_url) return null;
  const deadline = Date.now() + ms;
  try {
    // The signed address is the credential: no cookies go to the bucket.
    return await readGraph(await fetchWithin(r.graph_url, { credentials: "omit", cache: "no-store" }, ms, signal));
  } catch (e) {
    if (signal?.aborted || !r.graph_fallback) throw e;
    const left = deadline - Date.now();
    if (left <= 0) throw e instanceof MapLoadError ? e : new MapLoadError("The map took too long to load.");
    return readGraph(await fetchWithin(`${apiBase()}${r.graph_fallback}`, { credentials: "include", cache: "no-store" }, left, signal));
  }
}
