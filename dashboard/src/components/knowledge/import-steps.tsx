"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/select";
import { buttonClass, focusRing, inputClass, linkButton, secondaryButton } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import {
  KB_ARN,
  connectProblem,
  fileSize,
  knowledge,
  type BedrockDataSource,
  type BedrockImport,
  type BedrockStart,
  type ConnectProblem,
  type KnowledgeLimits,
  type PickerNode,
  type S3Place,
  type SearchToolServer,
  type Selected,
  type SourceKind,
} from "@/lib/knowledge";
import { SourceLogo } from "./logos";

// The add flow's steps for bringing in an existing knowledge base:
//
// - a search tool the team already runs, through its MCP server on Connected
//   apps, connected in place (searched live, nothing copied);
// - an S3 bucket (or folders of one), imported and kept in sync;
// - what a Bedrock knowledge base was built from (its S3 data sources),
//   imported the same way;
// - an archive (.zip) of a Notion, Confluence or docs export.
//
// Each step only gathers the choice; the flow names the base and saves.

/** The note shown before anything from an archive is uploaded. */
export const ARCHIVE_WARNING =
  "Every page in the archive becomes readable by everyone who can read this knowledge base. A Confluence Full Export also includes pages that are restricted in Confluence.";

const notice = "rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200";

// ── A search tool through MCP ───────────────────────────────────────

export interface McpChoice {
  server: SearchToolServer;
  search_tool: string;
  fetch_tool: string;
}

export function McpStep({ value, onChange }: { value: McpChoice | null; onChange: (c: McpChoice | null) => void }) {
  const [servers, setServers] = useState<SearchToolServer[] | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    knowledge
      .searchTools()
      .then((r) => {
        if (stop) return;
        setServers(r.servers);
        setConnected(r.connected);
      })
      .catch((e) => !stop && setLoadError(errorMessage(e, "Couldn't load your Connected apps.")));
    return () => {
      stop = true;
    };
  }, []);
  const pick = (s: SearchToolServer) =>
    onChange({ server: s, search_tool: s.search_tool ?? s.tools[0]?.name ?? "", fetch_tool: s.fetch_tool ?? "" });
  return (
    <div className="space-y-5" data-testid="mcp-step">
      <p className="text-sm leading-relaxed text-zinc-400">
        Already run a search tool with an MCP server (Glean, Atlassian Rovo, Azure AI Search, Pinecone Assistant, your own)? Connect it in place: Chat and the agents search it live through
        that server, and nothing is copied. It answers alongside your other knowledge bases.
      </p>
      {loadError && <p className="text-sm text-amber-300">{loadError}</p>}
      {servers === null && !loadError && <div className="h-24 animate-pulse rounded-xl bg-zinc-900/60 motion-reduce:animate-none" role="status" aria-label="Loading" />}
      {servers && servers.length === 0 && (
        <p className={notice} data-testid="mcp-none">
          No MCP servers yet. Add the search tool&apos;s MCP server on{" "}
          <Link href="/connections" className={linkButton} target="_blank" rel="noopener noreferrer">
            Connected accounts
          </Link>{" "}
          first, then come back here.
        </p>
      )}
      {servers && servers.length > 0 && (
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800" role="radiogroup" aria-label="MCP servers" data-testid="mcp-servers">
          {servers.map((s) => {
            const on = value?.server.id === s.id;
            const used = connected.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={used}
                  onClick={() => pick(s)}
                  data-testid="mcp-option"
                  className={`flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors motion-reduce:transition-none disabled:opacity-50 ${focusRing} ${on ? "bg-zinc-800" : "hover:bg-zinc-800/60"}`}
                >
                  <span aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 rounded-full border ${on ? "border-emerald-400 bg-emerald-400" : "border-zinc-600"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-100">{s.name}</span>
                    <span className="block truncate text-xs text-zinc-400">
                      {used
                        ? "Already connected"
                        : `${s.sharing === "personal" ? "Each person signs in" : "One team connection"}${s.search_tool ? `, searches with ${s.search_tool}` : ""}`}
                    </span>
                  </span>
                  {!s.connected && !used && <span className="shrink-0 text-xs text-amber-300">not signed in</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {value && (
        <div className="space-y-3" data-testid="mcp-tools">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">The tool that searches</span>
            <Select
              className="w-full"
              value={value.search_tool}
              onChange={(t) => onChange({ ...value, search_tool: t })}
              data-testid="mcp-search-tool"
              options={value.server.tools.map((t) => ({ value: t.name, label: t.name }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">The tool that reads a whole result (optional)</span>
            <Select
              className="w-full"
              value={value.fetch_tool}
              onChange={(t) => onChange({ ...value, fetch_tool: t })}
              data-testid="mcp-fetch-tool"
              options={[{ value: "", label: "None: use the search results as they are" }, ...value.server.tools.map((t) => ({ value: t.name, label: t.name }))]}
            />
          </label>
          {value.server.sharing === "personal" ? (
            <p className="text-sm leading-relaxed text-zinc-400" data-testid="mcp-per-person">
              Each person&apos;s search uses their own sign-in, so they only see what that tool lets them see. Agent runs search as the person who started them; runs nobody started skip it.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-zinc-400" data-testid="mcp-team">
              Searches use the team&apos;s one connection: everyone who can read this knowledge base sees what that connection can see.
            </p>
          )}
          {!value.server.connected && (
            <p className={notice} data-testid="mcp-not-signed-in">
              {value.server.sharing === "personal" ? "You aren't signed in to this server yet." : "The team's connection to this server isn't working."} Sign in on{" "}
              <Link href="/connections" className={linkButton} target="_blank" rel="noopener noreferrer">
                Connected accounts
              </Link>{" "}
              so the test search can run.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Amazon S3 ───────────────────────────────────────────────────────

/** Loads the team's AWS accounts once (Bedrock's start covers them). */
function useAccounts() {
  const [start, setStart] = useState<BedrockStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    knowledge
      .bedrock()
      .then((r) => !stop && setStart(r))
      .catch((e) => !stop && setError(errorMessage(e, "Couldn't load your AWS accounts.")));
    return () => {
      stop = true;
    };
  }, []);
  return { start, error };
}

export const WHOLE_BUCKET = "/";

export function S3Step({
  place,
  onPlace,
  picked,
  onPicked,
}: {
  place: S3Place;
  onPlace: (p: S3Place) => void;
  picked: Selected[];
  onPicked: (s: Selected[]) => void;
}) {
  const { start, error } = useAccounts();
  const [path, setPath] = useState<string[]>([]);
  const [nodes, setNodes] = useState<PickerNode[] | null>(null);
  const [problem, setProblem] = useState<ConnectProblem | null>(null);
  const [loading, setLoading] = useState(false);
  const accounts = start?.accounts ?? [];
  // The first account is picked for you.
  const seeded = useRef(false);
  useEffect(() => {
    const first = start?.accounts[0];
    if (seeded.current || !first || place.account) return;
    seeded.current = true;
    onPlace({ ...place, account: first.account, region: place.region || first.region });
  }, [start, place, onPlace]);

  const open = async (parent: string | null, trail: string[]) => {
    setLoading(true);
    setProblem(null);
    try {
      const r = await knowledge.browseS3(place, parent);
      setNodes(r.nodes);
      setPath(trail);
    } catch (e) {
      setProblem(connectProblem(e, "Couldn't read the bucket."));
      setNodes(null);
    } finally {
      setLoading(false);
    }
  };
  const ready = /^\d{12}$/.test(place.account) && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(place.bucket) && !!place.region;
  const whole = picked.some((p) => p.id === WHOLE_BUCKET);
  const toggle = (n: PickerNode) => {
    const on = picked.some((p) => p.id === n.id);
    onPicked(on ? picked.filter((p) => p.id !== n.id) : [...picked.filter((p) => p.id !== WHOLE_BUCKET), { id: n.id, title: n.title, kind: n.kind, path, include_children: true }]);
  };
  return (
    <div className="space-y-5" data-testid="s3-step">
      <p className="text-sm leading-relaxed text-zinc-400">
        Coderhelm reads the bucket with the CoderHelmLogReader role in that account. The bucket must be named in the role&apos;s update stack; if it isn&apos;t yet, the link Coderhelm
        shows does it. Documents are indexed here and kept in sync: changed ones are read again and deleted ones removed.
      </p>
      {error && <p className="text-sm text-amber-300">{error}</p>}
      {start && accounts.length === 0 && (
        <p className={notice} data-testid="s3-no-account">
          No AWS account is connected yet. Connect one on{" "}
          <Link href="/settings/integrations/aws" className={linkButton} target="_blank" rel="noopener noreferrer">
            Integrations, AWS
          </Link>{" "}
          first.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-zinc-400">AWS account</span>
          <Select
            className="w-full"
            value={place.account}
            onChange={(a) => onPlace({ ...place, account: a, region: accounts.find((x) => x.account === a)?.region ?? place.region })}
            data-testid="s3-account"
            options={accounts.map((a) => ({ value: a.account, label: a.account }))}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Bucket</span>
          <input
            className={inputClass}
            value={place.bucket}
            onChange={(e) => {
              onPlace({ ...place, bucket: e.target.value.trim() });
              setNodes(null);
              onPicked([]);
            }}
            placeholder="team-docs"
            spellCheck={false}
            autoComplete="off"
            data-testid="s3-bucket"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Region</span>
          <input className={inputClass} value={place.region} onChange={(e) => onPlace({ ...place, region: e.target.value.trim() })} placeholder="us-east-1" spellCheck={false} data-testid="s3-region" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={secondaryButton} disabled={!ready || loading} onClick={() => open(null, [])} data-testid="s3-browse">
          {loading && !nodes ? "Reading the bucket…" : "Show folders"}
        </button>
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input
            type="checkbox"
            className="accent-emerald-500"
            checked={whole}
            disabled={!ready}
            onChange={(e) => onPicked(e.target.checked ? [{ id: WHOLE_BUCKET, title: place.bucket, kind: "prefix", path: [], include_children: true }] : [])}
            data-testid="s3-whole"
          />
          The whole bucket
        </label>
      </div>
      {problem && <ImportProblem problem={problem} />}
      {nodes && (
        <div data-testid="s3-tree">
          {path.length > 0 && (
            <p className="mb-2 flex min-w-0 flex-wrap items-center gap-1 text-xs text-zinc-400">
              <button type="button" className={linkButton} onClick={() => open(null, [])}>
                {place.bucket}
              </button>
              {path.map((p, i) => (
                <span key={p} className="min-w-0 truncate">
                  {" / "}
                  {p}
                </span>
              ))}
            </p>
          )}
          {nodes.length === 0 ? (
            <p className="text-sm text-zinc-400">Nothing here.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800">
              {nodes.map((n) => {
                const on = whole || picked.some((p) => p.id === n.id);
                return (
                  <li key={n.id} className="flex min-w-0 items-center gap-3 px-3 py-2" data-testid="s3-node">
                    <input type="checkbox" className="accent-emerald-500" checked={on} disabled={!n.selectable || whole} onChange={() => toggle(n)} aria-label={`Bring in ${n.title}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-100">{n.title}</span>
                      <span className="block truncate text-xs text-zinc-400">{n.detail || (n.kind === "prefix" ? "Folder, with everything inside" : n.bytes ? fileSize(n.bytes) : "File")}</span>
                    </span>
                    {n.has_children && (
                      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => open(n.id, [...path, n.title])} aria-label={`Open ${n.title}`}>
                        Open
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-zinc-400">
        PDF, Word, Markdown, text, spreadsheets and web pages. A <code>&lt;file&gt;.metadata.json</code> next to a document (as Bedrock data sources have) gives its title, link and date.
      </p>
    </div>
  );
}

/** An import that couldn't read, what to do, and the one-click role update when that is all it needs. */
export function ImportProblem({ problem }: { problem: ConnectProblem }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm leading-relaxed" role="alert" data-testid="import-problem" data-code={problem.code}>
      <p className="font-medium text-red-200">{problem.message}</p>
      {problem.fix && <p className="mt-1 text-zinc-300">{problem.fix}</p>}
      {problem.grant && (
        <div className="mt-3 space-y-2">
          <a href={problem.grant.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")} data-testid="import-grant">
            Update the role in one click
          </a>
          <p className="text-xs text-zinc-400">
            Sign in to AWS account {problem.grant.account} and create the stack {problem.grant.stack_name}. It lets the CoderHelmLogReader role read the buckets you import from, read-only.
            Then try again.
          </p>
        </div>
      )}
    </div>
  );
}

// ── A Bedrock knowledge base's data sources ─────────────────────────

export interface ImportPlan {
  info: BedrockImport;
  /** The data sources to import (importable ones). */
  chosen: BedrockDataSource[];
}

export function BedrockImportStep({
  plan,
  onPlan,
  onUseInstead,
}: {
  plan: ImportPlan | null;
  onPlan: (p: ImportPlan | null) => void;
  onUseInstead: (k: SourceKind) => void;
}) {
  const { start } = useAccounts();
  const [arn, setArn] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ConnectProblem | null>(null);
  const look = async (target = arn) => {
    setBusy(true);
    setProblem(null);
    onPlan(null);
    try {
      const info = await knowledge.bedrockImport(target.trim());
      onPlan({ info, chosen: info.data_sources.filter((d) => d.importable) });
    } catch (e) {
      setProblem(connectProblem(e, "Couldn't read the knowledge base."));
    } finally {
      setBusy(false);
    }
  };
  const trimmed = arn.trim();
  const bad = trimmed !== "" && !KB_ARN.test(trimmed);
  return (
    <div className="space-y-5" data-testid="bedrock-import-step">
      <p className="text-sm leading-relaxed text-zinc-400">
        Coderhelm reads the documents in the knowledge base&apos;s S3 data source and indexes them itself. Nothing in Bedrock changes. To search it live instead, without copying, connect the
        Bedrock knowledge base in place.
      </p>
      {start?.install && !!start.bases?.length && (
        <ul className="max-h-48 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800" aria-label="Knowledge bases in this account">
          {start.bases.map((b) => (
            <li key={b.arn}>
              <button
                type="button"
                className={`flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-800/60 ${focusRing}`}
                onClick={() => {
                  setArn(b.arn);
                  void look(b.arn);
                }}
                data-testid="bedrock-import-option"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{b.name}</span>
                <span className="shrink-0 text-xs text-zinc-400">{b.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className={`${inputClass} min-w-0 flex-1 text-sm`}
          value={arn}
          onChange={(e) => setArn(e.target.value)}
          placeholder="arn:aws:bedrock:us-east-1:111122223333:knowledge-base/ABCDE12345"
          spellCheck={false}
          autoComplete="off"
          aria-label="Knowledge base ARN"
          data-testid="bedrock-import-arn"
        />
        <button type="button" className={secondaryButton} disabled={!KB_ARN.test(trimmed) || busy} onClick={() => look()} data-testid="bedrock-import-look">
          {busy ? "Reading…" : "Find its data"}
        </button>
      </div>
      {bad && (
        <p className="text-sm text-amber-300" role="alert">
          That isn&apos;t a knowledge base ARN. It looks like arn:aws:bedrock:us-east-1:111122223333:knowledge-base/ABCDE12345.
        </p>
      )}
      {problem && <ImportProblem problem={problem} />}
      {plan && (
        <div data-testid="bedrock-import-sources">
          <p className="mb-2 text-sm font-medium text-zinc-300">
            {plan.info.name}: {plan.info.data_sources.length} data source{plan.info.data_sources.length === 1 ? "" : "s"}
          </p>
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {plan.info.data_sources.map((d) => {
              const on = plan.chosen.some((c) => c.id === d.id);
              return (
                <li key={d.id} className="flex min-w-0 items-start gap-3 px-3 py-2.5" data-testid="bedrock-data-source" data-importable={d.importable}>
                  {d.importable ? (
                    <input
                      type="checkbox"
                      className="mt-1 accent-emerald-500"
                      checked={on}
                      aria-label={`Import ${d.name}`}
                      onChange={() => onPlan({ ...plan, chosen: on ? plan.chosen.filter((c) => c.id !== d.id) : [...plan.chosen, d] })}
                    />
                  ) : (
                    <span className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-100">
                      {d.name} <span className="text-xs text-zinc-400">{d.type}</span>
                    </span>
                    <span className="block text-xs leading-relaxed text-zinc-400 [overflow-wrap:anywhere]">
                      {d.importable ? `s3://${d.bucket}/${d.prefixes.length ? d.prefixes.join(", ") : ""}` : d.note}
                    </span>
                  </span>
                  {!d.importable && d.use_instead && (
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => onUseInstead(d.use_instead as SourceKind)} data-testid="bedrock-use-instead">
                      Use {d.use_instead === "confluence" ? "Confluence" : "Website"} instead
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── An archive (.zip) ───────────────────────────────────────────────

export function archiveProblem(f: File, limits: KnowledgeLimits | null): string | null {
  if (!/\.zip$/i.test(f.name)) return "Choose a .zip file: a Notion or Confluence export, or a zipped docs folder.";
  if (f.size === 0) return "That archive is empty.";
  const max = limits?.max_archive_bytes ?? 0;
  if (max && f.size > max) return `That archive is larger than ${Math.round(max / (1024 * 1024))} MB.`;
  return null;
}

export function ArchiveStep({ limits, file, onFile }: { limits: KnowledgeLimits | null; file: File | null; onFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const take = (f: File | undefined) => {
    if (!f) return;
    const p = archiveProblem(f, limits);
    setError(p);
    onFile(p ? null : f);
  };
  return (
    <div className="space-y-5" data-testid="archive-step">
      <p className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200" role="note" data-testid="archive-warning">
        {ARCHIVE_WARNING}
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          take(e.dataTransfer.files[0]);
        }}
        className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-6 py-10 text-center"
      >
        <SourceLogo kind="archive" size="lg" />
        <p className="mt-4 text-sm font-medium text-zinc-100">{file ? file.name : "Drop a .zip here"}</p>
        <p className="mt-1 text-xs text-zinc-400">
          {file
            ? fileSize(file.size)
            : `Notion Markdown and CSV exports, Confluence HTML exports, or a zipped docs folder${limits?.max_archive_bytes ? `, up to ${Math.round(limits.max_archive_bytes / (1024 * 1024))} MB` : ""}`}
        </p>
        <button type="button" className={`${secondaryButton} mt-4`} onClick={() => input.current?.click()}>
          {file ? "Choose another" : "Choose the archive"}
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          aria-label="Choose the archive"
          data-testid="archive-input"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="text-sm text-amber-300" role="alert" data-testid="archive-bad">
          {error}
        </p>
      )}
      <p className="text-xs leading-relaxed text-zinc-400">
        Coderhelm unpacks it and reads every page. To bring in a newer export later, upload it to the same source: unchanged pages are kept, changed ones read again and missing ones
        removed.
      </p>
    </div>
  );
}
