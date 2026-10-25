"use client";

import { useEffect, useState } from "react";
import { api, type Plan } from "@/lib/api";
import { Modal, ModalFooter } from "@/components/modal";
import { useToast } from "@/components/toast";
import { inputClass, primaryButton, secondaryButton } from "@/components/ui";

/** "Save as template": a short form in the shared modal. */
export function SaveTemplateDialog({
  planId,
  plan,
  open,
  onOpenChange,
}: {
  planId: string;
  plan: Plan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState({ title: "", description: "", category: "", tags: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setForm({ title: (plan.title ?? "") + " template", description: plan.description ?? "", category: "", tags: "" });
  }, [open, plan.title, plan.description]);

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const tags = form.tags.trim() ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
      await api.createTemplateFromPlan(planId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        tags,
      });
      toast("Saved as a template");
      onOpenChange(false);
    } catch {
      toast("Failed to save template", "error");
    } finally {
      setSaving(false);
    }
  };

  const field = (id: keyof typeof form, label: string, extra: { placeholder?: string; area?: boolean; autoFocus?: boolean } = {}) => (
    <div>
      <label htmlFor={`tpl-${id}`} className="mb-1 block text-xs text-zinc-400">
        {label}
      </label>
      {extra.area ? (
        <textarea
          id={`tpl-${id}`}
          value={form[id]}
          onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <input
          id={`tpl-${id}`}
          autoFocus={extra.autoFocus}
          value={form[id]}
          placeholder={extra.placeholder}
          onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
          className={inputClass}
        />
      )}
    </div>
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Save as template" description="Start new plans from this one's tasks.">
      <form
        id="save-template-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-3"
      >
        {field("title", "Title", { autoFocus: true })}
        {field("description", "Description", { area: true })}
        {field("category", "Category (optional)", { placeholder: "e.g. backend, frontend, devops" })}
        {field("tags", "Tags (optional, separated by commas)", { placeholder: "e.g. api, auth, migration" })}
        <ModalFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" form="save-template-form" disabled={saving || !form.title.trim()} className={primaryButton}>
            {saving ? "Saving…" : "Save template"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
