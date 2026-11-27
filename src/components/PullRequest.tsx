import type { PullRequest } from "@/content/types";
import { Inline } from "./Md";

// A real pull request, quoted word for word, set as a document rather than a
// drawing of GitHub: the review thread, then the commits, each linked.
export function PullRequestView({ pr }: { pr: PullRequest }) {
  return (
    <figure className="min-w-0 border-y border-text-primary/80">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-4">
        <a href={pr.href} className="font-medium text-text-primary underline decoration-line underline-offset-4 hover:decoration-text-primary">
          {pr.title}
        </a>
        <span className="font-mono text-[13px] text-text-muted">
          {pr.repo}#{pr.number}
        </span>
      </figcaption>
      <p className="py-4 text-[15px] leading-relaxed text-text-secondary">
        <Inline text={pr.facts} />
      </p>

      <ol className="grid gap-px border-t border-line">
        {pr.thread.map((t, i) => (
          <li key={i} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
            <p className="font-mono text-[13px] leading-6">
              <span className={t.bot ? "text-accent-text" : "text-text-primary"}>{t.who}</span>
            </p>
            <div className="min-w-0">
              <p className={`text-[16px] leading-relaxed ${t.bot ? "text-text-primary" : "text-text-secondary"}`}>
                <Inline text={t.text} />
              </p>
              <p className="mt-1 truncate font-mono text-[12px] text-text-muted">on {t.file}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="border-t border-line py-4">
        <p className="text-[13px] text-text-muted">Commits, times in UTC</p>
        <ul className="mt-2 grid gap-1.5 font-mono text-[13px]">
          {pr.commits.map((c) => (
            <li key={c.sha} className="flex min-w-0 gap-3">
              <a href={`https://github.com/${pr.repo}/commit/${c.sha}`} className="flex-none text-accent-text hover:underline">
                {c.sha}
              </a>
              <span className="flex-none text-text-muted">{c.time}</span>
              <span className="min-w-0 text-text-secondary sm:truncate" title={c.text}>
                {c.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
