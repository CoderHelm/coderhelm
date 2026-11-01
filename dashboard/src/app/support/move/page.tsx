"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type TeamInfo } from "@/lib/api";
import { hasRole } from "@/lib/roles";
import { isSelfHosted } from "@/lib/runtime-config";
import { Page, PageHeader } from "@/components/page";
import { Field } from "@/components/settings";
import { ListSkeleton } from "@/components/list";
import { fullWidthOnPhone, primaryButton, secondaryButton } from "@/components/ui";

// The install guide's "Your data" step opens this page on hosted Coderhelm
// with the install's region, name and address. A team admin or owner asks for
// the move here; it opens a support ticket (POST /api/support/move), and a
// person from Coderhelm arranges the rest on that ticket.

const REGION_RE = /^[a-z]{2}(-[a-z]+)+-[0-9]$/;
const STAGE_RE = /^[a-z][a-z0-9]{0,19}$/;

/** The install's details from the guide's link, each checked; "" when missing or odd. */
function installFrom(params: URLSearchParams): { region: string; stage: string; address: string } {
  const region = (params.get("region") || "").trim();
  const stage = (params.get("stage") || "").trim();
  let address = "";
  try {
    const u = new URL((params.get("address") || "").trim());
    if (u.protocol === "https:" && !u.username && !u.password) address = `https://${u.hostname.toLowerCase()}`;
  } catch {
    address = "";
  }
  return { region: REGION_RE.test(region) ? region : "", stage: STAGE_RE.test(stage) ? stage : "", address };
}

const NEXT_STEPS = [
  "Someone from Coderhelm answers on this ticket, usually within a working day.",
  "You agree on a time, and both sides confirm the team and the install.",
  "Your team's settings, history and connections are copied to your install and checked, count by count.",
  "Hosted Coderhelm keeps working the whole time. You switch when you are ready.",
  "People sign in to your install with the same email and password.",
];

export default function MovePageWithParams() {
  return (
    <Suspense
      fallback={
        <Page narrow>
          <PageHeader title="Move your team to your install" />
          <div className="mt-6">
            <ListSkeleton rows={3} />
          </div>
        </Page>
      }
    >
      <MovePage />
    </Suspense>
  );
}

function MovePage() {
  const params = useSearchParams();
  const [install] = useState(() => installFrom(new URLSearchParams(params.toString())));
  const [me, setMe] = useState<{ email: string; role: string; team_id: string } | null>(null);
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");

  useEffect(() => {
    Promise.all([api.me(), api.listTeams().catch(() => ({ teams: [] as TeamInfo[] }))])
      .then(([u, t]) => {
        setMe({ email: u.email, role: u.role, team_id: u.team_id });
        setTeam(t.teams.find((x) => x.current) ?? null);
      })
      .catch(() => setMe(null))
      .finally(() => setLoaded(true));
  }, []);

  const complete = !!(install.region && install.stage && install.address);
  const admin = hasRole(me?.role, "admin");

  const submit = async () => {
    if (busy || !complete || !admin) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.requestMove({ ...install, window: when.trim(), notes: notes.trim() });
      setTicket(r.ticket.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  };

  if (isSelfHosted()) {
    return (
      <Page narrow>
        <PageHeader title="Move your team to your install" lead="The team that moves asks for it on hosted Coderhelm, not on an install." />
      </Page>
    );
  }

  if (ticket) {
    return (
      <Page narrow testId="move-sent">
        <PageHeader title="Request sent" lead={`Your ticket number is ${ticket}. You can go back to the install guide; it doesn't wait for this.`} />
        <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
          {NEXT_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href={`/support/ticket?id=${encodeURIComponent(ticket)}`} className={`${primaryButton} ${fullWidthOnPhone}`}>
            Open the ticket
          </Link>
        </div>
      </Page>
    );
  }

  return (
    <Page narrow testId="move-request">
      <PageHeader
        title="Move your team to your install"
        lead="Ask Coderhelm to bring this team's settings, history and connections to your own install. A person sets up the move with you on a support ticket."
      />
      {!loaded ? (
        <div className="mt-6">
          <ListSkeleton rows={3} />
        </div>
      ) : (
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5 text-sm sm:grid-cols-[auto_1fr]" data-testid="move-details">
            <dt className="text-zinc-400">Team</dt>
            <dd className="text-zinc-200 [overflow-wrap:anywhere]">{team?.org || "Your current team"}</dd>
            <dt className="text-zinc-400">Contact</dt>
            <dd className="text-zinc-200 [overflow-wrap:anywhere]">{me?.email || "Sign in first"}</dd>
            <dt className="text-zinc-400">Install</dt>
            <dd className="text-zinc-200 [overflow-wrap:anywhere]">{install.address || "Missing: open this page from the install guide"}</dd>
            <dt className="text-zinc-400">AWS region and name</dt>
            <dd className="text-zinc-200">{install.region && install.stage ? `${install.region}, ${install.stage}` : "Missing"}</dd>
          </dl>
          <p className="text-xs text-zinc-400">
            Moving a different team? Switch to it in the team menu first; this page asks for the team you are in.
          </p>
          {!admin && (
            <p role="alert" className="text-sm text-amber-300" data-testid="move-not-admin">
              Only an admin or the owner of this team can ask to move it. Ask one of them, or switch to a team you run.
            </p>
          )}
          <Field id="move-window" label="When suits you? (optional)" value={when} maxLength={200} onChange={(e) => setWhen(e.target.value)} placeholder="Weekday mornings, US Eastern" />
          <Field as="textarea" id="move-notes" label="Anything else? (optional)" value={notes} maxLength={2000} rows={4} onChange={(e) => setNotes(e.target.value)} placeholder="Dates that matter, anything you must keep." />
          <p className="text-xs text-zinc-400" data-testid="move-no-secrets">
            Never put AWS keys, tokens or passwords here. Coderhelm never needs them to move your team, and a request with one is refused.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link href="/support" className={`${secondaryButton} ${fullWidthOnPhone}`}>
              Cancel
            </Link>
            <button type="submit" disabled={busy || !complete || !admin} className={`${primaryButton} ${fullWidthOnPhone} cursor-pointer disabled:cursor-not-allowed`}>
              {busy ? "Sending…" : "Ask to move this team"}
            </button>
          </div>
        </form>
      )}
    </Page>
  );
}
