"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { buttonClass, inputClass } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import { knowledge, shortTokens, usd, type SyncSettings } from "@/lib/knowledge";

// The team's sync limits: how many items one connected source keeps. The
// number is a cost choice, so the dialog says what a full source would cost
// to embed and how much of the team's monthly token limit is left. Admins
// change it; everyone else sees it.

export function SyncLimits({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved?: (s: SyncSettings) => void }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [value, setValue] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadError(null);
    knowledge
      .syncSettings()
      .then((s) => {
        setSettings(s);
        setValue(String(s.items_per_source));
      })
      .catch((e) => setLoadError(errorMessage(e, "Couldn't load the sync limits.")));
  }, [open]);

  const n = Number(value.replace(/[,\s]/g, ""));
  const problem =
    !settings || !value.trim()
      ? value.trim()
        ? null
        : "Enter a number."
      : !Number.isInteger(n)
        ? "Enter a whole number."
        : n < settings.min_items_per_source || n > settings.max_items_per_source
          ? `Pick a number from ${settings.min_items_per_source.toLocaleString()} to ${settings.max_items_per_source.toLocaleString()}.`
          : null;
  const items = Number.isInteger(n) && n > 0 ? n : (settings?.items_per_source ?? 0);
  const tokens = settings ? items * settings.embedding.tokens_per_item : 0;
  const cost = settings ? (tokens / 1_000_000) * settings.embedding.usd_per_million_tokens : 0;
  const canEdit = !!settings?.can_edit;

  const save = async () => {
    if (!settings || problem || !canEdit) return;
    setSaving(true);
    try {
      const s = await knowledge.saveSyncSettings({ items_per_source: n });
      setSettings(s);
      setValue(String(s.items_per_source));
      toast(`Saved. Each source keeps up to ${s.items_per_source.toLocaleString()} items.`);
      onSaved?.(s);
      onOpenChange(false);
    } catch (e) {
      toast(errorMessage(e, "Couldn't save the sync limits."), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Sync limits"
      description="How many items one connected source keeps searchable. A source that covers more says so on its card."
      testId="sync-limits"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      footer={
        canEdit ? (
          <>
            <button type="button" className={buttonClass("secondary")} onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className={buttonClass("primary")} disabled={saving || !!problem} data-testid="sync-limits-save">
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <button type="button" className={buttonClass("secondary")} onClick={() => onOpenChange(false)}>
            Close
          </button>
        )
      }
    >
      {loadError ? (
        <p className="text-sm text-orange-200" role="alert">
          {loadError}
        </p>
      ) : !settings ? (
        <p className="text-sm text-zinc-400" role="status">
          Loading…
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="items-per-source" className="block text-sm font-semibold text-zinc-100">
              Items per source
            </label>
            {canEdit ? (
              <input
                id="items-per-source"
                inputMode="numeric"
                className={`${inputClass} mt-1.5`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={problem ? true : undefined}
                aria-describedby="items-per-source-help"
                data-testid="items-per-source"
              />
            ) : (
              <p className="mt-1.5 text-sm text-zinc-200" data-testid="items-per-source-value">
                {settings.items_per_source.toLocaleString()}
              </p>
            )}
            <p id="items-per-source-help" className="mt-1.5 text-xs text-zinc-400">
              From {settings.min_items_per_source.toLocaleString()} to {settings.max_items_per_source.toLocaleString()}. The default is{" "}
              {settings.default_items_per_source.toLocaleString()}. A knowledge base holds up to {settings.items_per_base.toLocaleString()} synced items across its sources.
            </p>
            {problem && (
              <p className="mt-1.5 text-xs text-orange-200" role="alert" data-testid="items-per-source-error">
                {problem}
              </p>
            )}
            {!canEdit && <p className="mt-1.5 text-xs text-zinc-400">Admins and owners can change this.</p>}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-300" data-testid="sync-limits-estimate">
            <p>
              A full source of {items.toLocaleString()} items takes about {shortTokens(tokens)} tokens to embed the first time (about {usd(cost)}). Later syncs embed only what changed.
            </p>
            <p className="mt-2 text-zinc-400">
              {settings.token_budget
                ? `Embeddings count against your team's monthly token limit: ${shortTokens(settings.token_budget.left)} of ${shortTokens(settings.token_budget.limit)} tokens are left this month.`
                : "Embeddings count against your team's monthly token limit. Your team hasn't set one."}{" "}
              A first sync of more than {settings.large_sync_items.toLocaleString()} items shows its estimate and waits for an admin to start it.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
