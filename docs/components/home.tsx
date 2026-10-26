import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, Bot, Cloud, Code, KeyRound, MessagesSquare, Server, ShieldCheck, Sparkles, Wrench } from 'lucide-react';

// The docs home: three paths (use it, self-host it, build on it), then the
// newest features and the topics. The text stays in the MDX, so the page's
// Markdown twin reads the same as the page.

const ICONS = {
  bot: Bot,
  book: BookOpen,
  cloud: Cloud,
  code: Code,
  key: KeyRound,
  chat: MessagesSquare,
  server: Server,
  shield: ShieldCheck,
  sparkles: Sparkles,
  wrench: Wrench,
} as const;

export type HomeIcon = keyof typeof ICONS;

function Icon({ name, className }: { name: HomeIcon; className?: string }) {
  const C = ICONS[name];
  return <C aria-hidden="true" className={className} />;
}

/** The three ways in, side by side on a wide screen and stacked on a phone. */
export function Paths({ children }: { children: ReactNode }) {
  return <div className="not-prose my-6 grid gap-4 md:grid-cols-3">{children}</div>;
}

/**
 * One way in: what it is, the one thing to do first (a button) and a few
 * pages to read next (the Markdown list given as children).
 */
export function Path({
  title,
  icon,
  description,
  href,
  cta,
  featured,
  children,
}: {
  title: string;
  icon: HomeIcon;
  description: string;
  href: string;
  cta: string;
  featured?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col rounded-xl border bg-fd-card p-5 ${featured ? 'border-fd-primary/50 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-fd-primary)_25%,transparent)]' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-lg border bg-fd-secondary text-fd-primary">
          <Icon name={icon} className="size-[18px]" />
        </span>
        <h2 className="text-base font-semibold text-fd-foreground">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">{description}</p>
      <div className="ch-path-links mt-4 flex-1 text-sm">{children}</div>
      <Link
        href={href}
        className={`mt-5 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          featured
            ? 'bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/90'
            : 'border bg-fd-secondary text-fd-foreground hover:bg-fd-accent'
        }`}
      >
        {cta}
      </Link>
    </section>
  );
}

/** A small grid of feature or topic links. */
export function Tiles({ children }: { children: ReactNode }) {
  return <div className="not-prose my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function Tile({
  title,
  href,
  icon,
  badge,
  children,
}: {
  title: string;
  href: string;
  icon: HomeIcon;
  badge?: 'new' | 'coming-soon';
  children: ReactNode;
}) {
  return (
    <Link href={href} className="group flex gap-3 rounded-xl border bg-fd-card p-4 transition-colors hover:bg-fd-accent">
      <Icon name={icon} className="mt-0.5 size-4 flex-none text-fd-muted-foreground group-hover:text-fd-primary" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center text-sm font-medium text-fd-foreground">
          {title}
          {badge ? (
            <span className="ch-badge" data-status={badge}>
              {badge === 'new' ? 'New' : 'Coming soon'}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-fd-muted-foreground">{children}</span>
      </span>
    </Link>
  );
}
