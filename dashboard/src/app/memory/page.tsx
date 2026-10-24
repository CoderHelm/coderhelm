"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  api,
  type AgentProfile,
  type MemoryFilters,
  type MemoryItem,
  type MemoryPreview,
  type Repo,
} from "@/lib/api";
import { Callout } from "@/components/callout";
import { Chip, List, ListEmpty, ListError, ListRow, ListSection, ListSkeleton, ListToolbar, MoreMenu, SortSelect, useListParams } from "@/components/list";
import { SettingsDisclosure } from "@/components/settings";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { ChatIcon, CodeIcon, MemoryIcon, PinIcon, PlannerIcon, ReviewerIcon } from "@/components/icons";
import { Page, PageHeader } from "@/components/page";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";

// What each memory can be about, in the order they're shown. Mirrors the
// platform's memory_meta::TOPICS.
const TOPICS: { value: string; label: string; hint: string }[] = [
  { value: "procedure", label: "How things are done here", hint: "Steps, commands and conventions to follow." },
  { value: "code-style", label: "Code style", hint: "How code in this repo is written." },
  { value: "architecture", label: "How the code is built", hint: "Where things live and how parts fit." },
  { value: "anti-pattern", label: "Things to avoid", hint: "Mistakes that were made before." },
  { value: "correction", label: "Corrections", hint: "Something it got wrong and the right answer." },
  { value: "learned", label: "Other things it learned", hint: "Anything else." },
];
const topicLabel = (t?: string) => TOPICS.find((x) => x.value === t)?.label ?? "Other things it learned";

const AGENT_ICON: Record<AgentProfile["id"], ReactNode> = {
  reviewer: <ReviewerIcon />,
  planner: <PlannerIcon />,
  coder: <CodeIcon />,
  feedback: <ChatIcon />,
};

type Show = "all" | "pinned" | "run" | "person";
type Sort = "newest" | "most_used";

/** A select that sits in a list toolbar. */
const toolbarSelect = `min-h-9 rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-3 text-sm text-zinc-100 hover:border-zinc-500 ${focusRing}`;

const ROLE_LEVEL: Record<string, number> = { viewer: 0, member: 1, billing: 2, admin: 3, owner: 4 };

function errorText(e: unknown, fallback: string) {
  const m = e instanceof Error ? e.message : "";
  return m || fallback;
}

function day(value: string | number | undefined): string {
  if (!value) return "";
  const ms = typeof value === "number" ? (value > 1e15 ? value / 1000 : value) : Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

function where(m: MemoryItem): string {
  const o = m.origin;
  if (!o) return "Learned on a ticket";
  if (o.source === "person") return o.added_by ? `Added by ${o.added_by}` : "Added by a person";
  return o.title ? `Learned on “${o.title}”` : "Learned on a ticket";
}

export default function MemoryPageWithParams() {
  return (
    <Suspense fallback={<Page><PageHeader title="Memory" /><div className="mt-6"><ListSkeleton rows={3} label="Loading memories" /></div></Page>}>
      <MemoryPage />
    </Suspense>
  );
}

const SHOWS: Show[] = ["all", "pinned", "run", "person"];

function MemoryPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposError, setReposError] = useState("");
  const [reposAttempt, setReposAttempt] = useState(0);
  // The address holds the repo and the list's filters, so a view can be shared.
  const [params, setParams] = useListParams({ repo: "", q: "", show: "all", sort: "newest", topic: "" });
  const [firstRepo, setFirstRepo] = useState("");
  const repo = params.repo || firstRepo;
  const [isAdmin, setIsAdmin] = useState(false);

  const [profiles, setProfiles] = useState<AgentProfile[] | null>(null);
  const [profilesError, setProfilesError] = useState("");
  const [openAgent, setOpenAgent] = useState<AgentProfile["id"] | null>(null);

  const [memories, setMemories] = useState<MemoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState("");
  const show: Show = (SHOWS as string[]).includes(params.show) ? (params.show as Show) : "all";
  const topic = TOPICS.some((t) => t.value === params.topic) ? params.topic : "";
  const sort: Sort = params.sort === "most_used" ? "most_used" : "newest";
  const query = params.q.trim();
  const clearFilters = () => setParams({ q: "", show: "all", topic: "" });
  const [teaching, setTeaching] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.me().then((u) => setIsAdmin((ROLE_LEVEL[u.role] ?? 0) >= 3)).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    setRepos(null);
    setReposError("");
    api
      .listRepos()
      .then(({ repos }) => {
        const enabled = repos.filter((r) => r.enabled);
        setRepos(enabled);
        if (enabled.length > 0) setFirstRepo(enabled[0].name);
      })
      // A failed request is not "no repositories": say so and offer a retry.
      .catch((e) => setReposError(errorText(e, "The request failed.")));
  }, [reposAttempt]);

  useEffect(() => {
    if (!repo) return;
    setProfiles(null);
    setProfilesError("");
    api
      .getAgentProfiles(repo)
      .then((r) => setProfiles(r.profiles))
      .catch((e) => setProfilesError(errorText(e, "The request failed.")));
  }, [repo, reload]);

  const loadMemories = useCallback(async () => {
    if (!repo) return;
    setListError("");
    const filters: MemoryFilters = { sort };
    if (show === "pinned") filters.pinned = true;
    if (show === "run" || show === "person") filters.source = show;
    if (topic) filters.topic = topic;
    try {
      const r = await api.listMemories(repo, 1, 100, query || undefined, undefined, filters);
      setMemories(r.memories);
      setTotal(r.total);
    } catch (e) {
      setMemories([]);
      setListError(errorText(e, "The request failed."));
    }
  }, [repo, show, topic, sort, query]);

  useEffect(() => {
    setMemories(null);
    loadMemories();
  }, [loadMemories, reload]);

  const refresh = () => setReload((n) => n + 1);

  const togglePin = async (m: MemoryItem) => {
    try {
      await api.updateMemory(m.id, { repo, pinned: !m.pinned });
      toast(m.pinned ? "Unpinned" : "Pinned: it now reaches the planner and coding agent on every ticket");
      refresh();
    } catch (e) {
      toast(errorText(e, "Couldn't change the pin. Try again."));
    }
  };

  const forget = async (m: MemoryItem) => {
    const ok = await confirm({
      title: "Forget this memory?",
      message: `Coderhelm will stop using it on ${repo}. This can't be undone.\n\n“${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}”`,
      confirmLabel: "Forget it",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteMemory(m.id, repo);
      toast("Forgotten");
      refresh();
    } catch (e) {
      toast(errorText(e, "Couldn't forget it. Try again."));
    }
  };

  const save = async (m: MemoryItem, content: string, newTopic: string) => {
    await api.updateMemory(m.id, { repo, content: content !== m.content ? content : undefined, topic: newTopic !== m.topic ? newTopic : undefined });
    toast("Saved");
    refresh();
  };

  const grouped = useMemo(() => {
    if (!memories) return [];
    if (sort === "most_used" || topic || query) return [{ topic: "", items: memories }];
    const by = new Map<string, MemoryItem[]>();
    for (const m of memories) {
      const key = m.topic || "learned";
      by.set(key, [...(by.get(key) ?? []), m]);
    }
    return TOPICS.filter((t) => by.has(t.value)).map((t) => ({ topic: t.value, items: by.get(t.value)! }));
  }, [memories, sort, topic, query]);

  const filtered = show !== "all" || !!topic || !!query;
  const agent = profiles?.find((p) => p.id === openAgent) ?? null;

  return (
    <Page>
      <PageHeader
        title="Memory"
        lead="What Coderhelm knows about each repository, where it learned it, and what each agent actually uses."
        actions={isAdmin && repo ? (
          <button type="button" onClick={() => setTeaching(true)} className={primaryButton}>
            Teach it something
          </button>
        ) : undefined}
      />

      {reposError ? (
        <div className="mt-6">
          <Callout variant="error" title="We couldn't load your repositories">
            <p>{reposError}</p>
            <p><button type="button" onClick={() => setReposAttempt((n) => n + 1)} className={linkButton}>Try again</button></p>
          </Callout>
        </div>
      ) : repos === null ? (
        <div className="mt-6"><Skeleton className="h-10 w-64" /></div>
      ) : repos.length === 0 ? (
        <div className="mt-6">
          <Callout variant="info" title="No repositories yet">
            <p>Turn on a repository in Settings. Coderhelm starts remembering things about it after its first finished ticket.</p>
          </Callout>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label htmlFor="memory-repo" className="text-sm text-zinc-400">Repository</label>
          <select
            id="memory-repo"
            aria-label="Repository"
            value={repo}
            onChange={(e) => { setParams({ repo: e.target.value }); setOpenAgent(null); }}
            className={`${toolbarSelect} min-w-0 max-w-full`}
          >
            {repos.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
      )}

      {repo && (
        <>
          {/* ── Memories ─────────────────────────────────────── */}
          <div className="mt-6">
            <ListSection
              id="memories"
              title="Memories"
              count={memories !== null && !listError ? total : undefined}
              description={<span className="text-xs text-zinc-500">The planner and coding agent get every pinned memory and the five most relevant on each ticket.</span>}
              actions={
                <>
                <select aria-label="Topic" value={topic} onChange={(e) => setParams({ topic: e.target.value })} className={`${toolbarSelect} w-40 min-w-0 max-w-full truncate pr-8`}>
                    <option value="">Every topic</option>
                    {TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                <SortSelect
                  value={sort}
                  onChange={(v) => setParams({ sort: v })}
                  options={[{ value: "newest", label: "Newest" }, { value: "most_used", label: "Most used" }]}
                />
                </>
              }
            >
              <ListToolbar
                className="mb-4"
                search={{ value: params.q, onChange: (v) => setParams({ q: v }, { replace: true }), placeholder: "Search memories" }}
                status={{
                  label: "Show",
                  value: show,
                  onChange: (v) => setParams({ show: v }),
                  options: [
                    { value: "all", label: "All" },
                    { value: "pinned", label: "Pinned", tone: "waiting" },
                    { value: "run", label: "From tickets" },
                    { value: "person", label: "From people" },
                  ],
                }}
                onClear={filtered ? clearFilters : undefined}
              />

              {listError ? (
                <ListError title="We couldn't load the memories" onRetry={refresh}>
                  {listError} Your agents still use them.
                </ListError>
              ) : memories === null ? (
                <ListSkeleton rows={3} label="Loading memories" />
              ) : memories.length === 0 ? (
                filtered ? (
                  <ListEmpty title="Nothing matches." onClear={clearFilters} />
                ) : (
                  <ListEmpty
                    title={`Nothing remembered about ${repo} yet`}
                    action={isAdmin ? <button type="button" onClick={() => setTeaching(true)} className={secondaryButton}>Teach it something</button> : undefined}
                  >
                    After each ticket it finishes here, Coderhelm saves up to five things it learned: conventions, mistakes to avoid,
                    where things live. You can also teach it directly, and pin what should always apply.
                  </ListEmpty>
                )
              ) : (
                <div className="flex flex-col gap-6">
                  {grouped.map((g) => {
                    const rows = (
                      <List label={g.topic ? topicLabel(g.topic) : "Memories"}>
                        {g.items.map((m) => (
                          <MemoryCard
                            key={m.id}
                            m={m}
                            showTopic={!g.topic}
                            isAdmin={isAdmin}
                            onPin={() => togglePin(m)}
                            onForget={() => forget(m)}
                            onSave={(c, t) => save(m, c, t)}
                          />
                        ))}
                      </List>
                    );
                    return g.topic ? (
                      <ListSection key={g.topic} id={`topic-${g.topic}`} title={topicLabel(g.topic)} count={g.items.length}>
                        {rows}
                      </ListSection>
                    ) : (
                      <div key="all">{rows}</div>
                    );
                  })}
                  {total > memories.length && (
                    <p className="text-sm text-zinc-500">Showing the first {memories.length} of {total}. Search or filter to find the rest.</p>
                  )}
                </div>
              )}
            </ListSection>
          </div>
          {/* ── Who uses memory ───────────────────────────────── */}
          <section aria-labelledby="agents-heading" className="mt-10">
            <h2 id="agents-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Who uses memory</h2>
            {profilesError ? (
              <Callout variant="error" title="We couldn't load the agents">
                <p>{profilesError}</p>
                <p><button type="button" onClick={refresh} className={linkButton}>Try again</button></p>
              </Callout>
            ) : profiles === null ? (
              <Skeleton className="h-24" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 lg:grid-cols-4" data-testid="memory-agents">
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-expanded={openAgent === p.id}
                      aria-controls="agent-profile"
                      title={p.role}
                      onClick={() => setOpenAgent(openAgent === p.id ? null : p.id)}
                      className={`flex min-w-0 flex-col justify-start p-4 text-left transition-colors motion-reduce:transition-none ${
                        openAgent === p.id ? "bg-zinc-800" : "bg-zinc-950 hover:bg-zinc-900"
                      } ${focusRing}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="shrink-0 text-zinc-400" aria-hidden="true">{AGENT_ICON[p.id]}</span>
                        <span className="truncate text-sm font-medium text-zinc-100">{p.name}</span>
                      </span>
                      <span className="mt-2 block text-xs text-zinc-400">
                        <span className="text-base font-semibold tabular-nums text-zinc-100">{p.activity_count}</span> {p.activity_label}
                      </span>
                      <span className={`mt-1 block text-xs ${p.uses_repo_memory ? "text-emerald-300/90" : "text-zinc-500"}`}>
                        {p.uses_repo_memory ? "Uses this repo's memories" : "Doesn't use repo memories"}
                      </span>
                    </button>
                  ))}
                </div>
                {agent && <AgentDetail agent={agent} />}
              </>
            )}
          </section>

          {/* ── Preview for a ticket ─────────────────────────── */}
          <div className="mt-10">
            <SettingsDisclosure summary="Preview what a ticket would bring along">
              <TryIt repo={repo} />
            </SettingsDisclosure>
          </div>
        </>
      )}

      {teaching && repo && (
        <TeachDialog
          repo={repo}
          onClose={() => setTeaching(false)}
          onSaved={() => { setTeaching(false); toast("Remembered"); refresh(); }}
        />
      )}
    </Page>
  );
}

function AgentDetail({ agent }: { agent: AgentProfile }) {
  return (
    <div id="agent-profile" role="region" aria-label={`${agent.name} profile`} className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300" aria-hidden="true">{AGENT_ICON[agent.id]}</span>
        <h3 className="text-lg font-semibold">{agent.name}</h3>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What it knows</h4>
          <dl className="mt-2 flex flex-col gap-3">
            {agent.knows.map((k) => (
              <div key={k.label}>
                <dt className="text-sm text-zinc-200">{k.label}</dt>
                <dd className="mt-0.5 text-sm text-zinc-400">{k.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What it learned</h4>
          {agent.learned.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">
              {agent.id === "feedback"
                ? "It works from each PR's conversation, so it keeps no memories of its own."
                : agent.id === "reviewer"
                  ? "No notes on its reviews yet. Rate a review with a note and it reads it before the next ones."
                  : "Nothing yet. It learns as it finishes tickets here."}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3">
              {agent.learned.map((l, i) => (
                <li key={i} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                  <p className="text-sm text-zinc-200">{l.text}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {l.link ? <a href={l.link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-300">{l.source}</a> : l.source}
                    {day(l.at) && <><span aria-hidden="true"> · </span>{day(l.at)}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recent work</h4>
        {agent.recent.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">Nothing on this repository yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-800 rounded-md border border-zinc-800">
            {agent.recent.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0 text-zinc-200">
                  {r.link ? <a href={r.link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-100">{r.title || "Untitled"}</a> : r.title || "Untitled"}
                </span>
                <span className="text-xs text-zinc-500">{r.outcome}{day(r.at) && <> · {day(r.at)}</>}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MemoryCard({
  m,
  showTopic,
  isAdmin,
  onPin,
  onForget,
  onSave,
}: {
  m: MemoryItem;
  showTopic: boolean;
  isAdmin: boolean;
  onPin: () => void;
  onForget: () => void;
  onSave: (content: string, topic: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(m.content);
  const [topic, setTopic] = useState(m.topic || "learned");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(content.trim(), topic);
      setEditing(false);
    } catch (e) {
      setError(errorText(e, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const uses = m.uses ?? 0;
  const long = m.content.length > 140;
  return (
    <ListRow
      testId="memory"
      status={{ tone: m.pinned ? "waiting" : m.origin?.source === "person" ? "neutral" : "muted" }}
      title={m.content}
      titleText={m.content}
      meta={[
        showTopic ? <span key="topic" className="text-zinc-400">{topicLabel(m.topic)}</span> : null,
        `${where(m)}${day(m.created_at) ? `, ${day(m.created_at)}` : ""}`,
        m.origin?.edited_by ? `Edited by ${m.origin.edited_by}` : null,
        uses === 0
          ? "Not used yet"
          : `Used on ${uses} ticket${uses === 1 ? "" : "s"}${m.last_used?.title ? `, last “${m.last_used.title}”` : ""}${day(m.last_used?.at) ? ` ${day(m.last_used?.at)}` : ""}`,
      ]}
      chips={
        m.pinned ? (
          <Chip tone="waiting">
            <PinIcon /> Pinned
          </Chip>
        ) : undefined
      }
      actions={
        isAdmin && !editing ? (
          <MoreMenu
            compact
            label="Memory actions"
            buttonLabel="Actions for this memory"
            items={[
              { label: m.pinned ? "Unpin" : "Pin", onSelect: onPin },
              { label: "Edit", onSelect: () => setEditing(true) },
              { label: "Forget", danger: true, onSelect: onForget },
            ]}
          />
        ) : undefined
      }
      details={long && !editing ? <p className="whitespace-pre-wrap text-sm text-zinc-200">{m.content}</p> : undefined}
      detailsLabel="Full text"
    >
      {editing && (
        <div className="mt-3 flex flex-col gap-3">
          <label className="sr-only" htmlFor={`edit-${m.id}`}>Memory</label>
          <textarea id={`edit-${m.id}`} value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={1000} className={inputClass} />
          <div className="flex flex-wrap items-center gap-3">
            <select aria-label="Topic for this memory" value={topic} onChange={(e) => setTopic(e.target.value)} className={`${inputClass} !w-auto min-w-0 max-w-full`}>
              {TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button type="button" onClick={submit} disabled={saving || !content.trim()} className={primaryButton}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => { setEditing(false); setContent(m.content); setTopic(m.topic || "learned"); setError(""); }} className={secondaryButton}>Cancel</button>
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </ListRow>
  );
}

function TryIt({ repo }: { repo: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<MemoryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setResult(null); setError(""); }, [repo]);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      setResult(await api.previewMemoryRecall(repo, text));
    } catch (e) {
      setResult(null);
      setError(errorText(e, "The request failed."));
    } finally {
      setBusy(false);
    }
  };

  const nothing = result && result.pinned.length === 0 && result.recalled.length === 0;
  return (
    <section aria-label="What would it remember for a ticket?">
      <div>
        <label htmlFor="try-text" className="text-sm text-zinc-300">Describe a ticket, the way someone would write it</label>
        <textarea
          id="try-text"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="For example: the checkout page shows the wrong total after a coupon"
          className={`${inputClass} mt-2`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={run} disabled={busy || !text.trim()} className={secondaryButton}>{busy ? "Looking…" : "Show what it would remember"}</button>
          <span className="text-xs text-zinc-500">The planner and coding agent get exactly this. Nothing is saved.</span>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        {result && (
          <div className="mt-4" aria-live="polite">
            {nothing ? (
              <p className="text-sm text-zinc-400">Nothing it remembers is close enough to this ticket, so it would start fresh.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {result.pinned.map((m) => (
                  <li key={m.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                    <p className="text-sm text-zinc-200">{m.content}</p>
                    <p className="mt-1 text-xs text-amber-300">Pinned, so always included</p>
                  </li>
                ))}
                {result.recalled.map(({ memory: m, score }) => (
                  <li key={m.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                    <p className="text-sm text-zinc-200">{m.content}</p>
                    <p className="mt-1 text-xs text-zinc-500">{topicLabel(m.topic)} · {where(m)} · match {Math.round(Math.min(1, score / 0.08) * 100)}%</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TeachDialog({ repo, onClose, onSaved }: { repo: string; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("procedure");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const first = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await api.createMemory({ repo, content: content.trim(), topic, pinned });
      onSaved();
    } catch (e) {
      setError(errorText(e, "Couldn't save it. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="teach-title"
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="teach-title" className="text-lg font-semibold">Teach Coderhelm something about {repo}</h2>
        <p className="mt-1 text-sm text-zinc-400">One fact or rule per memory works best, written the way you&apos;d tell a new teammate.</p>
        <label htmlFor="teach-text" className="mt-4 block text-sm text-zinc-300">What should it remember?</label>
        <textarea
          id="teach-text"
          ref={first}
          rows={4}
          maxLength={1000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="For example: run the unit tests with pnpm test:unit; the e2e suite needs staging."
          className={`${inputClass} mt-2`}
        />
        <p className="mt-1 text-right text-xs text-zinc-500">{content.length} / 1000</p>
        <label htmlFor="teach-topic" className="mt-2 block text-sm text-zinc-300">Topic</label>
        <select id="teach-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={`${inputClass} mt-2`}>
          {TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}: {t.hint}</option>)}
        </select>
        <label className="mt-4 flex items-start gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="mt-1" />
          <span>Pin it: the planner and coding agent get it on every ticket, not only when it seems relevant.</span>
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !content.trim()} className={primaryButton}>{saving ? "Saving…" : "Remember this"}</button>
        </div>
      </div>
    </div>
  );
}
