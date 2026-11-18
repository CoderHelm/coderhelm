"use client";

import { useEffect, useId, useState } from "react";
import { api, type PreviewAccess, type PreviewAccessKind } from "@/lib/api";
import { SecretInput } from "./field";
import { Modal, ModalFooter } from "./modal";
import { Select } from "./select";
import { inputClass, primaryButton, secondaryButton } from "./ui";

// A repository's preview access. Most previews need nothing here: Coderhelm
// finds the pull request's preview in its deployments, deploy statuses,
// preview checks and bot comments. This is for the two things only the team
// can give: the preview's address when nothing publishes it, and the secret
// a protected preview takes. The secret is never shown again and is sent
// only to the preview's own host.

const PLACEHOLDERS = ["{pr}", "{branch}", "{branch_slug}", "{sha}", "{short_sha}", "{owner}", "{repo}"];

/** The reason an address template is refused, or "" when it is fine. */
export function templateProblem(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (!t.startsWith("https://")) return "The address starts with https://.";
  const unknown = (t.match(/\{[^}]*\}/g) ?? []).find((b) => !PLACEHOLDERS.includes(b));
  if (unknown) return `${unknown} isn't filled in; use ${PLACEHOLDERS.join(", ")}.`;
  if (!["{pr}", "{branch}", "{branch_slug}", "{sha}", "{short_sha}"].some((p) => t.includes(p)))
    return "The address needs {pr}, {branch}, {branch_slug}, {sha} or {short_sha}, so each pull request gets its own preview.";
  return "";
}

const KINDS: { value: PreviewAccessKind; label: string }[] = [
  { value: "none", label: "Not protected" },
  { value: "header", label: "A header (a bypass token or a service token pair)" },
  { value: "query", label: "A query parameter" },
  { value: "basic", label: "A user name and password" },
];

export function PreviewAccessDialog({
  repo,
  open,
  onOpenChange,
}: {
  repo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [saved, setSaved] = useState<PreviewAccess | null>(null);
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<PreviewAccessKind>("none");
  // Header kind: up to two `name: value` pairs (a token, or an id and a secret).
  const [names, setNames] = useState(["", ""]);
  const [values, setValues] = useState(["", ""]);
  // Query kind: `name=value`; password kind: user and password.
  const [single, setSingle] = useState("");
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = { address: useId(), kind: useId(), single: useId(), user: useId(), h0: useId(), h1: useId(), v0: useId(), v1: useId() };

  // Each opening reads what is saved; the secret is never sent back.
  useEffect(() => {
    if (!open) return;
    setError("");
    setSaved(null);
    setNames(["", ""]);
    setValues(["", ""]);
    setSingle("");
    setUser("");
    api
      .getPreviewAccess(repo)
      .then((a) => {
        setSaved(a);
        setAddress(a.address ?? "");
        setKind(a.kind ?? "none");
      })
      .catch(() => setError("Couldn't load the preview access. Try again."));
  }, [open, repo]);

  const problem = templateProblem(address);
  const keepsSecret = !!saved?.secret_set && saved?.kind === kind;

  const secret = (): string => {
    if (kind === "header")
      return names
        .map((n, i) => (n.trim() && values[i].trim() ? `${n.trim()}: ${values[i].trim()}` : ""))
        .filter(Boolean)
        .join("\n");
    if (kind === "basic") return user.trim() && single.trim() ? `${user.trim()}:${single.trim()}` : "";
    if (kind === "query") return single.trim();
    return "";
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const s = secret();
      const a = await api.savePreviewAccess(repo, { kind, address: address.trim(), secret: s || undefined });
      setSaved(a);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api.deletePreviewAccess(repo);
      onOpenChange(false);
    } catch {
      setError("Couldn't remove the preview access. Try again.");
    }
    setBusy(false);
  };

  const secretHint = keepsSecret ? "Saved. Enter a new one to replace it." : "";

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !busy && onOpenChange(v)}
      testId="preview-access-dialog"
      title={`Preview access for ${repo}`}
      description="Coderhelm finds each pull request's preview on its own, in the commit's deployments, deploy statuses, preview checks and bot comments, and checks the changed pages there. Set this only when nothing publishes the preview's address, or when the preview asks for a sign-in."
    >
      <form
        id="preview-access-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) void save();
        }}
      >
        <div>
          <label htmlFor={ids.address} className="mb-1 block text-sm font-medium text-zinc-200">
            Preview address <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id={ids.address}
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="https://pr-{pr}.preview.your-domain.example"
            className={inputClass}
            autoComplete="off"
            aria-invalid={!!problem || undefined}
            aria-describedby={`${ids.address}-help`}
          />
          <p id={`${ids.address}-help`} className={`mt-1 text-xs ${problem ? "text-red-400" : "text-zinc-400"}`}>
            {problem ||
              "Used only when nothing on the commit publishes the address. {pr} is the pull request number, {branch_slug} the branch as hosts put it in a host name, {sha} and {short_sha} the commit."}
          </p>
        </div>
        <div>
          <label htmlFor={ids.kind} className="mb-1 block text-sm font-medium text-zinc-200">
            How the preview is protected
          </label>
          <Select id={ids.kind} value={kind} onChange={(v) => setKind(v)} options={KINDS} />
        </div>
        {kind === "header" &&
          [0, 1].map((i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={i ? ids.h1 : ids.h0} className="mb-1 block text-sm font-medium text-zinc-200">
                  Header name{i ? <span className="font-normal text-zinc-500"> (optional second)</span> : null}
                </label>
                <input
                  id={i ? ids.h1 : ids.h0}
                  type="text"
                  value={names[i]}
                  onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))}
                  className={inputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor={i ? ids.v1 : ids.v0} className="mb-1 block text-sm font-medium text-zinc-200">
                  Value
                </label>
                <SecretInput
                  id={i ? ids.v1 : ids.v0}
                  value={values[i]}
                  onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i === 0 ? secretHint : ""}
                />
              </div>
            </div>
          ))}
        {kind === "basic" && (
          <div>
            <label htmlFor={ids.user} className="mb-1 block text-sm font-medium text-zinc-200">
              User name
            </label>
            <input id={ids.user} type="text" value={user} onChange={(e) => setUser(e.target.value)} className={inputClass} autoComplete="off" />
          </div>
        )}
        {(kind === "basic" || kind === "query") && (
          <div>
            <label htmlFor={ids.single} className="mb-1 block text-sm font-medium text-zinc-200">
              {kind === "basic" ? "Password" : "Parameters (name=value, join several with &)"}
            </label>
            <SecretInput id={ids.single} value={single} onChange={(e) => setSingle(e.target.value)} placeholder={secretHint} />
          </div>
        )}
        {kind !== "none" && (
          <p className="text-xs text-zinc-400">
            Kept sealed, never shown again, and sent only to the preview&apos;s own host when Coderhelm opens its pages.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <ModalFooter>
          {saved?.configured && (
            <button type="button" onClick={remove} disabled={busy} className={secondaryButton}>
              Remove
            </button>
          )}
          <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" form="preview-access-form" disabled={busy || !!problem} className={primaryButton}>
            {busy ? "Saving…" : "Save"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
