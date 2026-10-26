import type { ShotId } from "./types";

// Screenshots of the CoderHelm dashboard, taken by its own end to end tests
// (dashboard/e2e: chat.spec.ts, knowledge.spec.ts, selfhost.spec.ts) with
// E2E_SHOTS_DIR set. Every name, team and file in them is made up test data.
// To refresh one, run that spec with E2E_SHOTS_DIR and convert the picture to
// WebP at the same size.

type Img = { src: string; width: number; height: number };

export const SHOTS: Record<ShotId, { alt: string; desktop: Img; phone?: Img }> = {
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
};
