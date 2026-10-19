"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { focusRing, inputClass, primaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";

const ADMIN_EMAIL = "admin@coderhelm.com";

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [allowEmail, setAllowEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const loadList = useCallback(() => {
    setListLoading(true);
    setListError("");
    api
      .listAllowlist()
      .then((r) => setAllowlist(r.emails))
      .catch((e: unknown) => setListError(e instanceof Error ? e.message : "The request failed."))
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    api
      .me()
      .then((me) => {
        if (me.email === ADMIN_EMAIL) {
          setAuthorized(true);
          loadList();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadList]);

  if (loading) {
    return (
      <Page className="space-y-3">
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Page>
    );
  }

  if (!authorized) {
    return (
      <Page>
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
          <svg aria-hidden="true" className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Access denied</h1>
        <p className="text-sm text-zinc-500">This page is only for Coderhelm platform administrators.</p>
      </div>
      </Page>
    );
  }

  const handleAdd = () => {
    const value = allowEmail.trim();
    if (!value) return;
    setAdding(true);
    api
      .addToAllowlist(value)
      .then((r) => {
        // The server stores the address in lower case; show what it stored, once.
        const stored = r?.email || value.toLowerCase();
        setAllowlist((prev) => (prev.includes(stored) ? prev : [...prev, stored]));
        setAllowEmail("");
        toast(`Added ${stored}`);
      })
      .catch((e: unknown) => toast(e instanceof Error ? `Could not add: ${e.message}` : "Could not add", "error"))
      .finally(() => setAdding(false));
  };

  const handleRemove = async (email: string) => {
    const ok = await confirm({
      title: "Remove from the allowlist?",
      message: `${email} will no longer be able to create an account. Existing accounts keep working.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setRemoving(email);
    api
      .removeFromAllowlist(email)
      .then(() => {
        setAllowlist((prev) => prev.filter((x) => x !== email));
        toast(`Removed ${email}`);
      })
      .catch((e: unknown) => toast(e instanceof Error ? `Could not remove: ${e.message}` : "Could not remove", "error"))
      .finally(() => setRemoving(null));
  };

  return (
    <Page>
      <PageHeader title="Platform admin" lead="Internal tools for managing the Coderhelm platform." />
      <section aria-labelledby="allowlist-heading" className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 id="allowlist-heading" className="text-base font-semibold text-zinc-100 mb-1">Signup allowlist</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Only these emails can create accounts. Use <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">*@domain.com</code> to allow a whole domain.
        </p>

        <form
          className="flex flex-col gap-2 mb-4 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <label htmlFor="allow-email" className="sr-only">Email or domain to allow</label>
          <input
            id="allow-email"
            type="text"
            autoComplete="off"
            placeholder="user@example.com or *@company.com"
            value={allowEmail}
            onChange={(e) => setAllowEmail(e.target.value)}
            className={`${inputClass} sm:flex-1`}
          />
          <button type="submit" disabled={adding || !allowEmail.trim()} className={primaryButton}>
            {adding ? "Adding..." : "Add"}
          </button>
        </form>

        {listError ? (
          <Callout variant="error" title="Couldn't load the allowlist">
            <p>{listError}</p>
            <button type="button" onClick={loadList} className={`mt-2 text-sm font-medium underline rounded ${focusRing}`}>
              Try again
            </button>
          </Callout>
        ) : listLoading ? (
          <div className="space-y-1.5" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : allowlist.length > 0 ? (
          <ul className="space-y-1.5" aria-label="Allowed emails">
            {allowlist.map((email) => (
              <li key={email} className="flex items-center justify-between gap-3 px-3 py-2 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="min-w-0 break-all text-sm text-zinc-300 font-mono">{email}</span>
                <button
                  type="button"
                  onClick={() => void handleRemove(email)}
                  disabled={removing === email}
                  aria-label={`Remove ${email}`}
                  className={`shrink-0 rounded text-xs text-zinc-400 hover:text-red-400 transition-colors disabled:opacity-50 ${focusRing}`}
                >
                  {removing === email ? "Removing..." : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No allowed emails yet, so nobody can sign up.</p>
        )}
      </section>
    </Page>
  );
}
