"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="chat-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-base font-bold text-zinc-100 mt-3 mb-1.5 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold text-zinc-100 mt-3 mb-1.5 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="text-sm text-zinc-200 mb-2 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside text-sm text-zinc-200 mb-2 last:mb-0 space-y-0.5 ml-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-zinc-200 mb-2 last:mb-0 space-y-0.5 ml-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block text-xs font-mono text-zinc-300 bg-black/40 rounded-lg p-3 mb-2 last:mb-0 overflow-x-auto border border-zinc-800">
                  {children}
                </code>
              );
            }
            return <code className="text-xs font-mono text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">{children}</code>;
          },
          pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{children}</a>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-600 pl-3 text-sm text-zinc-400 italic mb-2 last:mb-0">{children}</blockquote>,
          table: ({ children }) => <div className="overflow-x-auto mb-2 last:mb-0 rounded-lg border border-zinc-800"><table className="text-sm text-zinc-300 border-collapse w-full">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-zinc-800/50">{children}</thead>,
          th: ({ children }) => <th className="text-left text-xs font-medium text-zinc-200 px-3 py-1.5">{children}</th>,
          td: ({ children }) => <td className="text-sm text-zinc-300 px-3 py-1.5 border-t border-zinc-800">{children}</td>,
          hr: () => <hr className="border-zinc-700 my-3" />,
          strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
          em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
