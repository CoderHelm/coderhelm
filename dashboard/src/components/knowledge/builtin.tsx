"use client";

import { useEffect, useId, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Segmented } from "@/components/segmented";
import { timeAgo } from "@/components/list/time";
import { focusRing, inputClass, smallPrimaryButton, smallSecondaryButton } from "@/components/ui";
import {
  AUDIENCE_ROLES,
  SHARE_DAYS,
  builtinBases,
  countsLine,
  parsePeople,
  type BaseSearch,
  type BuiltinBase,
  type BuiltinList,
  type ShareDays,
} from "@/lib/builtin-bases";

// The six built-in bases on the Knowledge page, above the ones people made:
// what each holds, how fresh it is, who reads it and whether the person
// looking may. An open base can be searched here and a search shared as a
// link that checks access again whoever opens it. Admins choose each base's
// audience and whether people may connect AI tools as readers.

export function BuiltinBases() {
  const [list, setList] = useState<BuiltinList | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    builtinBases
      .list()
      .then((r) => {
        if (!live) return;
        // Anything but the list (an older gateway answering another route): as if it failed.
        if (r && Array.isArray(r.bases)) setList({ ...r, bases: r.bases.filter((b) => b && Array.isArray(b.counts) && b.access && b.audience) });
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  // An install whose gateway predates the built-in bases: the page shows the
  // bases people made, as before.
  if (failed) return null;
  if (!list) {
    return (
      <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading the built-in bases">
        {[0, 1].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40 motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  const replace = (b: BuiltinBase) => setList((l) => (l ? { ...l, bases: l.bases.map((x) => (x.key === b.key ? b : x)) } : l));

  return (
    <section aria-labelledby="builtin-heading" data-testid="builtin-bases">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="builtin-heading" className="text-base font-semibold text-zinc-100">
            Built in
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            What Coderhelm already reads for your team, kept up to date with nothing to set up. Chat and the AI tools you connect answer from them.
          </p>
        </div>
      </div>
      {list.can_manage && <ReadersToggle enabled={list.readers.enabled} onChange={(enabled) => setList((l) => (l ? { ...l, readers: { enabled } } : l))} />}
      <ul className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-2" aria-label="Built-in bases">
        {list.bases.map((b) => (
          <BuiltinCard key={b.key} b={b} canManage={list.can_manage} onChange={replace} />
        ))}
      </ul>
    </section>
  );
}

function ReadersToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toggle = async (v: boolean) => {
    // Shown at once; put back if the save fails.
    onChange(v);
    setSaving(true);
    setError("");
    try {
      const r = await builtinBases.setReaders(v);
      onChange(r.enabled);
    } catch (e) {
      onChange(!v);
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3" data-testid="readers-toggle">
      <div className="flex items-start gap-3">
        <input id={id} type="checkbox" className={`mt-0.5 h-4 w-4 shrink-0 accent-blue-500 ${focusRing}`} checked={enabled} aria-busy={saving} onChange={(e) => toggle(e.target.checked)} />
        <label htmlFor={id} className="min-w-0 text-sm text-zinc-200">
          Let people connect AI tools as readers (no account, not a seat)
          <span className="mt-0.5 block text-sm text-zinc-400">
            Someone in your GitHub organization signs in with GitHub when they connect Claude, ChatGPT, Cursor or VS Code, and reads the bases open to readers. They can&apos;t change anything.
          </span>
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    </div>
  );
}

function BuiltinCard({ b, canManage, onChange }: { b: BuiltinBase; canManage: boolean; onChange: (b: BuiltinBase) => void }) {
  const [editing, setEditing] = useState(false);
  const fresh = b.updated_at ? `Updated ${timeAgo(b.updated_at)}${b.live ? ", read live" : ""}` : b.live ? "Read live" : "Not read yet";
  return (
    <li className="min-w-0" data-testid="builtin-card" data-key={b.key} data-open={b.access.open ? "yes" : "no"}>
      <div className="flex h-full min-w-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-base font-semibold text-zinc-100">{b.name}</h3>
          <span className="shrink-0 rounded-full border border-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">Built in</span>
        </div>
        <p className="mt-1 text-sm text-zinc-400">{b.about}</p>
        <p className="mt-4 text-sm text-zinc-300" data-testid="builtin-counts">
          {countsLine(b.counts)}
        </p>
        <p className="mt-1 text-sm text-zinc-400" data-testid="builtin-fresh">
          {fresh}
        </p>
        <dl className="mt-4 grid gap-y-0.5 text-sm">
          <dt className="text-zinc-400">Who reads it</dt>
          <dd className="mb-2 min-w-0 text-zinc-200 wrap-anywhere" data-testid="builtin-audience">
            {b.audience.paused ? "Paused: nobody reads it" : b.audience_label}
          </dd>
          <dt className="text-zinc-400">You</dt>
          <dd className="min-w-0 wrap-anywhere" data-testid="builtin-access">
            {b.access.open ? (
              <span className="text-emerald-300">Open to you</span>
            ) : (
              <span className="text-orange-300">
                Not open to you
                {b.access.why && <span className="block text-zinc-400">{b.access.why}</span>}
              </span>
            )}
          </dd>
        </dl>
        {b.mirroring && <p className="mt-2 text-sm text-zinc-400">{b.mirroring}</p>}
        {b.access.open && <BaseSearchBox b={b} />}
        {canManage && (
          <div className="mt-4 border-t border-zinc-800 pt-3">
            {editing ? (
              <AudienceEditor b={b} onDone={(nb) => { if (nb) onChange(nb); setEditing(false); }} />
            ) : (
              <button type="button" className={smallSecondaryButton} onClick={() => setEditing(true)} data-testid="builtin-edit">
                Change who reads it
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function AudienceEditor({ b, onDone }: { b: BuiltinBase; onDone: (b: BuiltinBase | null) => void }) {
  const [roles, setRoles] = useState<string[]>(b.audience.roles);
  const [people, setPeople] = useState(b.audience.people.join("\n"));
  const [readers, setReaders] = useState(b.audience.readers);
  const [paused, setPaused] = useState(b.audience.paused);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const peopleId = useId();
  const readersId = useId();
  const pausedId = useId();
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      onDone(await builtinBases.update(b.key, { roles, people: parsePeople(people), readers, paused }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3 text-sm" data-testid="audience-editor">
      <fieldset>
        <legend className="text-zinc-200">Roles that read it</legend>
        <p className="text-zinc-400">None ticked: everyone whose role opens what it holds.</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {AUDIENCE_ROLES.map((r) => (
            <RoleBox key={r.key} label={r.label} checked={roles.includes(r.key)} onChange={(on) => setRoles((rs) => (on ? [...rs, r.key] : rs.filter((x) => x !== r.key)))} />
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={peopleId} className="text-zinc-200">
          People, by email
        </label>
        <textarea id={peopleId} rows={2} className={`${inputClass} mt-1`} value={people} onChange={(e) => setPeople(e.target.value)} placeholder="ada@example.com" />
      </div>
      <div className="flex items-start gap-2">
        <input id={readersId} type="checkbox" className={`mt-0.5 h-4 w-4 shrink-0 accent-blue-500 ${focusRing}`} checked={readers} onChange={(e) => setReaders(e.target.checked)} />
        <label htmlFor={readersId} className="text-zinc-200">
          Readers from AI tools
        </label>
      </div>
      <div className="flex items-start gap-2">
        <input id={pausedId} type="checkbox" className={`mt-0.5 h-4 w-4 shrink-0 accent-blue-500 ${focusRing}`} checked={paused} onChange={(e) => setPaused(e.target.checked)} />
        <label htmlFor={pausedId} className="text-zinc-200">
          Paused
        </label>
      </div>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallPrimaryButton} disabled={saving} onClick={save} data-testid="audience-save">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={smallSecondaryButton} disabled={saving} onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RoleBox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <span className="flex items-center gap-2">
      <input id={id} type="checkbox" className={`h-4 w-4 accent-blue-500 ${focusRing}`} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-zinc-300">
        {label}
      </label>
    </span>
  );
}

function BaseSearchBox({ b }: { b: BuiltinBase }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [found, setFound] = useState<BaseSearch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    const query = q.trim();
    if (!query) return;
    setBusy(true);
    setError("");
    try {
      setFound(await builtinBases.search(b.key, query));
      setAsked(query);
    } catch (e) {
      setFound(null);
      setError(e instanceof Error ? e.message : "The search failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4" data-testid="builtin-search">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label htmlFor={id} className="sr-only">
          Search {b.name}
        </label>
        <input id={id} type="search" className={inputClass} placeholder={`Search ${b.name}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className={smallSecondaryButton} disabled={busy || !q.trim()}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      {found && <Results found={found} />}
      {found && asked && <ShareControl base={b} query={asked} />}
    </div>
  );
}

export function Results({ found }: { found: Pick<BaseSearch, "results" | "withheld" | "not_read"> }) {
  return (
    <div className="mt-3 space-y-2" data-testid="builtin-results">
      {found.results.length === 0 ? (
        <p className="text-sm text-zinc-400">Nothing matched.</p>
      ) : (
        <ul className="space-y-2">
          {found.results.map((r) => (
            <li key={r.id} className="min-w-0 rounded-lg border border-zinc-800 px-3 py-2" data-testid="builtin-result">
              <a href={r.url} target="_blank" rel="noreferrer" className={`text-sm font-medium text-zinc-100 underline-offset-2 hover:underline [overflow-wrap:anywhere] ${focusRing}`}>
                {r.title}
              </a>
              {r.snippet && <p className="mt-0.5 line-clamp-2 text-sm text-zinc-400 [overflow-wrap:anywhere]">{r.snippet}</p>}
              <p className="mt-0.5 text-sm text-zinc-400">
                {r.base}
                {r.updated_at ? `, updated ${timeAgo(r.updated_at) || r.updated_at}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      {found.withheld && found.withheld.count > 0 && (
        <p className="text-sm text-zinc-400" data-testid="builtin-withheld">
          {found.withheld.count} more {found.withheld.count === 1 ? "result isn't" : "results aren't"} open to you, so {found.withheld.count === 1 ? "it isn't" : "they aren't"} shown.
        </p>
      )}
      {(found.not_read ?? []).map((n, i) => (
        <p key={i} className="text-sm text-orange-300">
          {n.base} wasn&apos;t read: {n.reason}
        </p>
      ))}
    </div>
  );
}

function ShareControl({ base, query }: { base: BuiltinBase; query: string }) {
  const [days, setDays] = useState<ShareDays>(7);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const share = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await builtinBases.share(base.key, query, days);
      setLink(`${window.location.origin}${r.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the link.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="builtin-share">
      <Segmented
        label="How long the link works"
        options={SHARE_DAYS.map((d) => ({ value: String(d) as `${ShareDays}`, label: d === 1 ? "1 day" : `${d} days` }))}
        value={String(days) as `${ShareDays}`}
        onChange={(v) => {
          setDays(Number(v) as ShareDays);
          setLink("");
        }}
      />
      {link ? (
        <CopyButton text={link} label="Copy the link" copiedLabel="Link copied" />
      ) : (
        <button type="button" className={smallSecondaryButton} disabled={busy} onClick={share} data-testid="builtin-share-make">
          {busy ? "Making the link…" : "Share"}
        </button>
      )}
      {link && <p className="w-full text-sm text-zinc-400">Whoever opens it sees only what they may read themselves.</p>}
      {error && <p role="alert" className="w-full text-sm text-red-300">{error}</p>}
    </div>
  );
}
