"use client";

import { memo } from "react";
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

const COMPONENTS: Partial<Components> = {
  h1: ({ children }) => <h1 className="text-base font-bold text-zinc-100 mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold text-zinc-100 mt-3 mb-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mt-2 mb-1">{children}</h3>,
  p: ({ children }) => <p className="text-sm text-zinc-200 mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ className, children }) =>
    className?.includes("contains-task-list") ? (
      <ul className="text-sm text-zinc-200 mb-2 last:mb-0 space-y-0.5 ml-1 list-none">{children}</ul>
    ) : (
      <ul className="list-disc list-inside text-sm text-zinc-200 mb-2 last:mb-0 space-y-0.5 ml-1">{children}</ul>
    ),
  ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-zinc-200 mb-2 last:mb-0 space-y-0.5 ml-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  ...markdownCode,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{children}</a>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-600 pl-3 text-sm text-zinc-400 italic mb-2 last:mb-0">{children}</blockquote>,
  table: ({ children }) => <div className="overflow-x-auto mb-2 last:mb-0 rounded-lg border border-zinc-800"><table className="text-sm text-zinc-300 border-collapse w-full">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-zinc-800/50">{children}</thead>,
  th: ({ children }) => <th className="text-left text-xs font-medium text-zinc-200 px-3 py-1.5">{children}</th>,
  td: ({ children }) => <td className="text-sm text-zinc-300 px-3 py-1.5 border-t border-zinc-800">{children}</td>,
  hr: () => <hr className="border-zinc-700 my-3" />,
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
  input: ({ checked }) => <input type="checkbox" aria-label={checked ? "Done" : "Not done"} checked={!!checked} disabled readOnly className="mr-1.5 align-middle accent-emerald-500" />,
};

/**
 * Markdown as the app shows messages and answers. Raw HTML is never rendered
 * and unsafe link targets are dropped (react-markdown's defaults). `breaks`
 * turns single newlines into line breaks, for text people typed.
 */
export const ChatMarkdown = memo(function ChatMarkdown({ children, breaks = false }: { children: string; breaks?: boolean }) {
  return (
    <div className="chat-md overflow-hidden min-w-0 max-w-full">
      <ReactMarkdown remarkPlugins={breaks ? REMARK_PLUGINS_BREAKS : REMARK_PLUGINS} components={COMPONENTS} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
});
