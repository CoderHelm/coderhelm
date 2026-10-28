"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { LearningExemplar, LearningExemplarUse } from "@/lib/api";
import { Chip, ListEmpty, ListSkeleton, SearchField, StatusToggles, Time, formatDate, type Tone } from "@/components/list";
import { Drawer } from "@/components/drawer";
import { Markdown } from "@/components/markdown";
import { Code } from "@/components/settings/code";
import { Section } from "@/components/page";
import { Select } from "@/components/select";
import { focusRing, linkButton, secondaryButton } from "@/components/ui";

// "Examples in use": the past work the agents read before a review or a
// change. One compact row each (title, why it is an example, tags, chips),
// To follow / To avoid as toggles with counts, and the whole example in a
// side panel (a full-screen sheet on a phone), the way an issue list opens
// an issue beside the list instead of printing every body inline.

const PAGE = 10;

type Polarity = "good" | "avoid";
type KindFilter = "" | "fix" | "finding";

const KIND_LABEL: Record<string, string> = { fix: "Code change", finding: "Review comment" };
const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const times = (n: number) => (n === 0 ? "Not used yet" : n === 1 ? "Used once" : `Used ${n.toLocaleString()} times`);

/** GitHub-only markup a reader never wants: HTML comments, tags, callout markers. */
function stripMarkup(md: string): string {
  return md
    .replace(/<!--\s*coderhelm:unverified\s*-->[\s\S]*?(<!--\s*\/coderhelm:unverified\s*-->|$)/g, "")
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/<\/?[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?\/?>/g, "")
    .replace(/^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gim, "")
    .replace(/^\s*Source ticket:.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One plain line: no markdown marks. */
function plainLine(md: string): string {
  return stripMarkup(md)
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ExampleView {
  e: LearningExemplar;
  title: string;
  summary: string;
  reason: string;
}

/**
 * How an example reads. The gateway sends a clean title, summary and reason;
 * an older one sends only `text` (`title: body`), read here the same way.
 */
export function viewOf(e: LearningExemplar): ExampleView {
  const fallbackReason =
    e.kind === "fix"
      ? e.polarity === "good"
        ? "Merged, with a good outcome"
        : "Closed, rewritten or reverted"
      : e.polarity === "good"
        ? "The team acted on this comment"
        : "The team dismissed it or left it open";
  if (e.title) return { e, title: e.title, summary: stripMarkup(e.summary ?? ""), reason: e.reason || fallbackReason };
  // `title: body`, where a commit type ("fix(api): ") is part of the title.
  let at = e.text.indexOf(": ");
  while (at > 0 && /^[a-z]+(\([^)]*\))?!?$/.test(e.text.slice(0, at).trim())) at = e.text.indexOf(": ", at + 2);
  const head = at > 0 && at <= 160 && !e.text.slice(0, at).includes("\n") ? e.text.slice(0, at) : "";
  const body = head ? e.text.slice(at + 2) : e.text;
  const title = plainLine(head) || plainLine(body).split(/(?<=[.?!])\s/)[0].slice(0, 120);
  const summary = stripMarkup(body)
    .replace(/^\s*(#{1,6}\s*)?(\*\*)?(summary|problem|changes?|risk|verification)(\*\*)?\s*:?\s*$/gim, "")
    .replace(/^\s*\*\*(summary|problem|changes?|risk|verification)\*\*\s*:?\s*/gim, "")
    .trim();
  return { e, title, summary, reason: e.reason || fallbackReason };
}

const prUrl = (repo: string, pr: number) => `https://github.com/${repo}/pull/${pr}`;
const runHref = (id: string) => `/runs/detail?id=${encodeURIComponent(id)}`;

/** Most used first, then the biggest reward either way. */
function byUse(a: ExampleView, b: ExampleView) {
  return b.e.uses - a.e.uses || Math.abs(b.e.reward) - Math.abs(a.e.reward) || a.title.localeCompare(b.title);
}

const tagClass = "inline-flex min-w-0 max-w-full items-center rounded border border-zinc-700 px-1.5 text-xs leading-5 text-zinc-300";
const metaLink = `relative z-10 rounded text-zinc-300 underline-offset-2 hover:text-zinc-100 hover:underline ${focusRing}`;

function ExampleRow({ v, onOpen }: { v: ExampleView; onOpen: (button: HTMLButtonElement) => void }) {
  const { e } = v;
  const tone: Tone = e.polarity === "good" ? "success" : "danger";
  // Right of the title from sm: up; at the end of the tags on a phone.
  const chips = (
    <>
      <Chip tone={tone} title={`Reward ${signed(e.reward)}${e.events ? ` from ${e.events} outcome${e.events === 1 ? "" : "s"}` : ""}`}>
        <span className="tabular-nums">{signed(e.reward)}</span>
      </Chip>
      <Chip tone={e.uses ? "neutral" : "muted"} title={times(e.uses)}>
        <span className="tabular-nums">{e.uses ? `${e.uses.toLocaleString()}×` : "Unused"}</span>
        <span className="sr-only"> {times(e.uses)}</span>
      </Chip>
    </>
  );
  return (
    // The title's button covers the whole row (its ::after), so the row is
    // one click target; the PR link sits above it.
    <li className="relative px-4 py-3 hover:bg-zinc-800/30" data-testid={`example-${e.id}`}>
      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(ev) => onOpen(ev.currentTarget)}
            title={v.title}
            className={`block w-full min-w-0 text-left text-sm font-medium text-zinc-100 after:absolute after:inset-0 after:content-[''] ${focusRing}`}
          >
            <span className="line-clamp-2 sm:line-clamp-1">{v.title}</span>
          </button>
          {/* One meta line: why it is an example, then its tags and where it came from. */}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-zinc-400">
            <span className="min-w-0 basis-full text-zinc-300 lg:basis-auto" data-testid="example-reason">
              {v.reason}
            </span>
            <span aria-hidden="true" className="hidden text-zinc-500 lg:inline">
              ·
            </span>
            <span className={tagClass}>{kindLabel(e.kind)}</span>
            {e.category && <span className={tagClass}>{e.category}</span>}
            {e.area && (
              <span className="min-w-0 max-w-full truncate" title={e.area}>
                <Code>{e.area}</Code>
              </span>
            )}
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {e.repo}
              {e.pr ? (
                <>
                  {" "}
                  <a href={prUrl(e.repo, e.pr)} target="_blank" rel="noreferrer" className={metaLink}>
                    #{e.pr}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </>
              ) : null}
            </span>
            <span className="ml-auto flex items-center gap-1.5 sm:hidden">{chips}</span>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex sm:pt-0.5">{chips}</div>
      </div>
    </li>
  );
}

function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-200 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function UseItem({ u, repo }: { u: LearningExemplarUse; repo: string }) {
  const what =
    u.run_id ? (
      <Link href={runHref(u.run_id)} className={`rounded text-zinc-200 underline underline-offset-2 hover:text-white ${focusRing}`}>
        Coding run {u.run_id.slice(-6)}
      </Link>
    ) : u.pr ? (
      <a href={prUrl(repo, u.pr)} target="_blank" rel="noreferrer" className={`rounded text-zinc-200 underline underline-offset-2 hover:text-white ${focusRing}`}>
        Review of #{u.pr}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      <span className="text-zinc-200">{u.agent === "coder" ? "A coding run" : "A review"}</span>
    );
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
      {what}
      <Time iso={u.at} className="text-xs text-zinc-400" />
    </li>
  );
}

function ExampleDetail({ v }: { v: ExampleView }) {
  const { e } = v;
  const uses = [...(e.used_by ?? [])].reverse();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={e.polarity === "good" ? "success" : "danger"}>{e.polarity === "good" ? "To follow" : "To avoid"}</Chip>
        <span className={tagClass}>{kindLabel(e.kind)}</span>
        {e.category && <span className={tagClass}>{e.category}</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Repository">{e.repo}</Fact>
        <Fact label="Pull request">
          {e.pr ? (
            <a href={prUrl(e.repo, e.pr)} target="_blank" rel="noreferrer" className={`rounded underline underline-offset-2 hover:text-white ${focusRing}`}>
              #{e.pr} on GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            "None"
          )}
        </Fact>
        {e.area && (
          <Fact label="Path" wide>
            <Code>{e.area}</Code>
          </Fact>
        )}
        {e.run_id && (
          <Fact label="Made by">
            <Link href={runHref(e.run_id)} className={`rounded underline underline-offset-2 hover:text-white ${focusRing}`}>
              The run that wrote it
            </Link>
          </Fact>
        )}
        <Fact label="Reward">
          <span className="tabular-nums">{signed(e.reward)}</span>
          {e.events ? <span className="text-zinc-400"> from {e.events} outcome{e.events === 1 ? "" : "s"}</span> : null}
        </Fact>
        <Fact label="Used">{times(e.uses)}</Fact>
        <Fact label="Last used">{e.last_used_at ? <Time iso={e.last_used_at} /> : e.uses ? "Before this was recorded" : "Never"}</Fact>
        <Fact label="Added">{formatDate(e.created_at) || "Unknown"}</Fact>
      </dl>

      <section aria-labelledby="example-summary" className="min-w-0">
        <h3 id="example-summary" className="mb-2 text-sm font-semibold text-zinc-100">
          {e.kind === "fix" ? "What the change did" : "What the comment said"}
        </h3>
        {v.summary ? (
          <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4" data-testid="example-summary">
            <Markdown>{v.summary}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Nothing more than the title.</p>
        )}
      </section>

      <section aria-labelledby="example-uses" className="min-w-0">
        <h3 id="example-uses" className="mb-1 text-sm font-semibold text-zinc-100">
          Recent uses
        </h3>
        {uses.length ? (
          <ul className="divide-y divide-zinc-800" data-testid="example-uses">
            {uses.map((u, i) => (
              <UseItem key={`${u.at}-${i}`} u={u} repo={e.repo} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">
            {e.uses ? "Used before runs were recorded here; new uses will show." : "Not given to an agent yet. It is used when similar work comes up in this repository."}
          </p>
        )}
      </section>
    </div>
  );
}

export function Examples({ list, loading = false }: { list: LearningExemplar[]; /** Reading a new repository or period: rows are stale. */ loading?: boolean }) {
  const [polarity, setPolarity] = useState<Polarity>("good");
  const [query, setQuery] = useState("");
  const [repo, setRepo] = useState("");
  const [kind, setKind] = useState<KindFilter>("");
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const views = useMemo(() => list.map(viewOf), [list]);
  const repos = useMemo(() => [...new Set(list.map((e) => e.repo))].sort(), [list]);
  // Every filter but the toggle: the toggle's counts answer "how many of each, here".
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return views.filter(
      (v) =>
        (!repo || v.e.repo === repo) &&
        (!kind || v.e.kind === kind) &&
        (!q || [v.title, v.reason, v.summary, v.e.area, v.e.category, v.e.repo, v.e.pr ? `#${v.e.pr}` : ""].some((s) => s.toLowerCase().includes(q))),
    );
  }, [views, query, repo, kind]);
  const counts = { good: filtered.filter((v) => v.e.polarity === "good").length, avoid: filtered.filter((v) => v.e.polarity === "avoid").length };
  const rows = useMemo(() => filtered.filter((v) => v.e.polarity === polarity).sort(byUse), [filtered, polarity]);
  const open = views.find((v) => v.e.id === openId) ?? null;
  const filtering = !!(query || repo || kind);
  const reset = (f: () => void) => {
    f();
    setShown(PAGE);
  };
  const clear = () => reset(() => {
    setQuery("");
    setRepo("");
    setKind("");
  });

  return (
    <Section
      title="Examples in use"
      id="exemplars"
      description="Past work with the best and worst outcomes. Before a review or a change, the agents read the closest ones: the first to follow, the second to avoid."
    >
      {list.length === 0 && !loading ? (
        <ListEmpty title="No examples yet">
          A review comment the team acts on, or a pull request that merges as written, becomes an example to follow. A dismissed comment or a closed pull request becomes one to avoid.
        </ListEmpty>
      ) : (
        <>
          <div className="min-w-0" data-testid="examples-toolbar">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SearchField value={query} onChange={(v) => reset(() => setQuery(v))} placeholder="Search examples" label="Search examples" />
              <StatusToggles
                value={polarity}
                onChange={(v) => reset(() => setPolarity(v as Polarity))}
                label="Show examples"
                options={[
                  { value: "good", label: "To follow", count: counts.good, tone: "success" },
                  { value: "avoid", label: "To avoid", count: counts.avoid, tone: "danger" },
                ]}
              />
              {/* The page's repository filter (top) reads one repository from the
                  server; this one narrows the examples already here. */}
              <div className="flex min-w-0 basis-full gap-2 sm:basis-auto">
                {repos.length > 1 && (
                  <Select
                    aria-label="Filter examples by repository"
                    value={repo}
                    onChange={(v) => reset(() => setRepo(v))}
                    options={[{ value: "", label: "All repositories" }, ...repos.map((r) => ({ value: r, label: r }))]}
                    className="min-w-0 flex-1 bg-zinc-900 sm:max-w-[14rem] sm:flex-none"
                  />
                )}
                <Select
                  aria-label="Filter examples by kind"
                  value={kind}
                  onChange={(v) => reset(() => setKind(v as KindFilter))}
                  options={[
                    { value: "", label: "All kinds" },
                    { value: "fix", label: "Code changes" },
                    { value: "finding", label: "Review comments" },
                  ]}
                  className="min-w-0 flex-1 bg-zinc-900 sm:flex-none"
                />
              </div>
            </div>
            <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-3 text-xs text-zinc-400">
              {rows.length > 0 && <p role="status">{`Showing ${Math.min(shown, rows.length)} of ${rows.length}, most used first`}</p>}
              {filtering && (
                <button type="button" onClick={clear} className={`${linkButton} !text-xs`}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
          <div className="mt-3">
            {loading ? (
              <ListSkeleton rows={4} label="Loading examples" />
            ) : rows.length === 0 ? (
              filtering ? (
                <ListEmpty title="No examples match" onClear={clear}>
                  Try another word, repository or kind.
                </ListEmpty>
              ) : (
                <ListEmpty title={polarity === "good" ? "Nothing to follow yet" : "Nothing to avoid yet"}>
                  {polarity === "good"
                    ? "Comments the team acts on and pull requests that merge as written show here."
                    : "Dismissed comments and closed or reverted pull requests show here."}
                </ListEmpty>
              )
            ) : (
              <>
                <ul aria-label={polarity === "good" ? "Examples to follow" : "Examples to avoid"} className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
                  {rows.slice(0, shown).map((v) => (
                    <ExampleRow
                      key={v.e.id}
                      v={v}
                      onOpen={(button) => {
                        opener.current = button;
                        setOpenId(v.e.id);
                      }}
                    />
                  ))}
                </ul>
                {rows.length > shown && (
                  <div className="mt-3 flex justify-center">
                    <button type="button" className={secondaryButton} onClick={() => setShown((n) => n + PAGE)}>
                      Show {Math.min(PAGE, rows.length - shown)} more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open?.title ?? ""}
        description={open?.reason}
        testId="example-panel"
        returnFocusTo={opener}
      >
        {open && <ExampleDetail v={open} />}
      </Drawer>
    </Section>
  );
}
