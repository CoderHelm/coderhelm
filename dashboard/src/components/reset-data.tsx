"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { can } from "@/lib/capabilities";
import { useToast } from "@/components/toast";
import { dangerButton, inputClass, secondaryButton } from "@/components/ui";
import { Modal, modalActions } from "@/components/modal";
import { SectionHeading } from "@/components/page";

/**
 * Reset all data, for whoever holds `reset`. It lives with the install's own
 * pages on a self-hosted install (Version and updates) and on Members and
 * roles on hosted, never on the Settings overview people open most.
 */
export function ResetAllData() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    api.me().then((me) => setAllowed(can(me, "reset"))).catch(() => setAllowed(false));
  }, []);
  return allowed ? <DangerZone /> : null;
}

function DangerZone() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();

  const handleReset = async () => {
    if (confirmText !== "DELETE") return;
    setResetting(true);
    try {
      await api.resetAccount();
      setOpen(false);
      toast("All data has been cleared. Refreshing...");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast("Couldn't reset the account. Nothing was deleted. Try again.", "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <section aria-labelledby="danger-zone" className="mt-12 max-w-3xl rounded-lg border border-red-500/30 bg-red-500/5 p-5">
      <SectionHeading id="danger-zone" danger className="mb-1">Danger zone</SectionHeading>
      <p className="text-sm text-zinc-300 mb-4">
        Delete every run, plan, repository, setting and Jira connection for this team. Your sign in stays; everything else is gone for good.
      </p>
      <button
        type="button"
        onClick={() => { setOpen(true); setConfirmText(""); }}
        className={dangerButton}
      >
        Reset all data
      </button>

      <Modal
        open={open}
        onOpenChange={(v) => !resetting && setOpen(v)}
        title="Reset all data"
        description="This permanently deletes runs, plans, repositories, settings and the Jira connection. It cannot be undone."
        testId="reset-dialog"
        initialFocus="#reset-confirm"
        onSubmit={(e) => {
          e.preventDefault();
          handleReset();
        }}
        footer={
          <div className={modalActions}>
            <button type="button" onClick={() => setOpen(false)} disabled={resetting} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" disabled={confirmText !== "DELETE" || resetting} className={dangerButton}>
              {resetting ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        }
      >
        <label htmlFor="reset-confirm" className="mb-1.5 block text-sm text-zinc-300">
          Type <span className="font-mono font-semibold text-red-400">DELETE</span> to confirm
        </label>
        <input
          id="reset-confirm"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          className={inputClass}
        />
      </Modal>
    </section>
  );
}
