import { Fragment } from "react";

/**
 * A file path in monospace: the directory muted, the file name in normal
 * weight, so a list of paths reads by file name. A long path wraps after a
 * slash first (anywhere only when one part is too long); the full path is
 * the hover text.
 */
export function FilePath({ path, className = "" }: { path: string; className?: string }) {
  const cut = path.lastIndexOf("/");
  const dir = cut > 0 ? path.slice(0, cut + 1).split("/").slice(0, -1) : [];
  return (
    <span className={`font-mono text-xs leading-5 [overflow-wrap:anywhere] ${className}`} title={path}>
      {dir.length > 0 && (
        <span className="text-zinc-400">
          {dir.map((part, i) => (
            <Fragment key={i}>
              {part}/<wbr />
            </Fragment>
          ))}
        </span>
      )}
      <span className="text-zinc-200">{path.slice(cut + 1)}</span>
    </span>
  );
}
