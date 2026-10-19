import Link from "next/link";
import type { ReactNode } from "react";

// A deliberately small Markdown renderer for the site's own content: links,
// `code` and **bold** inline; headings, paragraphs, lists and tables as blocks.
// It renders on the server only and ships no JavaScript.

const INLINE = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g;

export function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          const [, label, href] = link;
          const cls = "text-accent-text underline decoration-accent-text/30 underline-offset-4 hover:decoration-accent-text";
          return href.startsWith("/") ? (
            <Link key={i} href={href} className={cls}>
              {label}
            </Link>
          ) : (
            <a key={i} href={href} className={cls}>
              {label}
            </a>
          );
        }
        if (part.startsWith("`")) {
          return (
            <code key={i} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.9em] text-text-primary">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-text-primary">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function MarkdownDoc({ source }: { source: string }) {
  const blocks = source.trim().split(/\n{2,}/);
  const out: ReactNode[] = [];
  blocks.forEach((b, i) => {
    const h = b.match(/^(#{1,3}) (.*)$/);
    if (h) {
      const level = h[1].length;
      const text = <Inline text={h[2]} />;
      if (level === 1) out.push(<h1 key={i} className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">{text}</h1>);
      else if (level === 2) out.push(<h2 key={i} className="mt-12 text-xl font-semibold text-text-primary">{text}</h2>);
      else out.push(<h3 key={i} className="mt-8 text-base font-semibold text-text-primary">{text}</h3>);
      return;
    }
    if (b.startsWith("- ")) {
      out.push(
        <ul key={i} className="mt-4 list-disc space-y-2 pl-5 text-text-secondary marker:text-text-muted">
          {b.split("\n").map((li, j) => (
            <li key={j} className="leading-relaxed">
              <Inline text={li.replace(/^- /, "")} />
            </li>
          ))}
        </ul>,
      );
      return;
    }
    if (b.startsWith("|")) {
      const rows = b
        .split("\n")
        .filter((r) => !/^\|\s*-/.test(r))
        .map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      const [head, ...body] = rows;
      out.push(
        <div key={i} className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-text-primary">
              <tr>{head.map((c, j) => <th key={j} scope="col" className="px-4 py-2.5 font-semibold"><Inline text={c} /></th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line text-text-secondary">
              {body.map((r, j) => (
                <tr key={j}>{r.map((c, k) => <td key={k} className="px-4 py-2.5 align-top"><Inline text={c} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      return;
    }
    out.push(
      <p key={i} className="mt-4 leading-relaxed text-text-secondary">
        <Inline text={b.replace(/\n/g, " ")} />
      </p>,
    );
  });
  return <>{out}</>;
}
