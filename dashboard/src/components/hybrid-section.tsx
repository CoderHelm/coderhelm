"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api, type HybridCheck, type HybridGithubLink, type HybridIntegration, type HybridNameCheck, type HybridStatus } from "@/lib/api";
import { GITHUB_OUTCOMES, NAME_CODES, TRUST_MODEL_URL, cleanName, hostedIntegrations, useHybrid, type HybridState } from "@/lib/hybrid";
import { Callout } from "./callout";
import { CopyButton } from "./copy-button";
import { useConfirm } from "./confirm-dialog";
import { ExternalLinkIcon, GitHubIcon, XIcon } from "./icons";
import { Chip, type Tone } from "./list";
import { Segmented } from "./segmented";
import { Code, Switch } from "./settings";
import { Skeleton } from "./skeleton";
import { useToast } from "./toast";
import { STATUS as CHECK_LOOK } from "./install-checks";
import { buttonClass, focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "./ui";

/** The rows of the Hybrid section split by lines; each row pads itself. */
const row = "min-w-0 px-4 py-5";

function RowHeading({ id, title, children, aside }: { id?: string; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 flex-1 basis-64">
        <h3 id={id} className="text-sm font-semibold text-zinc-100">{title}</h3>
        {children && <div className="mt-1 max-w-prose text-sm text-zinc-400">{children}</div>}
      </div>
      {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

/**
 * Settings, then System, Hybrid (self-hosted install admins): register the
 * install with Coderhelm, claim a name.coderhelm.com address, use Coderhelm's
 * GitHub App and other apps instead of your own, and choose what support may
 * see. Every write answers with the whole status (GET /api/system/hybrid).
 */
export function HybridSection() {
  const hybrid = useHybrid({ deep: true });
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<string | null>(null);

  // GitHub sends people back here with ?hybrid_github=<outcome>#hybrid.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get("hybrid_github");
    if (!o) return;
    setOutcome(o);
    const known = GITHUB_OUTCOMES[o];
    if (known) toast(known.title, known.ok ? "success" : "error");
    q.delete("hybrid_github");
    const rest = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}#hybrid`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Land on the section when the address asks for it, once it has drawn.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || hybrid.loading) return;
    if (!outcome && !window.location.hash.startsWith("#hybrid")) return;
    scrolled.current = true;
    const target = document.getElementById(window.location.hash.slice(1) || "hybrid") ?? document.getElementById("hybrid");
    target?.scrollIntoView({ block: "start" });
  }, [hybrid.loading, outcome]);

  if (hybrid.loading && !hybrid.status) {
    return (
      <div className={`${row} space-y-3`} aria-busy="true" aria-label="Loading hybrid">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-12 w-2/3" />
      </div>
    );
  }
  if (hybrid.error && !hybrid.status) {
    return (
      <div className={row}>
        <Callout variant="error" title="Couldn't load hybrid">
          <p>{hybrid.error}</p>
          <button type="button" className={`mt-2 ${secondaryButton}`} onClick={() => void hybrid.reload(true)}>Try again</button>
        </Callout>
      </div>
    );
  }
  const s = hybrid.status;
  if (!s || !s.available) {
    return (
      <div className={row} data-testid="hybrid-unavailable">
        <Setups current="private" />
        <p className="mt-4 text-sm text-zinc-400">Hybrid isn&apos;t available on this install yet. Update to the latest release to use it.</p>
      </div>
    );
  }

  const known = outcome ? GITHUB_OUTCOMES[outcome] : undefined;
  return (
    <div className="min-w-0 divide-y divide-zinc-800" data-testid="hybrid-section" data-registered={String(s.registered)}>
      <div className={row}>
        <p className="max-w-prose text-sm text-zinc-300">
          Hybrid lets this install use Coderhelm&apos;s apps and a coderhelm.com address, so there is less to set up. Your code, tickets and runs stay in your AWS account either way.
        </p>
        <div className="mt-4">
          <Setups current={s.registered ? "hybrid" : "private"} />
        </div>
        {outcome && (
          <div className="mt-4" data-testid="hybrid-github-outcome" data-outcome={outcome}>
            <Callout variant={known?.ok ? "success" : "error"} title={known?.title ?? "GitHub sent back an answer Coderhelm didn't expect."}>
              <p>{known?.fix ?? "Press Install on GitHub again. If it keeps happening, contact support."}</p>
            </Callout>
          </div>
        )}
      </div>

      <Registration hybrid={hybrid} s={s} />

      {s.registered && (
        <>
          <NameRow hybrid={hybrid} s={s} />
          <GithubRow hybrid={hybrid} s={s} />
          <IntegrationsRow hybrid={hybrid} s={s} />
          <SharingRow hybrid={hybrid} s={s} />
        </>
      )}

      <ChecksRow hybrid={hybrid} checks={s.checks ?? []} />

      <div className={`${row} flex flex-wrap gap-x-6 gap-y-2`}>
        <a href={TRUST_MODEL_URL} target="_blank" rel="noopener noreferrer" className={`${linkButton} gap-1.5`}>
          What Coderhelm can and can&apos;t see <ExternalLinkIcon />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <Link href="/settings/deliveries" className={linkButton}>See every delivery</Link>
      </div>
    </div>
  );
}

// ── The setups side by side ─────────────────────────────────────────

const SETUPS: { key: "private" | "hybrid" | "hosted"; title: string; tag: string; good: string[]; cost: string }[] = [
  {
    key: "private",
    title: "Fully private",
    tag: "Default",
    good: ["Your own GitHub App and other apps", "Nothing passes through Coderhelm"],
    cost: "You create and look after each app, and the address is your AWS one or a domain you own.",
  },
  {
    key: "hybrid",
    title: "Hybrid",
    tag: "Easiest to run",
    good: ["Coderhelm's GitHub App and other apps", "A name.coderhelm.com address", "Code, tickets and runs stay in your AWS account"],
    cost: "Events from those apps pass through Coderhelm on their way to you.",
  },
  {
    key: "hosted",
    title: "Hosted by Coderhelm",
    tag: "Not this install",
    good: ["Nothing to run or update", "Coderhelm runs it all"],
    cost: "Your code is read in Coderhelm's cloud, not in your AWS account.",
  },
];

function Setups({ current }: { current: "private" | "hybrid" }) {
  return (
    <ul className="grid min-w-0 gap-3 md:grid-cols-3" aria-label="Ways to run Coderhelm" data-testid="hybrid-setups">
      {SETUPS.map((x) => {
        const on = x.key === current;
        return (
          <li
            key={x.key}
            data-setup={x.key}
            aria-current={on ? "true" : undefined}
            className={`min-w-0 rounded-lg border p-4 ${on ? "border-zinc-500 bg-zinc-800/50" : x.key === "hosted" ? "border-zinc-800 bg-transparent" : "border-zinc-800 bg-zinc-900/40"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-sm font-semibold ${x.key === "hosted" ? "text-zinc-300" : "text-zinc-100"}`}>{x.title}</p>
              {on ? <Chip tone="success">This install</Chip> : <Chip tone="muted">{x.tag}</Chip>}
            </div>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {x.good.map((g) => (
                <li key={g} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                  <span className="min-w-0">{g}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-zinc-400"><span className="text-zinc-300">Trade-off: </span>{x.cost}</p>
          </li>
        );
      })}
    </ul>
  );
}

// ── Registration ───────────────────────────────────────────────────

interface RowProps {
  hybrid: HybridState;
  s: HybridStatus;
}

function useAct() {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const act = async (key: string, run: () => Promise<HybridStatus | void>, done?: string): Promise<boolean> => {
    setBusy(key);
    try {
      await run();
      if (done) toast(done);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work", "error");
      return false;
    } finally {
      setBusy("");
    }
  };
  return { busy, act };
}

function Registration({ hybrid, s }: RowProps) {
  const { busy, act } = useAct();
  const { confirm } = useConfirm();

  if (!s.registered) {
    return (
      <div className={row} id="hybrid-register" data-testid="hybrid-register">
        <RowHeading title="Register with Coderhelm">
          <p>
            Registering gives this install an identity at Coderhelm. It changes nothing in your AWS account, and you can leave at any time.
          </p>
        </RowHeading>
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
          <p className="font-medium text-zinc-200">What Coderhelm will see</p>
          <ul className="mt-1.5 space-y-1 text-zinc-400">
            <li>This install&apos;s id and its AWS address{s.cloudfront ? <> (<Code>{s.cloudfront}</Code>)</> : null}</li>
            <li>The version it runs, and whether it answers</li>
            <li>Nothing from your code, tickets, runs or chats</li>
          </ul>
        </div>
        <button
          type="button"
          className={`mt-4 ${primaryButton}`}
          disabled={!!busy}
          data-testid="hybrid-register-button"
          onClick={() => void act("register", async () => hybrid.set(await api.registerHybrid()), "Registered with Coderhelm")}
        >
          {busy ? "Registering…" : "Register with Coderhelm"}
        </button>
      </div>
    );
  }

  const leave = async () => {
    const ok = await confirm({
      title: "Leave hybrid?",
      message:
        "Coderhelm's apps stop sending events to this install, its coderhelm.com address is released, and repositories linked through Coderhelm's GitHub App stop working until you set up your own app. Your data stays where it is.",
      confirmLabel: "Leave hybrid",
      destructive: true,
    });
    if (!ok) return;
    await act("leave", async () => hybrid.set(await api.leaveHybrid()), "Left hybrid. This install is fully private again.");
  };

  return (
    <div className={row} id="hybrid-register" data-testid="hybrid-registered">
      <RowHeading
        title="Registered with Coderhelm"
        aside={
          <button type="button" className={buttonClass("danger", "sm")} disabled={!!busy} onClick={() => void leave()} data-testid="hybrid-leave">
            {busy === "leave" ? "Leaving…" : "Leave hybrid"}
          </button>
        }
      >
        <p>Coderhelm knows this install and can send it events from its apps.</p>
      </RowHeading>
      <dl className="mt-3 grid min-w-0 gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-zinc-400">Install id</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Code>{s.install_id ?? "Unknown"}</Code>
          {s.install_id && <CopyButton text={s.install_id} variant="link" />}
        </dd>
        <dt className="text-zinc-400">Verified</dt>
        <dd data-testid="hybrid-verified">
          {s.verified ? <Chip tone="success">Verified</Chip> : <Chip tone="waiting">Waiting for Coderhelm to reach this install</Chip>}
        </dd>
      </dl>
    </div>
  );
}

// ── name.coderhelm.com ──────────────────────────────────────────────

function NameRow({ hybrid, s }: RowProps) {
  const { busy, act } = useAct();
  const { confirm } = useConfirm();
  const [text, setText] = useState("");
  const [check, setCheck] = useState<HybridNameCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const inputId = useId();
  const name = cleanName(text);

  useEffect(() => {
    if (!name) {
      setCheck(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    let live = true;
    const t = window.setTimeout(() => {
      api
        .checkHybridName(name)
        .then((r) => live && setCheck(r))
        .catch((e) => live && setCheck({ name, available: false, code: "error", error: e instanceof Error ? e.message : "Couldn't check this name." }))
        .finally(() => live && setChecking(false));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [name]);

  const nameChecks = (s.checks ?? []).filter((c) => c.id === "hybrid_name" || c.id.startsWith("hybrid_name"));

  if (s.name) {
    const url = `https://${s.name.hostname}`;
    const release = async () => {
      const ok = await confirm({
        title: `Release ${s.name!.hostname}?`,
        message: "Links to this address stop working, and someone else may claim the name. Coderhelm keeps answering on your other addresses.",
        confirmLabel: "Release the address",
        destructive: true,
      });
      if (!ok) return;
      await act("release", async () => hybrid.set(await api.releaseHybridName()), "Address released");
    };
    return (
      <div className={row} id="hybrid-name" data-testid="hybrid-name" data-claimed="true">
        <RowHeading
          title="Coderhelm address"
          aside={
            <button type="button" className={buttonClass("secondary", "sm")} disabled={!!busy} onClick={() => void release()} data-testid="hybrid-release">
              {busy === "release" ? "Releasing…" : "Release"}
            </button>
          }
        >
          <p>People and GitHub can reach this install here, with a certificate Coderhelm looks after.</p>
        </RowHeading>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
          <a href={url} target="_blank" rel="noopener noreferrer" className={`min-w-0 rounded text-sm font-medium text-zinc-100 hover:underline ${focusRing}`} data-testid="hybrid-hostname">
            <span className="wrap-anywhere">{s.name.hostname}</span>
          </a>
          <CopyButton text={url} variant="link" className="shrink-0" />
        </div>
        {nameChecks.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800" aria-label="Address checks" data-testid="hybrid-name-checks">
            {nameChecks.map((c) => <HybridCheckRow key={`${c.id}-${c.code}`} check={c} />)}
          </ul>
        )}
      </div>
    );
  }

  const ok = !!check && check.available && check.name === name;
  const message = !name ? "" : checking || check?.name !== name ? "Checking…" : ok ? `${check!.hostname ?? `${name}.coderhelm.com`} is available.` : check?.error || NAME_CODES[check?.code ?? ""] || "This name can't be used.";
  const claim = async () => {
    if (!ok) return;
    const done = await act("claim", async () => hybrid.set(await api.claimHybridName(name)), `Claimed ${name}.coderhelm.com`);
    if (done) setText("");
  };

  return (
    <div className={row} id="hybrid-name" data-testid="hybrid-name" data-claimed="false">
      <RowHeading title="Coderhelm address">
        <p>An address that&apos;s easy to share, with no domain or DNS records to set up. Coderhelm points it at this install.</p>
      </RowHeading>
      <form
        className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          void claim();
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-zinc-200">Name</label>
          <div className="flex min-w-0 items-stretch rounded-lg border border-zinc-700 bg-zinc-950 focus-within:border-zinc-500 focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-zinc-100">
            <input
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="example-org"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${inputId}-status`}
              aria-invalid={!!name && !checking && check?.name === name && !ok ? true : undefined}
              data-testid="hybrid-name-input"
              className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
            />
            <span className="flex shrink-0 items-center rounded-r-lg border-l border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-400">.coderhelm.com</span>
          </div>
          <p
            id={`${inputId}-status`}
            aria-live="polite"
            data-testid="hybrid-name-status"
            data-code={check?.name === name ? check?.code : ""}
            className={`mt-1.5 min-h-5 text-sm ${!name || checking ? "text-zinc-400" : ok ? "text-emerald-300" : "text-red-300"}`}
          >
            {message || "Lowercase letters, numbers and hyphens."}
          </p>
        </div>
        <button type="submit" className={`${primaryButton} sm:mt-6`} disabled={!ok || !!busy} data-testid="hybrid-claim">
          {busy === "claim" ? "Claiming…" : "Claim"}
        </button>
      </form>
    </div>
  );
}

// ── GitHub ─────────────────────────────────────────────────────────

function ChoiceCards<T extends string>({
  name,
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  name: string;
  label: string;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  options: { value: T; title: string; body: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid min-w-0 gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={o.value}
            className={`relative flex min-w-0 cursor-pointer gap-3 rounded-lg border p-4 transition-colors motion-reduce:transition-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-100 ${
              on ? "border-zinc-400 bg-zinc-800/60" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={on}
              disabled={disabled}
              onChange={() => onChange(o.value)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-100"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-100">{o.title}</span>
              <span className="mt-1 block text-sm text-zinc-400">{o.body}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function GithubRow({ hybrid, s }: RowProps) {
  const { busy, act } = useAct();
  // The choice shows at once; it goes back if the save fails.
  const [mode, setMode] = useState(s.github.mode);
  useEffect(() => setMode(s.github.mode), [s.github.mode]);
  const hosted = s.github.mode === "hosted";
  const choose = async (v: "hosted" | "own") => {
    setMode(v);
    const ok = await act("mode", () => hybrid.save({ github_mode: v }), v === "hosted" ? "Using Coderhelm's GitHub App" : "Using your own GitHub App");
    if (!ok) setMode(s.github.mode);
  };

  const install = async () => {
    await act("link", async () => {
      const r = await api.linkHybridGithub(`${window.location.origin}/settings/system/`);
      window.location.assign(r.install_url);
    });
  };

  return (
    <div className={row} id="hybrid-github" data-testid="hybrid-github" data-mode={s.github.mode}>
      <RowHeading title="GitHub">
        <p>Which GitHub App sends pull requests, comments and CI results to this install.</p>
      </RowHeading>
      <div className="mt-3">
        <ChoiceCards<"hosted" | "own">
          name="hybrid-github-mode"
          label="GitHub App"
          value={mode}
          disabled={!!busy}
          onChange={(v) => void choose(v)}
          options={[
            { value: "hosted", title: "Use Coderhelm's GitHub App (easiest)", body: "Install it on GitHub in a few clicks. GitHub's events reach this install through Coderhelm." },
            { value: "own", title: "Use my own GitHub App (fully private)", body: "Your own app sends events straight to this install. Nothing passes through Coderhelm." },
          ]}
        />
      </div>
      {hosted && (
        <div className="mt-4 min-w-0 space-y-3">
          {s.github.links.length === 0 ? (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
              <p className="min-w-0 flex-1 basis-56 text-sm text-zinc-300">Install Coderhelm&apos;s app on the GitHub account or organization that owns your repositories. Coderhelm then shows which install it is about to link: check that the address is this one and press Link. Tokens reach only the repositories you can push to.</p>
              <button type="button" className={`${primaryButton} gap-1.5`} disabled={!!busy} onClick={() => void install()} data-testid="hybrid-github-install">
                <span aria-hidden="true"><GitHubIcon /></span>
                {busy === "link" ? "Opening GitHub…" : "Install on GitHub"}
              </button>
            </div>
          ) : (
            <>
              <ul className="space-y-3" aria-label="Linked GitHub accounts">
                {s.github.links.map((l) => (
                  <GithubLinkCard key={l.installation_id} link={l} hybrid={hybrid} />
                ))}
              </ul>
              <button type="button" className={`${secondaryButton} gap-1.5`} disabled={!!busy} onClick={() => void install()} data-testid="hybrid-github-install">
                <span aria-hidden="true"><GitHubIcon /></span>
                {busy === "link" ? "Opening GitHub…" : "Install on another account"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GithubLinkCard({ link, hybrid }: { link: HybridGithubLink; hybrid: HybridState }) {
  const { busy, act } = useAct();
  const { confirm } = useConfirm();
  const [repos, setRepos] = useState<string[]>(link.repositories);
  const [adding, setAdding] = useState("");
  const addId = useId();
  useEffect(() => setRepos(link.repositories), [link.repositories]);
  const dirty = repos.join("\n") !== link.repositories.join("\n");

  const add = () => {
    const r = adding.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "");
    if (!r) return;
    const full = r.includes("/") ? r : `${link.account}/${r}`;
    if (!repos.includes(full)) setRepos([...repos, full]);
    setAdding("");
  };

  const unlink = async () => {
    const ok = await confirm({
      title: `Unlink ${link.account}?`,
      message: "Events from its repositories stop reaching this install. The app stays installed on GitHub until you remove it there.",
      confirmLabel: "Unlink",
      destructive: true,
    });
    if (!ok) return;
    await act("unlink", async () => hybrid.set(await api.unlinkHybridGithub(link.installation_id)), `Unlinked ${link.account}`);
  };

  return (
    <li className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4" data-testid="hybrid-github-link" data-installation={link.installation_id}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-100">
          <span aria-hidden="true" className="shrink-0 text-zinc-400"><GitHubIcon /></span>
          <span className="min-w-0 wrap-anywhere">{link.account}</span>
          <Chip tone="neutral">{`${link.repositories.length} ${link.repositories.length === 1 ? "repository" : "repositories"}`}</Chip>
        </p>
        <button type="button" className={buttonClass("ghost", "sm")} disabled={!!busy} onClick={() => void unlink()}>
          {busy === "unlink" ? "Unlinking…" : "Unlink"}
        </button>
      </div>
      <p className="mt-2 text-sm text-zinc-400">Only these repositories send events to this install.</p>
      {repos.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-300">None yet: add the ones this install should work on.</p>
      ) : (
        <ul className="mt-2 flex min-w-0 flex-wrap gap-2" aria-label={`Repositories for ${link.account}`}>
          {repos.map((r) => (
            <li key={r} className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 py-0.5 pl-2.5 pr-1 text-sm text-zinc-200">
              <span className="min-w-0 wrap-anywhere">{r}</span>
              <button
                type="button"
                aria-label={`Remove ${r}`}
                onClick={() => setRepos(repos.filter((x) => x !== r))}
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 [&_svg]:h-3 [&_svg]:w-3 ${focusRing}`}
              >
                <XIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor={addId} className="sr-only">Add a repository</label>
        <input id={addId} value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={`${link.account}/repository`} autoCapitalize="off" spellCheck={false} className={`${inputClass} sm:max-w-xs`} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass("secondary", "sm")} disabled={!adding.trim()}>Add</button>
          <button
            type="button"
            className={buttonClass("primary", "sm")}
            disabled={!dirty || !!busy}
            data-testid="hybrid-repos-save"
            onClick={() => void act("repos", async () => hybrid.set(await api.setHybridGithubRepos(link.installation_id, repos)), "Repositories saved")}
          >
            {busy === "repos" ? "Saving…" : "Save repositories"}
          </button>
        </div>
      </form>
    </li>
  );
}

// ── Other integrations ─────────────────────────────────────────────

function IntegrationsRow({ hybrid, s }: RowProps) {
  const list = (s.integrations ?? []).filter((i) => i.id !== "github");
  if (list.length === 0) return null;
  return (
    <div className={row} id="hybrid-integrations" data-testid="hybrid-integrations">
      <RowHeading title="Other apps">
        <p>For each tool, use Coderhelm&apos;s app, or create your own so nothing passes through Coderhelm.</p>
      </RowHeading>
      <ul className="mt-3 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
        {list.map((i) => (
          <IntegrationItem key={i.id} i={i} hybrid={hybrid} s={s} />
        ))}
      </ul>
    </div>
  );
}

function IntegrationItem({ i, hybrid, s }: { i: HybridIntegration } & RowProps) {
  const { busy, act } = useAct();
  const value = i.uses_coderhelm ? "coderhelm" : "own";
  const notOffered = i.mode === "hosted" && i.offered === false;
  return (
    <li className="min-w-0 px-4 py-4" data-testid={`hybrid-integration-${i.id}`} data-mode={i.mode}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-medium text-zinc-100">{i.name}</p>
        {notOffered ? (
          <Chip tone="muted">Coderhelm&apos;s app isn&apos;t set up yet</Chip>
        ) : i.mode === "hosted" ? (
          <Segmented<"coderhelm" | "own">
            label={`Which ${i.name} app to use`}
            value={value}
            disabled={!!busy}
            onChange={(v) =>
              void act("set", () => hybrid.save({ integrations: hostedIntegrations(s, i.id, v === "coderhelm") }), v === "coderhelm" ? `${i.name} uses Coderhelm's app` : `${i.name} uses your own app`)
            }
            options={[
              { value: "coderhelm", label: "Use Coderhelm's app (easiest)" },
              { value: "own", label: "Use my own app (fully private)" },
            ]}
          />
        ) : i.mode === "direct" ? (
          <Chip tone="success">Works from your install, no app needed</Chip>
        ) : (
          <Chip tone="muted">Not available</Chip>
        )}
      </div>
      {notOffered && <p className="mt-1 text-sm text-zinc-400">Use your own {i.name} app for now.</p>}
      {i.mode === "hosted" && !notOffered && (i.through_coderhelm || i.stays_with_you) && (
        <dl className="mt-2 grid min-w-0 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {i.through_coderhelm && (
            <div className={`min-w-0 ${value === "coderhelm" ? "" : "opacity-60"}`}>
              <dt className="text-zinc-300">Through Coderhelm</dt>
              <dd className="text-zinc-400">{i.through_coderhelm}</dd>
            </div>
          )}
          {i.stays_with_you && (
            <div className="min-w-0">
              <dt className="text-zinc-300">Stays with you</dt>
              <dd className="text-zinc-400">{i.stays_with_you}</dd>
            </div>
          )}
        </dl>
      )}
      {i.mode === "unavailable" && i.reason && <p className="mt-1 text-sm text-zinc-400">{i.reason}</p>}
    </li>
  );
}

// ── Sharing with support ───────────────────────────────────────────

function SharingRow({ hybrid, s }: RowProps) {
  const { busy, act } = useAct();
  const base = useId();
  const share = s.sharing ?? { enabled: false, payloads: false };
  const set = (next: { enabled: boolean; payloads: boolean }, done: string) => void act("sharing", () => hybrid.save({ sharing: next }), done);
  return (
    <div className={row} id="hybrid-sharing" data-testid="hybrid-sharing" data-enabled={String(share.enabled)}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`${base}-label`} className="text-sm font-semibold text-zinc-100">Share failed deliveries with Coderhelm support</h3>
          <p id={`${base}-help`} className="mt-1 max-w-prose text-sm text-zinc-400">Off unless you turn it on. You can turn it off at any time.</p>
        </div>
        <Switch
          checked={share.enabled}
          disabled={!!busy}
          labelledBy={`${base}-label`}
          describedBy={`${base}-help`}
          testId="hybrid-sharing-switch"
          onChange={(c) => set({ enabled: c, payloads: c ? share.payloads : false }, c ? "Sharing with support is on" : "Sharing with support is off")}
        />
      </div>
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
          <p className="font-medium text-zinc-200">What you get</p>
          <ul className="mt-1.5 space-y-1 text-zinc-400">
            <li>Support can see failed deliveries and help you find the cause</li>
            <li>A heads-up from Coderhelm when deliveries to this install keep failing</li>
          </ul>
        </div>
        <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
          <p className="font-medium text-zinc-200">Exactly what is sent</p>
          <ul className="mt-1.5 space-y-1 text-zinc-400">
            <li>For failed deliveries only: source, event type, status, reason code, attempts and timings</li>
            <li>Never headers</li>
            <li>Never payloads, unless you also turn on payload previews below</li>
          </ul>
        </div>
      </div>
      {share.enabled && (
        <div className="mt-4 flex min-w-0 items-start justify-between gap-4 border-l-2 border-zinc-800 pl-4">
          <div className="min-w-0">
            <p id={`${base}-payloads`} className="text-sm font-medium text-zinc-100">Include payload previews</p>
            <p className="mt-0.5 max-w-prose text-sm text-zinc-400">The first part of each failed delivery&apos;s body, so support can see what arrived. It may hold repository names, titles and comments.</p>
          </div>
          <Switch
            checked={share.payloads}
            disabled={!!busy}
            labelledBy={`${base}-payloads`}
            testId="hybrid-payloads-switch"
            onChange={(c) => set({ enabled: true, payloads: c }, c ? "Payload previews are shared" : "Payload previews are not shared")}
          />
        </div>
      )}
    </div>
  );
}

// ── Checks ─────────────────────────────────────────────────────────

const CHECK_STATUS: Record<HybridCheck["status"], { label: string; tone: Tone; look: keyof typeof CHECK_LOOK }> = {
  pass: { label: "Passed", tone: "success", look: "pass" },
  fail: { label: "Needs a fix", tone: "danger", look: "fail" },
  wait: { label: "Waiting", tone: "waiting", look: "warn" },
  todo: { label: "To do", tone: "muted", look: "skip" },
};

function HybridCheckRow({ check }: { check: HybridCheck }) {
  const st = CHECK_STATUS[check.status] ?? CHECK_STATUS.todo;
  const look = CHECK_LOOK[st.look];
  return (
    <li className="flex min-w-0 gap-3 px-4 py-3" data-testid="hybrid-check" data-id={check.id} data-status={check.status}>
      <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${look.ring}`}>
        <span className="scale-75">{look.icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
          <span className="min-w-0">{check.title}</span>
          <Chip tone={st.tone}>{st.label}</Chip>
        </p>
        {check.fix && check.status !== "pass" && (
          <p className="mt-1 text-sm text-zinc-300">
            <span className="font-medium text-zinc-100">{check.status === "wait" ? "What happens next: " : "How to fix: "}</span>
            {check.fix}
          </p>
        )}
      </div>
    </li>
  );
}

function ChecksRow({ hybrid, checks }: { hybrid: HybridState; checks: HybridCheck[] }) {
  if (checks.length === 0) return null;
  const failing = checks.filter((c) => c.status === "fail").length;
  return (
    <div className={row} id="hybrid-checks" data-testid="hybrid-checks">
      <RowHeading
        title="Checks"
        aside={
          <button type="button" className={buttonClass("secondary", "sm")} disabled={hybrid.loading} onClick={() => void hybrid.reload(true)} data-testid="hybrid-recheck">
            {hybrid.loading ? "Checking…" : "Check again"}
          </button>
        }
      >
        <p>{failing ? `${failing} need${failing === 1 ? "s" : ""} a fix.` : "Checked live from this install."}</p>
      </RowHeading>
      <ul className="mt-3 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800" aria-label="Hybrid checks">
        {checks.map((c) => <HybridCheckRow key={`${c.id}-${c.code}`} check={c} />)}
      </ul>
    </div>
  );
}

