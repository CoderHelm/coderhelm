import type { Block, Page } from "@/content/types";
import { SITE, pages, pageBySlug, mdPath } from "@/content/site";

// Relative links in content become absolute so a Markdown twin read on its own
// (pasted into a chat, fetched by an agent) still resolves.
function absolutize(text: string): string {
  return text.replace(/\]\((\/[^)]*)\)/g, (_m, p: string) => `](${SITE.url}${p})`);
}

function block(b: Block): string {
  switch (b.type) {
    case "p":
      return absolutize(b.text);
    case "list":
      return b.items.map((i) => `- ${absolutize(i)}`).join("\n");
    case "steps":
      return b.items.map((s, i) => `${i + 1}. **${s.title}.** ${absolutize(s.text)}`).join("\n");
    case "cards":
      return b.items
        .map((c) => {
          const title = c.href ? `[${c.title}](${SITE.url}${c.href})` : c.title;
          return `- **${title}:** ${absolutize(c.text)}`;
        })
        .join("\n");
    case "faq":
      return b.items.map((f) => `### ${f.q}\n\n${absolutize(f.a)}`).join("\n\n");
    case "table": {
      const head = `| ${b.head.join(" | ")} |\n| ${b.head.map(() => "---").join(" | ")} |`;
      const rows = b.rows.map((r) => `| ${r.map(absolutize).join(" | ")} |`).join("\n");
      return `${head}\n${rows}`;
    }
    case "frame":
      return `*Product view: ${b.caption}*`;
    case "story": {
      let n = 0;
      return b.chapters
        .map((c) =>
          [
            `### ${c.title}`,
            ...c.steps.map(
              (s) =>
                `${++n}. **${s.title}.** ${s.heading} ${absolutize(s.text)} [${s.linkLabel}](${SITE.url}${s.href})\n\n   *Product view: ${s.caption}*`,
            ),
          ].join("\n\n"),
        )
        .join("\n\n");
    }
    case "bento":
      return b.items.map((c) => `- **[${c.title}](${SITE.url}${c.href}):** ${absolutize(c.text)}`).join("\n");
  }
}

export function pageToMarkdown(page: Page, opts: { frontmatter?: boolean } = {}): string {
  const out: string[] = [];
  if (opts.frontmatter !== false) {
    out.push(
      [
        "---",
        `title: ${JSON.stringify(page.title)}`,
        `description: ${JSON.stringify(page.description)}`,
        `url: ${SITE.url}${page.path}`,
        `updated: ${SITE.updated}`,
        "---",
      ].join("\n"),
    );
  }
  if (page.body) {
    out.push(absolutize(page.body.trim()));
    out.push(`---\n\nSource: ${SITE.url}${page.path} · Updated ${SITE.updated}`);
    return out.join("\n\n") + "\n";
  }
  out.push(`# ${page.h1}`);
  out.push(`> ${absolutize(page.lede)}`);
  if (page.slug === "") out.push(SITE.entity);
  if (page.heroFrame) out.push(`*Product view: ${page.heroFrame.caption}*`);
  for (const s of page.sections) {
    out.push(`## ${s.heading}`);
    for (const b of s.blocks) out.push(block(b));
  }
  if (page.related?.length) {
    out.push("## Related");
    out.push(
      page.related
        .map((slug) => pageBySlug(slug))
        .filter((p): p is Page => Boolean(p))
        .map((p) => `- [${p.title}](${SITE.url}${mdPath(p)}): ${p.description}`)
        .join("\n"),
    );
  }
  out.push(
    `---\n\nSource: ${SITE.url}${page.path} · Markdown: ${SITE.url}${mdPath(page)} · Updated ${SITE.updated} · Get started: ${SITE.appUrl}`,
  );
  return out.join("\n\n") + "\n";
}

export function llmsTxt(): string {
  const product = pages.filter((p) => p.slug !== "" && p.kind !== "legal");
  const legal = pages.filter((p) => p.kind === "legal");
  const home = pageBySlug("")!;
  return (
    [
      `# ${SITE.name}`,
      `> ${SITE.entity}`,
      SITE.llmsDetails.map((l) => `- ${l}`).join("\n"),
      "Every page on this site has a Markdown twin: add `.md` to the path (the home page is `/index.md`), or send `Accept: text/markdown`. The full site in one file is at /llms-full.txt.",
      "## Pages",
      [home, ...product].map((p) => `- [${p.title}](${SITE.url}${mdPath(p)}): ${p.description}`).join("\n"),
      "## Get started",
      `- [Sign in or request access](${SITE.appUrl}): connect GitHub, then Jira if you use it, and add your Anthropic API key.\n- Email: ${SITE.email}`,
      "## Optional",
      legal.map((p) => `- [${p.title}](${SITE.url}${mdPath(p)}): ${p.description}`).join("\n"),
    ].join("\n\n") + "\n"
  );
}

export function llmsFullTxt(): string {
  const parts = [`# ${SITE.name}`, `> ${SITE.entity}`, `Updated ${SITE.updated}. Each page below is separated by a horizontal rule.`];
  for (const p of pages) {
    parts.push("---");
    parts.push(pageToMarkdown(p, { frontmatter: false }).replace(/^# /, "# ").trim());
  }
  return parts.join("\n\n") + "\n";
}

export function markdownResponse(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
