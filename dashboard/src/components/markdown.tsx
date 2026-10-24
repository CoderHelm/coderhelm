"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownCode, markdownCodeFor } from "./markdown-code";
import { Code } from "./settings/code";

/** Body text no wider than a comfortable reading line; code and tables may use the full width. */
const MEASURE = "max-w-[80ch]";

export function Markdown({ children, codeLang }: { children: string; /** The language for fences that name none, e.g. from a finding's file. */ codeLang?: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className={`text-lg font-bold text-zinc-100 mt-4 mb-2 first:mt-0 ${MEASURE}`}>{children}</h1>,
        h2: ({ children }) => <h2 className={`text-base font-semibold text-zinc-200 mt-4 mb-2 first:mt-0 ${MEASURE}`}>{children}</h2>,
        h3: ({ children }) => <h3 className={`text-sm font-semibold text-zinc-200 mt-3 mb-1 ${MEASURE}`}>{children}</h3>,
        h4: ({ children }) => <h4 className={`text-sm font-medium text-zinc-300 mt-2 mb-1 ${MEASURE}`}>{children}</h4>,
        p: ({ children }) => <p className={`text-sm text-zinc-300 mb-2 last:mb-0 leading-relaxed ${MEASURE}`}>{children}</p>,
        ul: ({ children }) => <ul className={`list-disc pl-5 marker:text-zinc-500 text-sm text-zinc-300 mb-2 last:mb-0 space-y-1 ${MEASURE}`}>{children}</ul>,
        ol: ({ children }) => <ol className={`list-decimal pl-5 marker:text-zinc-500 text-sm text-zinc-300 mb-2 last:mb-0 space-y-1 ${MEASURE}`}>{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed [&>ul]:mt-1 [&>ol]:mt-1 [&>ul]:mb-0 [&>ol]:mb-0">{children}</li>,
        ...(codeLang ? markdownCodeFor(codeLang) : markdownCode),
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{children}</a>,
        blockquote: ({ children }) => <blockquote className={`border-l-2 border-zinc-700 pl-3 text-sm text-zinc-400 italic mb-2 ${MEASURE}`}>{children}</blockquote>,
        table: ({ children }) => <div className="overflow-x-auto mb-2"><table className="text-sm text-zinc-300 border-collapse w-full">{children}</table></div>,
        thead: ({ children }) => <thead className="border-b border-zinc-700">{children}</thead>,
        th: ({ children }) => <th className="text-left text-xs font-medium text-zinc-300 px-3 py-1.5">{children}</th>,
        td: ({ children }) => <td className="text-sm text-zinc-300 px-3 py-1.5 border-t border-zinc-800 align-top [&:has(code)]:min-w-[14rem]">{children}</td>,
        hr: () => <hr className="border-zinc-800 my-3" />,
        strong: ({ children }) => <strong className="font-semibold text-zinc-200">{children}</strong>,
        em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
        input: ({ checked, ...props }) => (
          <input {...props} checked={checked} disabled className="mr-1.5 accent-emerald-500" type="checkbox" />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

const INLINE = ["p", "code", "strong", "em", "a", "del"];

/**
 * One line of markdown inside other text: a task, a title, a list item. Only
 * inline marks are drawn (`code`, **bold**, _italic_, links); anything else
 * shows as its text, so `src/app.tsx` reads as code, not as backticks.
 */
export function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      allowedElements={INLINE}
      unwrapDisallowed
      skipHtml
      components={{
        p: ({ children }) => <>{children}</>,
        code: ({ children }) => <Code>{children}</Code>,
        strong: ({ children }) => <strong className="font-semibold text-zinc-200">{children}</strong>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{children}</a>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
