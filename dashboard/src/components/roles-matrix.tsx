"use client";

import { useState } from "react";
import { CheckIcon } from "./icons";
import { Segmented } from "./segmented";
import { focusRing } from "./ui";
import { groupCapabilities, roleCan } from "@/lib/permission-groups";
import { roleLadder, type Permissions, type RoleInfo } from "@/lib/team";

// "What each role can do" on Settings → Team: one line per role, then a
// matrix of capabilities (rows, grouped by area) against roles (columns), the
// viewer's own role highlighted. On a phone the matrix would not fit, so a
// role picker shows one role's column as a list instead.

const ROLE_STYLE: Record<string, string> = {
  owner: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  admin: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  member: "border-zinc-700 bg-zinc-800/60 text-zinc-200",
  billing: "border-zinc-700 bg-zinc-800/60 text-zinc-200",
  viewer: "border-zinc-800 bg-zinc-900 text-zinc-400",
};

export function RolesMatrix({ perms, inUse }: { perms: Permissions; inUse: Set<string> }) {
  const ladder = roleLadder(perms);
  const groups = groupCapabilities(perms.capabilities);
  const legacy = perms.roles.filter((r) => !r.assignable && inUse.has(r.key));
  const yours = ladder.find((r) => r.key === perms.your_role);
  const [picked, setPicked] = useState<string>(yours?.key ?? ladder[0]?.key ?? "");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="perms-heading" className="mt-10 min-w-0" data-testid="roles">
      <h2 id="perms-heading" className="text-sm font-semibold text-zinc-100">
        What each role can do
      </h2>
      <p className="mt-2 max-w-prose text-sm text-zinc-400">Each role can do everything the role before it can, and more.</p>

      {/* One line per role. */}
      <ul className="mt-4 hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-4" aria-label="Roles">
        {ladder.map((r) => {
          const mine = r.key === perms.your_role;
          return (
            <li
              key={r.key}
              data-testid={`role-summary-${r.key}`}
              className={`flex min-w-0 flex-col gap-1.5 rounded-lg border p-3 ${mine ? "border-zinc-500 bg-zinc-900" : "border-zinc-800 bg-zinc-900/40"}`}
            >
              <span className="flex items-center gap-2">
                <RoleChip role={r} />
                {mine && <span className="text-xs text-zinc-400">Your role</span>}
              </span>
              <span className="text-xs leading-relaxed text-zinc-400">{r.summary}</span>
            </li>
          );
        })}
      </ul>

      {/* Wide screens: the matrix. */}
      <div className="mt-4 hidden overflow-hidden rounded-lg border border-zinc-800 lg:block">
        <table className="w-full table-fixed border-collapse text-sm" data-testid="roles-matrix">
          <caption className="sr-only">What each role can do. Your role is {yours?.label ?? perms.your_role}.</caption>
          <colgroup>
            <col />
            {ladder.map((r) => (
              <col key={r.key} className={`w-20 lg:w-24 ${r.key === perms.your_role ? "bg-zinc-800/40" : ""}`} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400">
                What they can do
              </th>
              {ladder.map((r) => {
                const mine = r.key === perms.your_role;
                return (
                  <th
                    key={r.key}
                    scope="col"
                    aria-current={mine ? "true" : undefined}
                    data-testid={`role-col-${r.key}`}
                    className={`px-2 py-2.5 text-center text-xs font-semibold ${mine ? "text-zinc-100" : "text-zinc-400"}`}
                  >
                    {r.label}
                    {mine && " "}
                    {mine && <span className="mt-0.5 block text-xs font-normal uppercase tracking-wider text-zinc-400">You</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          {groups.map((g) => {
            const open = !closed.has(g.id);
            const rowsId = `perm-group-${g.id}`;
            return (
              <tbody key={g.id} id={rowsId} data-testid={`perm-group-${g.id}`}>
                <tr className="border-b border-zinc-800 bg-zinc-950/40">
                  <th scope="colgroup" colSpan={ladder.length + 1} className="p-0 text-left">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={rowsId}
                      onClick={() => toggle(g.id)}
                      className={`flex w-full items-center gap-2 px-4 py-2 text-sm font-semibold text-zinc-100 hover:text-zinc-200 ${focusRing} focus-visible:outline-offset-[-2px]`}
                    >
                      <span aria-hidden="true" className={`inline-block transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
                        ›
                      </span>
                      {g.label}
                      <span className="font-normal normal-case tracking-normal text-zinc-400">{g.items.length}</span>
                    </button>
                  </th>
                </tr>
                {open &&
                  g.items.map((c) => (
                    <tr key={c.key} className="border-b border-zinc-800/60 last:border-b-0" data-testid={`perm-${c.key}`}>
                      <th scope="row" className="px-4 py-2 text-left font-normal text-zinc-300">
                        {c.label}
                      </th>
                      {ladder.map((r) => (
                        <td key={r.key} className="px-2 py-2 text-center">
                          <Mark yes={roleCan(perms, r, c)} />
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
      </div>

      {/* Phone: pick a role, see its list. */}
      <div className="mt-4 lg:hidden" data-testid="roles-phone">
        <Segmented label="Show what this role can do" value={picked} onChange={setPicked} options={ladder.map((r) => ({ value: r.key, label: r.label }))} />
        <PhoneList perms={perms} role={ladder.find((r) => r.key === picked) ?? ladder[0]} groups={groups} />
      </div>

      {legacy.length > 0 && <p className="mt-3 text-xs text-zinc-400">{legacy.map((r) => `${r.label}: ${r.summary}`).join(" ")}</p>}
    </section>
  );
}

function PhoneList({
  perms,
  role,
  groups,
}: {
  perms: Permissions;
  role: RoleInfo | undefined;
  groups: ReturnType<typeof groupCapabilities>;
}) {
  if (!role) return null;
  const mine = role.key === perms.your_role;
  return (
    <div className="mt-3 rounded-lg border border-zinc-800" aria-live="polite" data-testid="roles-phone-list">
      <div className="border-b border-zinc-800 px-3 py-2.5">
        <p className="text-sm font-medium text-zinc-200">
          {role.label}
          {mine ? " (your role)" : ""}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{role.summary}</p>
      </div>
      {groups.map((g) => (
        <div key={g.id} className="border-b border-zinc-800 last:border-b-0">
          <p className="px-3 pt-2.5 text-sm font-semibold text-zinc-100">{g.label}</p>
          <ul className="px-3 pb-2.5 pt-1.5">
            {g.items.map((c) => {
              const yes = roleCan(perms, role, c);
              return (
                <li key={c.key} className={`flex gap-2 py-1 text-sm ${yes ? "text-zinc-200" : "text-zinc-500"}`}>
                  <span className="mt-0.5 shrink-0">
                    <Mark yes={yes} />
                  </span>
                  <span>{c.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Mark({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="inline-flex scale-90 text-emerald-400">
      <CheckIcon />
      <span className="sr-only">Yes</span>
    </span>
  ) : (
    <span className="inline-flex w-4 justify-center text-zinc-700">
      <span aria-hidden="true">–</span>
      <span className="sr-only">No</span>
    </span>
  );
}

function RoleChip({ role }: { role: RoleInfo }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-medium ${ROLE_STYLE[role.key] ?? ROLE_STYLE.member}`}>
      {role.label}
    </span>
  );
}
