"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, LockIcon } from "./icons";
import { Callout } from "./callout";
import { Field } from "./field";
import { DetailBlock, List, ListEmpty, ListError, ListRow, ListSection, ListSkeleton } from "./list";
import { Modal } from "./modal";
import { useToast } from "./toast";
import { dangerButton, focusRing, inputClass, primaryButton, secondaryButton, smallSecondaryButton } from "./ui";
import { groupCapabilities } from "@/lib/permission-groups";
import { relativeTime, teamApi, type Capability, type CustomRole, type Permissions, type RoleChange, type RolesInfo } from "@/lib/team";

// "Custom roles" on Settings → Team: the team's own roles under the built-in
// ones. Everyone sees them and what each can do; built-in admins and owners
// also create, edit and delete them, and see the log of role changes. The
// capabilities offered come from the gateway's table (GET /api/roles), so one
// added there shows up in the editor by itself.

type Editing = { mode: "new" } | { mode: "edit"; role: CustomRole } | null;

export function CustomRoles({
  perms,
  info,
  error,
  onRetry,
  onChanged,
}: {
  perms: Permissions;
  info: RolesInfo | null;
  error: string;
  onRetry: () => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CustomRole | null>(null);
  const manage = !!info?.can_manage;
  const full = !!info && info.roles.length >= info.max_roles;
  const capByKey = useMemo(() => new Map(perms.capabilities.map((c) => [c.key, c])), [perms.capabilities]);

  return (
    <div className="mt-10" data-testid="custom-roles">
      <ListSection
        id="custom-roles"
        title="Custom roles"
        count={info ? info.roles.length : undefined}
        description={
          manage
            ? "Roles your team makes from the abilities below. Built-in roles stay as they are."
            : "Roles your team's admins made from the abilities below. Only admins and owners can create or change them."
        }
        actions={
          manage ? (
            <button
              type="button"
              className={smallSecondaryButton}
              disabled={full}
              title={full ? `A team can have up to ${info?.max_roles} custom roles` : undefined}
              onClick={() => setEditing({ mode: "new" })}
            >
              New role
            </button>
          ) : undefined
        }
      >
        {error ? (
          <ListError title="We couldn't load custom roles" onRetry={onRetry}>
            {error}
          </ListError>
        ) : !info ? (
          <ListSkeleton rows={2} label="Loading custom roles" />
        ) : info.roles.length === 0 ? (
          <ListEmpty
            title="No custom roles yet."
            action={
              manage ? (
                <button type="button" className={secondaryButton} onClick={() => setEditing({ mode: "new" })}>
                  Create a role
                </button>
              ) : undefined
            }
          >
            {manage
              ? "Make a role when a built-in one gives someone too much or too little, like Member plus test settings."
              : "When an admin makes one, it shows up here with what it can do."}
          </ListEmpty>
        ) : (
          <List label="Custom roles">
            {info.roles.map((r) => (
              <RoleRow
                key={r.id}
                role={r}
                perms={perms}
                capByKey={capByKey}
                mine={perms.your_role === r.key}
                manage={manage}
                onEdit={() => setEditing({ mode: "edit", role: r })}
                onDelete={() => setDeleting(r)}
              />
            ))}
          </List>
        )}
      </ListSection>

      {manage && <RoleChanges version={info?.roles.map((r) => `${r.id}:${r.updated_at}:${r.member_count}`).join("|") ?? ""} />}

      {editing && info && (
        <RoleEditor
          key={editing.mode === "edit" ? editing.role.id : "new"}
          editing={editing}
          perms={perms}
          info={info}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await onChanged();
          }}
        />
      )}
      {deleting && info && (
        <DeleteRole
          role={deleting}
          perms={perms}
          info={info}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function RoleRow({
  role,
  perms,
  capByKey,
  mine,
  manage,
  onEdit,
  onDelete,
}: {
  role: CustomRole;
  perms: Permissions;
  capByKey: Map<string, Capability>;
  mine: boolean;
  manage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const held = role.capabilities.map((k) => capByKey.get(k)).filter((c): c is Capability => !!c);
  const groups = groupCapabilities(held);
  const actsAs = perms.roles.find((r) => r.key === role.acts_as)?.label ?? role.acts_as;
  return (
    <ListRow
      testId="custom-role-row"
      data={{ role: role.key }}
      title={
        <>
          {role.name}
          {mine && <span className="ml-2 rounded border border-zinc-700 px-1.5 text-[11px] font-normal leading-5 text-zinc-400">Your role</span>}
        </>
      }
      titleText={role.name}
      meta={[
        `${role.member_count} ${role.member_count === 1 ? "person" : "people"}`,
        `${held.length} ${held.length === 1 ? "ability" : "abilities"}`,
        role.updated_at ? `changed ${relativeTime(role.updated_at)}` : null,
      ]}
      summary={role.description || undefined}
      summaryTone="muted"
      detailsLabel="What it can do"
      detailsFor={`what ${role.name} can do`}
      details={
        <>
          {groups.map((g) => (
            <DetailBlock key={g.id} title={g.label}>
              <ul className="space-y-1">
                {g.items.map((c) => (
                  <li key={c.key} className="flex gap-2">
                    <span className="mt-0.5 shrink-0 scale-75 text-emerald-400" aria-hidden="true">
                      <CheckIcon />
                    </span>
                    <span>{c.label}</span>
                  </li>
                ))}
              </ul>
            </DetailBlock>
          ))}
          <p className="text-zinc-500">Anywhere else, people with this role can do what a {actsAs} can.</p>
        </>
      }
      actions={
        manage ? (
          <span className="flex gap-2">
            <button type="button" className={smallSecondaryButton} onClick={onEdit} aria-label={`Edit ${role.name}`}>
              Edit
            </button>
            <button
              type="button"
              className={`inline-flex min-h-8 items-center rounded-lg px-3 text-xs font-medium text-red-400 hover:bg-red-500/10 ${focusRing}`}
              onClick={onDelete}
              aria-label={`Delete ${role.name}`}
            >
              Delete
            </button>
          </span>
        ) : undefined
      }
    />
  );
}

// ── Editor ───────────────────────────────────────────────────────────

const TEMPLATE_LABEL: Record<string, string> = { viewer: "Viewer", member: "Member", admin: "Admin" };

function RoleEditor({
  editing,
  perms,
  info,
  onClose,
  onSaved,
}: {
  editing: NonNullable<Editing>;
  perms: Permissions;
  info: RolesInfo;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const existing = editing.mode === "edit" ? editing.role : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [template, setTemplate] = useState<string>(existing?.template ?? "");
  const baseline = useMemo(() => new Set(info.baseline), [info.baseline]);
  const yours = useMemo(() => new Set(info.yours), [info.yours]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set((existing?.capabilities ?? info.templates.member ?? []).filter((k) => !baseline.has(k))));
  const [nameError, setNameError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Only what a custom role may hold, grouped as on the matrix above.
  const offered = useMemo(() => {
    const allowed = new Set([...info.customizable, ...info.baseline]);
    return groupCapabilities(perms.capabilities.filter((c) => allowed.has(c.key)));
  }, [perms.capabilities, info.customizable, info.baseline]);
  const leftOut = perms.capabilities.filter((c) => !info.customizable.includes(c.key) && !baseline.has(c.key));

  const startFrom = (t: string) => {
    setTemplate(t);
    if (t) setPicked(new Set((info.templates[t] ?? []).filter((k) => !baseline.has(k) && yours.has(k))));
  };
  const toggle = (key: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
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
        await teamApi.createRole({ name: name.trim(), description: description.trim(), capabilities, template: template || null });
        toast(`${name.trim()} created`);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Edit ${existing.name}` : "New role"}
      description={
        existing && existing.member_count > 0
          ? `${existing.member_count} ${existing.member_count === 1 ? "person has" : "people have"} this role. Changes reach them within a minute.`
          : "Pick what people with this role can do."
      }
    >
      <form onSubmit={save} noValidate className="space-y-5" data-testid="role-editor">
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
            />
          )}
        </Field>
        {!existing && (
          <Field id="role-template" label="Start from" helper="Ticks what that built-in role can do. Change anything after.">
            {(p) => (
              <select {...p} value={template} onChange={(e) => startFrom(e.target.value)} className={`${inputClass} sm:w-56`}>
                <option value="">Nothing ticked</option>
                {Object.keys(info.templates).map((t) => (
                  <option key={t} value={t}>
                    {TEMPLATE_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <fieldset>
          <legend className="text-sm font-semibold text-zinc-100">What it can do</legend>
          <div className="mt-2 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {offered.map((g) => (
              <div key={g.id} className="px-3 py-2.5" data-testid={`role-group-${g.id}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{g.label}</p>
                <ul className="mt-1.5 space-y-1">
                  {g.items.map((c) => {
                    const always = baseline.has(c.key);
                    const notYours = !always && !yours.has(c.key);
                    const checked = always || picked.has(c.key);
                    const note = always ? "Everyone on the team can do this" : notYours ? "Your own role doesn't include this" : "";
                    const id = `cap-${c.key}`;
                    return (
                      <li key={c.key}>
                        <label htmlFor={id} className={`flex gap-2.5 rounded-md px-1 py-1 text-sm ${always || notYours ? "cursor-not-allowed text-zinc-500" : "cursor-pointer text-zinc-200 hover:bg-zinc-800/50"}`}>
                          <input
                            id={id}
                            type="checkbox"
                            checked={checked}
                            disabled={always || notYours}
                            onChange={(e) => toggle(c.key, e.target.checked)}
                            className={`mt-0.5 h-4 w-4 shrink-0 accent-zinc-100 disabled:opacity-50 ${focusRing}`}
                          />
                          <span className="min-w-0">
                            {c.label}
                            {note && <span className="block text-xs text-zinc-500">{note}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {leftOut.length > 0 && (
            <p className="mt-2 flex gap-1.5 text-xs text-zinc-500" data-testid="role-left-out">
              <span aria-hidden="true" className="mt-px shrink-0 scale-75">
                <LockIcon />
              </span>
              <span>Never in a custom role: {leftOut.map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1)).join("; ")}.</span>
            </p>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={saving}>
            {saving ? "Saving…" : existing ? "Save role" : "Create role"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Delete ───────────────────────────────────────────────────────────

function DeleteRole({
  role,
  perms,
  info,
  onClose,
  onDeleted,
}: {
  role: CustomRole;
  perms: Permissions;
  info: RolesInfo;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [count, setCount] = useState(role.member_count);
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Roles its members can move to: built-in roles you may give (never owner)
  // and the team's other custom roles you may give.
  const options = [
    ...perms.roles.filter((r) => r.assignable && r.key !== "owner" && perms.grantable_roles.includes(r.key)).map((r) => ({ key: r.key, label: r.label })),
    ...info.roles.filter((r) => r.id !== role.id && perms.grantable_roles.includes(r.key)).map((r) => ({ key: r.key, label: r.name })),
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (count > 0 && !replacement) {
      setError("Pick the role its members get instead.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await teamApi.deleteRole(role.id, count > 0 ? replacement : undefined);
      const to = options.find((o) => o.key === r.replacement)?.label;
      toast(r.moved > 0 && to ? `${role.name} deleted. ${r.moved} moved to ${to}.` : `${role.name} deleted`);
      await onDeleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The request failed.";
      // Someone was given the role meanwhile: ask for a replacement now.
      const m = msg.match(/^(\d+) (?:person has|people have) this role/);
      if (m) setCount(Number(m[1]));
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Delete ${role.name}?`}>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="delete-role">
        {count > 0 ? (
          <>
            <p className="text-sm text-zinc-300">
              {count} {count === 1 ? "person has" : "people have"} this role. Pick the role they get instead; it applies to them at once.
            </p>
            <Field id="replacement-role" label="Move them to">
              {(p) => (
                <select
                  {...p}
                  value={replacement}
                  onChange={(e) => {
                    setReplacement(e.target.value);
                    if (error) setError("");
                  }}
                  className={inputClass}
                >
                  <option value="">Pick a role</option>
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        ) : (
          <p className="text-sm text-zinc-300">No one has this role. It is removed for good; the log of role changes keeps a record.</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={dangerButton} disabled={busy || (count > 0 && !replacement)}>
            {busy ? "Deleting…" : count > 0 ? "Move them and delete" : "Delete role"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── The log of role changes ──────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Changed",
  deleted: "Deleted",
  assigned: "Role given",
};

function RoleChanges({ version }: { version: string }) {
  const [entries, setEntries] = useState<RoleChange[] | null>(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    teamApi
      .roleChanges()
      .then((r) => live && (setEntries(r.entries), setError("")))
      .catch((e) => live && setError(e instanceof Error ? e.message : "The request failed."));
    return () => {
      live = false;
    };
  }, [version]);

  const shown = all ? entries ?? [] : (entries ?? []).slice(0, 5);
  return (
    <div className="mt-6">
      <ListSection id="role-changes" title="Role changes" level={3} description="Who created, changed, deleted or gave out a role, newest first.">
        {error ? (
          <Callout variant="error" live={false}>
            <p>{error}</p>
          </Callout>
        ) : !entries ? (
          <ListSkeleton rows={2} label="Loading role changes" />
        ) : entries.length === 0 ? (
          <ListEmpty title="No role changes yet." />
        ) : (
          <>
            <List label="Role changes">
              {shown.map((e, i) => (
                <ListRow
                  key={`${e.at}-${i}`}
                  testId="role-change"
                  title={`${ACTION_LABEL[e.action] ?? e.action}: ${e.role_name}`}
                  meta={[e.actor, e.detail]}
                  time={e.at}
                />
              ))}
            </List>
            {entries.length > 5 && (
              <button type="button" className={`${smallSecondaryButton} mt-2`} onClick={() => setAll((v) => !v)}>
                {all ? "Show fewer" : `Show all ${entries.length}`}
              </button>
            )}
          </>
        )}
      </ListSection>
    </div>
  );
}
