// Repos this browser picked or reviewed lately, newest first. Only a
// convenience for the pickers' "Recent" group: a private window or blocked
// storage simply has none.

const KEY = "coderhelm.recent-repos";
const MAX = 5;
const EVENT = "coderhelm:recent-repos";

export function recentRepos(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberRepo(name: string): void {
  if (!name) return;
  try {
    const next = [name, ...recentRepos().filter((r) => r !== name)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage blocked: no recents.
  }
}

/** Calls `fn` when the list changes in this tab or another. */
export function onRecentRepos(fn: () => void): () => void {
  const storage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}
