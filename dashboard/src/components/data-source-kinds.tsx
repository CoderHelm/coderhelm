"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CloudIcon, CodeIcon, DatabaseIcon, LogsIcon, ScanIcon, WrenchIcon } from "./icons";
import { focusRing } from "./ui";

const CONNECT = "/data-sources/connect";
const CONNECT_AWS = "/data-sources/connect/aws";

function SourceIcon({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100 ${small ? "h-8 w-8" : "h-10 w-10"}`}
    >
      {children}
    </span>
  );
}

/** Every kind of source that can be added, in the same order the list groups them. */
const KINDS: { href: string; icon: ReactNode; title: string; time: string; text: string }[] = [
  { href: `${CONNECT}?step=address`, icon: <CodeIcon />, title: "A GraphQL API", time: "About 2 minutes",
    text: "The web address your apps already talk to. Coderhelm asks it questions." },
  { href: "/data-sources/connect/reader?kind=rest", icon: <CloudIcon />, title: "A REST API", time: "About 2 minutes",
    text: "A booking, payments or vendor API, read with GET requests under the paths you allow." },
  { href: `${CONNECT_AWS}?for=database`, icon: <DatabaseIcon />, title: "A database in your AWS account", time: "About 5 minutes",
    text: "Read only access to a PostgreSQL database or a Redshift warehouse, to check the records a ticket names." },
  { href: "/data-sources/connect/reader?kind=search", icon: <ScanIcon />, title: "An OpenSearch cluster", time: "About 2 minutes",
    text: "The search indexes your app reads, searched read only. Only the indexes you list." },
  { href: `${CONNECT_AWS}?for=logs`, icon: <LogsIcon />, title: "Logs in your AWS account", time: "About 3 minutes",
    text: "Coderhelm searches your logs for the errors behind a bug report. Only the log groups you choose." },
  { href: "/data-sources/tools", icon: <WrenchIcon />, title: "Your own tools", time: "About 5 minutes",
    text: "Named lookups your engineers already trust, like “find order by number”. Approved by another admin." },
];

/** The kinds to pick from: a list of links, one per kind. */
export function KindPicker({ compact = false }: { compact?: boolean }) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {KINDS.map((k) => (
        <li key={k.href} className="min-w-0">
          <Link
            href={k.href}
            className={`flex h-full gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3.5 text-left hover:border-zinc-600 hover:bg-zinc-900 transition-colors motion-reduce:transition-none ${focusRing}`}
          >
            <SourceIcon small>{k.icon}</SourceIcon>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-zinc-100">{k.title}</span>
              <span className="text-sm text-zinc-400">{k.text}</span>
              {!compact && <span className="mt-1 text-xs text-zinc-400">{k.time}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

