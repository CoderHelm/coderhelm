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
  | "skills";

export type Block =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "cards"; items: { title: string; text: string; href?: string }[] }
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "table"; head: string[]; rows: string[][] }
  // A picture of the product. The caption is what the Markdown twin keeps.
  | { type: "frame"; id: FrameId; caption: string };

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
  sections: Section[];
  related?: string[]; // slugs
  kind?: "product" | "legal";
  // Legal pages keep their text as Markdown, rendered as-is.
  body?: string;
};
