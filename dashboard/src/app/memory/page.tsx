"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  api,
  type AgentProfile,
  type MemoryFilters,
  type MemoryItem,
  type MemoryPreview,
  type Repo,
} from "@/lib/api";
import { Callout } from "@/components/callout";
import { Segmented } from "@/components/segmented";
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

export default function MemoryPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposError, setReposError] = useState("");
  const [reposAttempt, setReposAttempt] = useState(0);
  const [repo, setRepo] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [profiles, setProfiles] = useState<AgentProfile[] | null>(null);
  const [profilesError, setProfilesError] = useState("");
  const [openAgent, setOpenAgent] = useState<AgentProfile["id"] | null>(null);

  const [memories, setMemories] = useState<MemoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
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
        if (enabled.length > 0) setRepo((cur) => cur || enabled[0].name);
      })
      // A failed request is not "no repositories": say so and offer a retry.
      .catch((e) => setReposError(errorText(e, "The request failed.")));
  }, [reposAttempt]);

  // Searching waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

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
            onChange={(e) => { setRepo(e.target.value); setOpenAgent(null); }}
            className={`${inputClass} !w-auto min-w-0 max-w-full`}
          >
            {repos.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
      )}

      {repo && (
        <>
          {/* ── Agents ───────────────────────────────────────── */}
          <section aria-labelledby="agents-heading" className="mt-10">
            <h2 id="agents-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Who knows what</h2>
            {profilesError ? (
              <Callout variant="error" title="We couldn't load the agents">
                <p>{profilesError}</p>
                <p><button type="button" onClick={refresh} className={linkButton}>Try again</button></p>
              </Callout>
            ) : profiles === null ? (
              <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-expanded={openAgent === p.id}
                      aria-controls="agent-profile"
                      onClick={() => setOpenAgent(openAgent === p.id ? null : p.id)}
                      className={`text-left rounded-lg border p-5 transition-colors motion-reduce:transition-none ${
                        openAgent === p.id ? "border-zinc-500 bg-zinc-900" : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900"
                      } ${focusRing}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300" aria-hidden="true">
                          {AGENT_ICON[p.id]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-zinc-100">{p.name}</p>
                          <p className="mt-1 text-sm text-zinc-400">{p.role}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="text-zinc-100"><span className="font-semibold">{p.activity_count}</span> <span className="text-zinc-400">{p.activity_label}</span></span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">
                        {p.uses_repo_memory ? "Uses this repo's memories" : "Doesn't use repo memories"}
                        <span aria-hidden="true"> · </span>
                        {openAgent === p.id ? "Hide profile" : "Open profile"}
                      </p>
                    </button>
                  ))}
                </div>
                {agent && <AgentDetail agent={agent} />}
              </>
            )}
          </section>

          {/* ── Try it ───────────────────────────────────────── */}
          <TryIt repo={repo} />

          {/* ── Memories ─────────────────────────────────────── */}
          <section aria-labelledby="memories-heading" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 id="memories-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Memories{memories !== null && !listError ? ` (${total})` : ""}
              </h2>
              <p className="text-xs text-zinc-500">The planner and coding agent get every pinned memory and the five most relevant on each ticket.</p>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="max-w-full overflow-x-auto">
                  <Segmented<Show>
                    label="Show"
                    value={show}
                    onChange={setShow}
                    options={[
                      { value: "all", label: "All" },
                      { value: "pinned", label: "Pinned" },
                      { value: "run", label: "Learned on tickets" },
                      { value: "person", label: "Added by people" },
                    ]}
                  />
                </div>
                <Segmented<Sort>
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={[{ value: "newest", label: "Newest" }, { value: "most_used", label: "Most used" }]}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  aria-label="Search memories"
                  placeholder="Search memories"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${inputClass} !w-auto min-w-0 flex-1 basis-48`}
                />
                <select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={`${inputClass} !w-auto min-w-0 max-w-full`}>
                  <option value="">Every topic</option>
                  {TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4">
              {listError ? (
                <Callout variant="error" title="We couldn't load the memories">
                  <p>{listError} Your agents still use them.</p>
                  <p><button type="button" onClick={refresh} className={linkButton}>Try again</button></p>
                </Callout>
              ) : memories === null ? (
                <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
              ) : memories.length === 0 ? (
                filtered ? (
                  <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
                    Nothing matches. <button type="button" className={linkButton} onClick={() => { setShow("all"); setTopic(""); setSearch(""); }}>Clear the filters</button>
                  </p>
                ) : (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300" aria-hidden="true"><MemoryIcon /></span>
                    <p className="mt-3 font-semibold text-zinc-100">Nothing remembered about {repo} yet</p>
                    <p className="mt-1 max-w-prose text-sm text-zinc-400">
                      After each ticket it finishes here, Coderhelm saves up to five things it learned: conventions, mistakes to avoid,
                      where things live. You can also teach it directly, and pin what should always apply.
                    </p>
                    {isAdmin && <button type="button" onClick={() => setTeaching(true)} className={`${secondaryButton} mt-4`}>Teach it something</button>}
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-6">
                  {grouped.map((g) => (
                    <div key={g.topic || "all"}>
                      {g.topic && (
                        <h3 className="mb-2 text-sm font-semibold text-zinc-300">
                          {topicLabel(g.topic)} <span className="font-normal text-zinc-500">{g.items.length}</span>
                        </h3>
                      )}
                      <ul className="flex flex-col gap-3">
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
                      </ul>
                    </div>
                  ))}
                  {total > memories.length && (
                    <p className="text-sm text-zinc-500">Showing the first {memories.length} of {total}. Search or filter to find the rest.</p>
                  )}
                </div>
              )}
            </div>
          </section>
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
                <dd className="mt-0.5 break-words text-sm text-zinc-400">{k.detail}</dd>
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
                  <p className="break-words text-sm text-zinc-200">{l.text}</p>
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
                <span className="min-w-0 break-words text-zinc-200">
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
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4" data-testid="memory">
      {editing ? (
        <div className="flex flex-col gap-3">
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
      ) : (
        <>
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 break-words text-sm text-zinc-100">{m.content}</p>
            {m.pinned && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                <PinIcon /> Pinned
              </span>
            )}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-zinc-500">
            {showTopic && <><span className="text-zinc-400">{topicLabel(m.topic)}</span><span aria-hidden="true">·</span></>}
            <span>{where(m)}{day(m.created_at) && `, ${day(m.created_at)}`}</span>
            {m.origin?.edited_by && <><span aria-hidden="true">·</span><span>Edited by {m.origin.edited_by}</span></>}
            <span aria-hidden="true">·</span>
            <span>
              {uses === 0
                ? "Not used yet"
                : `Used on ${uses} ticket${uses === 1 ? "" : "s"}${m.last_used?.title ? `, last “${m.last_used.title}”` : ""}${day(m.last_used?.at) ? ` ${day(m.last_used?.at)}` : ""}`}
            </span>
          </p>
          {isAdmin && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={onPin} className={secondaryButton} aria-label={`${m.pinned ? "Unpin" : "Pin"} this memory`}>
                {m.pinned ? "Unpin" : "Pin"}
              </button>
              <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>Edit</button>
              <button type="button" onClick={onForget} className={`${secondaryButton} !text-red-300`}>Forget</button>
            </div>
          )}
        </>
      )}
    </li>
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
    <section aria-labelledby="try-heading" className="mt-10">
      <h2 id="try-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">What would it remember for a ticket?</h2>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
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
                    <p className="break-words text-sm text-zinc-200">{m.content}</p>
                    <p className="mt-1 text-xs text-amber-300">Pinned, so always included</p>
                  </li>
                ))}
                {result.recalled.map(({ memory: m, score }) => (
                  <li key={m.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                    <p className="break-words text-sm text-zinc-200">{m.content}</p>
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
