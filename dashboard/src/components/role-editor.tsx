"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronRightIcon, LockIcon, SearchIcon } from "./icons";
import { Field } from "./field";
import { Modal, ModalFooter } from "./modal";
import { useToast } from "./toast";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton, smallSecondaryButton } from "./ui";
import { groupCapabilities } from "@/lib/permission-groups";
import { shortLabel, teamApi, uniqueCapabilities, type Capability, type CustomRole, type Permissions, type RolesInfo } from "@/lib/team";

// The custom role editor: a panel on the right of Settings, then Team.
//
// Most people want a built-in role with a few changes, so a new role starts
// from one (Member by default) and the editor shows how far it has moved from
// it. Abilities sit in collapsed groups that say how many are on; each one has
// a short name and its full sentence under it. What everyone can do is said
// once, not offered as a locked checkbox. A summary beside the list (below it
// on a phone) says what the role can do and what changed.

export type Editing = { mode: "new" } | { mode: "edit"; role: CustomRole };

type Base = "viewer" | "member" | "admin" | "";

const BASES: { key: Exclude<Base, "">; label: string; blurb: string }[] = [
  { key: "viewer", label: "Viewer", blurb: "Reads, changes nothing" },
  { key: "member", label: "Member", blurb: "Plans, runs and reviews" },
  { key: "admin", label: "Admin", blurb: "Runs the workspace" },
];

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The full sentence under a short label, without the words the short label
 * already says ("Manage repositories: sync, turn on…" under "Manage
 * repositories" reads "Sync, turn on…"). Empty when it adds nothing.
 */
export function detailOf(c: Capability): string {
  if (!c.short_label) return "";
  const short = c.short_label.trim().toLowerCase();
  const full = c.label.trim();
  if (full.toLowerCase() === short) return "";
  if (full.toLowerCase().startsWith(`${short}:`)) {
    const rest = full.slice(short.length + 1).trim();
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return full;
}

export function RoleEditor({
  editing,
  perms,
  info,
  onClose,
  onSaved,
}: {
  editing: Editing;
  perms: Permissions;
  info: RolesInfo;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const existing = editing.mode === "edit" ? editing.role : null;
  const baseline = useMemo(() => new Set(info.baseline), [info.baseline]);
  const yours = useMemo(() => new Set(info.yours), [info.yours]);
  const caps = useMemo(() => uniqueCapabilities(perms.capabilities), [perms.capabilities]);

  /** A built-in role's abilities as this editor can tick them. */
  const templateOf = (b: Base) => new Set((b ? info.templates[b] ?? [] : []).filter((k) => !baseline.has(k) && yours.has(k)));

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [describing, setDescribing] = useState(!!existing?.description);
  const [base, setBase] = useState<Base>(existing ? ((existing.template ?? "") as Base) : "member");
  const saved = useMemo(() => new Set((existing?.capabilities ?? []).filter((k) => !baseline.has(k))), [existing, baseline]);
  const [picked, setPicked] = useState<Set<string>>(() => (existing ? new Set(saved) : templateOf("member")));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [nameError, setNameError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // What a custom role may hold, grouped as on the matrix. The baseline is
  // said once above the groups; what stays with built-in roles, once below.
  const offered = useMemo(() => {
    const allowed = new Set(info.customizable);
    return groupCapabilities(caps.filter((c) => allowed.has(c.key) && !baseline.has(c.key)));
  }, [caps, info.customizable, baseline]);
  const everyone = caps.filter((c) => baseline.has(c.key));
  const leftOut = caps.filter((c) => !info.customizable.includes(c.key) && !baseline.has(c.key));
  const total = offered.reduce((n, g) => n + g.items.length, 0);

  // What the role is compared with: the built-in role it starts from, or
  // when editing, the role as saved.
  const reference = existing ? saved : templateOf(base);
  const referenceName = existing ? "the saved role" : (BASES.find((b) => b.key === base)?.label ?? "a blank role");
  const added = offered.flatMap((g) => g.items).filter((c) => picked.has(c.key) && !reference.has(c.key));
  const removed = offered.flatMap((g) => g.items).filter((c) => !picked.has(c.key) && reference.has(c.key));

  const q = query.trim().toLowerCase();
  const matches = (c: Capability, groupLabel: string) =>
    !q || shortLabel(c).toLowerCase().includes(q) || c.label.toLowerCase().includes(q) || groupLabel.toLowerCase().includes(q);
  const shown = offered.map((g) => ({ ...g, items: g.items.filter((c) => matches(c, g.label)) })).filter((g) => g.items.length > 0);
  const allOpen = offered.every((g) => open.has(g.id));

  const pickBase = (b: Base) => {
    setBase(b);
    setPicked(templateOf(b));
  };
  const toggle = (keys: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Give the role a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const capabilities = [...picked];
      if (existing) {
        await teamApi.updateRole(existing.id, { name: name.trim(), description: description.trim(), capabilities });
        toast(`${name.trim()} saved`);
      } else {
        await teamApi.createRole({ name: name.trim(), description: description.trim(), capabilities, template: base || null });
        toast(`${name.trim()} created`);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  const changes =
    added.length || removed.length
      ? [added.length ? `${added.length} added` : "", removed.length ? `${removed.length} removed` : ""].filter(Boolean).join(", ")
      : existing
        ? "no changes"
        : `same as ${referenceName}`;

  return (
    <Modal
      open
      side
      onOpenChange={(o) => !o && onClose()}
      testId="role-editor"
      title={existing ? `Edit ${existing.name}` : "New role"}
      description={
        existing && existing.member_count > 0
          ? `${existing.member_count} ${existing.member_count === 1 ? "person has" : "people have"} this role. Changes reach them within a minute.`
          : existing
            ? "No one has this role yet."
            : "Start from a built-in role, then change what you need."
      }
    >
      <form id="role-editor-form" onSubmit={save} noValidate className="xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-8">
        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            <Field id="role-name" label="Name" error={nameError}>
              {(p) => (
                <input
                  {...p}
                  value={name}
                  maxLength={40}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError("");
                  }}
                  placeholder="Release manager"
                  className={inputClass}
                  autoFocus
                />
              )}
            </Field>
            {describing ? (
              <Field id="role-description" label="Description" helper="Optional. Shown to the team next to the role.">
                {(p) => (
                  <textarea
                    {...p}
                    value={description}
                    maxLength={300}
                    rows={2}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Runs plans and looks after tests, nothing else."
                    className={inputClass}
                    autoFocus={!existing?.description}
                  />
                )}
              </Field>
            ) : (
              <button type="button" className={linkButton} onClick={() => setDescribing(true)}>
                Add a description
              </button>
            )}
          </div>

          {!existing && (
            <fieldset>
              <legend className="text-sm font-medium text-zinc-200">Start from</legend>
              <p className="mt-0.5 text-sm text-zinc-400">Ticks what that role can do. Change anything below.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {BASES.map((b) => {
                  const n = templateOf(b.key).size;
                  return (
                    <label
                      key={b.label}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 px-3 py-2.5 hover:border-zinc-600 has-[:checked]:border-zinc-300 has-[:checked]:bg-zinc-800/70"
                    >
                      <input
                        type="radio"
                        name="role-base"
                        value={b.key}
                        checked={base === b.key}
                        onChange={() => pickBase(b.key)}
                        className={`mt-0.5 h-4 w-4 shrink-0 accent-zinc-100 ${focusRing}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-100">{b.label}</span>
                        <span className="block text-xs text-zinc-400">
                          {b.blurb} · {n === 0 ? "nothing extra" : `${n} abilities`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <section aria-labelledby="role-abilities-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id="role-abilities-title" className="text-sm font-medium text-zinc-200">
                  What it can do
                </h3>
                <p className="text-sm text-zinc-400">
                  {picked.size} of {total} abilities on
                </p>
              </div>
              <button
                type="button"
                className={smallSecondaryButton}
                onClick={() => setOpen(allOpen ? new Set() : new Set(offered.map((g) => g.id)))}
              >
                {allOpen ? "Collapse all" : "Expand all"}
              </button>
            </div>

            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 scale-90 text-zinc-500">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find an ability"
                placeholder="Find an ability"
                className={`${inputClass} pl-9`}
              />
            </div>

            {everyone.length > 0 && (
              <p className="flex gap-2 text-sm text-zinc-400" data-testid="role-everyone">
                <span aria-hidden="true" className="mt-0.5 shrink-0 scale-75 text-emerald-400">
                  <CheckIcon />
                </span>
                <span>Everyone on the team can always {everyone.map((c) => lower(shortLabel(c))).join(", ")}.</span>
              </p>
            )}

            {shown.length === 0 ? (
              <p className="rounded-lg border border-zinc-800 px-4 py-6 text-center text-sm text-zinc-400">
                No ability matches “{query.trim()}”.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
                {shown.map((g) => {
                  const full = offered.find((x) => x.id === g.id)!;
                  return (
                    <Group
                      key={g.id}
                      id={g.id}
                      label={g.label}
                      items={g.items}
                      all={full.items}
                      open={!!q || open.has(g.id)}
                      onToggleOpen={() => toggleOpen(g.id)}
                      picked={picked}
                      yours={yours}
                      reference={reference}
                      referenceName={referenceName}
                      onToggle={toggle}
                    />
                  );
                })}
              </ul>
            )}

            {leftOut.length > 0 && (
              <p className="flex gap-2 text-xs text-zinc-400" data-testid="role-left-out">
                <span aria-hidden="true" className="mt-px shrink-0 scale-75">
                  <LockIcon />
                </span>
                <span>Never in a custom role, kept for built-in admins and owners: {leftOut.map((c) => lower(shortLabel(c))).join(", ")}.</span>
              </p>
            )}
          </section>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <Summary
          offered={offered}
          picked={picked}
          added={added}
          removed={removed}
          compared={existing ? "Changes since it was saved" : `Compared with ${referenceName}`}
          same={existing ? "Nothing changed yet." : `Same as ${referenceName}.`}
        />

        <ModalFooter>
          <p className="order-last text-sm text-zinc-400 sm:order-none sm:mr-auto" data-testid="role-footer-summary" aria-live="polite">
            {picked.size} {picked.size === 1 ? "ability" : "abilities"} · {changes}
          </p>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="role-editor-form" className={primaryButton} disabled={saving}>
            {saving ? "Saving…" : existing ? "Save role" : "Create role"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function Group({
  id,
  label,
  items,
  all,
  open,
  onToggleOpen,
  picked,
  yours,
  reference,
  referenceName,
  onToggle,
}: {
  id: string;
  label: string;
  /** The group's abilities a search leaves. */
  items: Capability[];
  /** All of them: "Allow all" and the count are over these. */
  all: Capability[];
  open: boolean;
  onToggleOpen: () => void;
  picked: Set<string>;
  yours: Set<string>;
  reference: Set<string>;
  referenceName: string;
  onToggle: (keys: string[], on: boolean) => void;
}) {
  const uid = useId();
  const panel = `${uid}-panel`;
  const allBox = useRef<HTMLInputElement>(null);
  const settable = all.filter((c) => yours.has(c.key)).map((c) => c.key);
  const on = all.filter((c) => picked.has(c.key)).length;
  const everyOn = settable.length > 0 && settable.every((k) => picked.has(k));
  const someOn = on > 0 && !everyOn;
  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = someOn;
  }, [someOn]);
  return (
    <li data-testid={`role-group-${id}`}>
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={onToggleOpen}
          className={`flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-3 text-left hover:bg-zinc-800/40 ${focusRing}`}
        >
          <span aria-hidden="true" className={`shrink-0 text-zinc-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
            <ChevronRightIcon />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium text-zinc-100">{label}</span>
          <span className={`shrink-0 text-sm ${on ? "text-zinc-300" : "text-zinc-400"}`} data-testid="role-group-count">
            {on} of {all.length}
          </span>
        </button>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-xs text-zinc-400 hover:text-zinc-200">
          <input
            ref={allBox}
            type="checkbox"
            checked={everyOn}
            disabled={settable.length === 0}
            onChange={(e) => onToggle(settable, e.target.checked)}
            aria-label={`Allow all in ${label}`}
            className={`h-4 w-4 accent-zinc-100 ${focusRing}`}
          />
          <span aria-hidden="true">All</span>
        </label>
      </div>
      {open && (
        <ul id={panel} className="space-y-0.5 px-2 pb-2">
          {items.map((c) => {
            const notYours = !yours.has(c.key);
            const checked = picked.has(c.key);
            const delta = checked && !reference.has(c.key) ? "added" : !checked && reference.has(c.key) ? "removed" : null;
            const box = `cap-${c.key}`;
            return (
              <li key={c.key}>
                <label
                  htmlFor={box}
                  className={`flex gap-3 rounded-md px-2 py-2 ${notYours ? "cursor-not-allowed" : "cursor-pointer hover:bg-zinc-800/50"}`}
                  data-testid="role-ability"
                >
                  <input
                    id={box}
                    type="checkbox"
                    checked={checked}
                    disabled={notYours}
                    onChange={(e) => onToggle([c.key], e.target.checked)}
                    aria-labelledby={`${box}-name`}
                    aria-describedby={`${box}-about`}
                    className={`mt-0.5 h-4 w-4 shrink-0 accent-zinc-100 disabled:opacity-50 ${focusRing}`}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span id={`${box}-name`} className={`text-sm ${notYours ? "text-zinc-400" : "text-zinc-100"}`}>
                        {shortLabel(c)}
                      </span>
                      {delta && (
                        <span
                          className={`rounded px-1.5 text-xs leading-5 ${delta === "added" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}
                          title={delta === "added" ? `Not in ${referenceName}` : `In ${referenceName}`}
                        >
                          {delta === "added" ? "Added" : "Removed"}
                        </span>
                      )}
                    </span>
                    <span id={`${box}-about`} className="block text-sm text-zinc-400">
                      {detailOf(c)}
                      {notYours && <span className="block text-xs">Your own role doesn&apos;t include this</span>}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function Summary({
  offered,
  picked,
  added,
  removed,
  compared,
  same,
}: {
  offered: { id: string; label: string; items: Capability[] }[];
  picked: Set<string>;
  added: Capability[];
  removed: Capability[];
  compared: string;
  same: string;
}) {
  const held = offered.map((g) => ({ ...g, items: g.items.filter((c) => picked.has(c.key)) })).filter((g) => g.items.length > 0);
  return (
    <aside aria-labelledby="role-summary-title" className="mt-8 xl:mt-0" data-testid="role-summary">
      <div className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 xl:sticky xl:top-0">
        <div>
          <h3 id="role-summary-title" className="text-sm font-medium text-zinc-200">
            This role can
          </h3>
          {held.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-400">Only what everyone on the team can do.</p>
          ) : (
            <dl className="mt-2 space-y-2 text-sm">
              {held.map((g) => (
                <div key={g.id}>
                  <dt className="text-xs text-zinc-400">{g.label}</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {g.items.map((c) => (
                      <span key={c.key} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">
                        {shortLabel(c)}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div data-testid="role-diff">
          <h3 className="text-sm font-medium text-zinc-200">{compared}</h3>
          {added.length === 0 && removed.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-400">{same}</p>
          ) : (
            <ul className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              {added.map((c) => (
                <li key={c.key} className="col-span-2 grid grid-cols-subgrid">
                  <span className="whitespace-nowrap text-emerald-300">Added</span>
                  <span className="text-zinc-200">{shortLabel(c)}</span>
                </li>
              ))}
              {removed.map((c) => (
                <li key={c.key} className="col-span-2 grid grid-cols-subgrid">
                  <span className="whitespace-nowrap text-amber-300">Removed</span>
                  <span className="text-zinc-200">{shortLabel(c)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

