"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { CommandPaletteButton } from "./command-palette";
import { ChevronRightIcon } from "./icons";
import { focusRing } from "./ui";
import { parentHref, tabTitle, trailFor, type Crumb } from "@/lib/routes";

// The one bar at the top of every page. Left: where you are, as a trail of
// links ending on the current page. Right: search. On a phone: a back arrow
// and the current page's name.
//
// The shell renders exactly one TopBar; pages never render one themselves.
// A page names itself with <PageHeader> (components/page.tsx): a visible
// title with its actions beside it, in the page. The bar's last crumb can be
// the item's short name, which PageHeader hands over through usePageMeta.

/** What the page on screen says about itself. */
export interface PageMeta {
  /** The item's name (a run's title), or an extra last crumb (New request). */
  crumb?: string;
  /** The page shows its own title, so the bar's last crumb is not the heading. */
  ownTitle: boolean;
  /** The page put actions or a More menu in the bar. */
  hasActions: boolean;
}

interface TopBarState {
  meta: PageMeta | null;
  setMeta: (owner: string, meta: PageMeta | null) => void;
}

const TopBarContext = createContext<TopBarState | null>(null);

export function useTopBar(): TopBarState | null {
  return useContext(TopBarContext);
}

/**
 * Tell the bar about the page on screen. <PageHeader> calls this; a page that
 * draws its own title (a setup flow) calls it with `ownTitle: true`.
 */
export function usePageMeta(meta: PageMeta) {
  const bar = useContext(TopBarContext);
  const owner = useId();
  const setMeta = bar?.setMeta;
  const { crumb, ownTitle, hasActions } = meta;
  // Before paint, so the bar never shows a second heading for a frame.
  useLayoutEffect(() => {
    if (!setMeta) return;
    setMeta(owner, { crumb, ownTitle, hasActions });
    return () => setMeta(owner, null);
  }, [setMeta, owner, crumb, ownTitle, hasActions]);
}

// ── In-app history, for the back arrow ─────────────────────────────

const HISTORY_KEY = "coderhelm.trail";

function readStack(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(stack.slice(-50)));
  } catch {
    /* private mode: back falls back to the parent page */
  }
}

/**
 * The pages visited in this tab, oldest first, by path: a filter change on the
 * same page is not a new page. Going to the entry before the current one
 * counts as going back and pops; anything else pushes. A reload keeps the
 * stack (sessionStorage), a new tab starts empty.
 *
 * Paths only, from usePathname: reading the query (useSearchParams) would make
 * the bar suspend in the static export and remount, and with it the page's
 * actions, taking focus away from a button the page just focused.
 */
function useInAppHistory(): { canGoBack: boolean } {
  const url = usePathname() ?? "/";
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    const stack = readStack();
    const top = stack[stack.length - 1];
    if (top === url) {
      // A reload, or the same address again.
    } else if (stack[stack.length - 2] === url) {
      stack.pop();
    } else {
      stack.push(url);
    }
    writeStack(stack);
    setCanGoBack(stack.length > 1);
  }, [url]);
  return { canGoBack };
}

// ── The provider ───────────────────────────────────────────────────

export function TopBarProvider({ children }: { children: ReactNode }) {
  const [metas, setMetas] = useState<{ owner: string; meta: PageMeta }[]>([]);

  const setMeta = useCallback((owner: string, meta: PageMeta | null) => {
    setMetas((prev) => {
      const rest = prev.filter((m) => m.owner !== owner);
      return meta ? [...rest, { owner, meta }] : rest;
    });
  }, []);

  // The most recently mounted header speaks for the page.
  const meta = metas.length ? metas[metas.length - 1].meta : null;

  const state = useMemo<TopBarState>(() => ({ meta, setMeta }), [meta, setMeta]);
  return <TopBarContext.Provider value={state}>{children}</TopBarContext.Provider>;
}

// ── The bar ────────────────────────────────────────────────────────

export function TopBar(props: { teamName?: string; menuButton?: ReactNode }) {
  const { canGoBack } = useInAppHistory();
  return <TopBarFrame {...props} canGoBack={canGoBack} />;
}

function TopBarFrame({ teamName, menuButton, canGoBack }: { teamName?: string; menuButton?: ReactNode; canGoBack: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const bar = useContext(TopBarContext);
  const meta = bar?.meta ?? null;
  const crumb = meta?.crumb || null;
  const trail = trailFor(pathname, crumb);
  const current: Crumb = trail[trail.length - 1] ?? { label: "Page not found" };
  const ancestors = trail.slice(0, -1);
  const up = parentHref(pathname, crumb);
  const upLabel = ancestors[ancestors.length - 1]?.label;
  // The current page is the page's heading unless the page shows its own
  // title (an item's name above its details) or no page answered.
  const isHeading = trail.length > 0 && !meta?.ownTitle;
  const tab = tabTitle(pathname, crumb);

  const goBack = () => {
    if (canGoBack) router.back();
    else if (up) router.push(up);
  };


  return (
    <div
      data-testid="topbar"
      className="sticky top-0 z-30 border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80"
    >
      <title>{tab ? `${tab} · Coderhelm` : "Coderhelm"}</title>
      <div className="mx-auto box-content flex h-12 max-w-6xl min-w-0 items-center gap-2 px-4 md:px-8">
        {/* Phone: back one level, or home on a top-level page. */}
        <div className="flex shrink-0 md:hidden">
          {up ? (
            <button
              type="button"
              onClick={goBack}
              aria-label={canGoBack ? "Back" : `Back to ${upLabel ?? "the previous page"}`}
              data-testid="topbar-back"
              className={`-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : (
            <Link href="/" aria-label="Coderhelm home" className={`-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg ${focusRing}`}>
              <Logo />
            </Link>
          )}
        </div>

        <nav aria-label="Breadcrumb" className="min-w-0 flex-1" data-testid="breadcrumb">
          <ol className="flex min-w-0 items-center gap-1 text-sm">
            {teamName && (
              <li className="hidden shrink-0 items-center gap-1 md:flex">
                <Link
                  href="/"
                  className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-zinc-400 hover:text-zinc-100 ${focusRing}`}
                  title={`${teamName}: go to runs`}
                >
                  <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white">
                    {teamName.charAt(0).toUpperCase()}
                  </span>
                  <span className="max-w-40 truncate">{teamName}</span>
                </Link>
                <Separator />
              </li>
            )}
            {ancestors.map((c) => (
              <li key={c.href ?? c.label} className="hidden min-w-0 shrink-0 items-center gap-1 md:flex">
                <Link href={c.href ?? "/"} title={c.label} className={`block max-w-48 truncate rounded px-1 py-0.5 text-zinc-400 hover:text-zinc-100 ${focusRing}`}>
                  {c.label}
                </Link>
                <Separator />
              </li>
            ))}
            <li className="flex min-w-0 flex-1 items-center" data-testid="breadcrumb-current">
              {isHeading ? (
                <h1 aria-current="page" className="truncate px-1 text-sm font-semibold text-zinc-100" title={current.label}>
                  {current.label}
                </h1>
              ) : (
                <span aria-current="page" className="truncate px-1 font-medium text-zinc-100" title={current.label}>
                  {current.label}
                </span>
              )}
            </li>
          </ol>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <div className="md:hidden">
            <CommandPaletteButton compact />
          </div>
          <div className="hidden md:block">
            <CommandPaletteButton inline />
          </div>
          {menuButton}
        </div>
      </div>
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="shrink-0 scale-75 text-zinc-600">
      <ChevronRightIcon />
    </span>
  );
}

export function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" className="h-5 w-5 flex-shrink-0" aria-hidden="true">
      <polygon points="106,416 158,416 226,96 174,96" fill="white" />
      <polygon points="196,416 248,416 316,96 264,96" fill="#3B82F6" />
      <polygon points="286,416 338,416 406,96 354,96" fill="white" />
    </svg>
  );
}
