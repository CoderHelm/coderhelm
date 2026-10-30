"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "./confirm-dialog";
import { formatDate } from "./list";
import { api, errorStatus, type JiraLinkRequest } from "@/lib/api";
import { isSelfHosted } from "@/lib/runtime-config";
import { useHybrid } from "@/lib/hybrid";
import { Callout } from "./callout";
import { Switch } from "./settings/switch";
import { useToast } from "./toast";
import { inputClass, primaryButton, secondaryButton } from "./ui";

/** What came back from linking a Jira site through Coderhelm (?hybrid_jira=…). */
export const JIRA_LINK_OUTCOMES: Record<string, { ok: boolean; title: string; fix: string }> = {
  linked: { ok: true, title: "Your Jira site is linked through Coderhelm.", fix: "Its events now come to this install. This page copies the site's Jira app settings by itself." },
  declined: { ok: false, title: "Nothing was linked: Cancel was chosen on Coderhelm's page.", fix: "If you meant to link it, press Link again and choose Link." },
};

/** The words for a refusal on Coderhelm's page, when the server sent none. */
export const JIRA_LINK_BLOCKED: Record<string, string> = {
  install_off: "That install isn't registered and verified with Coderhelm any more. Start again from the install.",
  jira_not_connected: "This team doesn't run Coderhelm's Jira app on a Jira site yet. Set the app up from this page first, then start again from the install.",
  site_mismatch: "The install asked for a different Jira site than the one this team connected. Check the site address on the install and start again.",
  linked_elsewhere: "This team's Jira site is already linked to another self-hosted install. Unlink it there first.",
  install_has_other_site: "That install is already linked to another team's Jira site. Unlink it on the install first.",
  expired: "That link expired or was already used. Start it again from the install.",
};

const box = "min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-4";

/**
 * A hybrid install: Settings, Integrations, Jira, "Link through Coderhelm".
 * A hosted team's Jira site, linked here, sends its events to this install
 * through Coderhelm's relay. Shows nothing on the hosted service or on an
 * install that isn't registered with Coderhelm.
 */
export function HybridJiraLink({ className = "" }: { className?: string }) {
  const hybrid = useHybrid();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [site, setSite] = useState("");
  const [started, setStarted] = useState<{ code: string; url: string } | null>(null);
  const s = hybrid.status;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const o = q.get("hybrid_jira");
    if (!o) return;
    setOutcome(o);
    q.delete("hybrid_jira");
    const rest = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }, []);

  if (!s || !s.available || !s.registered) return null;
  const jira = s.jira ?? { enabled: false, link: null, synced: false };
  const check = s.checks.find((c) => c.id === "hybrid_jira");
  const told = outcome ? JIRA_LINK_OUTCOMES[outcome] : undefined;

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await hybrid.save({ jira_link: on });
      toast(on ? "Link through Coderhelm is on" : "Unlinked: Coderhelm handles the site's events again");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Nothing was changed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const link = async () => {
    setBusy(true);
    try {
      const r = await api.linkHybridJira(site.trim(), `${window.location.origin}/settings/integrations/jira/`);
      setStarted({ code: r.code, url: r.link_url });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start linking. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      hybrid.set(await api.unlinkHybridJira());
      toast("Unlinked: Coderhelm handles the site's events again");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't unlink. Nothing was changed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${box} ${className}`} data-testid="hybrid-jira-link" data-state={jira.link ? "linked" : jira.enabled ? "on" : "off"}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="hybrid-jira-label" className="text-sm font-medium text-zinc-100">Link through Coderhelm</p>
          <p id="hybrid-jira-help" className="mt-1 text-sm text-zinc-400">
            A Jira site your team connected on Coderhelm&apos;s hosted service sends its events here instead, through Coderhelm&apos;s relay, the
            way GitHub&apos;s do. Linking needs an admin of that team to confirm on Coderhelm.
          </p>
        </div>
        <Switch checked={jira.enabled} onChange={toggle} disabled={busy} labelledBy="hybrid-jira-label" describedBy="hybrid-jira-help" testId="hybrid-jira-switch" />
      </div>

      {told && (
        <div className="mt-3">
          <Callout variant={told.ok ? "success" : "warning"} title={told.title} testId="hybrid-jira-outcome">
            <p>{told.fix}</p>
          </Callout>
        </div>
      )}

      {jira.enabled && (
        <div className="mt-4 min-w-0 space-y-3">
          {jira.link ? (
            <>
              <p className="min-w-0 text-sm text-zinc-300 wrap-anywhere" data-testid="hybrid-jira-site">
                Linked: <span className="text-zinc-100">{jira.link.site_url || "a Jira webhook"}</span>
                {jira.synced ? "" : ". Copying its Jira app settings."}
              </p>
              <button type="button" onClick={unlink} disabled={busy} className={secondaryButton} data-testid="hybrid-jira-unlink">
                Unlink
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-400">{check?.fix ?? "Type your Jira site's address and press Link, then sign in to Coderhelm as an admin of the team that connected the site, and confirm."}</p>
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-sm text-zinc-300">
                  <span className="block">Jira site</span>
                  <input
                    type="text"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    placeholder="example.atlassian.net"
                    autoComplete="off"
                    className={`${inputClass} mt-1 w-full`}
                    data-testid="hybrid-jira-site-input"
                  />
                </label>
                <button type="button" onClick={link} disabled={busy || !/\.[a-z]{2,}/i.test(site.trim())} className={primaryButton} data-testid="hybrid-jira-start">
                  Link
                </button>
              </div>
              <p className="text-xs text-zinc-400">Coderhelm links only this site, and only for an admin of the team that runs Coderhelm&apos;s Jira app on it.</p>
              {started && (
                <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-3" data-testid="hybrid-jira-started">
                  <p className="text-sm text-zinc-300">
                    Confirmation code: <code className="text-base font-semibold tracking-widest text-zinc-100" data-testid="hybrid-jira-code">{started.code}</code>
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">Type it on Coderhelm&apos;s page when it asks. It works once, for one hour. Don&apos;t send it to anyone you don&apos;t trust with your Jira events.</p>
                  <a href={started.url} target="_blank" rel="noopener noreferrer" className={`${primaryButton} mt-3 inline-flex`} data-testid="hybrid-jira-open">
                    Open Coderhelm to confirm
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The link state in this page's address (?hybrid_link=hyj_…), if any. */
export function linkStateFrom(search: string): string | null {
  const st = new URLSearchParams(search).get("hybrid_link") ?? "";
  return /^hyj_[A-Za-z0-9_-]{1,56}$/.test(st) ? st : null;
}

/**
 * Coderhelm's hosted dashboard, Settings, Integrations, Jira with
 * ?hybrid_link=hyj_…: a team admin confirms linking the team's Jira site to
 * a self-hosted install, named by its address. Nothing is linked until Link
 * is pressed; Cancel, or leaving, links nothing.
 */
export function HostedJiraLinkRequest({ className = "" }: { className?: string }) {
  const [state, setState] = useState<string | null>(null);
  const [req, setReq] = useState<JiraLinkRequest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || isSelfHosted()) return;
    setState(linkStateFrom(window.location.search));
  }, []);

  const load = useCallback(async (st: string) => {
    try {
      setReq(await api.getJiraLinkRequest(st));
      setError("");
    } catch (e) {
      const code = errorStatus(e);
      setError(code === 410 || code === 400 ? JIRA_LINK_BLOCKED.expired : code === 403 ? "Only an admin of this team can link its Jira site." : e instanceof Error ? e.message : "Couldn't read the link.");
    }
  }, []);

  useEffect(() => {
    if (state) void load(state);
  }, [state, load]);

  if (!state) return null;

  const answer = async (choice: "link" | "cancel") => {
    setBusy(true);
    try {
      const r = await api.answerJiraLinkRequest(state, choice, code.trim());
      window.location.assign(r.return_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't link. Nothing was changed.");
      setBusy(false);
    }
  };

  return (
    <div className={`${box} ${className}`} data-testid="hosted-jira-link">
      <p className="text-sm font-medium text-zinc-100">Link this team&apos;s Jira site to a self-hosted Coderhelm?</p>
      {error ? (
        <div className="mt-3">
          <Callout variant="error" title="Nothing was linked">
            <p>{error}</p>
          </Callout>
        </div>
      ) : !req ? (
        <p className="mt-2 text-sm text-zinc-400">Reading the request…</p>
      ) : req.blocked ? (
        <div className="mt-3">
          <Callout variant="warning" title="This site can't be linked to that install" testId="hosted-jira-link-blocked">
            <p>{req.message ?? JIRA_LINK_BLOCKED[req.blocked] ?? "This site can't be linked right now."}</p>
          </Callout>
        </div>
      ) : (
        <>
          <p className="mt-2 min-w-0 text-sm text-zinc-300 wrap-anywhere">
            The Coderhelm install at <code className="text-zinc-100">{req.install_address}</code>
            {req.install_registered_at ? `, registered with Coderhelm ${formatDate(req.install_registered_at)},` : ""} will receive every event of{" "}
            <span className="text-zinc-100">{req.site_url}</span>, and this team stops handling them here. It comments on the site through
            Coderhelm, which keeps the Jira app&apos;s secret. You can unlink it on this page at any time.
          </p>
          <p className="mt-2 text-sm text-amber-300">Only continue if you started this from that install yourself, and only enter a code shown on an install you run. If someone sent you this link or the code, choose Cancel.</p>
          <label className="mt-3 block max-w-xs text-sm text-zinc-300">
            <span className="block">Confirmation code the install shows</span>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" className={`${inputClass} mt-1 w-full`} data-testid="hosted-jira-link-code" />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => answer("link")} disabled={busy || code.trim().length < 8} className={primaryButton} data-testid="hosted-jira-link-confirm">
              Link
            </button>
            <button type="button" onClick={() => answer("cancel")} disabled={busy} className={secondaryButton} data-testid="hosted-jira-link-cancel">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Coderhelm's hosted dashboard, Settings, Integrations, Jira: where this
 * team's Jira site is linked (a self-hosted install), and Unlink, which
 * brings its events back here at once.
 */
export function HostedJiraLinked({ className = "" }: { className?: string }) {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [link, setLink] = useState<{ linked: boolean; install_address?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || isSelfHosted()) return;
    api
      .getTeamJiraLink()
      .then(setLink)
      .catch(() => setLink(null));
  }, []);

  if (!link?.linked) return null;

  const unlink = async () => {
    const ok = await confirm({
      title: "Unlink the Jira site?",
      message: "Its events come back to this team on Coderhelm at once, and the self-hosted install can no longer comment on the site.",
      confirmLabel: "Unlink",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setLink(await api.unlinkTeamJira());
      toast("Unlinked: this team handles the site's events again");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't unlink. Nothing was changed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${box} ${className}`} data-testid="hosted-jira-linked">
      <p className="min-w-0 text-sm text-zinc-300 wrap-anywhere">
        This team&apos;s Jira site is linked to the self-hosted Coderhelm at <code className="text-zinc-100">{link.install_address ?? "an install"}</code>: its
        events go there, not to this team.
      </p>
      <button type="button" onClick={unlink} disabled={busy} className={`${secondaryButton} mt-3`}>
        Unlink
      </button>
    </div>
  );
}
