"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownCode } from "./markdown-code";

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/**
 * A single newline is a line break, as in GitHub comments and support email:
 * people write tickets and notes line by line, not in markdown paragraphs.
 */
function remarkLineBreaks() {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    const next: MdNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value?.includes("\n")) {
        child.value.split(/\r?\n/).forEach((part, i) => {
          if (i > 0) next.push({ type: "break" });
          if (part) next.push({ type: "text", value: part });
        });
      } else {
        walk(child);
        next.push(child);
      }
    }
    node.children = next;
  };
  return (tree: MdNode) => walk(tree);
}

// Hoisted outside component to keep stable references
const REMARK_PLUGINS = [remarkGfm];
const REMARK_PLUGINS_BREAKS = [remarkGfm, remarkLineBreaks];

/** Body text no wider than a comfortable reading line; code and tables may use the full width. */
const MEASURE = "max-w-[80ch]";

/**
 * chat: messages and answers, bright text. reading: saved text people read at
 * length (instructions, guides), in the softer body colour.
 */
export type ChatMarkdownTone = "chat" | "reading";

function components(tone: ChatMarkdownTone): Partial<Components> {
  const body = tone === "reading" ? "text-zinc-300" : "text-zinc-200";
  const lead = "leading-relaxed";
  return {
    h1: ({ children }) => <h1 className={`text-base font-bold text-zinc-100 mt-4 mb-1.5 first:mt-0 ${MEASURE}`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`text-sm font-semibold text-zinc-100 mt-4 mb-1.5 first:mt-0 ${MEASURE}`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`text-sm font-semibold text-zinc-200 mt-3 mb-1 first:mt-0 ${MEASURE}`}>{children}</h3>,
    p: ({ children }) => <p className={`text-sm ${body} mb-2 last:mb-0 ${lead} ${MEASURE}`}>{children}</p>,
    ul: ({ className, children }) =>
      className?.includes("contains-task-list") ? (
        <ul className={`text-sm ${body} mb-2 last:mb-0 space-y-1 ml-1 list-none ${MEASURE}`}>{children}</ul>
      ) : (
        <ul className={`list-disc pl-5 marker:text-zinc-500 text-sm ${body} mb-2 last:mb-0 space-y-1 ${MEASURE}`}>{children}</ul>
      ),
    ol: ({ children }) => <ol className={`list-decimal pl-5 marker:text-zinc-500 text-sm ${body} mb-2 last:mb-0 space-y-1 ${MEASURE}`}>{children}</ol>,
    li: ({ children }) => <li className={`${lead} [&>ul]:mt-1 [&>ol]:mt-1 [&>ul]:mb-0 [&>ol]:mb-0`}>{children}</li>,
    ...markdownCode,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{children}</a>,
    blockquote: ({ children }) => <blockquote className={`border-l-2 border-zinc-600 pl-3 text-sm text-zinc-400 italic mb-2 last:mb-0 ${MEASURE}`}>{children}</blockquote>,
    table: ({ children }) => <div className="overflow-x-auto mb-2 last:mb-0 rounded-lg border border-zinc-800"><table className="text-sm text-zinc-300 border-collapse w-full">{children}</table></div>,
    thead: ({ children }) => <thead className="bg-zinc-800/50">{children}</thead>,
    th: ({ children }) => <th className="text-left text-xs font-medium text-zinc-200 px-3 py-1.5">{children}</th>,
    td: ({ children }) => <td className="text-sm text-zinc-300 px-3 py-1.5 border-t border-zinc-800 align-top [&:has(code)]:min-w-[14rem]">{children}</td>,
    hr: () => <hr className="border-zinc-700 my-3" />,
    strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
    em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
    input: ({ checked }) => <input type="checkbox" aria-label={checked ? "Done" : "Not done"} checked={!!checked} disabled readOnly className="mr-1.5 align-middle accent-emerald-500" />,
  };
}

const COMPONENTS: Record<ChatMarkdownTone, Partial<Components>> = { chat: components("chat"), reading: components("reading") };

/**
 * Markdown as the app shows messages and answers. Raw HTML is never rendered
 * and unsafe link targets are dropped (react-markdown's defaults). `breaks`
 * turns single newlines into line breaks, for text people typed.
 */
export const ChatMarkdown = memo(function ChatMarkdown({
  children,
  breaks = false,
  tone = "chat",
  onCite,
}: {
  children: string;
  breaks?: boolean;
  tone?: ChatMarkdownTone;
  /** Links to `#cite-<id>` become citation buttons that call this. */
  onCite?: (id: string) => void;
}) {
  const parts = useMemo<Partial<Components>>(
    () =>
      onCite
        ? {
            ...COMPONENTS[tone],
            a: ({ href, children: label }) =>
              href?.startsWith("#cite-") ? (
                <button
                  type="button"
                  onClick={() => onCite(href.slice(6))}
                  aria-label={`Source ${String(label)}`}
                  data-testid="cite-marker"
                  className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-1 items-center justify-center rounded bg-zinc-800 px-1 align-baseline text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-100"
                >
                  {label}
                </button>
              ) : (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  {label}
                </a>
              ),
          }
        : COMPONENTS[tone],
    [onCite, tone],
  );
  return (
    <div className="chat-md overflow-hidden min-w-0 max-w-full">
      <ReactMarkdown remarkPlugins={breaks ? REMARK_PLUGINS_BREAKS : REMARK_PLUGINS} components={parts} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
});
