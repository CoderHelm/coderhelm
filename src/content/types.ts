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
  | "ticket"
  | "cifix"
  | "reply"
  | "merge";

// Screenshots of the dashboard in public/shots/, taken from its end to end
// tests' made up data (see src/content/shots.ts).
export type ShotId = "chat" | "knowledge" | "setup";

// Small pictures for the bento cells on the home page.
export type MiniId = "lookup" | "skills" | "plans" | "security";

export type StoryStep = {
  id: string; // anchor, unique on the page
  title: string; // short label in the step selector
  heading: string; // one sentence shown with the picture
  text: string;
  frame: FrameId;
  caption: string;
  href: string;
  linkLabel: string;
};

export type Chapter = { title: string; steps: StoryStep[] };

export type Block =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "cards"; items: { title: string; text: string; href?: string }[] }
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "table"; head: string[]; rows: string[][] }
  // One ticket followed through its life, grouped by the job each step does.
  | { type: "story"; chapters: Chapter[] }
  | { type: "bento"; items: { title: string; text: string; href: string; mini: MiniId; wide?: boolean }[] }
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
  eyebrow?: string;
  heading: string;
  blocks: Block[];
};

export type Page = {
  slug: string; // "" for home
  path: string; // "/" or "/reviewer/"
  navLabel: string;
  title: string; // <title>, without the site suffix
  description: string; // meta description, also the llms.txt note
  eyebrow?: string;
  h1: string;
  lede: string;
  heroFrame?: { id: FrameId; caption: string };
  // The main button under the heading, when it is not "Get started".
  heroCta?: { label: string; href: string };
  sections: Section[];
  related?: string[]; // slugs
  kind?: "product" | "legal";
  // Legal pages keep their text as Markdown, rendered as-is.
  body?: string;
};
