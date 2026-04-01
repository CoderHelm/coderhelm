"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold text-zinc-100 mt-4 mb-2 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-zinc-200 mt-4 mb-2 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mt-3 mb-1">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-medium text-zinc-300 mt-2 mb-1">{children}</h4>,
        p: ({ children }) => <p className="text-sm text-zinc-400 mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside text-sm text-zinc-400 mb-2 space-y-0.5 ml-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-zinc-400 mb-2 space-y-0.5 ml-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <code className="block text-xs font-mono text-zinc-300 bg-zinc-900 rounded p-3 mb-2 overflow-x-auto">
                {children}
              </code>
            );
          }
          return <code className="text-xs font-mono text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">{children}</code>;
        },
        pre: ({ children }) => <pre className="mb-2">{children}</pre>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{children}</a>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-700 pl-3 text-sm text-zinc-500 italic mb-2">{children}</blockquote>,
        table: ({ children }) => <div className="overflow-x-auto mb-2"><table className="text-sm text-zinc-400 border-collapse w-full">{children}</table></div>,
        thead: ({ children }) => <thead className="border-b border-zinc-700">{children}</thead>,
        th: ({ children }) => <th className="text-left text-xs font-medium text-zinc-300 px-3 py-1.5">{children}</th>,
        td: ({ children }) => <td className="text-sm text-zinc-400 px-3 py-1.5 border-t border-zinc-800">{children}</td>,
        hr: () => <hr className="border-zinc-800 my-3" />,
        strong: ({ children }) => <strong className="font-semibold text-zinc-200">{children}</strong>,
        em: ({ children }) => <em className="italic text-zinc-400">{children}</em>,
        input: ({ checked, ...props }) => (
          <input {...props} checked={checked} disabled className="mr-1.5 accent-emerald-500" type="checkbox" />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
