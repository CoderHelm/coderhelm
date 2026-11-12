"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type DataSource, type PrivateNetworkParam, type PrivateNetworkPlan } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { Callout } from "@/components/callout";
import { CodeBlock } from "@/components/code-block";
import { useToast } from "@/components/toast";
import { linkButton, primaryButton, secondaryButton } from "@/components/ui";

const DOCS = "https://docs.coderhelm.com/self-host/private-networks/";

/**
 * A search source's private network (docs/self-host/private-networks.md):
 * where its AWS domain lives, which of the install's networks reads it (or
 * the one to add, through the install's reviewed update), and the one
 * security group rule the domain needs when it doesn't let the network in yet.
 */
export function PrivateNetworkPanel({
  source,
  onChange,
  onClose,
  onTest,
}: {
  source: DataSource;
  onChange: (s: DataSource) => void;
  onClose: () => void;
  onTest: () => void;
}) {
  const { toast } = useToast();
  const [plan, setPlan] = useState<PrivateNetworkPlan | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<"" | "use" | "add" | "internet">("");
  const [error, setError] = useState("");
  const [proposed, setProposed] = useState("");

  useEffect(() => {
    let live = true;
    api
      .getPrivateNetworkPlan(source.id)
      .then((p) => live && setPlan(p))
      .catch((e) => live && setLoadError(errorMessage(e, "The request failed.")));
    return () => {
      live = false;
    };
  }, [source.id, source.network]);

  const use = async (network: string, url?: string) => {
    setBusy(network ? "use" : "internet");
    setError("");
    try {
      const res = await api.updateDataSource(source.id, { network, ...(url && url !== source.url ? { url } : {}) });
      onChange(res.source);
      toast(network ? `${source.name} now reads through private network ${network}` : `${source.name} now reads over the internet`);
    } catch (e) {
      setError(`${errorMessage(e, "The request failed.")} Nothing was changed.`);
    } finally {
      setBusy("");
    }
  };

  const add = async (parameter: string, value: string, network: string) => {
    setBusy("add");
    setError("");
    try {
      await api.setInstallOptions({ [parameter as PrivateNetworkParam]: value });
      setProposed(network);
    } catch (e) {
      setError(`${errorMessage(e, "The request failed.")} Nothing was changed.`);
    } finally {
      setBusy("");
    }
  };

  const current = source.network ?? "";
  const d = plan?.domain ?? null;
  const s = plan?.suggestion ?? null;
  const access = plan?.access ?? null;
  const placed = (n: string) => plan?.networks?.find((p) => p.network === n);

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4" data-testid="private-network-panel">
      <p className="text-sm text-zinc-300">
        {current ? (
          <>Reads through <strong>private network {current}</strong>{placed(current)?.vpc_id ? ` (${placed(current)!.vpc_id})` : ""}.</>
        ) : (
          <>Reads over the internet.</>
        )}{" "}
        A cluster that is reachable only inside a VPC is read through a small read-only lookup function Coderhelm runs there.{" "}
        <a href={DOCS} target="_blank" rel="noreferrer" className={linkButton}>How it works</a>
      </p>

      {loadError && <Callout variant="error" title="We couldn't look the cluster up"><p>{loadError} Close and open this again.</p></Callout>}
      {!plan && !loadError && <p className="text-sm text-zinc-400" role="status">Looking up the cluster…</p>}

      {plan && !plan.available && (
        <Callout variant="info" title="Private networks need a self-hosted install">
          <p>{plan.why}</p>
        </Callout>
      )}

      {plan?.available && plan.domain_error && (
        <Callout variant="warning" title="Coderhelm couldn't find the domain">
          <p>{plan.domain_error}</p>
        </Callout>
      )}

      {plan?.available && d && !d.vpc_only && (
        <Callout variant="info" title={`${d.domain} is on the internet`}>
          <p>It has a public endpoint, so it needs no private network{d.endpoint && !d.endpoint.endsWith(new URL(source.url).host) ? `: its address is ${d.endpoint}` : ""}.</p>
        </Callout>
      )}

      {plan?.available && d && plan.replaced && (
        <Callout variant="warning" title="This source's domain no longer exists">
          <p>
            Its address points at a domain that was deleted or replaced. This AWS account has <strong>{d.domain}</strong>, with a similar name: if it
            replaced the old one, reading through it below also moves this source to its endpoint.
          </p>
        </Callout>
      )}

      {plan?.available && d?.vpc_only && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-3">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-xs text-zinc-400">Domain</dt><dd className="wrap-anywhere text-zinc-200">{d.domain} ({d.region})</dd></div>
            <div className="min-w-0"><dt className="text-xs text-zinc-400">VPC</dt><dd className="wrap-anywhere font-mono text-zinc-200">{d.vpc_id}</dd></div>
            <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-zinc-400">Endpoint</dt><dd className="wrap-anywhere font-mono text-zinc-200">{d.endpoint}</dd></div>
            <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-zinc-400">Subnets</dt><dd className="wrap-anywhere font-mono text-zinc-200">{d.subnet_ids.join(", ")}</dd></div>
          </dl>

          {s?.exists && s.network && current !== s.network && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-zinc-300">Private network {s.network} already runs in this VPC.</p>
              <button type="button" className={primaryButton} disabled={busy !== ""} onClick={() => use(s.network!, d.endpoint)}>
                {busy === "use" ? "Checking…" : `Read through private network ${s.network}`}
              </button>
            </div>
          )}
          {s && !s.exists && s.network && !proposed && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-300">
                No private network runs in this VPC yet. Adding <strong>private network {s.network}</strong> deploys the read-only lookup function into the
                domain&apos;s subnets with its own security group. It waits in Settings, System for an admin to confirm, like a version update.
              </p>
              <div>
                <button type="button" className={primaryButton} disabled={busy !== ""} onClick={() => add(s.parameter, s.option_value, s.network!)}>
                  {busy === "add" ? "Preparing…" : `Add private network ${s.network}`}
                </button>
              </div>
            </div>
          )}
          {proposed && (
            <Callout variant="success" title={`Private network ${proposed} is prepared`}>
              <p>
                Confirm it in <Link href="/settings/system" className={linkButton}>Settings, System</Link>. Once it has applied, come back and choose{" "}
                <strong>Read through private network {proposed}</strong>.
              </p>
            </Callout>
          )}
          {s && !s.exists && !s.network && (
            <p className="text-sm text-amber-300">All three private networks are in use. Remove one in Settings, System, or read this cluster through a network already in its VPC.</p>
          )}

          {access && (
            access.allowed ? (
              <p className="text-sm text-emerald-300">The domain&apos;s security group already lets private network {access.network} in on port 443.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-zinc-300">
                  {access.allowed === false
                    ? `The domain's security group doesn't let private network ${access.network} in yet. An AWS admin adds one inbound rule: tcp 443 from the network's security group.`
                    : `Coderhelm couldn't read the domain's security group. If Test stops at "Connect on the port", an AWS admin adds this rule: tcp 443 from the network's security group.`}
                </p>
                {access.rules.map((r) => (
                  <div key={r.target_group} className="flex min-w-0 flex-col gap-2">
                    <a href={r.console_url} target="_blank" rel="noreferrer" className={linkButton}>
                      Open {r.target_group} in the AWS console
                    </a>
                    <CodeBlock code={r.command} lang="bash" title="Or run" label="The security group rule as a command" wrap />
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {current && (
          <button type="button" className={secondaryButton} onClick={onTest}>
            Test connection
          </button>
        )}
        {current && (
          <button type="button" className={secondaryButton} disabled={busy !== ""} onClick={() => use("")}>
            {busy === "internet" ? "Checking…" : "Read over the internet instead"}
          </button>
        )}
        <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
      </div>
    </div>
  );
}
