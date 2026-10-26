"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Field, SecretInput } from "@/components/field";
import { buttonClass, inputClass, linkButton } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import { KIND_LABEL, knowledge, type SourceKind, type TokenInput } from "@/lib/knowledge";
import { SourceLogo } from "./logos";

// Connecting an app with a token, inside the add flow: for installs without
// the app's sign-in (no OAuth app set up), or for anyone who prefers it.
// The token is checked with the app before it is saved, and saved exactly as
// the Integrations page saves it, so the flow goes straight on to the pages.
// Google Drive has no token path: it says so plainly.

/** Where each app's saved token lives on the Integrations page. */
export const INTEGRATIONS_HREF: Partial<Record<SourceKind, string>> = {
  notion: "/settings/integrations/#integration-notion",
  confluence: "/settings/integrations/#integration-confluence",
};

export const SELF_HOST_DOCS = "https://docs.coderhelm.com/self-host/knowledge-sources/";

const NOTION_INTEGRATIONS = "https://www.notion.so/profile/integrations";
const ATLASSIAN_TOKENS = "https://id.atlassian.com/manage-profile/security/api-tokens";

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkButton}>
      {children}
    </a>
  );
}

function Steps({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-400" data-testid={testId}>
      {children}
    </ol>
  );
}

/** The Notion how-to: create a read-only connection, share pages, copy its token. */
export function NotionSteps() {
  return (
    <Steps testId="token-steps">
      <li>
        Open <Ext href={NOTION_INTEGRATIONS}>Notion&apos;s integrations page</Ext> and create a new internal connection for your workspace (older
        workspaces say New integration, type Internal). Only a Notion workspace owner can do this.
      </li>
      <li>
        On its <strong className="font-medium text-zinc-100">Configuration</strong> tab, under Capabilities, tick{" "}
        <strong className="font-medium text-zinc-100">Read content</strong> only, leave the update, insert and comment boxes empty, and save.
      </li>
      <li>
        Share pages with it: open each top page in Notion, choose <strong className="font-medium text-zinc-100">•••</strong> at the top right, then{" "}
        <strong className="font-medium text-zinc-100">Connections</strong>, then <strong className="font-medium text-zinc-100">+ Add connection</strong>, and
        pick your connection. Pages inside come along.
      </li>
      <li>
        Copy the <strong className="font-medium text-zinc-100">API token</strong> from the Configuration tab (older workspaces call it the Internal
        Integration Secret) and paste it here.
      </li>
    </Steps>
  );
}

/** The Confluence how-to: an Atlassian API token for an account that can read the spaces. */
export function ConfluenceSteps() {
  return (
    <Steps testId="token-steps">
      <li>
        Sign in to Atlassian with an account that can read the spaces you want, open <Ext href={ATLASSIAN_TOKENS}>API tokens</Ext>, and choose{" "}
        <strong className="font-medium text-zinc-100">Create API token</strong>. Name it Coderhelm and copy it.
      </li>
      <li>Enter your Confluence address, that account&apos;s email and the token here. Coderhelm reads only what that account can read.</li>
    </Steps>
  );
}

/**
 * The token form. Checks the token with the app and saves it (admins and
 * owners); `onConnected` carries on to the picker, with the app's note when
 * the token works but sees nothing yet.
 */
export function TokenForm({ kind, onConnected }: { kind: "notion" | "confluence"; onConnected: (warning: string) => void }) {
  const label = KIND_LABEL[kind];
  const [token, setToken] = useState("");
  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = token.trim() && (kind === "notion" || (site.trim() && email.trim()));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input: TokenInput = kind === "notion" ? { token } : { token, site, email };
      const r = await knowledge.saveToken(kind, input);
      onConnected(r.warning ?? "");
    } catch (err) {
      setError(errorMessage(err, `${label} didn't answer: try again in a minute.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="token-form" noValidate>
      {kind === "confluence" && (
        <>
          <Field id="kn-site" label="Confluence address">
            {(ids) => (
              <input
                {...ids}
                className={inputClass}
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="https://yourcompany.atlassian.net"
                inputMode="url"
                autoComplete="off"
                data-testid="token-site"
              />
            )}
          </Field>
          <Field id="kn-email" label="Atlassian account email">
            {(ids) => (
              <input
                {...ids}
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="off"
                data-testid="token-email"
              />
            )}
          </Field>
        </>
      )}
      <Field id="kn-token" label={kind === "notion" ? "Notion API token" : "API token"} error={error ?? undefined}>
        {(ids) => (
          <SecretInput
            {...ids}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={kind === "notion" ? "ntn_..." : "Paste the token"}
            spellCheck={false}
            data-testid="token-input"
          />
        )}
      </Field>
      <button type="submit" className={`${buttonClass("primary", "lg")} w-full sm:w-auto`} disabled={!ready || busy} data-testid="token-save">
        {busy ? `Checking with ${label}…` : `Connect ${label}`}
      </button>
    </form>
  );
}

/** For someone who can't save tokens: who can, by role. */
export function AskAdmin({ kind }: { kind: SourceKind }) {
  const label = KIND_LABEL[kind];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-left text-sm leading-relaxed text-zinc-300" data-testid="ask-admin">
      <p className="font-medium text-zinc-100">Ask an admin to connect {label}</p>
      <p className="mt-1 text-zinc-400">
        Admins and owners can connect {label} here with a token, or on the Integrations page. Once it&apos;s connected, you can pick pages from it.
      </p>
    </div>
  );
}

/** Google Drive without Google sign-in: there is no other way, said plainly. */
export function NoTokenPath({ kind }: { kind: SourceKind }) {
  const label = KIND_LABEL[kind];
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-left text-sm leading-relaxed text-zinc-300" data-testid="no-token-path">
      <p>
        {label} connects only through Google sign-in, and that isn&apos;t set up on this Coderhelm yet. There&apos;s no token to paste instead.
      </p>
      <p className="mt-2 text-zinc-400">
        Ask whoever runs Coderhelm to add a Google OAuth client. The steps are in the <Ext href={SELF_HOST_DOCS}>knowledge sources guide</Ext>.
      </p>
    </div>
  );
}

/** The provider step while what the team has connected is still loading. */
export function ConnectLoading({ kind, error, onRetry }: { kind: SourceKind; error: string | null; onRetry: () => void }) {
  const label = KIND_LABEL[kind];
  return (
    <div className="flex flex-col items-center py-6 text-center" data-testid="connect-loading" aria-busy={!error}>
      <SourceLogo kind={kind} size="lg" />
      {error ? (
        <>
          <p className="mt-5 max-w-sm text-sm text-amber-300" role="alert">
            {error}
          </p>
          <button type="button" className={`${linkButton} mt-3 text-sm`} onClick={onRetry}>
            Try again
          </button>
        </>
      ) : (
        <>
          <div className="mt-5 h-5 w-48 animate-pulse rounded bg-zinc-800 motion-reduce:animate-none" />
          <div className="mt-3 h-3.5 w-64 max-w-full animate-pulse rounded bg-zinc-800/70 motion-reduce:animate-none" />
          <p className="mt-5 flex items-center gap-2 text-sm text-zinc-400" role="status">
            <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-sky-400 motion-reduce:animate-none" />
            Checking your {label} connection…
          </p>
        </>
      )}
    </div>
  );
}

/** The one link to where saved tokens live, named like the page. */
export function IntegrationsLink({ kind }: { kind: SourceKind }) {
  const href = INTEGRATIONS_HREF[kind] ?? "/settings/integrations/";
  return (
    <Link href={href} className={`${linkButton} text-sm`} data-testid="integrations-link">
      Open the Integrations page
    </Link>
  );
}
