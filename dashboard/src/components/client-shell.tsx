"use client";

import { can } from "@/lib/capabilities";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api, ApiError, TWO_FACTOR_REQUIRED, type UsageInfo, type Banner, type TeamInfo } from "@/lib/api";
import { pushToDataLayer } from "@/lib/gtm";
import { BETA_SIGNUPS_CHANGED } from "@/lib/admin";
import { formatTokens, limitName, reachedLimit, USAGE_CHANGED, usageBreakdown, usageLimits } from "@/lib/usage";
import { TokenMeters } from "@/components/token-meters";
import { usePluginsFlag } from "@/hooks/use-plugins-flag";
import { ToastProvider } from "./toast";
import { SupportViewBanner } from "./support-access";
import { ScrollFade } from "./scroll-fade";
import { ConfirmProvider } from "./confirm-dialog";
import { CommandPaletteProvider, type PalettePage } from "./command-palette";
import { Logo, TopBar, TopBarProvider } from "./top-bar";
import { tabTitle as routeTabTitle } from "@/lib/routes";
import { focusRing } from "./ui";
import { helpHref, helpTargetFromUrl } from "@/lib/support";
import { BookIcon, ChatIcon, GearIcon, LifeBuoyIcon, PlanIcon, PlayIcon, ReviewerIcon, ShieldIcon, TemplateIcon, TrendingUpIcon } from "./icons";
import { ADMIN_SECTIONS, NAV_SECTIONS, sectionFor, visiblePages, type NavIconKey, type NavSection } from "@/lib/nav";
import { SETTINGS_ITEMS, offered } from "./settings-items";
import { isSelfHosted } from "@/lib/runtime-config";
import { hybridGithubSetupTarget, hybridOAuthHandoff, maybeHybridOAuthCallback } from "@/lib/hybrid";
import { Menu } from "./menu";
import { SectionTabs } from "./section-tabs";
import { inSettings, SettingsNav } from "./settings-nav";
import { buttonClass } from "./ui";
import { AlertCircleIcon, InfoIcon, LogFindingsIcon, WarningIcon, XIcon } from "./icons";
import { apiBase, githubAppUrl, runtimeConfig, siteUrl } from "@/lib/runtime-config";
import { SetupBanner } from "@/components/setup-banner";
import { CopyButton } from "./copy-button";
import { openInChromeHref, signInProblem, type SignInProblem } from "@/lib/sign-in-errors";
import { TwoFactorSetup } from "./two-factor-setup";
import type { MyTwoFactor } from "@/lib/api";

/** Sign out everywhere the same way: end the session, then the sign-in screen. */
async function signOut() {
  try {
    await api.logout();
  } catch {
    // The session may already be gone; the sign-in screen shows either way.
  }
  window.location.href = "/";
}



interface User {
  /** Set by /api/me in a read-only support view. */
  support_view?: { team_id: string; until: number } | null;
  user_id: string;
  team_id: string;
  github_login: string | null;
  email: string;
  avatar_url: string;
  role: string;
  status?: string;
  /** The capability keys this person holds (lib/capabilities.ts). */
  capabilities?: string[];
  /** An admin of the whole install (the server's PLATFORM_ADMIN_EMAILS). */
  platform_admin?: boolean;
}

/** Who sees the platform admin pages. The server checks again on every call. */
function isPlatformAdmin(user: User | null): boolean {
  if (typeof user?.platform_admin === "boolean") return user.platform_admin;
  // A gateway from before the field: the hosted admin, on the hosted dashboard only.
  return !isSelfHosted() && user?.email === "admin@coderhelm.com";
}

const NAV_ICONS: Record<NavIconKey, ReactNode> = {
  runs: <PlayIcon />,
  plans: <PlanIcon />,
  reviews: <ReviewerIcon />,
  logs: <LogFindingsIcon />,
  chat: <ChatIcon />,
  knowledge: <BookIcon />,
  insights: <TrendingUpIcon />,
  settings: <GearIcon />,
  admin: <ShieldIcon />,
  queue: <LifeBuoyIcon />,
  plugins: <TemplateIcon />,
};

/** A page's capability check, for this person. */
function allowedFor(user: User | null) {
  return (need?: string) => !need || can(user, need);
}

/** The destinations this person can open, each with the first page they can open. */
function visibleSections(user: User | null, pluginsOn = false): { section: NavSection; href: string }[] {
  const allowed = allowedFor(user);
  const admin = isPlatformAdmin(user);
  return [...NAV_SECTIONS, ...ADMIN_SECTIONS]
    .filter((sec) => !sec.superAdminOnly || admin)
    .filter((sec) => sec.flag !== "plugins" || pluginsOn)
    .map((section) => ({ section, href: visiblePages(section, allowed)[0]?.href }))
    .filter((x): x is { section: NavSection; href: string } => !!x.href);
}

/** Every page someone can reach from the menu, for the ⌘K palette. */
function palettePages(user: User | null, pluginsOn = false): PalettePage[] {
  const allowed = allowedFor(user);
  const admin = isPlatformAdmin(user);
  const pages: PalettePage[] = [];
  for (const section of [...NAV_SECTIONS, ...ADMIN_SECTIONS]) {
    if (section.superAdminOnly && !admin) continue;
    if (section.flag === "plugins" && !pluginsOn) continue;
    for (const p of visiblePages(section, allowed)) pages.push({ href: p.href, label: p.label, section: section.label });
  }
  for (const item of SETTINGS_ITEMS) {
    if (!can(user, item.view) || !offered(item, isSelfHosted(), user?.platform_admin === true)) continue;
    if (!pages.some((p) => p.href === item.href)) pages.push({ href: item.href, label: item.title, section: "Settings" });
  }
  return pages;
}

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const pluginsOn = usePluginsFlag() === "on";
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  // New beta sign-ups, for the Admin menu item (platform admin only).
  const [betaNew, setBetaNew] = useState(0);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());
  // Load persisted dismissals once usage data is available (keyed to usage month)
  const usageMonth = usage?.month;
  // The app has started: the inline loading screen (lib/boot-recovery.ts)
  // stops offering Reload, however long sign-in takes.
  useEffect(() => {
    document.documentElement.setAttribute("data-ch-mounted", "");
  }, []);
  useEffect(() => {
    if (!usageMonth) return;
    try {
      const stored = JSON.parse(localStorage.getItem("dismissedBanners") || "{}");
      if (stored.period === usageMonth && Array.isArray(stored.ids)) {
        setDismissedBanners(new Set<string>(stored.ids));
      }
    } catch { /* ignore */ }
  }, [usageMonth]);
  const dismissBanner = (id: string) => {
    setDismissedBanners((prev) => {
      const next = new Set(prev).add(id);
      if (usage) {
        try {
          localStorage.setItem("dismissedBanners", JSON.stringify({ period: usage.month, ids: [...next] }));
        } catch { /* ignore */ }
      }
      return next;
    });
  };
  const [authChecked, setAuthChecked] = useState(false);
  // A team (a self-hosted install: the organization) that requires
  // two-factor sign-in: a session without a second factor sees only the
  // setup screen. A self-hosted install asks up front, as before; hosted
  // learns it from the server's answer (`two_factor_required`) to the first
  // request it holds, so a session that isn't held pays for no extra call.
  const [twoFactor, setTwoFactor] = useState<MyTwoFactor | null>(null);
  const fetchTwoFactor = () => api.myTwoFactor().then(setTwoFactor, () => setTwoFactor(null));
  const loadTwoFactor = () => {
    if (isSelfHosted()) return fetchTwoFactor();
    return api.getUsage().then(setUsage, (e) =>
      e instanceof ApiError && e.code === "two_factor_required" ? fetchTwoFactor() : undefined,
    );
  };
  useEffect(() => {
    const held = () => {
      fetchTwoFactor();
    };
    window.addEventListener(TWO_FACTOR_REQUIRED, held);
    return () => window.removeEventListener(TWO_FACTOR_REQUIRED, held);
  }, []);
  // A self-hosted install's callback from Coderhelm's GitHub App or an OAuth
  // sign-in (lib/hybrid.ts): passed on before sign-in, since the person here
  // usually has no hosted account.
  const [handoff, setHandoff] = useState<"" | "github" | "oauth">("");
  useEffect(() => {
    const github = hybridGithubSetupTarget(window.location);
    if (github) {
      setHandoff("github");
      window.location.replace(github);
      return;
    }
    if (maybeHybridOAuthCallback(window.location)) {
      setHandoff("oauth");
      hybridOAuthHandoff().then((moved) => {
        if (!moved) setHandoff("");
      });
    }
  }, []);

  // Small screens: the sidebar is a drawer opened from a top bar. From md up
  // the wrapper is `display: contents`, so the desktop layout is untouched.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuWasOpen = useRef(false);

  // Close on navigation.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!menuOpen) {
      // Hand focus back to the button that opened the menu.
      if (menuWasOpen.current) menuButtonRef.current?.focus();
      menuWasOpen.current = false;
      return;
    }
    menuWasOpen.current = true;
    const drawer = drawerRef.current;
    const focusable = () =>
      Array.from(drawer?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])
        .filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      // Keep focus inside the open menu.
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !drawer?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !drawer?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // The drawer only exists below md. If the window grows, close it.
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => { if (wide.matches) setMenuOpen(false); };
    wide.addEventListener("change", onWide);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
    };
  }, [menuOpen]);

  useEffect(() => {
    api.me()
      .then(async (u) => {
        setUser(u);
        pushToDataLayer({ event: "identify", user_id: u.user_id, team_id: u.team_id });
        await loadTwoFactor();
        setAuthChecked(true);
        // Hosted read the usage already, on the way.
        if (isSelfHosted()) api.getUsage().then(setUsage).catch(() => {});
        api.getBanners().then((r) => setBanners(r.banners)).catch(() => {});
        api.listTeams().then((r) => setTeams(r.teams)).catch(() => {});
      })
      .catch(() => {
        setAuthChecked(true);
      });
  }, []);

  // Refresh usage on route changes so token count stays current
  useEffect(() => {
    if (user) {
      api.getUsage().then(setUsage).catch(() => {});
    }
  }, [pathname, user]);

  // The platform admin sees how many beta sign-ups wait, kept current when
  // the admin page invites someone.
  const platformAdmin = isPlatformAdmin(user);
  useEffect(() => {
    if (!platformAdmin) return;
    const refresh = () =>
      api.adminBetaSignups().then((r) => setBetaNew(r.counts.new)).catch(() => {});
    refresh();
    window.addEventListener(BETA_SIGNUPS_CHANGED, refresh);
    return () => window.removeEventListener(BETA_SIGNUPS_CHANGED, refresh);
  }, [platformAdmin]);

  // ...and right after someone changes the limit.
  useEffect(() => {
    const refresh = () => api.getUsage().then(setUsage).catch(() => {});
    window.addEventListener(USAGE_CHANGED, refresh);
    return () => window.removeEventListener(USAGE_CHANGED, refresh);
  }, []);

  // Name the tab after the page (the top bar does it once a page shows; this
  // covers the screens before it). React hoists <title> into the head.
  const tabName = routeTabTitle(pathname);
  const tabTitle = <title>{tabName ? `${tabName} · Coderhelm` : "Coderhelm"}</title>;

  if (handoff) {
    return (
      <div className="ch-boot" role="status" data-testid="hybrid-handoff" data-kind={handoff}>
        {tabTitle}
        <div className="ch-boot-inner">
          <div className="ch-boot-spinner" aria-hidden="true" />
          <span>{handoff === "github" ? "Linking your install…" : "Finishing the sign-in…"}</span>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      // Styled by the inline BOOT_STYLE, not Tailwind: this markup is in the
      // static HTML and must look right even when the stylesheet failed.
      <div className="ch-boot" role="status">
        {tabTitle}
        <div className="ch-boot-inner">
          <div className="ch-boot-spinner" aria-hidden="true" />
          <span>Loading...</span>
          <button type="button" className="ch-boot-reload" data-ch-reload>Reload</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <><title>Sign in · Coderhelm</title><AuthScreen onAuth={async (u) => {
      await loadTwoFactor();
      setUser(u);
      pushToDataLayer({ event: "identify", user_id: u.user_id, team_id: u.team_id });
      if (isSelfHosted()) api.getUsage().then(setUsage).catch(() => {});
      api.getBanners().then((r) => setBanners(r.banners)).catch(() => {});
      api.listTeams().then((r) => setTeams(r.teams)).catch(() => {});
    }} /></>;
  }

  if (twoFactor?.held) {
    return (
      <>
        <title>Two-factor sign-in · Coderhelm</title>
        <TwoFactorGate status={twoFactor} email={user.email || user.github_login || ""} onDone={() => window.location.reload()} />
      </>
    );
  }

  if (user.status === "deactivated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        {tabTitle}
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-6">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400" aria-hidden="true">
            <WarningIcon />
          </div>
          <h1 className="text-xl font-semibold text-zinc-50">The GitHub app was removed</h1>
          <p className="text-sm text-zinc-300">
            Coderhelm can&apos;t reach your code until someone with admin rights on your GitHub organization reinstalls the Coderhelm app.
            Runs and reviews are paused until then.
          </p>
          <div className="flex flex-col items-center gap-3">
            <a
              href={githubAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("primary")}
            >
              Reinstall the GitHub app
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(githubAppUrl()).catch(() => {});
              }}
              className={buttonClass("secondary")}
            >
              Copy the link for your GitHub admin
            </button>
            <a
              href={`${apiBase()}/auth/github`}
              className={`text-sm text-zinc-300 hover:text-zinc-100 underline transition-colors rounded ${focusRing}`}
            >
              Then sign in with GitHub again
            </a>
          </div>
          {teams.filter((t) => t.status !== "deactivated").length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-zinc-400 mb-2">Or switch to an active organization:</p>
              {teams.filter((t) => t.status !== "deactivated" && !t.current).map((t) => (
                <button
                  key={t.team_id}
                  type="button"
                  onClick={async () => {
                    try {
                      await api.switchTeam(t.team_id);
                      window.location.reload();
                    } catch {
                      window.alert(`Could not switch to ${t.org}. Try again.`);
                    }
                  }}
                  className={`block mx-auto mt-1 text-sm text-zinc-300 hover:text-white underline rounded ${focusRing}`}
                >
                  Switch to {t.org}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
    <ConfirmProvider>
    <CommandPaletteProvider pages={palettePages(user, pluginsOn)} user={user}>
    <TopBarProvider>
      <div className="flex min-h-screen bg-zinc-950">
        {menuOpen && (
          <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMenuOpen(false)} />
        )}
        <div
          id="app-menu"
          ref={drawerRef}
          role={menuOpen ? "dialog" : undefined}
          aria-modal={menuOpen ? true : undefined}
          aria-label={menuOpen ? "Menu" : undefined}
          // A link to the page you are already on does not change the path, so close on any link click too.
          onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMenuOpen(false); }}
          className={`${menuOpen ? "fixed inset-y-0 left-0 z-50 flex shadow-2xl" : "hidden"} md:contents`}
        >
          <Sidebar usage={usage} user={user} teams={teams} betaNew={betaNew} pluginsOn={pluginsOn} />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="md:hidden absolute top-3 right-2 inline-flex h-8 items-center rounded-md px-2 text-xs text-zinc-400 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100"
          >
            Close
          </button>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          {user.support_view && <SupportViewBanner />}
          <TopBar
            teamName={teams.find((t) => t.current)?.org}
            menuButton={
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Menu"
                aria-expanded={menuOpen}
                aria-controls="app-menu"
                onClick={() => setMenuOpen(true)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 md:hidden ${focusRing}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              </button>
            }
          />
          <ShellBanners
            banners={banners.filter((b) => !dismissedBanners.has(b.id))}
            limit={usage && !dismissedBanners.has("token-limit-banner") ? reachedLimit(usage) : undefined}
            month={usage?.month}
            canRaise={can(user, "budget")}
            onLimitPage={pathname.replace(/\/+$/, "") === "/settings/budget"}
            onDismiss={dismissBanner}
          />
          <main className="flex-1 p-4 md:p-8">
            <SetupBanner />
            {inSettings(pathname) ? (
              <div data-settings-layout="" className="mx-auto flex w-full min-w-0 max-w-6xl flex-col xl:flex-row xl:gap-10">
                <SettingsNav visible={(item) => can(user, item.view) && offered(item, isSelfHosted(), user.platform_admin === true)} />
                <div className="min-w-0 flex-1 pb-24 md:pb-32" data-testid="settings-content">{children}</div>
              </div>
            ) : (
              <>
                <SectionTabs allowed={allowedFor(user)} />
                {children}
              </>
            )}
          </main>
        </div>
      </div>
    </TopBarProvider>
    </CommandPaletteProvider>
    </ConfirmProvider>
    </ToastProvider>
  );
}

function TeamSwitcher({
  teams,
  currentTeam,
  switching,
  onSwitch,
}: {
  teams: TeamInfo[];
  currentTeam: TeamInfo | null;
  switching: boolean;
  onSwitch: (teamId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeTeams = teams.filter((t) => t.status !== "deactivated");
  const canSwitch = activeTeams.length > 1;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!currentTeam) return null;

  return (
    <div ref={ref} className="relative mb-2 pb-3 border-b border-zinc-800/60">
      <p className="px-2 mb-1.5 text-xs font-medium text-zinc-400">Team</p>
      <button
        type="button"
        onClick={() => canSwitch && setOpen(!open)}
        disabled={switching}
        aria-expanded={canSwitch ? open : undefined}
        aria-label={canSwitch ? `Team: ${currentTeam.org}. Switch team` : `Team: ${currentTeam.org}`}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors disabled:opacity-50 border ${focusRing} ${
          canSwitch
            ? "hover:bg-zinc-800/60 border-zinc-800 cursor-pointer"
            : "border-transparent cursor-default"
        } ${open ? "bg-zinc-800/60 border-zinc-700" : ""}`}
      >
        <span className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
          {currentTeam.org.charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-zinc-100 truncate block">{currentTeam.org}</span>
        </div>
        {canSwitch && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500 shrink-0" aria-hidden="true">
            <polyline points="7 15 12 20 17 15" />
            <polyline points="7 9 12 4 17 9" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1 max-h-56 overflow-y-auto">
          <p className="px-3 py-1.5 text-xs font-medium text-zinc-400">Switch team</p>
          {activeTeams.map((t) => (
            <button
              type="button"
              key={t.team_id}
              aria-current={t.team_id === currentTeam.team_id ? "true" : undefined}
              onClick={() => { onSwitch(t.team_id); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${focusRing} ${
                t.team_id === currentTeam.team_id
                  ? "text-zinc-100 bg-zinc-800"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <span className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {t.org.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{t.org}</span>
              {t.team_id === currentTeam.team_id && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-auto text-blue-400 shrink-0" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  usage,
  user,
  teams,
  betaNew,
  pluginsOn,
}: {
  usage: UsageInfo | null;
  user: User | null;
  teams: TeamInfo[];
  /** New beta sign-ups, shown on the Admin item. */
  betaNew: number;
  /** The team's plugins flag. */
  pluginsOn: boolean;
}) {
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);
  // "Report an issue" carries the page the person is on, and the run,
  // review or plan it shows. Read after render: the search string isn't
  // known while the static page is built.
  const [issueHref, setIssueHref] = useState("/support?new=1&type=issue");
  useEffect(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    setIssueHref(`${helpHref(pathname, helpTargetFromUrl(pathname, search))}&type=issue`);
  }, [pathname]);

  // The destination the page belongs to (an item's page counts for its list).
  const currentSection = sectionFor(pathname)?.key;

  const currentTeam = teams.find((t) => t.current);

  // The current page's menu item is always in view, even when it sits below
  // the fold of the menu (Token limit, Members on a short window).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const area = nav?.querySelector<HTMLElement>("[data-scroll-fade]");
    const item = nav?.querySelector<HTMLElement>('[data-scroll-fade] a[aria-current="page"]');
    if (!area || !item) return;
    const a = area.getBoundingClientRect();
    const i = item.getBoundingClientRect();
    if (i.bottom > a.bottom - 24) area.scrollTop += i.bottom - a.bottom + 48;
    else if (i.top < a.top) area.scrollTop -= a.top - i.top + 8;
  }, [pathname, user]);

  // Support counts: tickets waiting on this team, and for platform admins
  // tickets waiting on support. Refetched on navigation, so answering or
  // opening a ticket updates them. An older backend answers 404: no badges.
  const [support, setSupport] = useState<{ waiting: number; queue_open: number | null }>({ waiting: 0, queue_open: null });
  useEffect(() => {
    let live = true;
    api.supportBadge().then(
      (b) => live && setSupport(b),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [pathname]);

  const handleSwitch = async (teamId: string) => {
    setSwitching(true);
    try {
      await api.switchTeam(teamId);
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  };

  return (
    // One scroll area for the brand, team, search and every menu group, with a
    // fade at whichever edge has more; help and the person stay pinned below.
    // h-dvh, not h-screen: on a phone 100vh is taller than the visible window,
    // so the pinned footer (help, the person, Sign out) sat under the
    // browser's toolbar.
    <nav ref={navRef} aria-label="Main" className="w-56 border-r border-zinc-800/60 bg-zinc-950 flex flex-col h-dvh sticky top-0">
      <ScrollFade axis="y" className="flex-1" innerClassName="px-3 pt-3 pb-2" testId="sidebar-scroll">
      <Link
        href="/"
        className={`flex items-center gap-2.5 px-2 py-2 mb-1 rounded-md ${focusRing}`}
      >
        <Logo />
        <span className="text-sm font-semibold text-zinc-100">Coderhelm</span>
      </Link>

      <TeamSwitcher teams={teams} currentTeam={currentTeam ?? null} switching={switching} onSwitch={handleSwitch} />

      <ul className="space-y-0.5" data-testid="main-nav">
        {visibleSections(user, pluginsOn).filter((x) => !x.section.superAdminOnly).map(({ section, href }) => (
          <NavItemLink key={section.key} href={href} label={section.label} icon={NAV_ICONS[section.icon]} current={currentSection === section.key} />
        ))}
      </ul>

      {visibleSections(user).some((x) => x.section.superAdminOnly) && (
        <div className="mt-3">
          <p className="mb-1 px-2 text-xs font-medium text-zinc-400">Platform</p>
          <ul className="space-y-0.5">
            {visibleSections(user).filter((x) => x.section.superAdminOnly).map(({ section, href }) => (
              <NavItemLink
                key={section.key}
                href={href}
                label={section.label}
                icon={NAV_ICONS[section.icon]}
                current={currentSection === section.key}
                badge={
                  section.countKey === "betaSignups" ? (
                    <CountBadge n={betaNew} label={`new beta ${betaNew === 1 ? "sign-up" : "sign-ups"}`} />
                  ) : section.countKey === "supportQueue" ? (
                    <CountBadge n={support.queue_open ?? 0} label="need a reply" />
                  ) : null
                }
              />
            ))}
          </ul>
        </div>
      )}

      </ScrollFade>

      <div className="shrink-0 px-3 pb-3" data-testid="sidebar-footer">
      {/* Help: one menu, always in view, so help is one click from any page. */}
      <div className="border-t border-zinc-800/60 pt-2">
        <HelpMenu issueHref={issueHref} waiting={support.waiting} current={pathname.startsWith("/support")} />
      </div>

      {/* One small bar per monthly limit that is set */}
      {usage && usageLimits(usage).length > 0 && (
        <Link
          href="/settings/budget"
          prefetch={false}
          className={`mt-2 block rounded-md border-t border-zinc-800/60 px-2 pb-1 pt-3 hover:bg-zinc-900 ${focusRing}`}
          data-testid="sidebar-token-meter"
          title={usageBreakdown(usage)}
          aria-label="Token usage this month: open Token limit"
        >
          <span className="mb-2 flex items-baseline justify-between gap-2 text-xs" title={usage.month ? resetLabel(usage.month) : undefined}>
            <span className="whitespace-nowrap font-medium text-zinc-300">Usage this month</span>
            {usage.month && <span className="whitespace-nowrap text-zinc-400">{resetLabel(usage.month).replace("Resets ", "")}</span>}
          </span>
          <TokenMeters limits={usageLimits(usage)} compact />
        </Link>
      )}

      {user && (
        <div className="mt-3 pt-3 border-t border-zinc-800/60 shrink-0">
          <div className="flex items-center gap-2">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt=""
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <span aria-hidden="true" className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center">
              {(user.github_login || user.email || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200 truncate" title={user.email}>{user.email || user.github_login}</p>
            {user.github_login && <p className="text-xs text-zinc-400 truncate">@{user.github_login}</p>}
            {runtimeConfig().version && (
              <p className="text-xs text-zinc-400 truncate" data-testid="install-version" title="This install's Coderhelm version">
                Coderhelm {runtimeConfig().version}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            data-testid="sign-out-icon"
            className={`hidden md:inline-flex rounded p-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer ${focusRing}`}
          >
            <SignOutIcon />
          </button>
          </div>
          {/* On a phone the menu is a sheet: Sign out is a full row with its
              name, where people look for it, not a small icon. */}
          <button
            type="button"
            onClick={signOut}
            data-testid="sign-out"
            className={`md:hidden mt-2 flex w-full min-h-11 items-center gap-2.5 rounded-md px-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer ${focusRing}`}
          >
            <span className="w-4 flex items-center justify-center" aria-hidden="true"><SignOutIcon /></span>
            Sign out
          </button>
        </div>
      )}
      </div>
    </nav>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/**
 * Why Google or GitHub sign-in did not finish, in one sentence, with what to
 * do next: Try again, or, inside another app's browser, open the page in a
 * real browser.
 */
function SignInProblemNotice({ problem }: { problem: SignInProblem }) {
  const [chromeHref, setChromeHref] = useState<string | null>(null);
  useEffect(() => {
    setChromeHref(openInChromeHref(window.location.origin + "/", navigator.userAgent));
  }, []);
  return (
    <div role="alert" data-testid="sign-in-problem" className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
      <p className="wrap-anywhere">{problem.sentence}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {problem.canRetry && problem.provider && (
          <a href={`${apiBase()}/auth/${problem.provider}`} className={`font-medium text-zinc-100 underline underline-offset-4 rounded ${focusRing}`}>
            Try again
          </a>
        )}
        {!problem.canRetry && (
          <>
            <CopyButton text={() => window.location.origin + "/"} label="Copy the link" copiedLabel="Link copied" variant="link" />
            {chromeHref && (
              <a href={chromeHref} className={`font-medium text-zinc-100 underline underline-offset-4 rounded ${focusRing}`}>
                Open in Chrome
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The organization (hosted: the team this session acts in) requires
 * two-factor sign-in and this session has none: set it up (or, when it is
 * set up already, sign in again with the code). The server refuses
 * everything else until then.
 */
function TwoFactorGate({ status, email, onDone }: { status: MyTwoFactor; email: string; onDone: () => void }) {
  const fits = status.fits ?? "cognito";
  const hasIt = !!status.set_up;
  const who = status.self_hosted ? "Your organization" : "This team";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 py-10">
      <main className="w-full max-w-md space-y-6" data-testid="two-factor-gate">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-sm font-semibold text-zinc-100">Coderhelm</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-zinc-50">
            {hasIt ? "Sign in again with your code" : "Set up two-factor sign-in"}
          </h1>
          <p className="text-sm text-zinc-300">
            {who} requires two-factor sign-in. {hasIt
              ? status.set_up === "cognito" && fits === "app"
                ? "Your code is on your password account. Sign out, then sign in with your email and password and enter the code from your authenticator app."
                : "You have it set up, but this session started without your code. Sign out, then sign in again and enter the code from your authenticator app."
              : "Before you go on, set up an authenticator app: every sign-in will then ask for the 6-digit code it shows."}
          </p>
          {email && <p className="text-sm text-zinc-400 [overflow-wrap:anywhere]">Signed in as {email}</p>}
        </div>
        {!hasIt && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <TwoFactorSetup kind={fits} onDone={onDone} />
          </div>
        )}
        <button
          type="button"
          onClick={signOut}
          className={hasIt ? buttonClass("primary") : `text-sm text-zinc-400 underline underline-offset-4 hover:text-zinc-100 rounded ${focusRing}`}
        >
          {hasIt ? "Sign out and sign in again" : "Sign out"}
        </button>
        <p className="text-sm text-zinc-400">Lost your phone? Ask an admin to reset your two-factor sign-in.</p>
      </main>
    </div>
  );
}

// ── Auth Screen (login / signup / verify / forgot password) ────────

type AuthView = "login" | "signup" | "waitlist" | "verify" | "forgot" | "reset" | "mfa" | "second_step";

/** What a self-hosted install says to someone it won't let in. */
const NOT_INVITED =
  "This Coderhelm is private to one organization. Ask one of its admins to invite you, or sign in with your work email if your company's domain is allowed.";

/** Google or GitHub for someone whose second factor is the code on their password account (only Cognito checks it). */
const USE_PASSWORD = "two_factor_use_password";
const USE_PASSWORD_MESSAGE =
  "Your two-factor code is on your password account. Sign in with your email and password, then enter the code from your authenticator app.";

function AuthScreen({ onAuth }: { onAuth: (user: User) => void }) {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [agreedTos, setAgreedTos] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaSession, setMfaSession] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState<SignInProblem | null>(null);

  // The hosted site's terms; a self-hosted install has none unless it names a site.
  const site = siteUrl();
  // A self-hosted install: one organization, no waitlist and no closed beta.
  const selfHosted = isSelfHosted();
  // A self-hosted install has no terms to agree to (no site): the box is pre-ticked and hidden.
  useEffect(() => {
    if (!site) setAgreedTos(true);
  }, [site]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Google or GitHub sign-in came back without finishing (the API's callback).
    const failed = signInProblem(window.location.search);
    if (failed) {
      setProblem(failed);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Google or GitHub sign-in waiting for the authenticator-app code.
    if (params.get("two_factor") === "1") {
      setView("second_step");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("error") === "not_invited") {
      setError(NOT_INVITED);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Google or GitHub for someone whose second factor is the code on their password account.
    if (params.get("error") === USE_PASSWORD) {
      setError(USE_PASSWORD_MESSAGE);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // The installer's first-admin link opens the sign-up form.
    if (params.get("signup") === "1") {
      setView("signup");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("error") === "closed_beta") {
      setError("Coderhelm is in closed beta. Join the waitlist to get notified.");
      setView("waitlist");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("error") === "ask_admin_invite") {
      const org = params.get("org");
      setError(
        `${org ? `${org} already uses Coderhelm` : "Your GitHub organization already uses Coderhelm"}. Ask one of its admins to invite you (Settings, then Team), then sign in with the email they invite.`,
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleWaitlist = async () => {
    setError(""); setLoading(true);
    try {
      const result = await api.joinWaitlist(email, { company: company.trim() || undefined, reason: reason.trim() || undefined });
      setMessage(result.message || "You're on the list!");
      setView("login");
    } catch {
      setError("We couldn't add you to the waitlist. Check your connection and try again.");
    } finally { setLoading(false); }
  };

  const handleSignup = async () => {
    setError(""); setLoading(true);
    try {
      await api.signup(email, password);
      setView("verify");
      setMessage("Check your email for a verification code.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (e instanceof ApiError && e.code === "not_invited") {
        setError(NOT_INVITED);
      } else if (msg.includes("403") && !selfHosted) {
        setError("Coderhelm is in closed beta. Join the waitlist to get notified.");
        setView("waitlist");
      } else if (msg.includes("409")) {
        setError("An account with this email already exists.");
      } else {
        setError(msg || "Signup failed. Please try again.");
      }
    } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const result = await api.loginEmail(email, password);
      if (result.status === "mfa_required" && result.session) {
        setMfaSession(result.session);
        setView("mfa");
      } else if (result.status === "second_step") {
        // Their second factor is the authenticator-app code set up in Coderhelm.
        setView("second_step");
      } else {
        const u = await api.me();
        onAuth(u);
      }
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === "not_invited") {
        setError(NOT_INVITED);
      } else if (e instanceof ApiError && e.code === USE_PASSWORD) {
        setError(e.message);
      } else if (e instanceof Error && e.message.includes("403")) {
        setError("Please verify your email first.");
        setView("verify");
      } else {
        setError("That email and password don't match. Check them, or reset your password.");
      }
    } finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setError(""); setLoading(true);
    try {
      await api.verifyEmail(email, code);
      setCode("");
      // Auto-login if we still have the password from signup
      if (password) {
        try {
          const result = await api.loginEmail(email, password);
          if (result.status === "mfa_required" && result.session) {
            setMfaSession(result.session);
            setView("mfa");
          } else if (result.status === "second_step") {
            setView("second_step");
          } else {
            const u = await api.me();
            onAuth(u);
          }
          return;
        } catch {
          // Auto-login failed — fall through to manual login
        }
      }
      setMessage("Email verified! You can now log in.");
      setView("login");
    } catch {
      setError("That code didn't work or has expired. Check the latest email from us, or ask for a new code.");
    } finally { setLoading(false); }
  };

  const handleForgot = async () => {
    setError(""); setLoading(true);
    try {
      await api.forgotPassword(email);
      setView("reset");
      setMessage("If an account exists, a reset code was sent to your email.");
    } catch {
      setError("We couldn't send a reset code. Check your connection and try again.");
    } finally { setLoading(false); }
  };

  const handleReset = async () => {
    setError(""); setLoading(true);
    try {
      await api.confirmReset(email, code, newPassword);
      setMessage("Password reset! You can now log in.");
      setView("login");
      setCode(""); setNewPassword("");
    } catch {
      setError("That didn't work. Check the code from the email, and use a password of at least 8 characters with a number and a symbol.");
    } finally { setLoading(false); }
  };

  const handleSecondStep = async () => {
    setError(""); setLoading(true);
    try {
      await api.verifySecondStep(code);
      const u = await api.me();
      onAuth(u);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === "locked_out") {
        // Too many wrong codes: the server's sentence says how long the pause is.
        setError(e.message);
        setCode("");
        setView("login");
      } else if (e instanceof ApiError && e.code === "second_step_expired") {
        setError(e.message || "That took too long. Sign in again.");
        setCode("");
        setView("login");
      } else {
        setError("That code didn't work. Open your authenticator app and enter the current 6-digit code.");
      }
    } finally { setLoading(false); }
  };

  const handleMfa = async () => {
    setError(""); setLoading(true);
    try {
      await api.mfaVerify(mfaSession, code, email);
      const u = await api.me();
      onAuth(u);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === "locked_out") {
        setError(e.message);
        setCode("");
        setView("login");
        return;
      }
      setError("That code didn't work. Open your authenticator app and enter the current 6-digit code.");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" className="w-12 h-12" aria-hidden="true">
              <polygon points="106,416 158,416 226,96 174,96" fill="white"/>
              <polygon points="196,416 248,416 316,96 264,96" fill="#3B82F6"/>
              <polygon points="286,416 338,416 406,96 354,96" fill="white"/>
            </svg>
            <span className="text-2xl font-bold text-white tracking-tight">coderhelm</span>
          </div>

          {problem && view === "login" && <SignInProblemNotice problem={problem} />}

          {error && (
            <div role="alert" className="mt-2 w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          {message && (
            <div role="status" className="w-full rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-sm text-blue-400">
              {message}
            </div>
          )}

          {/* ── Login ── */}
          {view === "login" && (
            <div className="w-full space-y-4">
              {!selfHosted && (
              <div className="flex items-center justify-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-medium text-amber-400">Closed beta</span>
                <span className="text-xs text-zinc-400">·</span>
                <button onClick={() => { setView("waitlist"); setError(""); setMessage(""); }} className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer">Join waitlist</button>
              </div>
              )}
              <div className="space-y-3">
                <a
                  href={`${apiBase()}/auth/google`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Continue with Google
                </a>
                <a
                  href={`${apiBase()}/auth/github`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  Continue with GitHub
                </a>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-400">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-3">
                <input type="email" name="email" id="login-email" autoComplete="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); setMessage(""); }}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <input type="password" name="password" id="login-password" autoComplete="current-password" aria-label="Password" placeholder="Password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <button type="submit" disabled={loading || !email || !password}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <div className="flex items-center justify-between w-full text-xs">
                <button onClick={() => { setView("signup"); setError(""); setMessage(""); }} className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">Create account</button>
                <button onClick={() => { setView("forgot"); setError(""); setMessage(""); }} className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">Forgot password?</button>
              </div>
            </div>
          )}

          {/* ── Signup ── */}
          {view === "signup" && (
            <div className="w-full space-y-4">
              <div className="text-center">
                {selfHosted ? (
                  <p className="text-sm text-zinc-400" data-testid="signup-one-org">
                    This Coderhelm is for one organization. Create an account with the email an admin invited, or your work email if your company&apos;s domain is allowed.
                  </p>
                ) : (
                  <>
                    <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 mb-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-xs font-medium text-amber-400">Closed beta</span>
                    </div>
                    <p className="text-xs text-zinc-400">Only users with an invite can create an account.</p>
                  </>
                )}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); if (password.length >= 8 && agreedTos) handleSignup(); }} className="space-y-3">
                <input type="email" name="email" id="signup-email" autoComplete="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); setMessage(""); }}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <input type="password" name="password" id="signup-password" autoComplete="new-password" aria-label="Password, at least 8 characters" placeholder="Password (8+ chars)" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                {site && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={agreedTos} onChange={(e) => setAgreedTos(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer" />
                    <span className="text-xs text-zinc-400">
                      I agree to the{" "}
                      <a href={`${site}/terms`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-200 underline">Terms of Service</a>
                      {" "}and{" "}
                      <a href={`${site}/privacy`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-200 underline">Privacy Policy</a>
                    </span>
                  </label>
                )}
                <button type="submit" disabled={loading || !email || password.length < 8 || !agreedTos}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Creating account..." : "Create account"}
                </button>
              </form>
              <button onClick={() => { setView("login"); setError(""); setMessage(""); }} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                Already have an account? Sign in
              </button>
            </div>
          )}

          {/* ── Waitlist ── */}
          {view === "waitlist" && (
            <div className="w-full space-y-4">
              <div className="text-center">
                <p className="text-sm text-zinc-300 font-medium">Coderhelm is in closed beta</p>
                <p className="text-xs text-zinc-400 mt-1">Join the waitlist and we&apos;ll notify you when we open up.</p>
              </div>
              <div className="space-y-3">
                <input type="email" autoComplete="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleWaitlist()}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <input type="text" autoComplete="organization" aria-label="Company (optional)" placeholder="Company (optional)" value={company} maxLength={120}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <textarea aria-label="What would you use Coderhelm for? (optional)" placeholder="What would you use Coderhelm for? (optional)" value={reason} maxLength={500} rows={3}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full resize-y rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <button onClick={handleWaitlist} disabled={loading || !email}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Joining..." : "Join waitlist"}
                </button>
              </div>
              <button onClick={() => { setView("login"); setError(""); setMessage(""); }} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                Already have an account? Sign in
              </button>
            </div>
          )}

          {/* ── Verify email ── */}
          {view === "verify" && (
            <div className="w-full space-y-4">
              <p className="text-sm text-zinc-400 text-center">Enter the verification code sent to <span className="text-zinc-200">{email}</span></p>
              <div className="space-y-3">
                <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Verification code" placeholder="Verification code" value={code} onChange={(e) => { setCode(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 text-center tracking-widest" />
                <button onClick={handleVerify} disabled={loading || !code}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Verifying..." : "Verify email"}
                </button>
              </div>
              <button onClick={() => { setView("login"); setError(""); setMessage(""); }} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Forgot password ── */}
          {view === "forgot" && (
            <div className="w-full space-y-4">
              <p className="text-sm text-zinc-400 text-center">Enter your email to receive a reset code</p>
              <div className="space-y-3">
                <input type="email" autoComplete="email" aria-label="Email" placeholder="Email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleForgot()}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <button onClick={handleForgot} disabled={loading || !email}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Sending..." : "Send reset code"}
                </button>
              </div>
              <button onClick={() => { setView("login"); setError(""); setMessage(""); }} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                Back to sign in
              </button>
            </div>
          )}

          {/* ── Reset password ── */}
          {view === "reset" && (
            <div className="w-full space-y-4">
              <p className="text-sm text-zinc-400 text-center">Enter the code and your new password</p>
              <div className="space-y-3">
                <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Reset code" placeholder="Reset code" value={code} onChange={(e) => { setCode(e.target.value); setError(""); }}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 text-center tracking-widest" />
                <input type="password" autoComplete="new-password" aria-label="New password, at least 8 characters" placeholder="New password (8+ chars)" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleReset()}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <button onClick={handleReset} disabled={loading || !code || newPassword.length < 8}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Resetting..." : "Reset password"}
                </button>
              </div>
              <button onClick={() => { setView("login"); setError(""); setMessage(""); }} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                Back to sign in
              </button>
            </div>
          )}

          {/* ── The code after Google or GitHub ── */}
          {view === "second_step" && (
            <form onSubmit={(e) => { e.preventDefault(); if (code.length === 6) handleSecondStep(); }} className="w-full space-y-4" data-testid="second-step">
              <p className="text-sm text-zinc-300 text-center">Enter the code from your authenticator app to finish signing in.</p>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Six digit code" placeholder="6-digit code" value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 text-center tracking-widest text-lg" />
              <button type="submit" disabled={loading || code.length < 6}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                {loading ? "Checking..." : "Sign in"}
              </button>
              <button type="button" onClick={() => { setView("login"); setError(""); setCode(""); }} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                Back to sign in
              </button>
              <p className="text-xs text-zinc-400 text-center">Lost your phone? Ask an admin to reset your two-factor sign-in.</p>
            </form>
          )}

          {/* ── MFA ── */}
          {view === "mfa" && (
            <div className="w-full space-y-4">
              <p className="text-sm text-zinc-400 text-center">Enter the code from your authenticator app</p>
              <div className="space-y-3">
                <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Six digit code" placeholder="6-digit code" value={code} onChange={(e) => { setCode(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleMfa()}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 text-center tracking-widest text-lg" />
                <button onClick={handleMfa} disabled={loading || code.length < 6}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Verifying..." : "Verify"}
                </button>
              </div>
              <button onClick={() => { setView("login"); setError(""); setMessage(""); setCode(""); }} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                Back to sign in
              </button>
            </div>
          )}

          {site && (
            <div className="flex gap-3 text-xs text-zinc-400 mt-4">
              <a href={`${site}/terms`} className="hover:text-zinc-400 transition-colors">Terms</a>
              <span>·</span>
              <a href={`${site}/privacy`} className="hover:text-zinc-400 transition-colors">Privacy</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A small count beside a menu item; nothing when zero. */
function CountBadge({ n, label }: { n: number; label: string }) {
  if (!n) return null;
  return (
    <span className="min-w-5 rounded-full bg-amber-500/15 px-1.5 text-center text-xs font-semibold tabular-nums leading-5 text-amber-300" data-testid="count-badge">
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function NavItemLink({ href, label, icon, current, badge }: { href: string; label: string; icon: ReactNode; current: boolean; badge?: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        aria-current={current ? "page" : undefined}
        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors motion-reduce:transition-none ${focusRing} ${
          current ? "bg-zinc-800 font-medium text-zinc-50" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex w-4 shrink-0 items-center justify-center" aria-hidden="true">
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </span>
        {badge}
      </Link>
    </li>
  );
}

/** "Resets Nov 1": the first day of the month after the usage month ("2026-10"). */
function resetLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return "";
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
  return `Resets ${next.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/** Get help, report an issue or contact us, in one menu. */
function HelpMenu({ issueHref, waiting, current }: { issueHref: string; waiting: number; current: boolean }) {
  const router = useRouter();
  return (
    <Menu
      label="Help"
      align="start"
      items={[
        { label: "Get help", note: waiting ? `${waiting} waiting on you` : "Your requests and answers", onSelect: () => router.push("/support") },
        { label: "Report an issue", note: "Tell us what went wrong on this page", onSelect: () => router.push(issueHref) },
        { label: "Contact us", onSelect: () => router.push("/support?new=1&type=contact") },
      ]}
      trigger={
        <button
          type="button"
          data-testid="nav-help"
          className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${focusRing} ${
            current ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span className="flex w-4 items-center justify-center" aria-hidden="true">
              <LifeBuoyIcon />
            </span>
            Help
          </span>
          <CountBadge n={waiting} label="waiting on you" />
        </button>
      }
    />
  );
}

const BANNER_LOOK: Record<string, { box: string; icon: ReactNode; iconClass: string }> = {
  error: { box: "border-red-500/30 bg-red-950/60", icon: <AlertCircleIcon />, iconClass: "text-red-400" },
  warning: { box: "border-amber-500/30 bg-amber-950/50", icon: <WarningIcon />, iconClass: "text-amber-400" },
  info: { box: "border-blue-500/25 bg-blue-950/40", icon: <InfoIcon />, iconClass: "text-blue-300" },
};

/** A link's words: a raw URL as link text reads as "Read more". */
function linkWords(text: string): string {
  return /^https?:\/\//i.test(text.trim()) || text.length > 60 ? "Read more" : text;
}

/**
 * The shell's banners, one at a time: the most urgent shows (a reached
 * limit, then errors, warnings, notes), in one line with Details for the
 * rest, so a page never starts half a screen down. "1 more" says others wait.
 */
function ShellBanners({
  banners,
  limit,
  month,
  canRaise,
  onLimitPage,
  onDismiss,
}: {
  banners: Banner[];
  limit: ReturnType<typeof reachedLimit>;
  month?: string;
  canRaise: boolean;
  onLimitPage: boolean;
  onDismiss: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  type Item = { id: string; type: "error" | "warning" | "info"; title: ReactNode; detail?: ReactNode; action?: ReactNode; dismissible: boolean; testId: string };
  const items: Item[] = [];
  if (limit) {
    const name = limitName(limit.kind);
    const Name = limit.kind === "all_tokens" ? "Token" : `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    const reset = month ? resetLabel(month).replace("Resets", "on") : "next month";
    items.push({
      id: "token-limit-banner",
      type: "error",
      testId: "token-limit-banner",
      dismissible: false,
      title: `${Name} limit reached, so new runs are paused`,
      detail: (
        <>
          You&apos;ve used {formatTokens(limit.used)} of your {formatTokens(limit.max)} {name} limit this month.{" "}
          {canRaise ? `Raise the limit to keep going, or runs resume ${reset}.` : `Ask an admin or the owner to raise the limit, or runs resume ${reset}.`}
        </>
      ),
      action: onLimitPage ? null : (
        <Link href="/settings/budget" className={buttonClass("primary", "sm")}>
          {canRaise ? "Raise the limit" : "See usage"}
        </Link>
      ),
    });
  }
  const rank = { error: 0, warning: 1, info: 2 } as const;
  for (const b of [...banners].sort((x, y) => (rank[x.type as keyof typeof rank] ?? 2) - (rank[y.type as keyof typeof rank] ?? 2))) {
    const type = b.type === "error" || b.type === "warning" ? b.type : "info";
    items.push({
      id: b.id,
      type,
      testId: "site-banner",
      dismissible: !!b.dismissible,
      title: b.message,
      action:
        b.link_url && b.link_text ? (
          <a href={b.link_url} className={buttonClass("secondary", "sm")} title={b.link_text}>
            {linkWords(b.link_text)}
          </a>
        ) : null,
    });
  }
  const first = items[0];
  if (!first) return null;
  const look = BANNER_LOOK[first.type];
  const more = items.length - 1;
  return (
    <div
      role={first.type === "error" ? "alert" : "status"}
      data-testid={first.testId}
      className={`border-b px-4 py-2.5 md:px-8 ${look.box}`}
    >
      <div className="mx-auto flex max-w-6xl min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className={`shrink-0 ${look.iconClass}`}>
          {look.icon}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className={`text-sm font-medium text-zinc-50 [overflow-wrap:anywhere] ${open ? "" : "line-clamp-1"}`}>{first.title}</p>
          {first.detail && <p className={`mt-0.5 text-sm text-zinc-300 ${open ? "" : "line-clamp-1"}`}>{first.detail}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {(first.detail || typeof first.title === "string") && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className={buttonClass("ghost", "sm")}
            >
              {open ? "Less" : "Details"}
            </button>
          )}
          {first.action}
          {more > 0 && <span className="text-xs text-zinc-300">{more} more</span>}
          {first.dismissible && (
            <button type="button" aria-label="Dismiss this message" onClick={() => onDismiss(first.id)} className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 ${focusRing}`}>
              <XIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
