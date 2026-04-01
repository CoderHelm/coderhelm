"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { api, type BillingInfo, type Banner, type TenantInfo } from "@/lib/api";
import { pushToDataLayer } from "@/lib/gtm";
import { ToastProvider } from "./toast";
import { ConfirmProvider } from "./confirm-dialog";
import {
  PlayIcon, CircleDotIcon, TrendingUpIcon, HexagonIcon, HeartIcon,
  GitBranchIcon, GearIcon, AtlassianIcon, GitHubIcon, UsersIcon,
  BellIcon, DollarIcon, TargetIcon, RepeatIcon, ShieldCheckIcon,
  AwsIcon, PluginIcon,
} from "./icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

interface User {
  user_id: string;
  tenant_id: string;
  github_login: string | null;
  email: string;
  avatar_url: string;
  role: string;
  status?: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
  billingVisible?: boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Runs", icon: <PlayIcon /> },
      { href: "/plans", label: "Plans", icon: <CircleDotIcon /> },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: <TrendingUpIcon /> },
      { href: "/infrastructure", label: "Infrastructure", icon: <HexagonIcon /> },
      { href: "/health", label: "Health", icon: <HeartIcon /> },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/settings/repos", label: "Repos", icon: <GitBranchIcon /> },
      { href: "/settings", label: "Settings", icon: <GearIcon /> },
      { href: "/settings/workflow", label: "Workflow", icon: <RepeatIcon />, adminOnly: true },
      { href: "/settings/notifications", label: "Notifications", icon: <BellIcon /> },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/settings/github", label: "GitHub", icon: <GitHubIcon />, adminOnly: true },
      { href: "/settings/aws", label: "AWS", icon: <AwsIcon />, adminOnly: true },
      { href: "/settings/jira", label: "Jira", icon: <AtlassianIcon />, adminOnly: true },
      { href: "/settings/plugins", label: "MCP Servers", icon: <PluginIcon />, adminOnly: true },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/settings/team", label: "Members", icon: <UsersIcon /> },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings/security", label: "Security", icon: <ShieldCheckIcon /> },
      { href: "/billing", label: "Billing", icon: <DollarIcon />, adminOnly: true, billingVisible: true },
      { href: "/settings/budget", label: "Budget", icon: <TargetIcon />, adminOnly: true, billingVisible: true },
    ],
  },
];

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    api.me()
      .then((u) => {
        setUser(u);
        pushToDataLayer({ event: "identify", user_id: u.user_id, tenant_id: u.tenant_id });
        setAuthChecked(true);
        api.getBilling().then(setBilling).catch(() => {});
        api.getBanners().then((r) => setBanners(r.banners)).catch(() => {});
        api.listTenants().then((r) => setTenants(r.tenants)).catch(() => {});
      })
      .catch(() => {
        setAuthChecked(true);
      });
  }, []);

  // Refresh billing on route changes so token count stays current
  useEffect(() => {
    if (user) {
      api.getBilling().then(setBilling).catch(() => {});
    }
  }, [pathname, user]);

  // Refresh billing when subscription changes (e.g. subscribe/cancel on billing page)
  useEffect(() => {
    const handler = () => { api.getBilling().then(setBilling).catch(() => {}); };
    window.addEventListener("billing-updated", handler);
    return () => window.removeEventListener("billing-updated", handler);
  }, []);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
          <span className="text-zinc-500 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuth={(u) => {
      setUser(u);
      pushToDataLayer({ event: "identify", user_id: u.user_id, tenant_id: u.tenant_id });
      api.getBilling().then(setBilling).catch(() => {});
      api.getBanners().then((r) => setBanners(r.banners)).catch(() => {});
      api.listTenants().then((r) => setTenants(r.tenants)).catch(() => {});
    }} />;
  }

  if (user.status === "deactivated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-6">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <span className="text-2xl">⚠</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100">GitHub App Uninstalled</h1>
          <p className="text-sm text-zinc-400">
            The Coderhelm GitHub App has been removed from your organization.
            All runs, webhooks, and automation are paused.
          </p>
          <p className="text-sm text-zinc-500">
            To restore access, reinstall the GitHub App and log in again.
          </p>
          <div className="flex flex-col items-center gap-3">
            <a
              href="https://github.com/apps/coderhelm/installations/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
            >
              Reinstall GitHub App
            </a>
            <a
              href={`${API_BASE}/auth/login`}
              className="text-sm text-zinc-400 hover:text-zinc-200 underline transition-colors"
            >
              Then log in here
            </a>
          </div>
          {tenants.filter((t) => t.status !== "deactivated").length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-zinc-600 mb-2">Or switch to an active organization:</p>
              {tenants.filter((t) => t.status !== "deactivated" && !t.current).map((t) => (
                <button
                  key={t.tenant_id}
                  onClick={async () => {
                    await api.switchTenant(t.tenant_id);
                    window.location.reload();
                  }}
                  className="block mx-auto mt-1 text-sm text-zinc-300 hover:text-white underline"
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
      <div className="flex min-h-screen bg-zinc-950">
        <Sidebar billing={billing} user={user} tenants={tenants} />
        <div className="flex-1 flex flex-col">
          {banners.filter((b) => !dismissedBanners.has(b.id)).map((banner) => (
            <div
              key={banner.id}
              className={`border-b px-6 py-3 flex items-center justify-between ${
                banner.type === "error"
                  ? "bg-red-900/80 border-red-700"
                  : banner.type === "warning"
                    ? "bg-yellow-900/80 border-yellow-700"
                    : "bg-blue-900/80 border-blue-700"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-lg shrink-0 ${
                  banner.type === "error" ? "text-red-300" : banner.type === "warning" ? "text-yellow-300" : "text-blue-300"
                }`}>
                  {banner.type === "error" ? "⚠" : banner.type === "warning" ? "⚡" : "ℹ"}
                </span>
                <p className={`text-sm font-medium ${
                  banner.type === "error" ? "text-red-100" : banner.type === "warning" ? "text-yellow-100" : "text-blue-100"
                }`}>
                  {banner.message}
                  {banner.link_url && banner.link_text && (
                    <a href={banner.link_url} className="ml-2 underline hover:no-underline">
                      {banner.link_text}
                    </a>
                  )}
                </p>
              </div>
              {banner.dismissible && (
                <button
                  onClick={() => setDismissedBanners((prev) => new Set(prev).add(banner.id))}
                  className={`shrink-0 ml-4 text-lg leading-none opacity-60 hover:opacity-100 transition-opacity ${
                    banner.type === "error" ? "text-red-300" : banner.type === "warning" ? "text-yellow-300" : "text-blue-300"
                  }`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {billing && billing.subscription_status === "past_due" && (
            <div className="bg-red-900/80 border-b border-red-700 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-red-300 text-lg">⚠</span>
                <p className="text-sm font-medium text-red-100">
                  Your payment is past due. Please update your payment method to continue using Coderhelm.
                </p>
              </div>
              <a
                href="/billing"
                className="shrink-0 rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 transition-colors"
              >
                Update Payment
              </a>
            </div>
          )}
          {billing && (billing.subscription_status === "free" && billing.previous_status === "cancelled") && !dismissedBanners.has("cancelled-banner") && (
            <div className="bg-yellow-900/60 border-b border-yellow-700 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-yellow-300 text-lg">⚡</span>
                <p className="text-sm font-medium text-yellow-100">
                  Your subscription has been cancelled. You&apos;re on the free plan. Subscribe again for full access.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href="/billing"
                  className="rounded-md bg-yellow-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-yellow-500 transition-colors"
                >
                  Go to Billing
                </a>
                <button
                  onClick={() => setDismissedBanners((prev) => new Set(prev).add("cancelled-banner"))}
                  className="text-yellow-300 text-lg leading-none opacity-60 hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          {billing && billing.current_period.total_tokens >= billing.limits.tokens && (
            <div className="bg-red-900/90 border-b-2 border-red-500 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-red-300 text-xl">⚠</span>
                <div>
                  <p className="text-sm font-bold text-red-100">
                    Token limit reached — all runs are paused
                  </p>
                  <p className="text-xs text-red-300 mt-0.5">
                    You&apos;ve used {formatTokens(billing.current_period.total_tokens)} of your {formatTokens(billing.limits.tokens)} token limit this period. New GitHub and Jira actions will be skipped until your limit resets or is increased.
                  </p>
                </div>
              </div>
              <a
                href="/billing"
                className="shrink-0 rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 transition-colors"
              >
                Upgrade Plan
              </a>
            </div>
          )}
          <main className="flex-1 p-8">{children}</main>
        </div>
      </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}

function Sidebar({
  billing,
  user,
  tenants,
}: {
  billing: BillingInfo | null;
  user: User | null;
  tenants: TenantInfo[];
}) {
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/settings") return pathname === "/settings";
    return pathname.startsWith(href);
  };

  const currentTenant = tenants.find((t) => t.current);

  const handleSwitch = async (tenantId: string) => {
    setSwitching(true);
    try {
      await api.switchTenant(tenantId);
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  };

  return (
    <nav className="w-56 border-r border-zinc-800/60 bg-zinc-950 p-3 flex flex-col h-screen sticky top-0">
      <Link
        href="/"
        className="flex items-center gap-2.5 px-2 py-2.5 mb-2 rounded-md"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" className="w-5 h-5 flex-shrink-0">
          <polygon points="106,416 158,416 226,96 174,96" fill="white"/>
          <polygon points="196,416 248,416 316,96 264,96" fill="#3B82F6"/>
          <polygon points="286,416 338,416 406,96 354,96" fill="white"/>
        </svg>
        <span className="text-sm font-semibold text-zinc-100">Coderhelm</span>
      </Link>

      <div className="flex-1 space-y-4 overflow-y-auto min-h-0">
        {navGroups.map((group, index) => {
          const isAdminOrOwner = user?.role === "admin" || user?.role === "owner";
          const isBilling = user?.role === "billing";
          const visibleItems = group.items.filter((item) => {
            if (!item.adminOnly) return true;
            if (isAdminOrOwner) return true;
            if (isBilling && item.billingVisible) return true;
            return false;
          });
          if (visibleItems.length === 0) return null;

          return (
          <div key={index}>
            {group.label && (
              <p className="px-2 mb-1 text-xs font-semibold text-zinc-600 uppercase tracking-widest">
                {group.label}
              </p>
            )}

            <div className="space-y-1">
              {visibleItems.map((item) => {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${
                      isActive(item.href)
                        ? "text-zinc-100 bg-zinc-800"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="w-4 flex items-center justify-center">{item.icon}</span>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* Tokens remaining */}
      {billing && (
        <div className="mx-2 mt-3 pt-3 border-t border-zinc-800/60 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Tokens left</span>
            <span className={`font-medium ${
              billing.current_period.total_tokens >= billing.limits.tokens
                ? "text-red-400"
                : billing.current_period.total_tokens >= billing.limits.tokens * 0.8
                  ? "text-yellow-400"
                  : "text-zinc-300"
            }`}>
              {formatTokens(Math.max(billing.limits.tokens - billing.current_period.total_tokens, 0))} / {formatTokens(billing.limits.tokens)}
            </span>
          </div>
          <div className="mt-1.5 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                billing.current_period.total_tokens >= billing.limits.tokens
                  ? "bg-red-500"
                  : billing.current_period.total_tokens >= billing.limits.tokens * 0.8
                    ? "bg-yellow-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min((billing.current_period.total_tokens / billing.limits.tokens) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {user && (
        <div className="mt-3 pt-3 border-t border-zinc-800/60 shrink-0">
          {tenants.filter((t) => t.status !== "deactivated").length > 1 && (
            <div className="mb-3">
              <p className="text-xs text-zinc-600 mb-1.5 px-1">Organization</p>
              <select
                value={currentTenant?.tenant_id ?? ""}
                onChange={(e) => handleSwitch(e.target.value)}
                disabled={switching}
                className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
              >
                {tenants.filter((t) => t.status !== "deactivated").map((t) => (
                  <option key={t.tenant_id} value={t.tenant_id}>
                    {t.org}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt={user.github_login || user.email}
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center">
              {(user.github_login || user.email || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-300 truncate">{user.github_login || user.email}</p>
            {user.github_login && <p className="text-xs text-zinc-500 truncate">{user.email}</p>}
          </div>
          <button
            onClick={async () => { try { await api.logout(); } catch {} window.location.href = "/"; }}
            title="Log out"
            className="text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
          </div>
        </div>
      )}
    </nav>
  );
}

// ── Auth Screen (login / signup / verify / forgot password) ────────

type AuthView = "login" | "signup" | "verify" | "forgot" | "reset" | "mfa";

function AuthScreen({ onAuth }: { onAuth: (user: User) => void }) {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaSession, setMfaSession] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSignup = async () => {
    setError(""); setLoading(true);
    try {
      await api.signup(email, password);
      setView("verify");
      setMessage("Check your email for a verification code.");
    } catch (e: unknown) {
      setError(e instanceof Error && e.message.includes("409") ? "An account with this email already exists." : "Signup failed. Please try again.");
    } finally { setLoading(false); }
  };

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const result = await api.loginEmail(email, password);
      if (result.status === "mfa_required" && result.session) {
        setMfaSession(result.session);
        setView("mfa");
      } else {
        const u = await api.me();
        onAuth(u);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("403")) {
        setError("Please verify your email first.");
        setView("verify");
      } else {
        setError("Invalid email or password.");
      }
    } finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setError(""); setLoading(true);
    try {
      await api.verifyEmail(email, code);
      setMessage("Email verified! You can now log in.");
      setView("login");
      setCode("");
    } catch {
      setError("Invalid or expired code.");
    } finally { setLoading(false); }
  };

  const handleForgot = async () => {
    setError(""); setLoading(true);
    try {
      await api.forgotPassword(email);
      setView("reset");
      setMessage("If an account exists, a reset code was sent to your email.");
    } catch {
      setError("Something went wrong.");
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
      setError("Invalid code or password too weak.");
    } finally { setLoading(false); }
  };

  const handleMfa = async () => {
    setError(""); setLoading(true);
    try {
      await api.mfaVerify(mfaSession, code);
      const u = await api.me();
      onAuth(u);
    } catch {
      setError("Invalid MFA code.");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" className="w-12 h-12">
              <polygon points="106,416 158,416 226,96 174,96" fill="white"/>
              <polygon points="196,416 248,416 316,96 264,96" fill="#3B82F6"/>
              <polygon points="286,416 338,416 406,96 354,96" fill="white"/>
            </svg>
            <span className="text-2xl font-bold text-white tracking-tight">coderhelm</span>
          </div>

          {error && (
            <div className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          {message && (
            <div className="w-full rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-sm text-blue-400">
              {message}
            </div>
          )}

          {/* ── Login ── */}
          {view === "login" && (
            <div className="w-full space-y-4">
              <div className="space-y-3">
                <a
                  href={`${API_BASE}/auth/google`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Continue with Google
                </a>
                <a
                  href={`${API_BASE}/auth/github`}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  Continue with GitHub
                </a>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-500">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              <div className="space-y-3">
                <input type="email" placeholder="Email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); setMessage(""); }}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <input type="password" placeholder="Password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <button onClick={handleLogin} disabled={loading || !email || !password}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </div>

              <div className="flex items-center justify-between w-full text-xs">
                <button onClick={() => { setView("signup"); setError(""); setMessage(""); }} className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">Create account</button>
                <button onClick={() => { setView("forgot"); setError(""); setMessage(""); }} className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">Forgot password?</button>
              </div>
            </div>
          )}

          {/* ── Signup ── */}
          {view === "signup" && (
            <div className="w-full space-y-4">
              <p className="text-sm text-zinc-400 text-center">Create your account</p>
              <div className="space-y-3">
                <input type="email" placeholder="Email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <input type="password" placeholder="Password (8+ chars)" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
                <button onClick={handleSignup} disabled={loading || !email || password.length < 8}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loading ? "Creating account..." : "Create account"}
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
                <input type="text" placeholder="Verification code" value={code} onChange={(e) => { setCode(e.target.value); setError(""); }}
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
                <input type="email" placeholder="Email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
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
                <input type="text" placeholder="Reset code" value={code} onChange={(e) => { setCode(e.target.value); setError(""); }}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 text-center tracking-widest" />
                <input type="password" placeholder="New password (8+ chars)" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
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

          {/* ── MFA ── */}
          {view === "mfa" && (
            <div className="w-full space-y-4">
              <p className="text-sm text-zinc-400 text-center">Enter the code from your authenticator app</p>
              <div className="space-y-3">
                <input type="text" placeholder="6-digit code" value={code} onChange={(e) => { setCode(e.target.value); setError(""); }}
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

          <div className="flex gap-3 text-xs text-zinc-600 mt-4">
            <a href="https://coderhelm.com/terms" className="hover:text-zinc-400 transition-colors">Terms</a>
            <span>·</span>
            <a href="https://coderhelm.com/privacy" className="hover:text-zinc-400 transition-colors">Privacy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
