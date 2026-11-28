import type { ShotId } from "./types";

// Screenshots of the CoderHelm dashboard, taken by its own end to end tests
// (dashboard/e2e: chat.spec.ts, knowledge.spec.ts, selfhost.spec.ts with
// E2E_SHOTS_DIR set, and landing-shots.spec.ts with LANDING_SHOTS_DIR set). Every name, team and file in them is made up test data.
// To refresh one, run that spec with E2E_SHOTS_DIR and convert the picture to
// WebP at the same size.

type Img = { src: string; width: number; height: number };

// The home page's pictures (public/shots/home) are the light versions from
// e2e/landing-shots-*.spec.ts, made by dashboard/scripts/home-shots.py into `<name>.png`
// (1280 wide), `<name>-1280.{avif,webp}` and `<name>-2400.{avif,webp}`, the
// larger one `large` pixels wide. Cropped ones leave out the dashboard's menu.
type Shot = { alt: string; desktop: Img; phone?: Img; large?: number };

const home = (name: string, alt: string, large = 2056): Shot => ({ alt, large, desktop: { src: `/shots/home/${name}.png`, width: 1280, height: 800 } });

export const SHOTS: Record<ShotId, Shot> = {
  chat: {
    alt: "CoderHelm Chat answering how a web app is put together: a line saying it read two files and searched knowledge, the steps it took, and an answer with numbered citations to source files.",
    desktop: { src: "/shots/chat.webp", width: 760, height: 594 },
    phone: { src: "/shots/chat-phone.webp", width: 390, height: 844 },
  },
  knowledge: {
    alt: "A CoderHelm knowledge base fed by Notion, Google Drive, Confluence, Sanity and uploaded files, each with its sync state.",
    desktop: { src: "/shots/knowledge.webp", width: 1440, height: 900 },
    phone: { src: "/shots/knowledge-phone.webp", width: 390, height: 844 },
  },
  setup: {
    alt: "The Setup page of a self hosted CoderHelm: install checks that passed, and one that needs a fix with why it matters and how to fix it.",
    desktop: { src: "/shots/setup.webp", width: 872, height: 960 },
    phone: { src: "/shots/setup-phone.webp", width: 390, height: 700 },
  },
  kbBase: {
    alt: "A CoderHelm knowledge base page: its status and source of truth mark, tiles for pages searchable, passages, freshness and searches this week, a problems banner, and Ask this knowledge base with Passages only on.",
    desktop: { src: "/shots/kb-base.webp", width: 1440, height: 900 },
    phone: { src: "/shots/kb-base-phone.webp", width: 390, height: 844 },
  },
  kbUsage: {
    alt: "The Usage section of a knowledge base: searches this week by Chat, coder runs, MCP and API keys and the page itself, the most cited pages, the runs and chats that used it, questions with no good answer, and pages no search found in 90 days.",
    desktop: { src: "/shots/kb-usage.webp", width: 1116, height: 504 },
    phone: { src: "/shots/kb-usage-phone.webp", width: 354, height: 985 },
  },
  setupResults: {
    alt: "The results of a Do it for me Setup run: 9 settings turned on, 4 kept, two previews to switch on with what each would have done in the last 14 days, and each change with its evidence and Undo.",
    desktop: { src: "/shots/setup-results.webp", width: 1440, height: 900 },
    phone: { src: "/shots/setup-results-phone.webp", width: 390, height: 844 },
  },
  infra: {
    alt: "The Infrastructure tab of the CoderHelm Security page: tiles for what needs action, fix pull requests, steps in AWS and AWS-managed, then one row per fix for an Auto Scaling group, an EKS node group and an Aurora cluster.",
    desktop: { src: "/shots/infra.webp", width: 1440, height: 900 },
    phone: { src: "/shots/infra-phone.webp", width: 390, height: 844 },
  },
  homeHero: { ...home("hero", "A CoderHelm run for Jira ticket ACME-123 on acme/web: pull request #412 is ready for review, CoderHelm's reviewer approved it, and the step list shows it planned, built, tested, opened the pull request and fixed a failing check.", 2400), phone: { src: "/shots/home/hero-main.png", width: 1280, height: 800 } },
  homeRun: home("run", "The Activity tab of a CoderHelm run: a failing lint check fixed by a pushed commit, a reviewer's comment answered with a new commit and a reply, then its review approved and all four checks passed."),
  homeReview: home("review", "A CoderHelm review of acme/web pull request #921 requesting changes, with a summary and four findings ranked High, Medium and Low, each linked to its file and line."),
  homeAlert: home("alert", "A checkout 5xx incident in acme/api on the Logs page: its cause, a payments timeout lowered to 2 seconds, the checks CoderHelm ran, and fix pull request #482 waiting for a person's review."),
  homeRelease: home("release", "The Releases page with acme/api v3.8.0 open: published to GitHub, Confluence and email, and its release notes listing five pull requests."),
  homeChat: home("chat", "CoderHelm Chat answering how checkout talks to the payments service in four numbered steps, each citing a file, above the list of cited source files from acme/web and acme/api."),
  homeAppMap: home("app-map", "The App map of an online store: the website, API, payments service, background jobs, data stores and outside services as cards joined by lines, with its journeys and screens listed beside them.", 2400),
};
