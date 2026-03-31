"use client";

import { useEffect, useState } from "react";
import { api, type TeamUser } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";

const ROLES = ["viewer", "member", "admin", "owner"] as const;
const ROLE_COLORS: Record<string, string> = {
  owner: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  admin: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  member: "text-zinc-300 bg-zinc-800 border-zinc-700",
  viewer: "text-zinc-500 bg-zinc-900 border-zinc-800",
};

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState("");
  const [myUserId, setMyUserId] = useState("");
  const { toast } = useToast();

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    Promise.all([api.me(), api.listUsers()])
      .then(([me, data]) => {
        setMyRole(me.role);
        setMyUserId(me.user_id);
        setUsers(data.users);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isAdminOrOwner = myRole === "admin" || myRole === "owner";

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
    if (!confirm(`Remove ${display} from the team?`)) return;
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
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
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
    </div>
  );
}
