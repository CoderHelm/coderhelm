"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon } from "./icons";
import { Callout } from "./callout";
import { Field } from "./field";
import { DetailBlock, List, ListEmpty, ListError, ListRow, ListSection, ListSkeleton } from "./list";
import { Modal, ModalFooter } from "./modal";
import { RoleEditor, type Editing as EditorMode } from "./role-editor";
import { useToast } from "./toast";
import { dangerButton, focusRing, inputClass, secondaryButton, smallSecondaryButton } from "./ui";
import { groupCapabilities } from "@/lib/permission-groups";
import { relativeTime, shortLabel, teamApi, uniqueCapabilities, type Capability, type CustomRole, type Permissions, type RoleChange, type RolesInfo } from "@/lib/team";

// "Custom roles" on Settings → Team: the team's own roles under the built-in
// ones. Everyone sees them and what each can do; built-in admins and owners
// also create, edit and delete them, and see the log of role changes. The
// capabilities offered come from the gateway's table (GET /api/roles), so one
// added there shows up in the editor by itself.

type Editing = EditorMode | null;

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
  const capByKey = useMemo(() => new Map(uniqueCapabilities(perms.capabilities).map((c) => [c.key, c])), [perms.capabilities]);

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
          {mine && <span className="ml-2 rounded border border-zinc-700 px-1.5 text-xs font-normal leading-5 text-zinc-400">Your role</span>}
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
                    <span title={c.label}>{shortLabel(c)}</span>
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
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Delete ${role.name}?`} testId="delete-role">
      <form id="delete-role-form" onSubmit={submit} noValidate className="space-y-4">
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
        <ModalFooter>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="delete-role-form" className={dangerButton} disabled={busy || (count > 0 && !replacement)}>
            {busy ? "Deleting…" : count > 0 ? "Move them and delete" : "Delete role"}
          </button>
        </ModalFooter>
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
  api_key_created: "API key made",
  api_key_revoked: "API key revoked",
  api_key_used: "API key used",
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
