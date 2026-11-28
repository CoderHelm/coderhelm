// The one content model for every public page. The HTML pages, the Markdown
// twins (/<page>.md), /llms.txt, /llms-full.txt, the sitemap and the JSON-LD
// are all generated from these objects, so they can never drift apart.
//
// Inline text supports two Markdown marks only: [label](/path) links and
// `code`. Both renderers understand them.

export type FrameId =
  | "run"
  | "review"
  | "maintain"
  | "alert"
  | "tests"
  | "lookup"
  | "skills"
  | "secfix"
  | "stale"
  | "setup"
  | "knowledge"
  | "infra";

// Screenshots of the dashboard in public/shots/, taken from its end to end
// tests' made up data (see src/content/shots.ts).
export type ShotId =
  | "chat"
  | "knowledge"
  | "setup"
  | "kbBase"
  | "kbUsage"
  | "setupResults"
  | "infra"
  // The home page's pictures: light versions in the site's colors, each in
  // AVIF and WebP at two widths with a PNG fallback (public/shots/home).
  | "homeHero"
  | "homeRun"
  | "homeReview"
  | "homeAlert"
  | "homeRelease"
  | "homeChat"
  | "homeAppMap";

// A real pull request CoderHelm opened in a public repository, quoted word
// for word: the review thread and the commits, with links to check them.
export type PullRequest = {
  repo: string; // "owner/name"
  number: number;
  title: string;
  href: string;
  facts: string; // one line: when it opened, from which issue, how it ended
  thread: { who: string; bot?: boolean; file: string; text: string }[];
  commits: { sha: string; time: string; who: string; text: string }[];
};

export type Block =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "cards"; items: { title: string; text: string; href?: string; shot?: ShotId }[] }
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "pr"; pr: PullRequest }
  // A picture of the product. The caption is what the Markdown twin keeps.
  | { type: "frame"; id: FrameId; caption: string }
  // A screenshot of the real dashboard, taken with made up example data.
  | { type: "shot"; shot: ShotId; caption: string }
  // Buttons that lead on: the first one is the main action.
  | { type: "actions"; items: { label: string; href: string }[] }
  // A short aside under the text, such as a note about releases.
  | { type: "note"; text: string };

export type Section = {
  id: string;
  heading: string;
  blocks: Block[];
};

export type Page = {
  slug: string; // "" for home
  path: string; // "/" or "/reviewer/"
  navLabel: string;
  title: string; // <title>, without the site suffix
  description: string; // meta description, also the llms.txt note
  h1: string;
  lede: string;
  // A short pointer under the lede, for a page people often open while
  // looking for another one.
  heroNote?: string;
  heroFrame?: { id: FrameId; caption: string };
  // The main button under the heading, when it is not "Get started".
  heroCta?: { label: string; href: string };
  sections: Section[];
  related?: string[]; // slugs
  kind?: "product" | "legal";
  // Legal pages keep their text as Markdown, rendered as-is.
  body?: string;
};
