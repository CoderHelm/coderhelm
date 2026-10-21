// The preview of a team's git conventions, rendered the way the worker does
// (services/common/src/git_conventions.rs in the platform). The gateway
// validates on save; the checks here only give feedback while typing.

export const TOKENS = ["ticket", "ticket_lower", "slug", "summary", "title"] as const;
export type Kind = "branch" | "commit" | "pr_title";

export const TOKEN_HELP: Record<(typeof TOKENS)[number], string> = {
  ticket: "the ticket as written (ABC-123, or #42 for a GitHub issue)",
  ticket_lower: "the ticket id in lowercase (abc-123)",
  slug: "a short kebab-case summary of the title, up to 40 characters",
  summary: "a one-line lowercase summary (for commits)",
  title: "the ticket's title as written",
};

const MAX_TEMPLATE = 120;
const MAX_BRANCH = 100;
const MAX_COMMIT = 72;
const MAX_PR_TITLE = 72;
const MAX_SLUG = 40;

export interface Tokens {
  ticket: string;
  ticket_lower: string;
  slug: string;
  summary: string;
  title: string;
}

export function slug(text: string): string {
  const words = text
    .replace(/['’]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let out = "";
  for (const w of words) {
    const extra = out ? w.length + 1 : w.length;
    if (out.length + extra > MAX_SLUG) {
      if (!out) out = w.slice(0, MAX_SLUG);
      break;
    }
    out = out ? `${out}-${w}` : w;
  }
  return out;
}

export function summary(text: string): string {
  const line = (text.split("\n").map((l) => l.trim()).find(Boolean) ?? "").replace(/\.+$/, "").trimEnd();
  if (!line) return "";
  return /^.[A-Z]/.test(line) ? line : line[0].toLowerCase() + line.slice(1);
}

export function tokens(ticket: string, id: string, title: string): Tokens {
  const t = (title.split("\n")[0] ?? "").trim();
  return { ticket: ticket.trim(), ticket_lower: id.trim().toLowerCase(), slug: slug(t), summary: summary(t), title: t };
}

function render(template: string, t: Tokens, each: (v: string) => string): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, name: string) =>
    (TOKENS as readonly string[]).includes(name) ? each(t[name as keyof Tokens]) : whole,
  );
}

function refPart(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
}

function cut(text: string, max: number): string {
  if ([...text].length <= max) return text;
  const head = [...text].slice(0, max).join("");
  const i = head.lastIndexOf(" ");
  return (i > max / 2 ? head.slice(0, i) : head).trimEnd();
}

export function branch(template: string, t: Tokens): string {
  let name = render(template, t, refPart).replace(/\/{2,}/g, "/");
  name = cut(name, MAX_BRANCH);
  while (/[/.-]$/.test(name) || name.endsWith(".lock")) name = name.endsWith(".lock") ? name.slice(0, -5) : name.slice(0, -1);
  return name;
}

export function commit(template: string, t: Tokens): string {
  return cut(render(template, t, (v) => v.replace(/[\r\n]/g, " ")).trim(), MAX_COMMIT);
}

export function prTitle(template: string, t: Tokens): string {
  const line = render(template, t, (v) => v.replace(/[\r\n]/g, " ")).trim();
  return [...line].length > MAX_PR_TITLE ? `${[...line].slice(0, MAX_PR_TITLE - 3).join("").trimEnd()}...` : line;
}

export function preview(kind: Kind, template: string, t: Tokens): string {
  if (kind === "branch") return branch(template, t);
  if (kind === "commit") return commit(template, t);
  return prTitle(template, t);
}

function validBranch(name: string): boolean {
  if (!name || name === "@" || name.startsWith("-") || name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) return false;
  if (name.includes("..") || name.includes("//") || name.includes("@{") || /[\s~^:?*[\\]/.test(name)) return false;
  return name.split("/").every((p) => p && !p.startsWith(".") && !p.endsWith(".lock"));
}

/** What is wrong with a template, or null. The gateway has the final word. */
export function problem(kind: Kind, template: string): string | null {
  const t = template.trim();
  if (!t) return null;
  if ([...t].length > MAX_TEMPLATE) return `Keep it to ${MAX_TEMPLATE} characters or fewer.`;
  if (/[\r\n]/.test(t)) return "Use a single line.";
  const used: string[] = [];
  let rest = t;
  for (;;) {
    const open = rest.search(/[{}]/);
    if (open < 0) break;
    if (rest[open] === "}") return "A `}` has no matching `{`.";
    const close = rest.indexOf("}", open + 1);
    if (close < 0) return "A `{` is never closed.";
    const name = rest.slice(open + 1, close);
    if (!(TOKENS as readonly string[]).includes(name)) return `\`{${name}}\` is not a token.`;
    used.push(name);
    rest = rest.slice(close + 1);
  }
  if (kind === "branch") {
    if (!used.includes("ticket") && !used.includes("ticket_lower"))
      return "A branch name needs `{ticket}` or `{ticket_lower}`, so each ticket gets its own branch.";
    if (!validBranch(t.replace(/\{[a-z_]+\}/g, "x"))) return "That isn't a valid git branch name: no spaces, `..`, `//`, `~^:?*[\\`, or a leading or trailing `/` or `.`.";
  }
  return null;
}
