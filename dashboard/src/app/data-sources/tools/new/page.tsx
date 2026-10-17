"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Field } from "@/components/field";
import { Segmented } from "@/components/segmented";
import { RunResult } from "@/components/tools";
import { useToast } from "@/components/toast";
import { inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { api, type DataSource } from "@/lib/api";
import { KIND_LABEL, toolsApi, type InputType, type ToolCheck, type ToolDef, type ToolKind, type ToolRunResult } from "@/lib/tools";

export default function NewToolPageGuarded() {
  return (
    <RoleGuard minRole="admin">
      <Suspense fallback={null}>
        <NewToolPage />
      </Suspense>
    </RoleGuard>
  );
}

interface InputRow {
  name: string;
  type: InputType;
  rule: "pattern" | "allowed";
  pattern: string;
  allowed: string;
  min: string;
  max: string;
  example: string;
}

const EMPTY_ROW: InputRow = { name: "", type: "string", rule: "pattern", pattern: "", allowed: "", min: "", max: "", example: "" };

const KINDS_FOR: Record<string, ToolKind[]> = { database: ["sql"], api: ["graphql", "http"], logs: ["logs"] };

const READ_HELP: Record<ToolKind, string> = {
  sql: "One SELECT. Put each input where a value goes as :name, for example WHERE o.number = :order_number. Values are sent as parameters, never pasted into the SQL.",
  graphql: "One query. Declare each input as a variable, for example query Q($order_number: String!) { … }.",
  logs: "One Logs Insights search. Put each input in braces, for example filter @message like /{order_number}/. Inputs may only hold letters, digits, spaces and . _ : @ -.",
  http: "A path on your API's own address, starting with /. Put each input in braces, for example /orders/{order_number}. Values are URL-encoded.",
};

function rowsFrom(def: ToolDef): InputRow[] {
  return Object.entries(def.inputs).map(([name, s]) => ({
    name,
    type: s.type,
    rule: s.allowed?.length ? "allowed" : "pattern",
    pattern: s.pattern ?? "",
    allowed: (s.allowed ?? []).join(", "),
    min: s.min?.toString() ?? "",
    max: s.max?.toString() ?? "",
    example: String(s.example ?? ""),
  }));
}

function buildDef(f: {
  name: string; useWhen: string; source: string; kind: ToolKind; read: string; rows: InputRow[];
  maxRows: string; askFirst: boolean; repos: string; logGroups: string; since: string; database: string;
}): ToolDef {
  const inputs: ToolDef["inputs"] = {};
  for (const r of f.rows) {
    if (!r.name.trim()) continue;
    const base = { type: r.type, example: r.type === "integer" ? Number(r.example) : r.example };
    if (r.type === "integer") inputs[r.name.trim()] = { ...base, min: Number(r.min), max: Number(r.max) };
    else if (r.type === "date") inputs[r.name.trim()] = base;
    else if (r.rule === "allowed") inputs[r.name.trim()] = { ...base, allowed: r.allowed.split(",").map((x) => x.trim()).filter(Boolean) };
    else inputs[r.name.trim()] = { ...base, pattern: r.pattern };
  }
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const def: ToolDef = { name: f.name.trim(), use_when: f.useWhen.trim(), source: f.source, kind: f.kind, read: f.read, inputs };
  if (f.maxRows.trim()) def.max_rows = Number(f.maxRows);
  if (f.askFirst) def.ask_me_first = true;
  if (list(f.repos).length) def.repos = list(f.repos);
  if (f.kind === "logs") {
    def.log_groups = list(f.logGroups);
    if (f.since.trim()) def.since = f.since.trim();
  }
  if (f.database.trim()) def.database = f.database.trim();
  return def;
}

function NewToolPage() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from");
  const { toast } = useToast();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [mode, setMode] = useState<"form" | "yaml">("form");
  const [name, setName] = useState("");
  const [useWhen, setUseWhen] = useState("");
  const [source, setSource] = useState("");
  const [kind, setKind] = useState<ToolKind>("sql");
  const [read, setRead] = useState("");
  const [rows, setRows] = useState<InputRow[]>([{ ...EMPTY_ROW }]);
  const [maxRows, setMaxRows] = useState("");
  const [askFirst, setAskFirst] = useState(false);
  const [repos, setRepos] = useState("");
  const [logGroups, setLogGroups] = useState("");
  const [since, setSince] = useState("24h");
  const [database, setDatabase] = useState("");
  const [yaml, setYaml] = useState("");
  const [check, setCheck] = useState<ToolCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ example: ToolRunResult; name: string } | null>(null);
  const [saveError, setSaveError] = useState<{ message: string; problems?: string[] } | null>(null);

  useEffect(() => {
    api.listDataSources().then((r) => setSources(r.sources)).catch(() => setSources([]));
  }, []);

  // Editing: start from the latest version of an existing tool.
  useEffect(() => {
    if (!from) return;
    toolsApi.get(from).then((r) => {
      const d = r.versions.find((v) => v.hash === r.tool.latest)?.def;
      if (!d) return;
      setName(d.name); setUseWhen(d.use_when); setSource(d.source); setKind(d.kind); setRead(d.read); setRows(rowsFrom(d));
      setMaxRows(d.max_rows?.toString() ?? ""); setAskFirst(!!d.ask_me_first); setRepos((d.repos ?? []).join(", "));
      setLogGroups((d.log_groups ?? []).join(", ")); setSince(d.since ?? "24h"); setDatabase(d.database ?? "");
    }).catch(() => {});
  }, [from]);

  const src = sources.find((s) => s.name === source || s.id === source);
  const kinds = src ? KINDS_FOR[src.kind] ?? [] : (["sql", "graphql", "logs", "http"] as ToolKind[]);
  useEffect(() => {
    if (src && !kinds.includes(kind)) setKind(kinds[0]);
  }, [src, kinds, kind]);

  const def = useMemo(
    () => buildDef({ name, useWhen, source, kind, read, rows, maxRows, askFirst, repos, logGroups, since, database }),
    [name, useWhen, source, kind, read, rows, maxRows, askFirst, repos, logGroups, since, database],
  );
  const payload: ToolDef | string = mode === "yaml" ? yaml : def;
  const ready = mode === "yaml" ? yaml.trim().length > 0 : !!(name && source && read);

  // Live check, a moment after typing stops.
  const seq = useRef(0);
  useEffect(() => {
    if (!ready) {
      setCheck(null);
      return;
    }
    const n = ++seq.current;
    setChecking(true);
    const t = setTimeout(() => {
      toolsApi
        .check(payload)
        .then((c) => n === seq.current && setCheck(c))
        .catch((e) => n === seq.current && setCheck({ ok: false, problems: [e instanceof Error ? e.message : "The check failed."] }))
        .finally(() => n === seq.current && setChecking(false));
    }, 500);
    return () => clearTimeout(t);
  }, [payload, ready]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await toolsApi.save(payload);
      setSaved({ example: r.example, name: r.tool.name });
      toast("Saved. It waits for another admin's approval.");
    } catch (e) {
      const err = e as Error & { problems?: string[] };
      setSaveError({ message: err.message, problems: err.problems });
    } finally {
      setSaving(false);
    }
  };

  const setRow = (i: number, patch: Partial<InputRow>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (saved) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-100">{saved.name} is saved</h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-400">
          Coderhelm ran it once with your example inputs. Another admin now reviews this exact version and approves it; agents can&apos;t
          use it until then. Any later edit is a new version that needs approval again.
        </p>
        <div className="mt-6">
          <RunResult run={saved.example} label="Example run" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className={primaryButton} onClick={() => router.push(`/data-sources/tools/tool?name=${encodeURIComponent(saved.name)}`)}>
            Open the tool
          </button>
          <Link href="/data-sources/tools" className={secondaryButton}>Back to tools</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link href="/data-sources/tools" className={`${linkButton} text-sm`}>Back to tools</Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-100">{from ? `Edit ${from}` : "New tool"}</h1>
      <p className="mt-2 max-w-prose text-sm text-zinc-400">
        A tool is one fixed read on a source you connected. Coderhelm fills in only the inputs you declare, and only with values that
        match their type. It is checked as you type, run once with your examples when you save, and then waits for another admin.
      </p>

      <div className="mt-6">
        <Segmented label="Write it as" options={[{ value: "form", label: "Form" }, { value: "yaml", label: "YAML" }]} value={mode} onChange={setMode} />
      </div>

      {mode === "yaml" ? (
        <div className="mt-5">
          <Field id="tool-yaml" label="Definition" helper="The same format as a file in .coderhelm/tools/ in your repo.">
            {(p) => (
              <textarea {...p} rows={18} value={yaml} onChange={(e) => setYaml(e.target.value)} spellCheck={false}
                placeholder={"name: find_order_by_number\nuse_when: A ticket mentions an order number.\nsource: Orders database\nkind: sql\nread: SELECT id, status FROM orders WHERE number = :order_number\ninputs:\n  order_number: { type: string, pattern: \"[A-Z]{2}-[0-9]{4,10}\", example: \"OR-102938\" }"}
                className={`${inputClass} font-mono text-xs`} />
            )}
          </Field>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <Field id="tool-name" label="Name" helper="Lowercase letters, digits and _. Agents see it as tool_<name>.">
            {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="find_order_by_number" className={`${inputClass} font-mono`} />}
          </Field>
          <Field id="tool-use" label="When to use it" helper="One sentence. Coderhelm reads this to decide when the tool helps.">
            {(p) => <input {...p} value={useWhen} onChange={(e) => setUseWhen(e.target.value)} placeholder="A ticket or PR mentions an order number and you need its status." className={inputClass} />}
          </Field>
          <Field id="tool-source" label="Source">
            {(p) => (
              <select {...p} value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
                <option value="">Choose a connected source</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            )}
          </Field>
          {kinds.length > 1 && (
            <Segmented label="Kind" options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={kind} onChange={setKind} />
          )}
          <Field id="tool-read" label={kind === "http" ? "Path" : "The read"} helper={READ_HELP[kind]}>
            {(p) => <textarea {...p} rows={kind === "http" ? 2 : 6} value={read} onChange={(e) => setRead(e.target.value)} spellCheck={false} className={`${inputClass} font-mono text-xs`} />}
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-zinc-100">Inputs</legend>
            <p className="mb-3 max-w-prose text-sm text-zinc-400">
              Text needs a pattern the whole value must match, or a list of allowed values. Numbers need a range. Each needs an example,
              used for the run your approver sees.
            </p>
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 sm:grid-cols-2">
                  <input aria-label={`Input ${i + 1} name`} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="order_number" className={`${inputClass} font-mono`} />
                  <select aria-label={`Input ${i + 1} type`} value={r.type} onChange={(e) => setRow(i, { type: e.target.value as InputType })} className={inputClass}>
                    <option value="string">Text</option>
                    <option value="integer">Whole number</option>
                    <option value="date">Date</option>
                  </select>
                  {r.type === "string" && (
                    <>
                      <select aria-label={`Input ${i + 1} rule`} value={r.rule} onChange={(e) => setRow(i, { rule: e.target.value as InputRow["rule"] })} className={inputClass}>
                        <option value="pattern">Must match a pattern</option>
                        <option value="allowed">One of a list</option>
                      </select>
                      {r.rule === "pattern" ? (
                        <input aria-label={`Input ${i + 1} pattern`} value={r.pattern} onChange={(e) => setRow(i, { pattern: e.target.value })} placeholder="[A-Z]{2}-[0-9]{4,10}" className={`${inputClass} font-mono`} />
                      ) : (
                        <input aria-label={`Input ${i + 1} allowed values`} value={r.allowed} onChange={(e) => setRow(i, { allowed: e.target.value })} placeholder="open, closed, refunded" className={inputClass} />
                      )}
                    </>
                  )}
                  {r.type === "integer" && (
                    <>
                      <input aria-label={`Input ${i + 1} minimum`} inputMode="numeric" value={r.min} onChange={(e) => setRow(i, { min: e.target.value })} placeholder="Minimum" className={inputClass} />
                      <input aria-label={`Input ${i + 1} maximum`} inputMode="numeric" value={r.max} onChange={(e) => setRow(i, { max: e.target.value })} placeholder="Maximum" className={inputClass} />
                    </>
                  )}
                  <input aria-label={`Input ${i + 1} example`} value={r.example} onChange={(e) => setRow(i, { example: e.target.value })} placeholder={r.type === "date" ? "2026-01-31" : "Example value"} className={inputClass} />
                  <button type="button" className={`${linkButton} justify-self-start`} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
                    Remove input
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className={`${secondaryButton} mt-3`} onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}>Add an input</button>
          </fieldset>

          {kind === "logs" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="tool-groups" label="Log groups" helper="Exact names, separated by commas. Only groups this source shares.">
                {(p) => <input {...p} value={logGroups} onChange={(e) => setLogGroups(e.target.value)} placeholder="/ecs/api" className={`${inputClass} font-mono`} />}
              </Field>
              <Field id="tool-since" label="How far back" helper="15m, 2h, 3d; at most two weeks.">
                {(p) => <input {...p} value={since} onChange={(e) => setSince(e.target.value)} className={inputClass} />}
              </Field>
            </div>
          )}
          {src?.aws?.engine === "redshift" && (src.aws.databases?.length ?? 0) > 1 && (
            <Field id="tool-db" label="Warehouse database">
              {(p) => (
                <select {...p} value={database} onChange={(e) => setDatabase(e.target.value)} className={inputClass}>
                  <option value="">Choose one</option>
                  {src.aws?.databases?.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
            </Field>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="tool-rows" label="Most rows" helper="1 to 200; 50 if empty.">
              {(p) => <input {...p} inputMode="numeric" value={maxRows} onChange={(e) => setMaxRows(e.target.value)} className={inputClass} />}
            </Field>
            <Field id="tool-repos" label="Repos" helper="owner/name, separated by commas. Empty means every repo.">
              {(p) => <input {...p} value={repos} onChange={(e) => setRepos(e.target.value)} placeholder="your-team/web" className={inputClass} />}
            </Field>
          </div>
          <label className="flex items-start gap-3 text-sm text-zinc-300">
            <input type="checkbox" checked={askFirst} onChange={(e) => setAskFirst(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" />
            <span>
              <span className="font-semibold text-zinc-100">Ask me first.</span> Each time Coderhelm wants to run it, an admin sees exactly what
              will run and says yes or no. It waits up to 10 minutes.
            </span>
          </label>
        </div>
      )}

      <section aria-label="Check" className="mt-6">
        {!ready ? (
          <p className="text-sm text-zinc-500">Fill in a name, a source and the read to check it.</p>
        ) : checking && !check ? (
          <p role="status" className="text-sm text-zinc-500">Checking…</p>
        ) : check?.ok ? (
          <Callout variant="success" title="It passes its checks">
            <p>Agents will see it as <code className="font-mono">{check.function}</code>. This is exactly what will be sent:</p>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">{check.sent}</pre>
          </Callout>
        ) : check ? (
          <Callout variant="warning" title="Not yet">
            <ul className="list-disc pl-5">
              {(check.problems ?? []).map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </Callout>
        ) : null}
      </section>

      {saveError && (
        <div className="mt-4">
          <Callout variant="error" title="It wasn't saved">
            <p>{saveError.message}</p>
            {saveError.problems && <ul className="mt-1 list-disc pl-5">{saveError.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          </Callout>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={primaryButton} disabled={!check?.ok || saving} onClick={save}>
          {saving ? "Running the example…" : "Save and run the example"}
        </button>
        <Link href="/data-sources/tools" className={secondaryButton}>Cancel</Link>
      </div>
    </div>
  );
}
