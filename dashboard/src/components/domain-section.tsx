"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type SystemDomain } from "@/lib/api";
import { CheckRow } from "@/components/install-checks";
import { Code } from "@/components/settings/code";
import { CopyButton } from "@/components/copy-button";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { useToast } from "@/components/toast";

/** Codes that are waiting on something outside this page: check again by itself. */
const WAITING = new Set(["validating", "attaching", "removing", "dns_missing"]);

/** Codes whose fix is a new certificate request for the same hostname. */
const RETRY = new Set(["caa_blocked", "certificate_failed", "attach_failed"]);

/** A hostname as people type it, bare and lowercase. */
export function cleanHostname(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/\.$/, "");
}

/**
 * Settings, then System, Domain: use your own domain, see the DNS records to
 * add, and watch the checks (GET /api/system/domain) until it answers there.
 * docs/self-host/domains.md in coderhelm-platform lists every code.
 */
export function DomainSection() {
  const { toast } = useToast();
  const [data, setData] = useState<SystemDomain | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState<"" | "set" | "remove">("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .getSystemDomain()
      .then((d) => {
        setData(d);
        setState("ready");
      })
      .catch(() => setState("failed"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // While something outside is pending, check again every 15 seconds.
  useEffect(() => {
    if (!data?.code || !WAITING.has(data.code)) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [data?.code, load]);

  const use = async (hostname: string) => {
    const h = cleanHostname(hostname);
    if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) {
      setError("Enter a hostname such as coderhelm.example.com.");
      return;
    }
    setError("");
    setBusy("set");
    try {
      await api.setSystemDomain(h);
      toast(`Requested a certificate for ${h}`, "success");
      setHost("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!window.confirm("Go back to the AWS address? Coderhelm redeploys (about 10 minutes), and links to your domain stop working.")) return;
    setBusy("remove");
    try {
      await api.removeSystemDomain();
      toast("Moving back to the AWS address", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start", "error");
    } finally {
      setBusy("");
    }
  };

  if (state === "loading" && !data) {
    return (
      <div className="space-y-3 px-4 py-4" aria-busy="true" aria-label="Checking the domain">
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (state === "failed" || !data) {
    return (
      <div className="px-4 py-4">
        <Callout variant="error" title="The domain couldn't be checked">
          <p>The gateway didn&apos;t answer. Try again in a minute.</p>
        </Callout>
      </div>
    );
  }
  if (!data.available) {
    return (
      <div className="px-4 py-4" data-testid="domain-unavailable">
        <Callout variant="neutral" title="Set the domain in the config">
          <p>{data.reason}</p>
        </Callout>
      </div>
    );
  }

  const d = data.domain;
  const code = data.code ?? "";
  const busyChange = d?.state === "attaching" || d?.state === "removing";
  const onDomain = d?.hostname && d.state === "live";
  const hasRecords = !!d?.records?.length && code !== "ok";
  // The records get their own rows with Copy buttons below, so the check's
  // fix doesn't repeat them as one block.
  const repeats = !!d?.records?.some((r) => data.check?.fix?.command?.includes(r.value));
  const check = data.check && hasRecords && repeats && data.check.fix ? { ...data.check, fix: { ...data.check.fix, command: undefined } } : data.check;
  return (
    <div className="min-w-0" data-testid="domain-section" data-code={code}>
      {check && (
        <ul className="divide-y divide-zinc-800" aria-label="Domain check">
          <CheckRow check={check} />
        </ul>
      )}
      {hasRecords && d && (
        <div className="min-w-0 border-t border-zinc-800 px-4 py-4" data-testid="domain-records">
          <h3 className="text-sm font-medium text-zinc-100">Records to add where your domain&apos;s DNS is hosted</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Type CNAME for both. If your DNS provider adds the domain to the name for you, type only the part before it. With Cloudflare, set the records to DNS only.
          </p>
          <ul className="mt-3 space-y-3">
            {d.records.map((r) => (
              <li key={`${r.purpose}-${r.name}`} className="min-w-0" data-testid={`domain-record-${r.purpose}`}>
                <p className="mb-1 text-sm text-zinc-300">
                  {r.purpose === "certificate" ? "For the certificate (keep it: AWS renews with it)" : "For the address"}, type {r.type}
                </p>
                <dl className="grid min-w-0 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm sm:grid-cols-[4rem_1fr]">
                  {([["Name", r.name], ["Value", r.value]] as const).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-zinc-400">{k}</dt>
                      <dd className="flex min-w-0 items-start justify-between gap-3">
                        <Code className="min-w-0">{v}</Code>
                        <CopyButton text={v} variant="link" className="shrink-0" />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="min-w-0 border-t border-zinc-800 px-4 py-4">
        {RETRY.has(code) && d?.hostname && (
          <div className="mb-4">
            <button type="button" className={primaryButton} disabled={!!busy} onClick={() => use(d.hostname!)} data-testid="domain-retry">
              {busy === "set" ? "Starting…" : "Try again"}
            </button>
          </div>
        )}
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void use(host);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-sm font-medium text-zinc-200">{d?.hostname ? "Use another domain" : "Use your own domain"}</span>
            <input
              className={inputClass}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="coderhelm.example.com"
              autoCapitalize="off"
              spellCheck={false}
              disabled={busyChange}
              data-testid="domain-input"
              aria-describedby="domain-help"
            />
          </label>
          <button type="submit" className={RETRY.has(code) ? secondaryButton : primaryButton} disabled={!!busy || busyChange || !host.trim()} data-testid="domain-use">
            {busy === "set" ? "Requesting…" : "Use this domain"}
          </button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-red-300" data-testid="domain-error">{error}</p>}
        <p id="domain-help" className="mt-2 text-sm text-zinc-400">
          With a Route 53 zone in this AWS account the records are added for you. Anywhere else, this page shows two records to add. Coderhelm keeps working on its current address until the domain is ready.
        </p>
        {(onDomain || d?.state === "failed" || d?.state === "validating") && (
          <div className="mt-4">
            <button type="button" className={secondaryButton} disabled={!!busy || busyChange} onClick={remove} data-testid="domain-remove">
              {busy === "remove" ? "Starting…" : onDomain ? "Use the AWS address" : "Cancel this domain"}
            </button>
          </div>
        )}
        <details className="mt-4 text-sm text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">How it works</summary>
          <div className="mt-2 space-y-2">
            <p>The install requests a certificate for the domain from AWS (in us-east-1, where CloudFront takes them). Once AWS sees the first record it issues it, and Coderhelm redeploys with the new address (about 10 minutes; Update history shows it).</p>
            <p>Afterwards, update your GitHub App&apos;s URLs to the new address; Settings, then Setup names each value.</p>
          </div>
        </details>
      </div>
    </div>
  );
}
