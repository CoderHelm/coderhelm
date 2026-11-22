// How the App map page words a build: its steps, how long it has run, how
// long it usually takes and when the map was last built. Pure, so the words
// are the same wherever they show.

import type { AppMapStage, AppMapStatus } from "./api";

/** The build's steps in order, as the page lists them. */
export const BUILD_STEPS: { key: AppMapStage; label: string; detail: string }[] = [
  { key: "reading", label: "Reading the repositories", detail: "Every repository, side by side, so calls from one to another can be matched." },
  { key: "parts", label: "Finding the parts and how they connect", detail: "Which parts the app has, and what calls what." },
  { key: "describing", label: "Describing each part in plain words", detail: "A short description of each part, file and endpoint." },
  { key: "done", label: "Done", detail: "The map opens on this page." },
];

/** The step a build is on (0 to 3). A build waiting to start is on the first. */
export function stepIndex(stage: string | undefined): number {
  const i = BUILD_STEPS.findIndex((s) => s.key === stage);
  return i < 0 ? 0 : i;
}

/** "under a minute", "1 min", "14 min", "1 h 5 min". */
export function duration(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return "under a minute";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "2:35 PM", in this computer's time zone. */
export function clockTime(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A map of 3 repositories usually takes 7 to 12 minutes." */
export function estimateLine(status: Pick<AppMapStatus, "estimate" | "repos">): string {
  const e = status.estimate;
  if (!e) return "A first map usually takes a few minutes.";
  const low = Math.max(1, Math.round(e.low_secs / 60));
  const high = Math.max(low, Math.round(e.high_secs / 60));
  const span = low === high ? `about ${plural(low, "minute")}` : `${low} to ${high} minutes`;
  const repos = status.repos ?? 0;
  return repos > 0 ? `A map of ${plural(repos, "repository", "repositories")} usually takes ${span}.` : `A map usually takes ${span}.`;
}

/** "just now", "3 minutes ago", "2 hours ago", "4 days ago". */
export function ago(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${plural(m, "minute")} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${plural(h, "hour")} ago`;
  return `${plural(Math.floor(h / 24), "day")} ago`;
}

/** "Built 3 minutes ago from 12 repositories", as far as it is known. */
export function builtLine(status: Pick<AppMapStatus, "built_at" | "built_repos">, nowSecs: number): string {
  const at = status.built_at ?? 0;
  const repos = status.built_repos ?? 0;
  const when = at > 0 ? ` ${ago(nowSecs - at)}` : "";
  const from = repos > 0 ? ` from ${plural(repos, "repository", "repositories")}` : "";
  return `Built${when}${from}`;
}
