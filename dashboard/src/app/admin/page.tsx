"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

const ADMIN_EMAIL = "admin@coderhelm.com";

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [allowEmail, setAllowEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api
      .me()
      .then((me) => {
        if (me.email === ADMIN_EMAIL) {
          setAuthorized(true);
          api.listAllowlist().then((r) => setAllowlist(r.emails)).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-zinc-500">Loading...</div>;
  }

  if (!authorized) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
        </div>
        <h1 className="text-lg font-semibold text-zinc-100 mb-2">Access Denied</h1>
        <p className="text-sm text-zinc-500">This page is restricted to platform administrators.</p>
      </div>
    );
  }

  const handleAdd = () => {
    if (!allowEmail.trim()) return;
    setAdding(true);
    api
      .addToAllowlist(allowEmail.trim())
      .then(() => {
        setAllowlist((prev) => [...prev, allowEmail.trim()]);
        setAllowEmail("");
        toast("Added to allowlist");
      })
      .catch(() => toast("Failed to add", "error"))
      .finally(() => setAdding(false));
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Platform Admin</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Internal tools for managing the Coderhelm platform.
      </p>

      {/* Signup Allowlist */}
      <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <h2 className="text-base font-semibold text-zinc-100 mb-1">Signup Allowlist</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Only these emails can create accounts. Use <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">*@domain.com</code> for domain wildcards.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="user@example.com or *@company.com"
            value={allowEmail}
            onChange={(e) => setAllowEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !allowEmail.trim()}
            className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>

        {allowlist.length > 0 ? (
          <div className="space-y-1.5">
            {allowlist.map((email) => (
              <div key={email} className="flex items-center justify-between px-3 py-2 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-sm text-zinc-300 font-mono">{email}</span>
                <button
                  onClick={() => {
                    api
                      .removeFromAllowlist(email)
                      .then(() => {
                        setAllowlist((prev) => prev.filter((x) => x !== email));
                        toast("Removed");
                      })
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
          <p className="text-sm text-zinc-600">No allowed emails yet. All signups will be blocked.</p>
        )}
      </div>
    </div>
  );
}
