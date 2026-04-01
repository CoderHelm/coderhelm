"use client";

import { useEffect, useState } from "react";
import { api, type TeamUser } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";

const ROLES = ["viewer", "member", "billing", "admin", "owner"] as const;
const ROLE_COLORS: Record<string, string> = {
  owner: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  admin: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  billing: "text-green-400 bg-green-500/10 border-green-500/20",
  member: "text-zinc-300 bg-zinc-800 border-zinc-700",
  viewer: "text-zinc-500 bg-zinc-900 border-zinc-800",
};

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState("");
  const [myUserId, setMyUserId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // Allowlist state
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [allowEmail, setAllowEmail] = useState("");
  const [addingAllow, setAddingAllow] = useState(false);

  useEffect(() => {
    Promise.all([api.me(), api.listUsers(), api.listTenants()])
      .then(([me, data, tenantData]) => {
        setMyRole(me.role);
        setMyUserId(me.user_id);
        setUsers(data.users);
        const current = tenantData.tenants.find((t) => t.current);
        if (current) setTeamName(current.org);
        if (me.role === "owner") {
          api.listAllowlist().then((r) => setAllowlist(r.emails)).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isAdminOrOwner = myRole === "admin" || myRole === "owner";

  const handleRenameSave = async () => {
    if (!newName.trim()) return;
    setSavingName(true);
    try {
      await api.renameTenant(newName.trim());
      setTeamName(newName.trim());
      setEditingName(false);
      toast("Team renamed");
    } catch {
      toast("Failed to rename team", "error");
    } finally {
      setSavingName(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const result = await api.inviteUser(inviteEmail.trim(), inviteRole);
      // Refresh user list
      const data = await api.listUsers();
      setUsers(data.users);
      setInviteEmail("");
      toast(`Invited ${inviteEmail.trim()}`);
    } catch (e) {
      toast(e instanceof Error && e.message.includes("409") ? "User already exists" : "Failed to send invite", "error");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, role: newRole } : u));
      toast("Role updated");
    } catch {
      toast("Failed to update role", "error");
    }
  };

  const handleRemove = async (user: TeamUser) => {
    const display = user.email || user.github_login || user.user_id;
    if (!(await confirm({ title: "Remove Team Member", message: `Remove ${display} from the team?`, confirmLabel: "Remove", destructive: true }))) return;
    try {
      await api.removeUser(user.user_id);
      setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id));
      toast(`Removed ${display}`);
    } catch {
      toast("Failed to remove user", "error");
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <a href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">← Settings</a>
        <h1 className="text-2xl font-bold mt-4 mb-6">Team</h1>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <a href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">← Settings</a>
      <h1 className="text-2xl font-bold mt-4 mb-2">Team</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Manage who has access to this workspace and their permissions.
      </p>

      {/* Team name */}
      {myRole === "owner" && (
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg mb-6">
          <h3 className="text-sm font-medium text-zinc-100 mb-2">Team name</h3>
          {editingName ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRenameSave()}
                maxLength={100}
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                autoFocus
              />
              <button
                onClick={handleRenameSave}
                disabled={savingName || !newName.trim()}
                className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                {savingName ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-300">{teamName || "—"}</span>
              <button
                onClick={() => { setNewName(teamName); setEditingName(true); }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Rename
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invite */}
      {isAdminOrOwner && (
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg mb-6">
          <h3 className="text-sm font-medium text-zinc-100 mb-3">Invite a team member</h3>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <div className="relative">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="billing">Billing</option>
                <option value="admin">Admin</option>
              </select>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {inviting ? "Inviting..." : "Invite"}
            </button>
          </div>
        </div>
      )}

      {/* Allowlist */}
      {myRole === "owner" && (
        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg mb-6">
          <h3 className="text-sm font-medium text-zinc-100 mb-1">Signup allowlist</h3>
          <p className="text-xs text-zinc-500 mb-3">Only these emails can create accounts. Use <code className="text-zinc-400">*@domain.com</code> for domain wildcards.</p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="user@example.com or *@company.com"
              value={allowEmail}
              onChange={(e) => setAllowEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && allowEmail.trim()) {
                  setAddingAllow(true);
                  api.addToAllowlist(allowEmail.trim())
                    .then(() => { setAllowlist((prev) => [...prev, allowEmail.trim()]); setAllowEmail(""); toast("Added to allowlist"); })
                    .catch(() => toast("Failed to add", "error"))
                    .finally(() => setAddingAllow(false));
                }
              }}
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={() => {
                if (!allowEmail.trim()) return;
                setAddingAllow(true);
                api.addToAllowlist(allowEmail.trim())
                  .then(() => { setAllowlist((prev) => [...prev, allowEmail.trim()]); setAllowEmail(""); toast("Added to allowlist"); })
                  .catch(() => toast("Failed to add", "error"))
                  .finally(() => setAddingAllow(false));
              }}
              disabled={addingAllow || !allowEmail.trim()}
              className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {addingAllow ? "Adding..." : "Add"}
            </button>
          </div>
          {allowlist.length > 0 ? (
            <div className="space-y-1">
              {allowlist.map((e) => (
                <div key={e} className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                  <span className="text-sm text-zinc-300 font-mono">{e}</span>
                  <button
                    onClick={() => {
                      api.removeFromAllowlist(e)
                        .then(() => { setAllowlist((prev) => prev.filter((x) => x !== e)); toast("Removed"); })
                        .catch(() => toast("Failed to remove", "error"));
                    }}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">No allowed emails yet. All signups will be blocked.</p>
          )}
        </div>
      )}

      {/* Role legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {ROLES.map((role) => (
          <span key={role} className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${ROLE_COLORS[role]}`}>
            {role}
          </span>
        ))}
      </div>

      {/* Users list */}
      <div className="space-y-2">
        {users.map((user) => {
          const isMe = user.user_id === myUserId;
          const isOwner = user.role === "owner";
          const display = user.name || user.email || user.github_login || user.user_id;
          const subtitle = user.email && user.name ? user.email : user.github_login ? `@${user.github_login}` : null;

          return (
            <div
              key={user.user_id}
              className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-lg"
            >
              {/* Avatar */}
              <div className="flex-shrink-0">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs text-zinc-400 font-medium">
                    {(display[0] || "?").toUpperCase()}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100 truncate">{display}</span>
                  {isMe && <span className="text-[10px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">you</span>}
                  {user.status === "invited" && <span className="text-[10px] text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded">invited</span>}
                </div>
                {subtitle && <p className="text-xs text-zinc-500 truncate">{subtitle}</p>}
              </div>

              {/* Role badge / selector */}
              {isAdminOrOwner && !isOwner && !isMe ? (
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.user_id, e.target.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border bg-transparent focus:outline-none cursor-pointer ${ROLE_COLORS[user.role] || ROLE_COLORS.member}`}
                >
                  <option value="viewer">viewer</option>
                  <option value="member">member</option>
                  <option value="billing">billing</option>
                  <option value="admin">admin</option>
                </select>
              ) : (
                <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${ROLE_COLORS[user.role] || ROLE_COLORS.member}`}>
                  {user.role}
                </span>
              )}

              {/* Remove */}
              {isAdminOrOwner && !isOwner && !isMe && (
                <button
                  onClick={() => handleRemove(user)}
                  className="text-zinc-600 hover:text-red-400 text-xs transition-colors cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      {users.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">No team members yet.</p>
      )}

      {/* Role permissions */}
      <div className="mt-8 p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <h3 className="text-sm font-semibold text-zinc-100 mb-4">Role permissions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 pr-4 font-medium">Permission</th>
                <th className="text-center py-2 px-3 font-medium">Viewer</th>
                <th className="text-center py-2 px-3 font-medium">Member</th>
                <th className="text-center py-2 px-3 font-medium">Billing</th>
                <th className="text-center py-2 px-3 font-medium">Admin</th>
                <th className="text-center py-2 px-3 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {[
                { perm: "View runs & analytics", viewer: true, member: true, billing: false, admin: true, owner: true },
                { perm: "View plans & health", viewer: true, member: true, billing: false, admin: true, owner: true },
                { perm: "Create & execute plans", viewer: false, member: true, billing: false, admin: true, owner: true },
                { perm: "View billing & invoices", viewer: false, member: false, billing: true, admin: true, owner: true },
                { perm: "Manage billing & budget", viewer: false, member: false, billing: true, admin: true, owner: true },
                { perm: "Manage repos & workflow", viewer: false, member: false, billing: false, admin: true, owner: true },
                { perm: "Manage integrations (GitHub, Jira, AWS)", viewer: false, member: false, billing: false, admin: true, owner: true },
                { perm: "Manage MCP servers", viewer: false, member: false, billing: false, admin: true, owner: true },
                { perm: "Invite & remove users", viewer: false, member: false, billing: false, admin: true, owner: true },
                { perm: "Change user roles", viewer: false, member: false, billing: false, admin: true, owner: true },
                { perm: "Access settings", viewer: false, member: false, billing: false, admin: true, owner: true },
                { perm: "Rename team", viewer: false, member: false, billing: false, admin: false, owner: true },
                { perm: "Reset account data", viewer: false, member: false, billing: false, admin: false, owner: true },
              ].map((row) => (
                <tr key={row.perm} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 text-zinc-300">{row.perm}</td>
                  <td className="text-center py-2 px-3">{row.viewer ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="inline text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg> : <span className="text-zinc-700">—</span>}</td>
                  <td className="text-center py-2 px-3">{row.member ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="inline text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg> : <span className="text-zinc-700">—</span>}</td>
                  <td className="text-center py-2 px-3">{row.billing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="inline text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg> : <span className="text-zinc-700">—</span>}</td>
                  <td className="text-center py-2 px-3">{row.admin ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="inline text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg> : <span className="text-zinc-700">—</span>}</td>
                  <td className="text-center py-2 px-3">{row.owner ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="inline text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg> : <span className="text-zinc-700">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
