import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-24">
        <p className="font-mono text-sm text-fd-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-bold">This page does not exist</h1>
        <p className="mt-4 text-fd-muted-foreground">
          The link may be old, or the page may have moved. Search the docs with <kbd>/</kbd> or{' '}
          <kbd>⌘K</kbd>, or start from one of these:
        </p>
        <ul className="mt-6 space-y-2">
          <li><Link className="text-fd-primary underline" href="/">Docs home</Link></li>
          <li><Link className="text-fd-primary underline" href="/getting-started/">Getting started</Link></li>
          <li><Link className="text-fd-primary underline" href="/plugins/">Build a plugin</Link></li>
          <li><Link className="text-fd-primary underline" href="/self-host/">Self-hosting</Link></li>
        </ul>
      </main>
    </HomeLayout>
  );
}
