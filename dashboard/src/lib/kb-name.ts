// Names for a new knowledge base, read from what was picked: the space,
// folder or repository everything sits in, the page above it all, or the
// words the titles share. No model call: it is instant and costs nothing.

/** One picked item, as the picker hands it over. */
export interface NameItem {
  title: string;
  /** `page`, `space`, `folder`, `repo`, `database`, `file`, ... */
  kind?: string;
  /** Titles above it, top first (a Confluence page's space comes first). */
  path?: string[];
}

export interface NameInput {
  /** The app or upload it comes from (`confluence`, `notion`, `upload`, ...). */
  kind: string;
  /** What the app is called, for the fallback and for telling names apart. */
  label: string;
  picked: NameItem[];
  /** Uploaded files: named from their file names. */
  files?: { name: string }[];
  /** Names already used by this team's knowledge bases. */
  taken?: string[];
}

const MAX_WORDS = 5;
const MAX_CHARS = 80;

/** Small words that never start or end a name, and stay lowercase inside one. */
const MINOR = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "vs", "with"]);
/** Words too common to make a name on their own. */
const STOP = new Set([
  ...MINOR,
  "how", "what", "why", "when", "where", "who", "we", "our", "your", "my", "is", "are", "be", "it", "this", "that",
  "new", "old", "page", "pages", "doc", "docs", "document", "documents", "documentation", "notes", "note", "misc",
  "general", "info", "information", "untitled", "readme", "index", "file", "files", "folder", "draft", "wip", "copy",
  "team", "guide", "runbook", "runbooks", "playbook", "playbooks", "handbook", "policy", "policies", "spec", "specs",
]);
/** Words a page is often titled with that say nothing about it. */
const NOISE_WORD = /\b(?:home|homepage|overview|untitled|copy of|draft|wip|archived?|deprecated|old)\b/gi;
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATES = [
  /\b\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?\b/g,
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g,
  new RegExp(`\\b${MONTH}\\.?(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?(?:,?\\s+\\d{4})?\\b`, "gi"),
  /\b(?:19|20)\d{2}\b/g,
  /\bQ[1-4]\b/g,
  /\bH[12]\b/g,
];
const VERSIONS = [/\bv(?:ersion)?\s?\d+(?:\.\d+)*\b/gi, /\b\d+(?:\.\d+){1,3}\b/g];
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu;
const FILE_EXT = /\.(?:md|mdx|markdown|txt|pdf|docx?|pptx?|xlsx?|csv|html?|rtf|odt|json|ya?ml|rst|adoc|zip)$/i;
/** Kinds whose titles are file or folder names. */
const FILE_KINDS = new Set(["upload", "google_drive", "github", "s3", "archive"]);
/** Kinds of item that hold others: picked alone, its own title names the base. */
const CONTAINER_KINDS = new Set(["space", "folder", "repo", "database", "project", "dataset"]);

/** A title with emoji, dates, version numbers and filler words taken out. */
export function cleanTitle(raw: string, fileLike = false): string {
  let t = raw.normalize("NFKC").replace(EMOJI, " ");
  if (fileLike) {
    t = t.replace(FILE_EXT, "").replace(/\/+$/, "");
    // A path keeps its last part; separators in file names become spaces.
    t = t.split("/").filter(Boolean).pop() ?? "";
    t = t.replace(/[_]+/g, " ").replace(/(\w)-(?=\w)/g, "$1 ");
  }
  for (const re of DATES) t = t.replace(re, " ");
  for (const re of VERSIONS) t = t.replace(re, " ");
  t = t.replace(NOISE_WORD, " ");
  // Brackets left empty, and separators left dangling at either end.
  t = t.replace(/[([{]\s*[)\]}]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s\-–—|:/·•,.;#*_~>]+|[\s\-–—|:/·•,.;#*_~<(]+$/g, "").trim();
  t = t.replace(/\s+[-–—|:·•]\s+(?=[-–—|:·•\s]*$)/g, "").trim();
  return t.replace(/\s+/g, " ");
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const key = (w: string) => bare(w).toLowerCase();

/** Title Case: lowercase words get a capital (small words stay small inside); acronyms and brand casing stay. */
export function titleCase(s: string): string {
  return words(s)
    .map((w, i) => {
      if (w !== w.toLowerCase()) return w;
      if (i > 0 && MINOR.has(key(w))) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** At most MAX_WORDS words, never ending on a small word. */
function clip(s: string, max = MAX_WORDS): string {
  let w = words(s).slice(0, max);
  while (w.length > 1 && MINOR.has(key(w[w.length - 1]))) w = w.slice(0, -1);
  while (w.length > 1 && MINOR.has(key(w[0]))) w = w.slice(1);
  return w.join(" ").replace(/[\s,;:\-–—|]+$/, "");
}

/** An abbreviation every title starts with ("ACME Data", "ACME dbt"): a team or org tag, not a topic. */
function sharedTag(titles: string[]): string | null {
  if (titles.length < 2) return null;
  const firsts = titles.map((t) => words(t));
  const first = firsts[0][0];
  if (!first) return null;
  const tag = bare(first);
  if (!/^[A-Z][A-Z0-9&]{1,4}$/.test(tag)) return null;
  return firsts.every((w) => w.length > 1 && bare(w[0]) === tag) ? tag : null;
}

function dropTag(s: string, tag: string | null): string {
  if (!tag) return s;
  const w = words(s);
  return w.length > 1 && bare(w[0]) === tag ? cleanTitle(w.slice(1).join(" ")) : s;
}

/** The plain noun a theme reads better with: what most of the titles are. */
function nounFor(titles: string[]): string {
  const has = (re: RegExp) => titles.filter((t) => re.test(t)).length * 2 >= titles.length;
  if (has(/\brun ?books?\b/i)) return "runbooks";
  if (has(/\bplay ?books?\b/i)) return "playbooks";
  if (has(/\b(?:handbook|polic(?:y|ies))\b/i)) return "handbook";
  return "docs";
}

/** A short name with a noun when one word alone would be vague. */
function withNoun(name: string, noun: string, always = false): string {
  if (!name) return "";
  const w = words(name);
  const last = key(w[w.length - 1]);
  if (last === noun || last === noun.replace(/s$/, "") || ["docs", "documentation", "wiki", "handbook", "runbooks", "playbooks", "space", "notes"].includes(last)) return name;
  if (always || w.length < 2) return `${name} ${noun}`;
  return name;
}

/** The words (one to three in a row) most titles share, when at least two in five of them do. */
function sharedTheme(titles: string[]): string {
  if (!titles.length) return "";
  const lists = titles.map((t) => words(t));
  // A leading phrase every title starts with.
  let lead = 0;
  while (lists.every((w) => w.length > lead && key(w[lead]) === key(lists[0][lead]))) lead++;
  if (lead > 0) {
    const phrase = clip(lists[0].slice(0, lead).join(" "), 4);
    if (words(phrase).some((w) => !STOP.has(key(w)))) return phrase;
  }
  if (titles.length < 2) return "";
  // Otherwise the run of words found in the most titles, longer runs first on a tie.
  const seen = new Map<string, { text: string; n: number; df: number; first: number }>();
  lists.forEach((w, ti) => {
    const here = new Set<string>();
    for (let n = 3; n >= 1; n--) {
      for (let i = 0; i + n <= w.length; i++) {
        const run = w.slice(i, i + n);
        if (STOP.has(key(run[0])) || STOP.has(key(run[n - 1]))) continue;
        if (run.some((x) => !key(x) || /^\d+$/.test(key(x)))) continue;
        const k = run.map(key).join(" ");
        if (here.has(k)) continue;
        here.add(k);
        const cur = seen.get(k) ?? { text: run.map(bare).join(" "), n, df: 0, first: ti };
        cur.df++;
        seen.set(k, cur);
      }
    }
  });
  const need = Math.max(2, Math.ceil(titles.length * 0.4));
  const best = [...seen.values()]
    .filter((c) => c.df >= need && (c.n > 1 || key(c.text).length > 2))
    .sort((a, b) => b.df - a.df || b.n - a.n || a.first - b.first)[0];
  return best?.text ?? "";
}

/** Names that do not repeat each other, case and spacing aside. */
function uniqueList(names: string[]): string[] {
  const out: string[] = [];
  const keys = new Set<string>();
  for (const n of names) {
    const k = n.toLowerCase().replace(/\s+/g, " ").trim();
    if (!k || keys.has(k)) continue;
    keys.add(k);
    out.push(n);
  }
  return out;
}

/** The name, or one that differs from every taken one: the app's name added, then a number. */
export function distinctName(name: string, taken: string[], label: string): string {
  const used = new Set(taken.map((t) => t.toLowerCase().trim()));
  if (!used.has(name.toLowerCase().trim())) return name;
  const withLabel = label && !name.toLowerCase().includes(label.toLowerCase()) ? `${name} (${label})` : name;
  if (!used.has(withLabel.toLowerCase())) return withLabel.slice(0, MAX_CHARS);
  for (let i = 2; i < 100; i++) {
    const n = `${withLabel} ${i}`;
    if (!used.has(n.toLowerCase())) return n.slice(0, MAX_CHARS);
  }
  return withLabel;
}

/** What a container is called as a name: a Confluence space says so; a repo drops its owner. */
function containerName(kind: string, raw: string, tag: string | null, noun: string): string {
  let t = raw;
  if (kind === "github") t = t.split("/").pop() ?? t;
  t = dropTag(cleanTitle(t, FILE_KINDS.has(kind)), tag);
  t = titleCase(clip(t));
  if (!t) return "";
  if (kind === "confluence") return /\b(?:space|wiki)$/i.test(t) ? t : `${t} space`;
  return withNoun(t, noun, kind === "github");
}

/** A website is named by its address: the site, or the two or three sites. */
function webNames(items: NameItem[], fallback: string): string[] {
  const hosts = uniqueList(
    items.map((it) => {
      try {
        return new URL(/^https?:\/\//i.test(it.title) ? it.title : `https://${it.title}`).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    }),
  );
  if (hosts.length === 1) return [hosts[0]];
  if (hosts.length === 2) return [`${hosts[0]} and ${hosts[1]}`];
  return [fallback];
}

/**
 * Up to three names for a new knowledge base, best first: where everything
 * sits (the page above it all, then the space, folder or repository), then
 * the words the titles share. Never "and N more".
 */
export function nameSuggestions(input: NameInput): string[] {
  const { kind, label } = input;
  const fileLike = FILE_KINDS.has(kind);
  const items: NameItem[] =
    kind === "upload" ? (input.files ?? []).map((f) => ({ title: f.name, kind: "file", path: [] })) : input.picked;
  const fallback = kind === "upload" ? "Team documents" : `${label} docs`;
  const finish = (names: string[]) =>
    uniqueList(names.map((n) => n.slice(0, MAX_CHARS).trim()).filter(Boolean))
      .slice(0, 3)
      .map((n) => distinctName(n, input.taken ?? [], kind === "upload" ? "" : label));

  if (!items.length) return finish([kind === "upload" ? fallback : label]);
  if (kind === "web") return finish(webNames(items, fallback));

  const cleaned = items.map((it) => cleanTitle(it.title, fileLike || it.kind === "file"));
  const tag = sharedTag(cleaned);
  const titles = cleaned.map((t) => dropTag(t, tag)).filter(Boolean);
  const noun = nounFor(titles.length ? titles : cleaned);
  const paths = items.map((it) => (it.path ?? []).filter(Boolean));
  const names: string[] = [];

  if (items.length === 1) {
    const it = items[0];
    const own = titles[0] || cleaned[0];
    const ownName = own
      ? CONTAINER_KINDS.has(it.kind ?? "")
        ? containerName(kind, it.title, null, noun)
        : withNoun(titleCase(clip(own)), noun)
      : "";
    names.push(ownName);
    if (paths[0].length) {
      const parent = paths[0][paths[0].length - 1];
      if (paths[0].length > 1) names.push(withNoun(titleCase(clip(cleanTitle(parent, fileLike))), noun));
      names.push(containerName(kind, paths[0][0], null, noun));
    }
    if (!names.some(Boolean)) names.push(fallback);
    return finish(names);
  }

  // The deepest place every item sits under.
  let depth = 0;
  while (paths.every((p) => p.length > depth && p[depth] === paths[0][depth])) depth++;
  if (depth > 1) {
    const parent = dropTag(cleanTitle(paths[0][depth - 1], fileLike), tag);
    if (parent) names.push(withNoun(titleCase(clip(parent)), noun));
  }
  if (depth > 0) names.push(containerName(kind, paths[0][0], tag, noun));

  const theme = sharedTheme(titles);
  if (theme) names.push(withNoun(titleCase(clip(theme, 4)), noun, noun !== "docs"));

  // Items from two or three places, or two or three containers picked whole: name them together.
  if (depth === 0 && kind !== "upload") {
    const tops = uniqueList(
      items.map((it, i) => (CONTAINER_KINDS.has(it.kind ?? "") || !paths[i].length ? it.title : paths[i][0])),
    ).map((t) => titleCase(dropTag(cleanTitle(kind === "github" ? (t.split("/").pop() ?? t) : t, fileLike), tag)));
    const together = tops.length === 2 ? `${tops[0]} and ${tops[1]}` : tops.length === 3 ? `${tops[0]}, ${tops[1]} and ${tops[2]}` : "";
    if (together && words(together).length <= MAX_WORDS && tops.every(Boolean)) {
      names.push(kind === "confluence" ? `${together} spaces` : together);
    }
  }
  if (!names.some(Boolean)) names.push(fallback);
  return finish(names);
}

/** The best name for a new knowledge base from what was picked. */
export function suggestBaseName(input: NameInput): string {
  return nameSuggestions(input)[0] ?? input.label;
}
