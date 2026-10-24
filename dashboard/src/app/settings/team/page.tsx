"use client";

import { useCan } from "@/hooks/use-can";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import {
  canManageInvites,
  customRoleInfo,
  displayName,
  isCustomRole,
  isInviteExpired,
  shortDate,
  isGithubOnly,
  isLinkTarget,
  isValidEmail,
  linkSuggestions,
  matchScore,
  relativeTime,
  roleLadder,
  teamApi,
  type LinkSuggestion,
  type Member,
  type Permissions,
  type RoleInfo,
  type RolesInfo,
} from "@/lib/team";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { GROUP_LABEL, List, ListEmpty, ListError, ListRow, ListSection, ListSkeleton, ListToolbar, useListParams } from "@/components/list";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { CheckIcon, GitHubIcon, MailIcon } from "@/components/icons";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import { RolesMatrix } from "@/components/roles-matrix";
import { CustomRoles } from "@/components/custom-roles";

const ROLE_STYLE: Record<string, string> = {
  owner: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  admin: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  member: "border-zinc-700 bg-zinc-800/60 text-zinc-200",
  billing: "border-zinc-700 bg-zinc-800/60 text-zinc-200",
  viewer: "border-zinc-800 bg-zinc-900 text-zinc-400",
};
const CUSTOM_STYLE = "border-violet-500/30 bg-violet-500/10 text-violet-300";
const roleStyle = (key: string) => (isCustomRole(key) ? CUSTOM_STYLE : (ROLE_STYLE[key] ?? ROLE_STYLE.member));

type StatusFilter = "all" | "active" | "github";

export default function TeamPageWithParams() {
  return (
    <Suspense fallback={<Page><PageHeader title="Team" /><div className="mt-8"><ListSkeleton rows={3} label="Loading members" /></div></Page>}>
      <TeamPage />
    </Suspense>
  );
}

function TeamPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [rolesInfo, setRolesInfo] = useState<RolesInfo | null>(null);
  const [rolesError, setRolesError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // ?q= search (the ⌘K palette links a member here by email), ?role=, ?signin=.
  const [params, setParams] = useListParams({ q: "", role: "all", signin: "all" });
  const query = params.q;
  const roleFilter = params.role;
  const statusFilter: StatusFilter = params.signin === "active" || params.signin === "github" ? params.signin : "all";
  const clearFilters = () => setParams({ q: "", role: "all", signin: "all" });
  const [linking, setLinking] = useState<Member | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([teamApi.members(), teamApi.permissions()]);
      setMembers(m.users);
      setPerms(p);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    }
  }, []);

  // Custom roles load on their own: the people list works without them.
  const loadRoles = useCallback(async () => {
    try {
      setRolesInfo(await teamApi.roles());
      setRolesError("");
    } catch (e) {
      setRolesError(e instanceof Error ? e.message : "The request failed.");
    }
  }, []);

  useEffect(() => {
    load();
    loadRoles();
    api
      .listTeams()
      .then((t) => setTeamName(t.teams.find((x) => x.current)?.org ?? ""))
      .catch(() => {});
  }, [load, loadRoles]);

  const role = perms?.your_role ?? "viewer";
  const { can } = useCan();
  const canRenameTeam = can("team_name");
  const canManagePeople = (perms?.manageable_roles.length ?? 0) > 0;
  // Invites are not seats: an admin may resend or revoke every pending invite,
  // including one that offers the admin role.
  const canInvites = canManageInvites(perms);
  // Built-in roles, then the team's custom roles, as role options.
  const allRoles = useMemo<RoleInfo[]>(() => [...(perms?.roles ?? []), ...(rolesInfo?.roles ?? []).map(customRoleInfo)], [perms, rolesInfo]);
  const roleInfo = useCallback((key: string) => allRoles.find((r) => r.key === key), [allRoles]);
  const roleLabel = (key: string) => roleInfo(key)?.label ?? (isCustomRole(key) ? "Custom role" : key);

  const active = useMemo(() => (members ?? []).filter((m) => m.status === "active"), [members]);
  const invites = useMemo(() => (members ?? []).filter((m) => m.status === "invited"), [members]);
  const owners = active.filter((m) => m.role === "owner").length;
  const suggestions = useMemo(() => (canManagePeople ? linkSuggestions(active) : []), [active, canManagePeople]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (statusFilter === "github" && !isGithubOnly(m)) return false;
      if (statusFilter === "active" && isGithubOnly(m)) return false;
      if (!q) return true;
      return [m.name, m.email, m.github_login].some((v) => v?.toLowerCase().includes(q));
    });
  }, [active, query, roleFilter, statusFilter]);

  const canManage = (m: Member) => !m.is_self && !!perms?.manageable_roles.includes(m.role);
  const isLastOwner = (m: Member) => m.role === "owner" && owners <= 1;

  const changeRole = async (m: Member, next: string) => {
    if (next === m.role) return;
    const info = roleInfo(next);
    const ok = await confirm({
      title: `Make ${displayName(m)} ${articled(info?.label ?? next)}?`,
      message: `${info?.summary ?? ""} It applies the next time they sign in; a session that is already open picks it up within a few days.`,
      confirmLabel: `Make ${info?.label ?? next}`,
    });
    if (!ok) return;
    setBusy(m.user_id);
    try {
      await teamApi.setRole(m.user_id, next);
      setMembers((prev) => prev?.map((x) => (x.user_id === m.user_id ? { ...x, role: next } : x)) ?? null);
      toast(`${displayName(m)} is now ${articled(info?.label ?? next)}`);
      // Custom roles show how many people hold them.
      if (isCustomRole(next) || isCustomRole(m.role)) loadRoles();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy("");
    }
  };

  const remove = async (m: Member) => {
    const invite = m.status === "invited";
    const ok = await confirm({
      title: invite ? `Revoke the invite for ${displayName(m)}?` : `Remove ${displayName(m)} from the team?`,
      message: invite
        ? "The link in their email stops working. You can invite them again later."
        : "They lose access to this team. Their past runs and plans stay. You can invite them again later.",
      confirmLabel: invite ? "Revoke invite" : "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(m.user_id);
    try {
      await teamApi.remove(m.user_id);
      setMembers((prev) => prev?.filter((x) => x.user_id !== m.user_id) ?? null);
      toast(invite ? `Invite for ${displayName(m)} revoked` : `${displayName(m)} removed`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy("");
    }
  };

  const resend = async (m: Member) => {
    setBusy(m.user_id);
    try {
      const r = await teamApi.resend(m.user_id);
      const renewed = { invited_at: r.invited_at ?? new Date().toISOString(), invite_expires_at: r.invite_expires_at ?? null, invite_expired: false };
      setMembers((prev) => prev?.map((x) => (x.user_id === m.user_id ? { ...x, ...renewed } : x)) ?? null);
      const until = shortDate(r.invite_expires_at);
      toast(`Invite sent again to ${m.email}${until ? `. It works until ${until}.` : ""}`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy("");
    }
  };

  const link = async (person: Member, github: Member) => {
    setBusy(person.user_id);
    try {
      await teamApi.linkGithub(person.user_id, github.user_id);
      toast(`Linked @${github.github_login} to ${displayName(person)}`);
      setLinking(null);
      await load();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy("");
    }
  };

  const loading = members === null && !error;

  return (
    <Page>
      <PageHeader
        title="Team"
        lead={
          <>
            {teamName ? <span className="text-zinc-200">{teamName}</span> : "This workspace"}
            {members ? ` · ${active.length} ${active.length === 1 ? "person" : "people"}` : ""}
            {". "}
            Who has access, what their role lets them do, and pending invites.
          </>
        }
      />
      {canRenameTeam && <RenameTeam current={teamName} onRenamed={setTeamName} />}

      {error && (
        <div className="mt-6">
          <ListError title="We couldn't load your team" onRetry={() => { setError(""); load(); }}>
            {error}
          </ListError>
        </div>
      )}

      {perms && !canManagePeople && (
        <div className="mt-6">
          <Callout live={false}>
            <p>
              You&apos;re {articled(roleLabel(role))} on this team, so this page is read-only. Ask an admin or owner to invite people or change
              roles.
            </p>
          </Callout>
        </div>
      )}

      {canManagePeople && perms && (
        <InviteForm
          roles={allRoles.filter((r) => perms.grantable_roles.includes(r.key) && r.key !== "owner")}
          onInvited={async (email, status) => {
            toast(status === "active" ? `${email} already had an account and is now on the team` : `Invite sent to ${email}`);
            await load();
          }}
        />
      )}

      {suggestions.length > 0 && (
        <section aria-labelledby="dupes-heading" className="mt-8">
          <h2 id="dupes-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Possibly the same person ({suggestions.length})
          </h2>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5">
            <p className="border-b border-zinc-800 px-4 py-3 text-sm text-zinc-300">
              These GitHub sign-ins look like members who sign in with email. Linking makes them one person who can sign in either way. Check
              each one: nothing is linked until you confirm.
            </p>
            <ul className="divide-y divide-zinc-800">
              {suggestions.map((s) => (
                <SuggestionRow
                  key={s.github.user_id}
                  s={s}
                  busy={busy === s.person.user_id}
                  onReview={() => setLinking(s.person)}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="mt-8">
        <ListSection id="members" title="Members" count={members ? active.length : undefined}>
          {members && active.length > 0 && (
            <ListToolbar
              className="mb-3"
              search={{
                value: query,
                onChange: (v) => setParams({ q: v }, { replace: true }),
                placeholder: "Search by name, email or GitHub username",
                label: "Search members",
              }}
              status={{
                label: "Filter by role",
                value: roleFilter,
                onChange: (v) => setParams({ role: v }),
                options: [
                  { value: "all", label: GROUP_LABEL.all, count: active.length },
                  ...(perms ? roleLadder(perms) : [])
                    .slice()
                    .reverse()
                    .filter((r) => r.assignable || active.some((m) => m.role === r.key))
                    .map((r) => ({ value: r.key, label: r.label, count: active.filter((m) => m.role === r.key).length })),
                  ...(rolesInfo?.roles ?? [])
                    .filter((r) => active.some((m) => m.role === r.key))
                    .map((r) => ({ value: r.key, label: r.name, count: active.filter((m) => m.role === r.key).length })),
                ],
              }}
              actions={
                <Select label="Filter by sign-in" value={statusFilter} onChange={(v) => setParams({ signin: v })}>
                  <option value="all">Any sign-in</option>
                  <option value="active">Signs in with email</option>
                  <option value="github">GitHub sign-in only</option>
                </Select>
              }
              onClear={query || roleFilter !== "all" || statusFilter !== "all" ? clearFilters : undefined}
            />
          )}

          {loading ? (
            <ListSkeleton rows={3} label="Loading members" />
          ) : members && active.length === 0 ? (
            <ListEmpty title="No one is on this team yet." />
          ) : members && shown.length === 0 ? (
            <ListEmpty title="No members match these filters." onClear={clearFilters} />
          ) : members ? (
            <List label="Members">
              {shown.map((m) => (
                <MemberRow
                  key={m.user_id}
                  m={m}
                  perms={perms}
                  roles={allRoles}
                  manageable={canManage(m)}
                  lastOwner={isLastOwner(m)}
                  busy={busy === m.user_id}
                  linkable={canManagePeople && (isGithubOnly(m) || isLinkTarget(m))}
                  onRole={(next) => changeRole(m, next)}
                  onRemove={() => remove(m)}
                  onLink={() => setLinking(m)}
                  roleLabel={roleLabel}
                />
              ))}
            </List>
          ) : null}
        </ListSection>
      </div>

      {canInvites && members && (
        <div className="mt-8">
          <ListSection id="invites" title="Pending invites" count={invites.length || undefined} group="waiting">
            {invites.length === 0 ? (
              <ListEmpty title="No pending invites.">People you invite show up here until they sign in.</ListEmpty>
            ) : (
              <List label="Pending invites">
                {invites.map((m) => {
                  const expired = isInviteExpired(m);
                  const sent = relativeTime(m.invited_at ?? m.updated_at);
                  const until = shortDate(m.invite_expires_at);
                  return (
                    <ListRow
                      key={m.user_id}
                      testId="invite-row"
                      leading={
                        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-700 text-zinc-500">
                          <MailIcon />
                        </span>
                      }
                      title={m.email}
                      meta={[
                        `Invited as ${articled(roleLabel(m.role))}`,
                        sent ? `sent ${sent}` : null,
                        until ? (expired ? `expired ${until}` : `works until ${until}`) : null,
                      ]}
                      summary={expired ? "The link no longer works. Resend it, or revoke the invite." : undefined}
                      summaryTone="muted"
                      chips={expired ? <StatusPill tone="error">Expired</StatusPill> : <StatusPill tone="warning">Invited</StatusPill>}
                      actions={
                        canInvites ? (
                          <span className="flex gap-2">
                            <button type="button" className={`${secondaryButton} !min-h-8 !py-1`} disabled={busy === m.user_id} onClick={() => resend(m)}>
                              Resend
                            </button>
                            <button
                              type="button"
                              className={`inline-flex min-h-8 items-center rounded-lg px-3 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 ${focusRing}`}
                              disabled={busy === m.user_id}
                              onClick={() => remove(m)}
                              aria-label={`Revoke invite for ${m.email}`}
                            >
                              Revoke
                            </button>
                          </span>
                        ) : undefined
                      }
                    />
                  );
                })}
              </List>
            )}
          </ListSection>
        </div>
      )}

      {perms && <RolesMatrix perms={perms} inUse={new Set(active.map((m) => m.role))} />}
      {perms && (
        <CustomRoles
          perms={perms}
          info={rolesInfo}
          error={rolesError}
          onRetry={() => {
            setRolesError("");
            loadRoles();
          }}
          onChanged={async () => {
            await Promise.all([load(), loadRoles()]);
          }}
        />
      )}

      {linking && members && (
        <LinkDialog
          from={linking}
          members={active}
          busy={busy !== ""}
          onCancel={() => setLinking(null)}
          onConfirm={(person, github) => link(person, github)}
        />
      )}
    </Page>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────

function articled(label: string) {
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "The request failed.";
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="relative min-w-0 flex-1 sm:flex-none">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-9 w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-3 pr-8 text-sm text-zinc-100 hover:border-zinc-500 sm:w-auto ${focusRing}`}
      >
        {children}
      </select>
      <Chevron />
    </div>
  );
}

function Chevron() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Avatar({ m, size = 40 }: { m: Member; size?: number }) {
  const [broken, setBroken] = useState(false);
  const label = displayName(m).replace(/^@/, "");
  const style = { width: size, height: size };
  if (m.avatar_url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.avatar_url} alt="" style={style} className="shrink-0 rounded-full bg-zinc-800" onError={() => setBroken(true)} />;
  }
  return (
    <span aria-hidden="true" style={style} className="flex shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-300">
      {(label[0] || "?").toUpperCase()}
    </span>
  );
}

function RoleChip({ role, label }: { role: string; label: string }) {
  return (
    <span className={`inline-flex min-h-8 items-center rounded-lg border px-2.5 text-xs font-medium ${roleStyle(role)}`}>{label}</span>
  );
}

function GithubLink({ login }: { login: string }) {
  return (
    <a
      href={`https://github.com/${encodeURIComponent(login)}`}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 rounded text-zinc-400 hover:text-zinc-100 ${focusRing}`}
    >
      <span aria-hidden="true" className="scale-[0.8]">
        <GitHubIcon />
      </span>
      <span className="truncate">{login}</span>
      <span className="sr-only"> on GitHub (opens in a new tab)</span>
    </a>
  );
}

function MemberRow({
  m,
  perms,
  roles,
  manageable,
  lastOwner,
  busy,
  linkable,
  onRole,
  onRemove,
  onLink,
  roleLabel,
}: {
  m: Member;
  perms: Permissions | null;
  roles: RoleInfo[];
  manageable: boolean;
  lastOwner: boolean;
  busy: boolean;
  linkable: boolean;
  onRole: (role: string) => void;
  onRemove: () => void;
  onLink: () => void;
  roleLabel: (key: string) => string;
}) {
  const githubOnly = isGithubOnly(m);
  const seen = relativeTime(m.last_active_at);
  const grantable = perms?.grantable_roles ?? [];
  // The current role stays selectable even when it isn't grantable (e.g. billing).
  const options = roles.filter((r) => r.key === m.role || (r.assignable && grantable.includes(r.key)));
  const name = displayName(m);
  const actions: { label: string; onSelect: () => void; danger?: boolean; disabledReason?: string }[] = [];
  if (manageable && linkable) {
    actions.push({ label: githubOnly ? "Link to a member who signs in with email…" : "Link a GitHub sign-in…", onSelect: onLink });
  }
  if (manageable) {
    actions.push({
      label: "Remove from team",
      onSelect: onRemove,
      danger: true,
      disabledReason: lastOwner ? "The last owner can't be removed" : undefined,
    });
  }

  return (
    <ListRow
      testId="member-row"
      data={{ role: m.role }}
      leading={<Avatar m={m} />}
      title={
        <>
          {name}
          {m.is_self && <span className="ml-2 rounded border border-zinc-700 px-1.5 text-[11px] font-normal leading-5 text-zinc-400">You</span>}
        </>
      }
      titleText={name}
      meta={[
        m.email && m.email !== name ? <span key="email">{m.email}</span> : null,
        m.github_login ? <GithubLink key="gh" login={m.github_login} /> : null,
      ]}
      chips={
        <>
          <span className="flex flex-col items-start gap-1 sm:items-end">
            {githubOnly ? <StatusPill>GitHub sign-in only</StatusPill> : <StatusPill tone="success">Active</StatusPill>}
            <span className="text-xs text-zinc-500">{seen ? `Active ${seen}` : "Not active yet"}</span>
          </span>
          {manageable && !lastOwner ? (
            <span className="relative">
              <select
                aria-label={`Role for ${name}`}
                value={m.role}
                disabled={busy}
                onChange={(e) => onRole(e.target.value)}
                className={`min-h-8 cursor-pointer appearance-none rounded-lg border py-1 pl-2.5 pr-7 text-xs font-medium disabled:opacity-50 ${roleStyle(m.role)} ${focusRing}`}
              >
                {options.map((r) => (
                  <option key={r.key} value={r.key} className="bg-zinc-900 text-zinc-100">
                    {r.label}
                  </option>
                ))}
              </select>
              <Chevron />
            </span>
          ) : (
            <span title={lastOwner && manageable ? "Make someone else an owner before changing this role" : undefined}>
              <RoleChip role={m.role} label={roleLabel(m.role)} />
            </span>
          )}
        </>
      }
      actions={actions.length > 0 ? <ActionsMenu label={`More actions for ${name}`} actions={actions} disabled={busy} /> : <span className="hidden w-9 sm:block" />}
    />
  );
}

function ActionsMenu({
  label,
  actions,
  disabled,
}: {
  label: string;
  actions: { label: string; onSelect: () => void; danger?: boolean; disabledReason?: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    }
  };

  return (
    <div ref={wrap} className="relative" onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 ${focusRing}`}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className="absolute right-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              disabled={!!a.disabledReason}
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className={`block w-full px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 focus:bg-zinc-800 focus:outline-none hover:bg-zinc-800 ${a.danger ? "text-red-400" : "text-zinc-200"}`}
            >
              {a.label}
              {a.disabledReason && <span className="mt-0.5 block text-xs text-zinc-500">{a.disabledReason}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ s, busy, onReview }: { s: LinkSuggestion; busy: boolean; onReview: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-3">
        <div className="flex shrink-0 -space-x-2">
          <Avatar m={s.github} size={32} />
          <Avatar m={s.person} size={32} />
        </div>
        <div className="min-w-0 text-sm">
          <p className="flex flex-wrap items-center gap-x-1.5 text-zinc-100">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="scale-[0.8]">
                <GitHubIcon />
              </span>
              {s.github.github_login}
            </span>
            <span className="text-zinc-500">may be</span>
            <span className="truncate">{displayName(s.person)}</span>
          </p>
          <p className="truncate text-xs text-zinc-500">
            {s.reason}
            {s.person.email && s.person.email !== displayName(s.person) ? ` · ${s.person.email}` : ""}
          </p>
        </div>
      </div>
      <button type="button" className={secondaryButton} disabled={busy} onClick={onReview}>
        Review and link
      </button>
    </li>
  );
}

function LinkDialog({
  from,
  members,
  busy,
  onCancel,
  onConfirm,
}: {
  from: Member;
  members: Member[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (person: Member, github: Member) => void;
}) {
  const fromGithub = isGithubOnly(from);
  // Candidates on the other side, likeliest first.
  const candidates = useMemo(() => {
    const pool = members.filter((m) => m.user_id !== from.user_id && (fromGithub ? isLinkTarget(m) : isGithubOnly(m)));
    return pool
      .map((m) => ({ m, ...(fromGithub ? matchScore(from, m) : matchScore(m, from)) }))
      .sort((a, b) => b.score - a.score || displayName(a.m).localeCompare(displayName(b.m)));
  }, [members, from, fromGithub]);
  const [picked, setPicked] = useState<string>(candidates[0]?.score >= 0.5 ? candidates[0].m.user_id : "");
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = dialog.current?.querySelector<HTMLElement>("input, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const chosen = candidates.find((c) => c.m.user_id === picked)?.m;
  const person = fromGithub ? chosen : from;
  const github = fromGithub ? from : chosen;

  return (
    <div className="fixed inset-0 z-[9997] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-xl border border-zinc-800 bg-zinc-900 shadow-2xl sm:rounded-xl"
      >
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-zinc-100">
            {fromGithub ? `Link ${from.github_login} to a member` : `Link a GitHub sign-in to ${displayName(from)}`}
          </h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            Pick the record that is the same person. They become one member who can sign in with email or GitHub. The GitHub-only record is
            removed and the higher of the two roles is kept.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-zinc-400">
              {fromGithub ? "No members who sign in with email are left to link to." : "There are no GitHub sign-in-only records to link."}
            </p>
          ) : (
            <fieldset>
              <legend className="sr-only">{fromGithub ? "Member who signs in with email" : "GitHub sign-in"}</legend>
              <ul className="space-y-2">
                {candidates.map(({ m, score, reason }) => (
                  <li key={m.user_id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${
                        picked === m.user_id ? "border-zinc-400 bg-zinc-800/80" : "border-zinc-800 hover:bg-zinc-800/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="link-target"
                        value={m.user_id}
                        checked={picked === m.user_id}
                        onChange={() => setPicked(m.user_id)}
                        className="h-4 w-4 accent-zinc-100"
                      />
                      <Avatar m={m} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-zinc-100">
                          {fromGithub ? displayName(m) : m.github_login}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {fromGithub ? m.email : `GitHub sign-in only · ${m.role}`}
                        </span>
                        {score >= 0.5 && (
                          <span className="mt-1 block" title={reason}>
                            <StatusPill tone="warning">Likely match</StatusPill>
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          {person && github && (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-300">
              <p className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-0.5 text-emerald-400">
                  <CheckIcon />
                </span>
                <span>
                  <span className="text-zinc-100">{displayName(person)}</span> keeps their email sign-in and gains GitHub{" "}
                  <span className="text-zinc-100">{github.github_login}</span>. The separate GitHub-only row disappears.
                </span>
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryButton}
            disabled={!person || !github || busy}
            onClick={() => person && github && onConfirm(person, github)}
          >
            {busy ? "Linking…" : "Link accounts"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteForm({ roles, onInvited }: { roles: RoleInfo[]; onInvited: (email: string, status: "invited" | "active") => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles.find((r) => r.key === "member")?.key ?? roles[0]?.key ?? "member");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const selected = roles.find((r) => r.key === role);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!isValidEmail(value)) {
      setError("Enter a valid email address, like name@example.com.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const r = await teamApi.invite(value, role);
      setEmail("");
      await onInvited(value, r.status);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby="invite-heading" className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
      <h2 id="invite-heading" className="text-sm font-semibold text-zinc-100">
        Invite someone
      </h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor="invite-email" className="sr-only">
            Email address
          </label>
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "invite-error" : "invite-help"}
            className={inputClass}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:flex-none">
            <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className={`${inputClass} appearance-none pr-8 sm:w-32`}>
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
          <button type="submit" className={`${primaryButton} shrink-0`} disabled={sending}>
            {sending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
      {error ? (
        <p id="invite-error" role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      ) : (
        <p id="invite-help" className="mt-2 text-sm text-zinc-500">
          {selected ? `${selected.label}: ${selected.summary}` : ""} They get an email and join when they sign in with that address.
        </p>
      )}
    </form>
  );
}

function RenameTeam({ current, onRenamed }: { current: string; onRenamed: (name: string) => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    setSaving(true);
    try {
      await api.renameTeam(value);
      onRenamed(value);
      setEditing(false);
      toast("Team renamed");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`${linkButton} mt-1 text-xs`}
        onClick={() => {
          setName(current);
          setEditing(true);
        }}
      >
        Rename team
      </button>
    );
  }
  return (
    <form onSubmit={save} className="mt-3 flex max-w-md flex-col gap-2 sm:flex-row">
      <label htmlFor="team-name" className="sr-only">
        Team name
      </label>
      <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} autoFocus />
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={secondaryButton} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
