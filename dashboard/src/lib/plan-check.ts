// The plan check's result, as the run page's Tasks card reads it.
//
// The worker checks the plan against the branch before the pull request
// ("Plan check" in the run's progress notes): one line per planned file,
// `- [x] path` when the branch changes it, `- [ ] path` when not. That note is
// the run's own measure. The checklist file (tasks.md) can say less: a fix
// round after the plan check rewrites it from the unticked plan with only the
// files that round touched, so a finished run read "1 of 3" while its plan
// check said 3 of 3. The card ticks from the note when there is one.

const HEAD = /^Plan check: \d+ of \d+ planned tasks done/;

function norm(p: string): string {
  const out: string[] = [];
  for (const part of p.replace(/^\.\//, "").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/") + (p.endsWith("/") ? "/" : "");
}

/**
 * The file a checklist task names, read as the worker's plan check reads it:
 * `path: what to do`, the path maybe in backticks or bold. `null` for a task
 * that names no file (the plan check doesn't measure those).
 */
export function taskPath(text: string): string | null {
  const colon = text.indexOf(":");
  if (colon < 0) return null;
  const head = text.slice(0, colon).trim().replace(/^[`*]+|[`*]+$/g, "").trim();
  if (!head || head.length >= 300 || /\s/.test(head) || head.includes("://")) return null;
  if (!head.includes("/") && !head.includes(".")) return null;
  return norm(head);
}

/**
 * Each planned file and whether the plan check found it done, from the run's
 * progress notes; a later check overrides an earlier one. `null` when the run
 * has no plan check note (an older run, or one that hasn't reached it).
 */
export function planCheckResult(notes?: { message: string; timestamp?: string }[] | null): Map<string, boolean> | null {
  let found = false;
  const done = new Map<string, boolean>();
  const inOrder = [...(notes ?? [])].sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
  for (const n of inOrder) {
    const lines = (n.message ?? "").split("\n");
    if (!HEAD.test(lines[0]?.trim() ?? "")) continue;
    found = true;
    for (const line of lines.slice(1)) {
      const m = line.trim().match(/^-\s+\[([ xX])\]\s+(\S+)/);
      if (m) done.set(norm(m[2]), m[1] !== " ");
    }
  }
  return found ? done : null;
}
