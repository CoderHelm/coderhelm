"use client";

// The Review step: one choice for every setting at the top, then each repo's
// settings grouped by feature, each with its value now, the recommendation,
// where the recommendation came from, and Use / Keep / Edit. A bar stuck to
// the bottom says what applying will change and asks before it replaces any
// value someone chose.

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/list";
import { Diff } from "@/components/diff";
import { lineDiff } from "@/lib/line-diff";
import { Segmented } from "@/components/segmented";
import { Switch } from "@/components/settings";
import { Tabs } from "@/components/tabs";
import { Callout } from "@/components/callout";
import { CheckIcon, ChevronRightIcon, WarningIcon } from "@/components/icons";
import { buttonClass, focusRing, inputClass, linkButton, monoInputClass } from "@/components/ui";
import {
  FEATURES,
  FEATURE_HREF,
  changes,
  effectiveDecision,
  featureLabel,
  isPreviewOnly,
  isText,
  itemKey,
  overwrites,
  plural,
  sameValue,
  shortRepo,
  summarize,
  valueAfter,
  valueWords,
  type Choice,
  type Decision,
  type Override,
  type PlanItem,
  type RunRepo,
  type SetupRun,
  type Value,
} from "@/lib/setup";
import { EvidenceList, SourceTag, ValueText } from "../parts";

const CHOICES: { value: Choice; title: string; body: string }[] = [
  {
    value: "keep_mine",
    title: "Keep my settings",
    body: "What you set stays. Settings nobody set take the recommendation.",
  },
  {
    value: "use_recommended",
    title: "Use recommended everywhere",
    body: "Every setting takes the recommendation. You see what it replaces first.",
  },
  {
    value: "decide",
    title: "Decide one by one",
    body: "Pick Use, Keep or Edit for each setting below.",
  },
];

export function ReviewStep({
  run,
  repo,
  hrefFor,
  choice,
  overrides,
  onChoice,
  onOverride,
  onApply,
  applying,
  problem,
}: {
  run: SetupRun;
  /** The repo on screen (from ?repo=). */
  repo: string | null;
  hrefFor: (repo: string) => string;
  choice: Choice;
  overrides: Record<string, Override>;
  onChoice: (c: Choice) => void;
  onOverride: (repo: string, settingId: string, o: Override | null) => void;
  onApply: () => void;
  applying: boolean;
  problem: string | null;
}) {
  const reviewable = run.repos.filter((r) => r.items.length > 0);
  const failed = run.repos.filter((r) => r.items.length === 0 && (r.error || r.state === "failed"));
  const current = reviewable.find((r) => r.repo === repo) ?? reviewable[0];
  const summary = useMemo(() => summarize(run, choice, overrides), [run, choice, overrides]);
  const perRepo = useMemo(() => {
    const out: Record<string, { changes: number; overwrites: number }> = {};
    for (const r of reviewable) {
      const s = summarize({ repos: [r] }, choice, overrides);
      out[r.repo] = { changes: s.changes, overwrites: s.overwrites.length };
    }
    return out;
  }, [reviewable, choice, overrides]);

  if (!current) {
    return (
      <Callout variant="warning" title="Nothing to review" testId="review-nothing">
        <p>Coderhelm couldn&apos;t read any of these repos, so there is nothing to recommend yet. Start a new run once the problem below is fixed.</p>
        <FailedList repos={failed} />
      </Callout>
    );
  }

  return (
    <div className="min-w-0" data-testid="review-step">
      <ChoicePicker value={choice} onChange={onChoice} />

      {failed.length > 0 && (
        <div className="mt-6">
          <Callout variant="warning" title={`${plural(failed.length, "repo")} couldn't be read`} testId="review-failed">
            <p>They are left out of this run. The rest can go ahead.</p>
            <FailedList repos={failed} />
          </Callout>
        </div>
      )}

      {reviewable.length > 1 && (
        <Tabs
          label="Repos in this run"
          value={current.repo}
          selectAbove={4}
          items={reviewable.map((r) => {
            const n = perRepo[r.repo]?.changes ?? 0;
            return {
              value: r.repo,
              label: shortRepo(r.repo),
              href: hrefFor(r.repo),
              countText: n ? plural(n, "change") : "no changes",
              count: (
                <span className={`rounded-full px-1.5 text-xs tabular-nums leading-5 ${n ? "bg-zinc-800 text-zinc-200" : "text-zinc-500"}`}>
                  {n}
                  <span className="sr-only"> {n === 1 ? "change" : "changes"}</span>
                </span>
              ),
            };
          })}
        />
      )}

      <RepoReview key={current.repo} repo={current} choice={choice} overrides={overrides} onOverride={onOverride} single={reviewable.length === 1} />

      <ApplyBar summary={summary} onApply={onApply} applying={applying} problem={problem} />
    </div>
  );
}

function FailedList({ repos }: { repos: RunRepo[] }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {repos.map((r) => (
        <li key={r.repo} className="[overflow-wrap:anywhere]">
          <span className="font-medium text-zinc-100">{shortRepo(r.repo)}</span>
          <span className="text-zinc-300">: {r.error ?? "it couldn't be read."}</span>
        </li>
      ))}
    </ul>
  );
}

/** Three cards, one choice: a real radio group, so arrows move between them. */
function ChoicePicker({ value, onChange }: { value: Choice; onChange: (c: Choice) => void }) {
  const name = useId();
  return (
    <fieldset className="min-w-0" data-testid="choice">
      <legend className="text-sm font-semibold text-zinc-100">Your settings that are already set</legend>
      <p className="mt-1 max-w-prose text-sm text-zinc-400">One choice for every setting below. You can still change any one of them.</p>
      <div className="mt-3 grid min-w-0 gap-2 xl:grid-cols-3">
        {CHOICES.map((c) => {
          const on = c.value === value;
          return (
            <label
              key={c.value}
              className={`relative flex min-w-0 cursor-pointer gap-3 rounded-lg border px-3.5 py-3 transition-colors motion-reduce:transition-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-100 ${
                on ? "border-zinc-300 bg-zinc-900" : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/60"
              }`}
              data-testid={`choice-${c.value}`}
            >
              <input type="radio" name={name} value={c.value} checked={on} onChange={() => onChange(c.value)} className="sr-only" />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-zinc-100" : "border-zinc-600"}`}
              >
                {on && <span className="h-2 w-2 rounded-full bg-zinc-100" />}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-zinc-100">
                  {c.title}
                  {c.value === "keep_mine" && <span className="text-xs font-normal text-zinc-400">Default</span>}
                </span>
                <span className="mt-0.5 block text-sm text-zinc-400">{c.body}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function RepoReview({
  repo,
  choice,
  overrides,
  onOverride,
  single,
}: {
  repo: RunRepo;
  choice: Choice;
  overrides: Record<string, Override>;
  onOverride: (repo: string, settingId: string, o: Override | null) => void;
  single: boolean;
}) {
  const groups = useMemo(() => {
    const order = FEATURES.map((f) => f.id);
    const by = new Map<string, PlanItem[]>();
    for (const it of repo.items) by.set(it.feature, [...(by.get(it.feature) ?? []), it]);
    return [...by.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
  }, [repo.items]);
  const s = summarize({ repos: [repo] }, choice, overrides);

  return (
    <section aria-labelledby="repo-review-heading" className={`${single ? "mt-8" : "mt-5"} min-w-0`} data-testid="repo-review" data-repo={repo.repo}>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="repo-review-heading" className="min-w-0 text-base font-semibold text-zinc-50 [overflow-wrap:anywhere]">
          {repo.repo}
        </h2>
        <p className="text-sm text-zinc-400" data-testid="repo-summary">
          {plural(repo.items.length, "setting")} · {s.changes ? plural(s.changes, "change") : "no changes"}
          {s.overwrites.length > 0 && <span className="text-amber-300"> · {s.overwrites.length} of yours replaced</span>}
        </p>
      </div>
      <div className="mt-3 space-y-3">
        {groups.map(([feature, items]) => (
          <FeatureGroup key={feature} repo={repo.repo} feature={feature} items={items} choice={choice} overrides={overrides} onOverride={onOverride} />
        ))}
      </div>
    </section>
  );
}

function FeatureGroup({
  repo,
  feature,
  items,
  choice,
  overrides,
  onOverride,
}: {
  repo: string;
  feature: string;
  items: PlanItem[];
  choice: Choice;
  overrides: Record<string, Override>;
  onOverride: (repo: string, settingId: string, o: Override | null) => void;
}) {
  const id = useId();
  const decided = items.map((item) => ({ item, d: effectiveDecision(item, choice, overrides[itemKey(repo, item.setting_id)]) }));
  const changing = decided.filter((x) => changes(x.item, x.d)).length;
  const replacing = decided.filter((x) => overwrites(x.item, x.d)).length;
  const differ = items.filter((i) => !sameValue(i.current.value, i.recommended) || !!i.needs);
  const match = items.length - differ.length;
  const [open, setOpen] = useState(differ.length > 0);
  const [showMatch, setShowMatch] = useState(false);
  const shown = showMatch ? items : differ;

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid="feature-group" data-feature={feature}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className={`flex min-h-12 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-left hover:bg-zinc-900 ${focusRing} focus-visible:outline-offset-[-2px]`}
        >
          <span aria-hidden="true" className={`shrink-0 text-zinc-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
            <ChevronRightIcon />
          </span>
          <span className="min-w-0 flex-1 basis-32 text-sm font-semibold text-zinc-100">{featureLabel(feature)}</span>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5" data-testid="group-counts">
            {replacing > 0 && <Chip tone="waiting">{replacing} replace yours</Chip>}
            {changing > 0 ? <Chip tone="neutral">{plural(changing, "change")}</Chip> : <Chip tone="muted">No changes</Chip>}
          </span>
        </button>
      </h3>
      <div id={id} hidden={!open} className="border-t border-zinc-800">
        <ul className="divide-y divide-zinc-800">
          {shown.map((item) => (
            <ItemRow
              key={item.setting_id}
              repo={repo}
              item={item}
              choice={choice}
              override={overrides[itemKey(repo, item.setting_id)]}
              onOverride={(o) => onOverride(repo, item.setting_id, o)}
            />
          ))}
        </ul>
        {match > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-4 py-2.5 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="scale-75 text-emerald-400">
                <CheckIcon />
              </span>
              {match === items.length ? `All ${plural(match, "setting")} already match the recommendation.` : `${plural(match, "other setting")} already ${match === 1 ? "matches" : "match"}.`}
            </span>
            <button type="button" onClick={() => setShowMatch((v) => !v)} className={`${linkButton} !text-sm`}>
              {showMatch ? "Hide them" : "Show them"}
            </button>
          </div>
        )}
        {FEATURE_HREF[feature] && (
          <p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400">
            <Link href={FEATURE_HREF[feature]} className={`${linkButton} !text-xs`}>
              Open {featureLabel(feature)} settings
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

const DECISION_WORDS: Record<Decision, string> = { use: "Use", keep: "Keep", edit: "Edit" };

function ItemRow({
  repo,
  item,
  choice,
  override,
  onOverride,
}: {
  repo: string;
  item: PlanItem;
  choice: Choice;
  override?: Override;
  onOverride: (o: Override | null) => void;
}) {
  const d = effectiveDecision(item, choice, override);
  const text = isText(item);
  const same = sameValue(item.current.value, item.recommended);
  const after = valueAfter(item, d);
  const changing = changes(item, d);
  const replacing = overwrites(item, d);
  const acts = item.risk === "acts";
  const titleId = useId();

  const pick = (v: Decision) => {
    const base = effectiveDecision(item, choice);
    if (v === "edit") {
      onOverride({ decision: "edit", value: override?.decision === "edit" ? override.value : item.recommended });
      return;
    }
    // Picking what the choice at the top already does is no override.
    onOverride(v === base.decision ? null : { decision: v });
  };

  return (
    <li className="min-w-0 px-4 py-4" data-testid="plan-item" data-id={item.setting_id} data-decision={d.decision} data-changes={changing ? "yes" : "no"}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 id={titleId} className="text-sm font-medium text-zinc-100">
              {item.title}
            </h4>
            <SourceTag source={item.source} />
            {item.custom && (
              <Chip tone="info" title="Someone changed this by hand after Setup last applied it.">
                Custom
              </Chip>
            )}
            {item.needs && (
              <span className="inline-flex" data-testid="needs">
                <Chip tone="muted" title={`You can't change this one: it needs the "${item.needs}" permission. It stays as it is.`}>
                  needs {item.needs}
                </Chip>
              </span>
            )}
            {item.isNew && <Chip tone="merged">New</Chip>}
            {override && (
              <span className="text-xs text-zinc-400" data-testid="overridden">
                your pick
              </span>
            )}
          </div>
          {item.help && <p className="mt-0.5 max-w-prose text-sm text-zinc-400">{item.help}</p>}
          {!acts && <EvidenceList evidence={item.evidence} className="mt-1.5" />}
        </div>
        {!same || item.needs ? (
          <div className="shrink-0">
            <Segmented label={`What to do with ${item.title}`} value={d.decision} onChange={pick} disabled={!!item.needs} options={(["use", "keep", "edit"] as Decision[]).map((v) => ({ value: v, label: DECISION_WORDS[v] }))} />
          </div>
        ) : null}
      </div>

      {acts && item.evidence.length > 0 && <Effect item={item} />}

      {same ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-zinc-400">
          <span aria-hidden="true" className="scale-75 text-emerald-400">
            <CheckIcon />
          </span>
          Already matches: <ValueText value={item.current.value} set={item.current.set} />
        </p>
      ) : text ? (
        <div className="mt-3 min-w-0">
          <Diff
            label={item.title}
            before={stringOf(item.current.value)}
            after={stringOf(d.decision === "keep" ? item.recommended : after)}
            beforeLabel="Yours now"
            afterLabel={d.decision === "edit" ? "Your edit" : "Recommended"}
            split
            maxHeightClass="max-h-80"
            testId="item-diff"
          />
          <p className="mt-1.5 text-xs text-zinc-400">
            {d.decision === "keep" ? "Keeping yours: the text stays as it is." : d.decision === "edit" ? "Your edited text replaces the current one." : "The recommended text replaces the current one."}
          </p>
        </div>
      ) : (
        <Compare item={item} decision={d.decision} after={after} />
      )}

      {d.decision === "edit" && (
        <Editor item={item} value={override?.value ?? item.recommended} labelledBy={titleId} onChange={(v) => onOverride({ decision: "edit", value: v })} />
      )}

      {isPreviewOnly(item) && d.decision === "keep" && !same && (
        <p className="mt-2 text-xs text-zinc-400" data-testid="preview-only-note">
          Never turned on by a choice at the top. Pick Use to turn it on, or switch it on later from the results.
        </p>
      )}

      {replacing && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-300" data-testid="replaces">
          <span aria-hidden="true" className="scale-75">
            <WarningIcon />
          </span>
          Replaces a value {item.custom ? "someone set by hand" : "of yours"} on {shortRepo(repo)}.
        </p>
      )}
    </li>
  );
}

function stringOf(v: Value): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return valueWords(v);
}

/** Two values side by side; the one that applies is marked. */
function Compare({ item, decision, after }: { item: PlanItem; decision: Decision; after: Value }) {
  const keep = decision === "keep";
  const edit = decision === "edit";
  const cell = (label: string, value: Value, set: boolean, applies: boolean, testId: string) => (
    <div
      className={`min-w-0 rounded-md border px-3 py-2 ${applies ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-950/40"}`}
      data-testid={testId}
      data-applies={applies ? "yes" : "no"}
    >
      <p className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-zinc-400">
        {label}
        {applies && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-emerald-300">
            <span aria-hidden="true" className="scale-[0.6]">
              <CheckIcon />
            </span>
            Applies
          </span>
        )}
      </p>
      <p className="mt-0.5 text-sm">
        <ValueText value={value} set={set} strong={applies} />
      </p>
    </div>
  );
  return (
    <div className="mt-3 grid max-w-2xl min-w-0 grid-cols-2 gap-2">
      {cell("Yours now", item.current.value, item.current.set, keep, "value-now")}
      {edit ? cell("Your edit", after, true, true, "value-edit") : cell("Recommended", item.recommended, true, !keep, "value-recommended")}
    </div>
  );
}

/** For a setting that closes, merges or posts: what it would have done, up front. */
function Effect({ item }: { item: PlanItem }) {
  return (
    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5" data-testid="effect">
      <p className="flex items-center gap-1.5 text-sm font-medium text-amber-200">
        <span aria-hidden="true" className="scale-75">
          <WarningIcon />
        </span>
        This setting acts on its own. Here is what it would have done:
      </p>
      <EvidenceList evidence={item.evidence} className="mt-1 !text-zinc-200" />
    </div>
  );
}

function Editor({ item, value, labelledBy, onChange }: { item: PlanItem; value: Value; labelledBy: string; onChange: (v: Value) => void }) {
  const kind = typeof item.recommended === "boolean" ? "bool" : typeof item.recommended === "number" ? "number" : Array.isArray(item.recommended) ? "list" : isText(item) ? "text" : typeof item.recommended === "string" || item.recommended === null ? "string" : "other";
  const id = useId();
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const label = (
    <label htmlFor={id} className="mb-1 block text-xs text-zinc-400">
      Your value
    </label>
  );
  if (kind === "bool") {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-md border border-zinc-800 px-3 py-2" data-testid="item-editor">
        <Switch id={id} checked={value === true} onChange={onChange} label={`${item.title}: your value`} />
        <span className="text-sm text-zinc-200">{value === true ? "On" : "Off"}</span>
      </div>
    );
  }
  if (kind === "other") {
    return (
      <p className="mt-3 text-sm text-zinc-400" data-testid="item-editor">
        This one has several parts. Use the recommendation or keep yours here, then fine tune it on its settings page.
      </p>
    );
  }
  return (
    <div className="mt-3 max-w-2xl" data-testid="item-editor">
      {label}
      {kind === "text" ? (
        <textarea
          id={id}
          ref={(el) => {
            ref.current = el;
          }}
          aria-describedby={labelledBy}
          rows={Math.min(14, Math.max(4, stringOf(value).split("\n").length + 1))}
          value={stringOf(value)}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} font-mono text-xs leading-5`}
        />
      ) : (
        <input
          id={id}
          ref={(el) => {
            ref.current = el;
          }}
          aria-describedby={labelledBy}
          type={kind === "number" ? "number" : "text"}
          inputMode={kind === "number" ? "numeric" : undefined}
          value={kind === "list" ? (Array.isArray(value) ? value.join(", ") : stringOf(value)) : value === null || value === undefined ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (kind === "number") onChange(raw === "" ? null : Number(raw));
            else if (kind === "list") onChange(raw.split(",").map((x) => x.trim()).filter(Boolean));
            else onChange(raw);
          }}
          className={kind === "list" || kind === "string" ? monoInputClass : inputClass}
        />
      )}
      {kind === "list" && <p className="mt-1 text-xs text-zinc-400">Separate them with commas.</p>}
    </div>
  );
}

/**
 * Fixed to the bottom of the screen: what applying changes, and the Apply
 * button. A spacer of the bar's own height ends the page, so the last row can
 * always scroll clear of it and the bar never sits over content. When a value
 * someone chose would be replaced, Apply first opens a confirm here, in the
 * page, listing each one.
 */
function ApplyBar({ summary, onApply, applying, problem }: { summary: ReturnType<typeof summarize>; onApply: () => void; applying: boolean; problem: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barHeight, setBarHeight] = useState(88);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = summary.overwrites.length;
  useEffect(() => {
    if (confirming) headingRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (n === 0) setConfirming(false);
  }, [n]);
  const words = summary.changes
    ? `Applying changes ${plural(summary.changes, "setting")} across ${plural(summary.repos, "repo")}.`
    : "Nothing to change. Every setting already has the value you chose.";
  const apply = () => (n > 0 && !confirming ? setConfirming(true) : onApply());

  return (
    <>
      <div aria-hidden="true" style={{ height: barHeight + 32 }} data-testid="apply-bar-spacer" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-4 md:left-56 md:px-8">
    <div ref={barRef} role="region" aria-label="Apply" className="pointer-events-auto mx-auto max-w-6xl rounded-lg border border-zinc-600 bg-zinc-900/95 shadow-xl backdrop-blur" data-testid="apply-bar">
      {confirming && (
        <div className="max-h-[50vh] overflow-y-auto border-b border-zinc-700 px-4 py-3" data-testid="overwrite-confirm">
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-zinc-50 focus:outline-none">
            Replace {n === 1 ? "this value" : `these ${n} values`} of yours?
          </h2>
          <p className="mt-0.5 text-sm text-zinc-400">Undo on the next screen puts them back.</p>
          <ul className="mt-2 divide-y divide-zinc-800 text-sm">
            {summary.overwrites.map(({ repo, item, after }) => (
              <li key={itemKey(repo, item.setting_id)} className="grid min-w-0 gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" data-testid="overwrite">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-medium text-zinc-100">{item.title}</span>
                  <span className="text-zinc-400"> · {shortRepo(repo)}</span>
                </span>
                <span className="min-w-0 text-zinc-400 [overflow-wrap:anywhere]">
                  {isText(item) ? (
                    <TextChange before={stringOf(item.current.value)} after={stringOf(after)} />
                  ) : (
                    <>
                      yours <span className="text-zinc-200 line-through decoration-red-400/60">{short(item.current.value)}</span>, new <span className="text-zinc-50">{short(after)}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {problem && (
        <p role="alert" className="border-b border-zinc-700 px-4 py-2 text-sm text-red-300" data-testid="apply-problem">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p aria-live="polite" className="min-w-0 flex-1 basis-64 text-sm text-zinc-200" data-testid="apply-summary">
          {words}
          {n > 0 && <span className="text-amber-300"> {n} of yours will be replaced.</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {confirming && (
            <button type="button" onClick={() => setConfirming(false)} className={buttonClass("secondary")}>
              Go back
            </button>
          )}
          <button type="button" onClick={apply} disabled={applying || summary.changes === 0} className={buttonClass(confirming ? "danger" : "primary")} data-testid="apply">
            {applying ? "Applying…" : confirming ? `Replace ${n} and apply` : `Apply to ${plural(summary.repos || 0, "repo")}`}
          </button>
        </div>
      </div>
    </div>
      </div>
    </>
  );
}

/** "Text rewritten: 3 lines added, 1 removed", for a prose setting in the confirm list. */
function TextChange({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after);
  const add = lines.filter((l) => l.kind === "added").length;
  const rem = lines.filter((l) => l.kind === "removed").length;
  return (
    <>
      Text rewritten: <span className="tabular-nums text-emerald-300">{plural(add, "line")} added</span>, <span className="tabular-nums text-red-300">{rem} removed</span>
    </>
  );
}

function short(v: Value): string {
  const w = valueWords(v);
  return w.length > 60 ? `${w.slice(0, 57)}…` : w;
}
