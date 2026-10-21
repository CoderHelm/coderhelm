"use client";

import { useEffect, useState } from "react";
import { api, type GitConventionTemplates, type GitConventions } from "@/lib/api";
import { preview, problem, tokens, TOKEN_HELP, TOKENS, type Kind } from "@/lib/git-conventions";
import { Field } from "./field";
import { inputClass, primaryButton } from "./ui";
import { useToast } from "./toast";

// The sample ticket the preview renders.
const SAMPLE = tokens("ABC-123", "ABC-123", "Fix the login redirect after single sign-on");

const FIELDS: { key: Kind; label: string; what: string }[] = [
  { key: "branch", label: "Branch name", what: "The branch CoderHelm works on for a ticket." },
  { key: "commit", label: "Commit message", what: "The first line of each commit; {summary} is what the commit does." },
  { key: "pr_title", label: "Pull request title", what: "The title of the pull request CoderHelm opens." },
];

const EMPTY: GitConventionTemplates = { branch: "", commit: "", pr_title: "" };

/** The team's branch, commit and PR title templates, with a live preview. */
export function GitConventionsSection() {
  const [loaded, setLoaded] = useState<GitConventions | null>(null);
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState<GitConventionTemplates>(EMPTY);
  const [serverError, setServerError] = useState<{ field: Kind; error: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api
      .getGitConventions()
      .then((c) => {
        setLoaded(c);
        setValues({ branch: c.branch, commit: c.commit, pr_title: c.pr_title });
      })
      .catch(() => setFailed(true));
  }, []);

  const problems = Object.fromEntries(FIELDS.map((f) => [f.key, problem(f.key, values[f.key])])) as Record<Kind, string | null>;
  const dirty = loaded !== null && FIELDS.some((f) => values[f.key].trim() !== loaded[f.key]);
  const blocked = FIELDS.some((f) => problems[f.key]);

  const save = async () => {
    setSaving(true);
    setServerError(null);
    const trimmed = { branch: values.branch.trim(), commit: values.commit.trim(), pr_title: values.pr_title.trim() };
    const res = await api.updateGitConventions(trimmed);
    setSaving(false);
    if (!res.ok) {
      if (res.field) setServerError({ field: res.field, error: res.error });
      else toast(res.error || "Could not save", "error");
      return;
    }
    setLoaded(res);
    setValues({ branch: res.branch, commit: res.commit, pr_title: res.pr_title });
    toast("Git conventions saved", "success");
  };

  return (
    <section aria-labelledby="git-conventions" className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 id="git-conventions" className="text-sm font-medium text-zinc-100">Git conventions</h2>
      <p className="text-xs text-zinc-500 mt-0.5 mb-4">
        How CoderHelm names branches, writes commit messages and titles pull requests. Leave a field empty to keep the
        default. A pull request already open for a ticket keeps its branch.
      </p>

      {failed ? (
        <p className="text-sm text-red-400">Could not load the git conventions. Reload the page to try again.</p>
      ) : !loaded ? (
        <div className="h-32 rounded-lg bg-zinc-900 animate-pulse" />
      ) : (
        <div className="space-y-5">
          {FIELDS.map((f) => {
            const template = values[f.key].trim() || loaded.defaults[f.key];
            const err = problems[f.key] ?? (serverError?.field === f.key ? serverError.error : null);
            return (
              <Field
                key={f.key}
                id={`git-${f.key}`}
                label={f.label}
                error={err}
                helper={
                  <>
                    {f.what}
                    {!err && (
                      <span className="block mt-1 text-zinc-300" data-testid={`git-${f.key}-preview`}>
                        Example: <code className="font-mono break-all">{preview(f.key, template, SAMPLE)}</code>
                      </span>
                    )}
                  </>
                }
              >
                {(props) => (
                  <input
                    {...props}
                    value={values[f.key]}
                    placeholder={loaded.defaults[f.key]}
                    onChange={(e) => {
                      setValues({ ...values, [f.key]: e.target.value });
                      if (serverError?.field === f.key) setServerError(null);
                    }}
                    spellCheck={false}
                    autoComplete="off"
                    className={`${inputClass} font-mono`}
                  />
                )}
              </Field>
            );
          })}

          <div className="text-xs text-zinc-500">
            <p className="mb-1">Tokens, shown for the sample ticket {SAMPLE.ticket} &ldquo;{SAMPLE.title}&rdquo;:</p>
            <ul className="space-y-0.5">
              {TOKENS.map((t) => (
                <li key={t}>
                  <code className="font-mono text-zinc-300">{`{${t}}`}</code> {TOKEN_HELP[t]}
                </li>
              ))}
            </ul>
          </div>

          <button type="button" onClick={save} disabled={saving || !dirty || blocked} className={primaryButton}>
            {saving ? "Saving..." : "Save git conventions"}
          </button>
        </div>
      )}
    </section>
  );
}
