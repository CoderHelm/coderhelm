"use client";

// ⌘K / Ctrl+K: one box that finds anything in the dashboard and does the
// rarer things ("Review a PR…") from the keyboard.
//
// - Empty: recent items, a few actions, "Search in …" scopes, every page.
// - Typing: pages, actions and settings matched fuzzily in the browser; runs,
//   reviewed PRs, releases and plans from `GET /api/search` (debounced, one
//   request at a time); data sources, skills and members from their own
//   lists, loaded once when the palette first opens (each behind its role).
// - The open page can offer its own actions ("Close this run") through
//   `usePaletteActions`; they lead the Actions group while it is open.
// - ">" at the start shows only actions. Picking a "Search in Runs" scope
//   narrows the search to that kind; Backspace in the empty box leaves it.
// - cmdk gives the listbox semantics and arrow / Enter / Home / End keys;
//   Radix Dialog gives the focus trap, Escape and the return of focus.

import { ANY_CHANGE, can } from "@/lib/capabilities";
import * as Dialog from "@radix-ui/react-dialog";
import { Command, defaultFilter } from "cmdk";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, type SearchResults } from "@/lib/api";
import { kindLabel, whereLabel } from "@/lib/data-sources";
import { pageHref, skillsApi } from "@/lib/skills";
import { helpHref, helpTargetFromUrl } from "@/lib/support";
import { runStatusLabel } from "./run-status";
import { timeAgo } from "./list/time";
import { focusRing } from "./ui";

type Scope = "runs" | "prs" | "releases" | "plans" | "sources" | "skills" | "members" | "pages" | "actions";

type GroupKey = "recent" | "actions" | "scopes" | "pages" | "settings" | Exclude<Scope, "pages" | "actions">;

interface Entry {
  id: string;
  group: GroupKey;
  label: string;
  sub?: string;
  href?: string;
  /** Opens outside the dashboard. */
  external?: boolean;
  run?: () => void;
  keywords?: string[];
}

const GROUP_TITLE: Record<GroupKey, string> = {
  recent: "Recent",
  actions: "Actions",
  scopes: "Search in",
  pages: "Pages",
  settings: "Settings",
  runs: "Runs",
  prs: "Pull requests",
  releases: "Releases",
  plans: "Plans",
  sources: "Data sources",
  skills: "Skills",
  members: "Members",
};

const SCOPE_TITLE: Record<Scope, string> = {
  runs: "Runs",
  prs: "Pull requests",
  releases: "Releases",
  plans: "Plans",
  sources: "Data sources",
  skills: "Skills",
  members: "Members",
  pages: "Pages",
  actions: "Actions",
};

/** The families `/api/search` answers, by scope. */
const SERVER_TYPES: Partial<Record<Scope, string>> = { runs: "runs", prs: "reviews", releases: "releases", plans: "plans" };


export interface PalettePage {
  href: string;
  label: string;
  section?: string;
}

export interface PaletteUser {
  role: string;
  /** The capability keys this person holds (lib/capabilities.ts). */
  capabilities?: string[];
}

// ── Recent items (this browser only) ─────────────────────────────────────

const RECENT_KEY = "coderhelm:palette:recent";
const RECENT_MAX = 8;

function readRecent(): Entry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e.id === "string" && typeof e.label === "string" && typeof e.href === "string")
      .slice(0, RECENT_MAX)
      .map((e) => ({ id: e.id, label: e.label, sub: typeof e.sub === "string" ? e.sub : undefined, href: e.href, group: "recent" as const }));
  } catch {
    return [];
  }
}

function remember(e: Entry) {
  if (!e.href || e.external) return;
  try {
    const kept = readRecent().filter((r) => r.id !== e.id);
    const next = [{ id: e.id, label: e.label, sub: e.sub, href: e.href }, ...kept].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private windows and blocked storage: the palette works without recents.
  }
}

// ── Static catalogs ──────────────────────────────────────────────────────

function actionsFor(who: PaletteUser): (Entry & { need?: string })[] {
  const all: (Entry & { need?: string })[] = [
    { id: "act:review-pr", group: "actions", label: "Review a PR…", sub: "Review any pull request's latest commit now", href: "/reviewer?review=1", need: "reviews", keywords: ["re-review", "pull request"] },
    { id: "act:write-notes", group: "actions", label: "Write release notes for a tag…", sub: "Releases", href: "/releases?write=1", need: "reviews", keywords: ["release", "changelog", "tag"] },
    { id: "act:release-now", group: "actions", label: "Release now…", sub: "Releases waiting to go out", href: "/releases", need: "reviews", keywords: ["release", "ship", "deploy"] },
    { id: "act:new-plan", group: "actions", label: "New plan", sub: "Break work into tasks Coderhelm builds", href: "/plans/new", need: "plans", keywords: ["new run", "start", "create", "task"] },
    { id: "act:add-source", group: "actions", label: "Add a data source", sub: "Connect an API, logs or a database", href: "/data-sources/connect", need: "data_sources", keywords: ["connect", "database", "api"] },
    { id: "act:new-tool", group: "actions", label: "Write a tool", sub: "A named lookup Coderhelm can call", href: "/data-sources/tools/new", need: "data_sources", keywords: ["lookup", "query"] },
    { id: "act:invite", group: "actions", label: "Invite a teammate", sub: "Team", href: "/settings/team", need: "people", keywords: ["member", "add person", "user"] },
    { id: "act:skills-repo", group: "actions", label: "Connect a skills repository", sub: "Skills", href: "/skills", need: "data_sources", keywords: ["skill", "agent", "command"] },
    { id: "act:reviewer-config", group: "actions", label: "Configure the reviewer", sub: "Reviewer settings", href: "/reviewer/config", need: ANY_CHANGE, keywords: ["label", "auto-merge", "release notes"] },
    // The href is filled in when the palette opens, with the page it opened on.
    { id: "act:get-help", group: "actions", label: "Get help…", sub: "Open a support ticket about this page", href: "/support?new=1", keywords: ["support", "ticket", "help", "contact", "broken", "bug"] },
    { id: "act:tickets", group: "actions", label: "Your support tickets", sub: "Support", href: "/support", keywords: ["support", "ticket", "help", "replies"] },
    { id: "act:report", group: "actions", label: "Report an issue", sub: "Open a ticket about something that went wrong", href: "/support?new=1&type=issue", keywords: ["bug", "feedback", "support", "broken"] },
    { id: "act:contact", group: "actions", label: "Contact us", sub: "Ask Coderhelm support a question", href: "/support?new=1&type=contact", keywords: ["contact", "email", "question", "feedback"] },
  ];
  return all.filter((a) => !a.need || can(who, a.need));
}

const SETTINGS: { label: string; href: string; need?: string; keywords: string[] }[] = [
  { label: "General settings", href: "/settings", keywords: ["team name", "reset", "danger zone"] },
  { label: "Custom instructions", href: "/settings/instructions", need: "agent_settings", keywords: ["prompt", "rules", "style"] },
  { label: "Workflow and git conventions", href: "/settings/workflow", need: "agent_settings", keywords: ["branch", "commit", "pr title", "naming"] },
  { label: "Guardrails", href: "/settings/guardrails", need: "agent_settings", keywords: ["limits", "safety", "files"] },
  { label: "Team voice", href: "/settings/voice", need: "agent_settings", keywords: ["tone", "writing"] },
  { label: "AI models", href: "/settings/models", need: "model_provider", keywords: ["model", "llm"] },
  { label: "Repositories", href: "/settings/repos", need: ANY_CHANGE, keywords: ["repo", "sync", "role"] },
  { label: "Integrations", href: "/settings/integrations", need: "view_integrations", keywords: ["connect", "mcp", "plugins"] },
  { label: "GitHub integration", href: "/settings/integrations/github", need: "view_integrations", keywords: ["app", "install"] },
  { label: "Jira integration", href: "/settings/integrations/jira", need: "integrations", keywords: ["tickets", "atlassian"] },
  { label: "AWS accounts", href: "/settings/integrations/aws", need: "view_integrations", keywords: ["cloud", "role"] },
  { label: "Reviewer settings", href: "/reviewer/config", need: ANY_CHANGE, keywords: ["review label", "auto-merge", "release notes"] },
  { label: "Alert routes", href: "/settings/alerts", need: "view_alerts", keywords: ["alarm", "sns", "topic"] },
  { label: "Notifications", href: "/settings/notifications", keywords: ["email"] },
  { label: "Team members", href: "/settings/team", keywords: ["people", "roles", "invite"] },
  { label: "Security", href: "/settings/security", keywords: ["password", "two-factor", "mfa"] },
  { label: "Token limit", href: "/settings/budget", need: ANY_CHANGE, keywords: ["budget", "usage", "cost"] },
];

// ── Context ──────────────────────────────────────────────────────────────

const PaletteContext = createContext<{ open: (scope?: Scope) => void }>({ open: () => {} });

export function useCommandPalette() {
  return useContext(PaletteContext);
}

/** Something the open page can do from the palette, e.g. "Close this run". */
export interface PageAction {
  id: string;
  label: string;
  sub?: string;
  keywords?: string[];
  run: () => void;
}

const PageActionsContext = createContext<(actions: PageAction[] | null) => void>(() => {});

/**
 * Offer `actions` in the palette while this page is open. Pass a memoized
 * list (or null for none); they go away when the page does.
 */
export function usePaletteActions(actions: PageAction[] | null) {
  const set = useContext(PageActionsContext);
  useEffect(() => {
    set(actions);
    return () => set(null);
  }, [actions, set]);
}

/** True on Apple keyboards, where the shortcut reads ⌘K. */
function useIsMac() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

/** The search button for the sidebar and the phone header. */
export function CommandPaletteButton({ compact = false, inline = false }: { compact?: boolean; inline?: boolean }) {
  const { open } = useCommandPalette();
  const mac = useIsMac();
  if (inline) {
    // The top bar's search: a short field-like button with its shortcut.
    return (
      <button
        type="button"
        onClick={() => open()}
        aria-keyshortcuts="Meta+K Control+K"
        data-testid="open-command-palette"
        className={`flex min-h-9 w-44 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 text-sm text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 lg:w-56 ${focusRing}`}
      >
        <SearchGlyph />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded border border-zinc-700 px-1.5 text-[11px] leading-5 text-zinc-500">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
    );
  }
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => open()}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 ${focusRing}`}
      >
        <SearchGlyph />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => open()}
      aria-keyshortcuts="Meta+K Control+K"
      data-testid="open-command-palette"
      className={`mb-3 flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-sm text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 ${focusRing}`}
    >
      <SearchGlyph />
      <span className="flex-1 text-left">Search</span>
      <kbd className="rounded border border-zinc-700 px-1.5 text-[11px] leading-5 text-zinc-500">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

function SearchGlyph() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

export function CommandPaletteProvider({
  pages,
  user,
  children,
}: {
  pages: PalettePage[];
  user: PaletteUser | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope | null>(null);
  const [pageActions, setPageActions] = useState<PageAction[] | null>(null);

  const openPalette = useCallback((s?: Scope) => {
    setScope(s ?? null);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A text box that uses ⌘K itself (the markdown editor's link) has taken it.
      if (e.defaultPrevented) return;
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setOpen((v) => {
          if (!v) setScope(null);
          return !v;
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const ctx = useMemo(() => ({ open: openPalette }), [openPalette]);

  return (
    <PaletteContext.Provider value={ctx}>
      <PageActionsContext.Provider value={setPageActions}>{children}</PageActionsContext.Provider>
      {user && (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60" />
            <Dialog.Content
              aria-describedby={undefined}
              data-testid="command-palette"
              className="fixed inset-x-0 top-0 z-[71] mx-auto flex max-h-[100dvh] w-full flex-col overflow-hidden border-zinc-800 bg-zinc-900 shadow-2xl sm:inset-x-4 sm:top-[12vh] sm:max-h-[70vh] sm:max-w-xl sm:rounded-xl sm:border"
            >
              <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
              {open && (
                <Palette pages={pages} pageActions={pageActions} who={user} scope={scope} setScope={setScope} close={() => setOpen(false)} />
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </PaletteContext.Provider>
  );
}

// ── Data that is loaded once per page load ───────────────────────────────

interface Catalogs {
  sources: Entry[];
  skills: Entry[];
  members: Entry[];
}

let catalogsOnce: Promise<Catalogs> | null = null;

function loadCatalogs(who: PaletteUser): Promise<Catalogs> {
  catalogsOnce ??= (async () => {
    const [sources, skills, members] = await Promise.all([
      can(who, "data_sources")
        ? api.listDataSources().then(
            (r) =>
              r.sources.map<Entry>((s) => ({
                id: `source:${s.id}`,
                group: "sources",
                label: s.name,
                sub: `${kindLabel(s)} · ${whereLabel(s)}`,
                href: `/data-sources?source=${encodeURIComponent(s.id)}`,
                keywords: [kindLabel(s), whereLabel(s)],
              })),
            () => [],
          )
        : [],
      can(who, ANY_CHANGE)
        ? skillsApi.list().then(
            (r) =>
              r.items.map<Entry>((s) => ({
                id: `skill:${s.repo}#${s.path}`,
                group: "skills",
                label: `${s.kind}:${s.name}`,
                sub: s.description ? s.description.slice(0, 90) : `${s.repo} · ${s.path}`,
                href: pageHref(s),
                keywords: [s.name, s.repo, s.path, s.description.slice(0, 200)],
              })),
            () => [],
          )
        : [],
      can(who, "people")
        ? api.listUsers().then(
            (r) =>
              r.users.map<Entry>((u) => {
                const name = u.name || u.github_login || u.email || "Member";
                return {
                  id: `member:${u.user_id}`,
                  group: "members",
                  label: name,
                  sub: [u.email, u.role].filter(Boolean).join(" · "),
                  href: `/settings/team?q=${encodeURIComponent(u.email || u.github_login || name)}`,
                  keywords: [u.email ?? "", u.github_login ?? "", u.role],
                };
              }),
            () => [],
          )
        : [],
    ]);
    return { sources, skills, members };
  })();
  // A failed load tries again next time the palette opens.
  catalogsOnce.catch(() => {
    catalogsOnce = null;
  });
  return catalogsOnce;
}

/** Ask `/api/search` only while it exists; an older backend answers 404 once. */
let serverSearch: "unknown" | "yes" | "no" = "unknown";

function serverEntries(r: SearchResults): Entry[] {
  return [
    ...r.runs.map<Entry>((x) => ({
      id: `run:${x.run_id}`,
      group: "runs",
      label: x.title || x.ticket_id || "Untitled run",
      sub: [x.ticket_id && x.ticket_id !== x.title ? x.ticket_id : "", x.repo, runStatusLabel(x.status), timeAgo(x.created_at)].filter(Boolean).join(" · "),
      href: `/runs/detail?id=${encodeURIComponent(x.run_id)}`,
    })),
    ...r.reviews.map<Entry>((x) => ({
      id: `pr:${x.repo}#${x.pr_number}`,
      group: "prs",
      label: x.title || `Pull request #${x.pr_number}`,
      sub: [`${x.repo} #${x.pr_number}`, verdictWords(x.verdict), timeAgo(x.created_at)].filter(Boolean).join(" · "),
      href: `/reviewer/detail?sk=${encodeURIComponent(x.sk)}`,
    })),
    ...r.releases.map<Entry>((x) => ({
      id: `release:${x.repo}@${x.tag}`,
      group: "releases",
      label: `${x.repo} ${x.tag}`,
      sub: [x.headline, timeAgo(x.updated_at)].filter(Boolean).join(" · "),
      href: `/releases?repo=${encodeURIComponent(x.repo)}&q=${encodeURIComponent(x.tag)}`,
    })),
    ...r.plans.map<Entry>((x) => ({
      id: `plan:${x.plan_id}`,
      group: "plans",
      label: x.title || "Untitled plan",
      sub: [x.repo, x.status, timeAgo(x.created_at)].filter(Boolean).join(" · "),
      href: `/plans/detail?id=${encodeURIComponent(x.plan_id)}`,
    })),
  ];
}

function verdictWords(v: string): string {
  return { APPROVE: "Approved", REQUEST_CHANGES: "Changes requested", COMMENT: "Commented", QUESTION: "Answered a question" }[v] ?? "";
}

/** The server search for `q`, debounced, cancelling the one before. */
function useServerSearch(q: string, scope: Scope | null) {
  const [state, setState] = useState<{ q: string; entries: Entry[]; loading: boolean; failed: boolean }>({
    q: "",
    entries: [],
    loading: false,
    failed: false,
  });
  const types = scope ? SERVER_TYPES[scope] : undefined;
  const wanted = q.length >= 2 && (scope === null || !!types);

  useEffect(() => {
    if (!wanted) {
      setState({ q: "", entries: [], loading: false, failed: false });
      return;
    }
    setState((s) => ({ ...s, loading: true, failed: false }));
    const ctrl = new AbortController();
    const limit = scope ? 10 : 4;
    const t = window.setTimeout(async () => {
      try {
        let entries: Entry[];
        if (serverSearch !== "no") {
          try {
            const r = await api.search(q, { limit, types }, { signal: ctrl.signal });
            serverSearch = "yes";
            entries = serverEntries(r);
          } catch (e) {
            if (e instanceof ApiError && (e.status === 404 || e.status === 405)) serverSearch = "no";
            else throw e;
            entries = [];
          }
        } else entries = [];
        // Without `/api/search`, runs still come from the Runs search.
        if (serverSearch === "no" && (scope === null || scope === "runs")) {
          const r = await api.listRuns(undefined, { q });
          entries = serverEntries({ q, runs: r.runs.slice(0, limit).map((x) => ({ ...x, title: x.title ?? "" })), reviews: [], releases: [], plans: [] });
        }
        if (!ctrl.signal.aborted) setState({ q, entries, loading: false, failed: false });
      } catch {
        if (!ctrl.signal.aborted) setState({ q, entries: [], loading: false, failed: true });
      }
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, scope, types, wanted]);

  return state;
}

// ── The palette ──────────────────────────────────────────────────────────

function Palette({
  pages,
  pageActions,
  who,
  scope,
  setScope,
  close,
}: {
  pages: PalettePage[];
  pageActions: PageAction[] | null;
  who: PaletteUser;
  scope: Scope | null;
  setScope: (s: Scope | null) => void;
  close: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [recent] = useState<Entry[]>(() => readRecent());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadCatalogs(who).then((c) => live && setCatalogs(c), () => live && setCatalogs({ sources: [], skills: [], members: [] }));
    return () => {
      live = false;
    };
  }, [who]);

  // ">" means actions only.
  const actionMode = scope === null && text.startsWith(">");
  const effectiveScope: Scope | null = actionMode ? "actions" : scope;
  const q = (actionMode ? text.slice(1) : text).trim();
  const server = useServerSearch(q, effectiveScope);

  // "Get help…" carries the page the palette was opened on (and the run,
  // review or plan it shows). The palette mounts on open, so this is read then.
  const [helpFrom] = useState(() =>
    typeof window === "undefined"
      ? "/support?new=1"
      : helpHref(window.location.pathname, helpTargetFromUrl(window.location.pathname, window.location.search)),
  );
  const actions = useMemo<Entry[]>(
    () => [
      // The open page's own actions first: they are about what is on screen.
      ...(pageActions ?? []).map<Entry>((a) => ({
        id: `page-act:${a.id}`,
        group: "actions",
        label: a.label,
        sub: a.sub,
        keywords: a.keywords,
        run: () => {
          close();
          a.run();
        },
      })),
      ...actionsFor(who).map((a) => (a.id === "act:get-help" ? { ...a, href: helpFrom } : a)),
    ],
    [who, helpFrom, pageActions, close],
  );
  const pageEntries = useMemo<Entry[]>(
    () => pages.map((p) => ({ id: `page:${p.href}`, group: "pages", label: p.label, sub: p.section, href: p.href, keywords: p.section ? [p.section] : [] })),
    [pages],
  );
  const settingsEntries = useMemo<Entry[]>(
    () =>
      SETTINGS.filter((s) => !s.need || can(who, s.need)).map((s) => ({
        id: `settings:${s.href}`,
        group: "settings",
        label: s.label,
        sub: "Settings",
        href: s.href,
        keywords: s.keywords,
      })),
    [who],
  );
  const scopeEntries = useMemo<Entry[]>(() => {
    const avail: Scope[] = ["runs", "prs", "releases", "plans"];
    if (can(who, "data_sources")) avail.push("sources");
    if (can(who, ANY_CHANGE)) avail.push("skills");
    if (can(who, "people")) avail.push("members");
    avail.push("pages", "actions");
    // Reviewer and Releases pages are for members and up.
    return avail
      .filter((s) => can(who, ANY_CHANGE) || (s !== "prs" && s !== "releases"))
      .map((s) => ({ id: `scope:${s}`, group: "scopes", label: `Search ${SCOPE_TITLE[s].toLowerCase()}`, run: () => setScope(s) }));
  }, [who, setScope]);

  const groups = useMemo(() => {
    // Fuzzy, but not scattered: letters strewn across a long label score
    // near zero and are left out.
    const MIN_SCORE = 0.15;
    const scored = new Map<GroupKey, number>();
    const match = (g: GroupKey, list: Entry[], cap: number) => {
      const hits = list
        .map((e) => ({ e, score: defaultFilter(e.label, q, [...new Set([...(e.keywords ?? []), e.sub ?? ""])].filter(Boolean)) }))
        .filter((x) => x.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, cap);
      scored.set(g, hits[0]?.score ?? 0);
      return hits.map((x) => x.e);
    };
    const out: [GroupKey, Entry[]][] = [];
    const big = 50;
    if (!q && !effectiveScope) {
      out.push(["recent", recent]);
      out.push(["actions", actions.slice(0, 4)]);
      out.push(["scopes", scopeEntries]);
      out.push(["pages", pageEntries]);
      return out;
    }
    const showAll = !effectiveScope;
    const cap = (s: Scope) => (effectiveScope === s ? big : 5);
    if (showAll || effectiveScope === "pages") {
      out.push(["pages", q ? match("pages", pageEntries, cap("pages")) : pageEntries]);
      out.push(["settings", q ? match("settings", settingsEntries, cap("pages")) : effectiveScope ? settingsEntries : []]);
    }
    if (showAll || effectiveScope === "actions") out.push(["actions", q ? match("actions", actions, cap("actions")) : actions]);
    // Old server rows stay out while the answer for the new words is on its way.
    if (server.q === q) {
      for (const g of ["runs", "prs", "releases", "plans"] as const) {
        if (showAll || effectiveScope === g) {
          const list = server.entries.filter((e) => e.group === g);
          // The server matched every word: rank these above a loose fuzzy hit,
          // below a page whose name is what was typed.
          scored.set(g, list.length ? 0.5 : 0);
          out.push([g, list]);
        }
      }
    }
    if (catalogs) {
      for (const g of ["sources", "skills", "members"] as const) {
        if (showAll || effectiveScope === g) out.push([g, q ? match(g, catalogs[g], cap(g)) : effectiveScope === g ? catalogs[g].slice(0, big) : []]);
      }
    }
    // Best match first: typing "runs" leads with the Runs page, a ticket number with runs.
    const order = new Map(out.map(([g], i) => [g, i]));
    if (q) out.sort((x, y) => (scored.get(y[0]) ?? 0) - (scored.get(x[0]) ?? 0) || order.get(x[0])! - order.get(y[0])!);
    // Pull requests and releases are member pages.
    return out.filter(([g]) => can(who, ANY_CHANGE) || (g !== "prs" && g !== "releases"));
  }, [q, effectiveScope, recent, actions, scopeEntries, pageEntries, settingsEntries, server, catalogs, who]);

  const total = groups.reduce((n, [, l]) => n + l.length, 0);

  // The highlight starts on the best hit each time the results change, not
  // on whatever row sat at that spot before.
  const [selected, setSelected] = useState("");
  const firstId = groups.find(([, l]) => l.length > 0)?.[1][0]?.id ?? "";
  useEffect(() => {
    setSelected(firstId);
  }, [firstId, q, effectiveScope]);
  const waiting = server.loading || (q.length >= 2 && server.q !== q && (!effectiveScope || !!SERVER_TYPES[effectiveScope]));

  // Back to the top when the results change.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [q, effectiveScope]);

  const choose = (e: Entry) => {
    if (e.run) {
      e.run();
      setText("");
      return;
    }
    if (!e.href) return;
    remember(e);
    close();
    if (e.external) window.open(e.href, "_blank", "noopener,noreferrer");
    else router.push(e.href);
  };

  const fullSearch: Entry | null =
    q && (effectiveScope === null || effectiveScope === "runs")
      ? { id: "act:all-runs", group: "runs", label: `See every run matching “${q}”`, href: `/?q=${encodeURIComponent(q)}` }
      : null;

  return (
    <Command
      label="Search and commands"
      shouldFilter={false}
      loop
      value={selected}
      onValueChange={setSelected}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3">
        <span className="text-zinc-500">
          <SearchGlyph />
        </span>
        {effectiveScope && !actionMode && (
          <button
            type="button"
            onClick={() => setScope(null)}
            aria-label={`Searching ${SCOPE_TITLE[effectiveScope]}. Search everything instead`}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-700 ${focusRing}`}
          >
            {SCOPE_TITLE[effectiveScope]}
            <span aria-hidden="true">×</span>
          </button>
        )}
        <Command.Input
          autoFocus
          value={text}
          onValueChange={setText}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !text && scope) {
              e.preventDefault();
              setScope(null);
            }
          }}
          placeholder={effectiveScope && !actionMode ? `Search ${SCOPE_TITLE[effectiveScope].toLowerCase()}…` : "Search or jump to…  (type > for actions)"}
          className="min-w-0 flex-1 bg-transparent py-3.5 text-base text-zinc-100 placeholder-zinc-500 outline-none sm:text-sm"
        />
        <Dialog.Close
          className={`shrink-0 rounded border border-zinc-700 px-1.5 text-[11px] leading-5 text-zinc-500 hover:text-zinc-300 ${focusRing}`}
        >
          <span className="hidden sm:inline">Esc</span>
          <span className="sm:hidden">Close</span>
        </Dialog.Close>
      </div>
      <Command.List ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-500">
        {waiting && (
          <Command.Loading>
            <p className="px-2 py-1.5 text-xs text-zinc-500" aria-live="polite">
              Searching runs, pull requests, releases and plans…
            </p>
          </Command.Loading>
        )}
        {server.failed && !waiting && <p className="px-2 py-1.5 text-xs text-red-300">The search did not answer. Pages and actions still work.</p>}
        {!waiting && total === 0 && !fullSearch && (
          <Command.Empty>
            <div className="px-2 py-8 text-center text-sm text-zinc-500" data-testid="palette-empty">
              {q ? <>Nothing matches “{q}”.</> : "Nothing here yet."}
            </div>
          </Command.Empty>
        )}
        {groups.map(([g, list]) => {
          const rows = g === "runs" && fullSearch ? [...list, fullSearch] : list;
          if (rows.length === 0) return null;
          return (
            <Command.Group key={g} heading={GROUP_TITLE[g]}>
              {rows.map((e) => (
                <Command.Item
                  key={e.id}
                  value={e.id}
                  onSelect={() => choose(e)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-zinc-300 data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{e.label}</span>
                    {e.sub && <span className="block truncate text-xs text-zinc-500">{e.sub}</span>}
                  </span>
                  {e.run && <span className="shrink-0 text-xs text-zinc-500">Scope</span>}
                  {e.external && <span className="shrink-0 text-xs text-zinc-500">↗</span>}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}
        {fullSearch && !groups.some(([g]) => g === "runs") && (
          <Command.Group heading={GROUP_TITLE.runs}>
            <Command.Item
              value={fullSearch.id}
              onSelect={() => choose(fullSearch)}
              className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm text-zinc-300 data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-100"
            >
              {fullSearch.label}
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
      <div className="hidden items-center gap-4 border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500 sm:flex">
        <span>
          <kbd className="font-sans">↑↓</kbd> move
        </span>
        <span>
          <kbd className="font-sans">↵</kbd> open
        </span>
        <span>
          <kbd className="font-sans">&gt;</kbd> actions
        </span>
        {scope && (
          <span>
            <kbd className="font-sans">⌫</kbd> search everything
          </span>
        )}
      </div>
    </Command>
  );
}
