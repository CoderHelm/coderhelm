"use client";

import type { Components } from "react-markdown";
import { CodeBlock } from "./code-block";
import { Code } from "./settings/code";

// How both markdown renderers (Markdown and ChatMarkdown) show code: a fenced
// block becomes a <CodeBlock> in the fence's language, inline code is <Code>.
// The fence's info string can also carry a filename and lines to mark, the
// way docs sites write them:
//
//   ```ts title="lib/api.ts" {3-5} showLineNumbers

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  data?: { meta?: string | null };
  children?: HastNode[];
};

function text(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(text).join("");
}

/** title="…" (or filename=), {1,3-5}, showLineNumbers from a fence's info string. */
export function parseFenceMeta(meta?: string | null) {
  if (!meta) return {};
  const title = /(?:title|filename|file)=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  const lines = /\{([\d,\s-]+)\}/.exec(meta);
  return {
    filename: title ? title[1] ?? title[2] ?? title[3] : undefined,
    highlight: lines ? lines[1] : undefined,
    lineNumbers: /\bshowLineNumbers\b|\blineNumbers\b/.test(meta),
  };
}

/** The pre/code overrides; `defaultLang` is used for fences that name no language. */
export function markdownCodeFor(defaultLang?: string): Pick<Components, "pre" | "code"> {
  return {
    pre: ({ node }) => {
      const codeNode = (node as HastNode | undefined)?.children?.find((c) => c.type === "element" && c.tagName === "code");
      if (!codeNode) return null;
      const classes = codeNode.properties?.className;
      const list = Array.isArray(classes) ? classes.map(String) : typeof classes === "string" ? classes.split(" ") : [];
      const lang = list.find((c) => c.startsWith("language-"))?.slice("language-".length) ?? defaultLang;
      const meta = parseFenceMeta(codeNode.data?.meta);
      return <CodeBlock code={text(codeNode)} lang={lang} {...meta} className="my-3 first:mt-0 last:mb-0" />;
    },
    // Only inline code reaches here: fenced blocks are taken whole by `pre`.
    code: ({ children }) => <Code>{children}</Code>,
  };
}

export const markdownCode = markdownCodeFor();
