"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { ChatMarkdown } from "./chat-markdown";
import { focusRing } from "./ui";
import {
  applyAction,
  continueList,
  indentList,
  inList,
  insertBlock,
  pasteLink,
  type Action,
  type Edit,
} from "@/lib/markdown-edit";

// One editor for every place people write more than a line: support tickets
// and replies, agent instructions and voice, review notes, data-source guides
// and the plan chat. What it stores is the markdown string, unchanged, so
// request bodies stay exactly as they were. GitHub's comment box is the model:
// write markdown with a toolbar and shortcuts, check it under Preview.
//
//   <Field as="custom" label="What happened?">
//     {(ids) => <MarkdownEditor {...ids} variant="prose" value={v} onChange={setV} draftKey="support:new" />}
//   </Field>

export type MarkdownEditorVariant = "prose" | "instructions" | "compact";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * prose: tickets and replies, full toolbar, Write/Preview.
   * instructions: what agents read, headings and lists, Write/Preview.
   * compact: chat; the toolbar opens from an "Aa" button, no preview.
   */
  variant?: MarkdownEditorVariant;
  /** From `Field`: ties the label, help and error to the text box. */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  /** A name when there is no visible label (a chat box). */
  ariaLabel?: string;
  placeholder?: string;
  maxLength?: number;
  /** Height of the empty box, in lines. */
  minRows?: number;
  /** The box grows with the text up to this many pixels, then scrolls. */
  maxHeight?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Keeps unsent text in this browser under this key; `clearDraft(key)` after sending. */
  draftKey?: string;
  /** A starting structure people can insert (not forced on them), e.g. an issue template. */
  template?: { label: string; text: string };
  /** Short tips under "Tips". Replaces help text that would float under the box. */
  tips?: ReactNode[];
  /** Under Preview, a line saying who reads it ("Agents read it like this"). */
  previewNote?: ReactNode;
  /** Runs before the editor's own keys; call `preventDefault()` to take a key (Enter to send). */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** ⌘/Ctrl+Enter: send. */
  onSubmitShortcut?: () => void;
  /** Buttons at the end of the footer row (a chat box's Send). */
  actions?: ReactNode;
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** Classes for the outer frame. */
  className?: string;
  /** Test id on the text box. */
  testId?: string;
}

// ── Drafts ──────────────────────────────────────────────────────────────

const DRAFT_PREFIX = "coderhelm:draft:";
const CLEAR_EVENT = "coderhelm:draft-clear";

function readDraft(key: string): string {
  try {
    return window.localStorage.getItem(DRAFT_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, value: string): boolean {
  try {
    if (value.trim()) window.localStorage.setItem(DRAFT_PREFIX + key, value);
    else window.localStorage.removeItem(DRAFT_PREFIX + key);
    return true;
  } catch {
    return false;
  }
}

/** Forget a field's saved draft, after it was sent. A pending save for it is cancelled. */
export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // Storage blocked: nothing was saved.
  }
  try {
    window.dispatchEvent(new CustomEvent(CLEAR_EVENT, { detail: key }));
  } catch {
    // No window events (tests outside a browser).
  }
}

type DraftStatus = "idle" | "saved" | "restored";

function useDraft(key: string | undefined, value: string, onChange: (v: string) => void): DraftStatus {
  const [status, setStatus] = useState<DraftStatus>("idle");
  // The value that is known to be in storage (or cleared): no save needed for it.
  const settled = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredFor = useRef<string | undefined>(undefined);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Restore once per key, only into an empty box.
  useEffect(() => {
    if (!key || restoredFor.current === key) return;
    restoredFor.current = key;
    const saved = readDraft(key);
    if (saved && !value.trim()) {
      settled.current = saved;
      onChange(saved);
      setStatus("restored");
    } else {
      settled.current = value;
    }
    // Only when the key changes; value and onChange are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Save a moment after typing stops.
  useEffect(() => {
    if (!key || restoredFor.current !== key) return;
    if (settled.current === value) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (writeDraft(key, value)) {
        settled.current = value;
        setStatus(value.trim() ? "saved" : "idle");
      }
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, value]);

  // Sent: drop any pending save, and don't save the sent text again.
  useEffect(() => {
    if (!key) return;
    const onClear = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== key) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      settled.current = valueRef.current;
      setStatus("idle");
    };
    window.addEventListener(CLEAR_EVENT, onClear);
    return () => window.removeEventListener(CLEAR_EVENT, onClear);
  }, [key]);

  return status;
}

// ── Toolbar ─────────────────────────────────────────────────────────────

const ic = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

const ICONS: Record<Action, ReactNode> = {
  heading: <svg {...ic}><path d="M6 4v16M18 4v16M6 12h12" /></svg>,
  bold: <svg {...ic} strokeWidth={2.25}><path d="M7 4h6.5a4 4 0 010 8H7zM7 12h7.5a4 4 0 010 8H7z" /></svg>,
  italic: <svg {...ic}><path d="M14 4h-4M14 20h-4M14.5 4l-5 16" /></svg>,
  code: <svg {...ic}><path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5" /></svg>,
  codeBlock: <svg {...ic}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9.5 10L7 12.5 9.5 15M14.5 10l2.5 2.5-2.5 2.5" /></svg>,
  link: <svg {...ic}><path d="M10 14a4.5 4.5 0 006.4.4l3-3a4.5 4.5 0 00-6.4-6.4l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 00-6.4-.4l-3 3a4.5 4.5 0 006.4 6.4l1.2-1.2" /></svg>,
  quote: <svg {...ic}><path d="M4 5v14M9 7h11M9 12h11M9 17h7" /></svg>,
  bullet: <svg {...ic}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>,
  numbered: <svg {...ic}><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 4.5h1.5V9M4 9h3" strokeWidth={1.5} /><path d="M4 14.5a1.5 1.5 0 013 .3c0 1-3 2.2-3 3.7h3" strokeWidth={1.5} /></svg>,
  task: <svg {...ic}><rect x="3" y="4" width="6" height="6" rx="1" /><path d="M4.5 7l1 1 2-2" /><rect x="3" y="14" width="6" height="6" rx="1" /><path d="M12 7h9M12 17h9" /></svg>,
};

const LABELS: Record<Action, string> = {
  heading: "Heading",
  bold: "Bold",
  italic: "Italic",
  code: "Code",
  codeBlock: "Code block",
  link: "Link",
  quote: "Quote",
  bullet: "Bulleted list",
  numbered: "Numbered list",
  task: "Task list",
};

const SHORTCUT: Partial<Record<Action, string>> = { bold: "B", italic: "I", code: "E", link: "K" };
const BY_KEY: Record<string, Action> = { b: "bold", i: "italic", e: "code", k: "link" };

/** Toolbar groups per variant: text, then code and links, then blocks. */
const GROUPS: Record<MarkdownEditorVariant, Action[][]> = {
  prose: [["heading", "bold", "italic"], ["code", "codeBlock", "link"], ["quote", "bullet", "numbered", "task"]],
  instructions: [["heading", "bold", "italic"], ["code", "link"], ["bullet", "numbered", "task", "quote"]],
  compact: [["bold", "italic", "code", "link"], ["bullet", "numbered", "codeBlock", "quote"]],
};

const TIPS: Record<MarkdownEditorVariant, ReactNode[]> = {
  prose: [
    <><Kbd>**bold**</Kbd>, <Kbd>_italic_</Kbd>, <Kbd>`code`</Kbd>, and three backticks on their own line for a block of code or a log.</>,
    <>Select words and paste a link to make them a link.</>,
    <>Start a line with <Kbd>-</Kbd>, <Kbd>1.</Kbd> or <Kbd>- [ ]</Kbd> for a list; Enter continues it, Tab indents it.</>,
  ],
  instructions: [
    <>Use a heading per topic (<Kbd>## Tests</Kbd>) and one rule per bullet. Short rules are followed best.</>,
    <>Put names agents should match exactly in <Kbd>`code`</Kbd>: file paths, commands, labels.</>,
    <>Enter continues a list, Tab indents it.</>,
  ],
  compact: [<>Enter sends, Shift+Enter starts a new line.</>, <>Select words and paste a link to make them a link.</>],
};

function Kbd({ children }: { children: ReactNode }) {
  return <code className="rounded bg-zinc-800 px-1 py-px text-[11px] text-zinc-300">{children}</code>;
}

function useIsMac(): boolean {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    try {
      setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    } catch {
      // Unknown platform: say Ctrl.
    }
  }, []);
  return mac;
}

/** Apply an edit as one native change, so Undo works and React sees an input event. */
function applyEdit(el: HTMLTextAreaElement, edit: Edit) {
  el.focus();
  el.setSelectionRange(edit.from, edit.to);
  let done = false;
  try {
    done = edit.insert
      ? document.execCommand("insertText", false, edit.insert)
      : edit.from === edit.to || document.execCommand("delete", false);
  } catch {
    done = false;
  }
  if (!done) {
    // No execCommand: set the value the way React notices, then say so.
    const next = el.value.slice(0, edit.from) + edit.insert + el.value.slice(edit.to);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.setSelectionRange(edit.selStart, edit.selEnd);
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as { current: T | null }).current = value;
}

// ── The editor ──────────────────────────────────────────────────────────

export function MarkdownEditor({
  value,
  onChange,
  variant = "prose",
  id: givenId,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ariaLabel,
  placeholder,
  maxLength,
  minRows,
  maxHeight,
  disabled = false,
  autoFocus = false,
  draftKey,
  template,
  tips,
  previewNote,
  onKeyDown,
  onSubmitShortcut,
  actions,
  textareaRef,
  className = "",
  testId,
}: MarkdownEditorProps) {
  const generated = useId();
  const id = givenId ?? `md-${generated}`;
  const compact = variant === "compact";
  const rows = minRows ?? (compact ? 1 : variant === "instructions" ? 10 : 6);
  const max = maxHeight ?? (compact ? 200 : variant === "instructions" ? 640 : 480);
  const mac = useIsMac();
  const mod = mac ? "⌘" : "Ctrl+";

  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [tipsOpen, setTipsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const draft = useDraft(draftKey, value, onChange);

  const writeTabId = `${id}-write-tab`;
  const previewTabId = `${id}-preview-tab`;
  const previewId = `${id}-preview`;
  const tipsId = `${id}-tips`;
  const toolbarId = `${id}-toolbar`;

  // Grow with the text, between `rows` lines and `max` pixels.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || tab !== "write") return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
    el.style.overflowY = el.scrollHeight + 2 > max ? "auto" : "hidden";
  }, [value, max, tab]);

  const run = useCallback((action: Action) => {
    const el = ref.current;
    if (!el || el.disabled) return;
    applyEdit(el, applyAction(action, el.value, el.selectionStart, el.selectionEnd));
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: end } = el;
    const modKey = e.metaKey || e.ctrlKey;

    if (modKey && !e.altKey && !e.shiftKey) {
      const action = BY_KEY[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        // ⌘K in the text box is a link, not the command palette. React
        // listens on the document, as the palette does, so stop the rest there.
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        run(action);
        return;
      }
    }
    if (modKey && e.key === "Enter" && onSubmitShortcut) {
      e.preventDefault();
      onSubmitShortcut();
      return;
    }
    if (e.key === "Tab" && !modKey && !e.altKey && inList(el.value, s, end)) {
      e.preventDefault();
      applyEdit(el, indentList(el.value, s, end, e.shiftKey));
      return;
    }
    // A chat box keeps Shift+Enter a plain new line; elsewhere Enter carries a list on.
    if (e.key === "Enter" && !modKey && !e.altKey && !compact && !e.shiftKey) {
      const edit = continueList(el.value, s, end);
      if (edit) {
        e.preventDefault();
        applyEdit(el, edit);
      }
    }
  };

  const insertTemplate = () => {
    const el = ref.current;
    if (!el || !template) return;
    setTab("write");
    applyEdit(el, insertBlock(el.value, el.selectionStart, template.text));
  };

  const tipList = tips ?? TIPS[variant];
  const showTools = !compact || toolsOpen;
  const nearLimit = maxLength !== undefined && value.length >= maxLength * 0.8;
  const atLimit = maxLength !== undefined && value.length >= maxLength * 0.95;
  const frame = compact
    ? "rounded-xl border border-zinc-700 bg-zinc-900 focus-within:border-zinc-500"
    : "rounded-lg border border-zinc-700 bg-zinc-950 focus-within:border-zinc-500";
  const border = invalid ? "border-red-500/60" : "";

  const toolbar = showTools && (
    <div
      id={toolbarId}
      role="toolbar"
      aria-label="Formatting"
      aria-controls={id}
      className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5"
      data-testid="md-toolbar"
    >
      {GROUPS[variant].map((group, gi) => (
        <div key={gi} className={`flex items-center ${gi > 0 ? "border-l border-zinc-800 pl-1" : ""}`}>
          {group.map((action) => {
            const key = SHORTCUT[action];
            const tip = key ? `${LABELS[action]} (${mod}${key})` : LABELS[action];
            return (
              <button
                key={action}
                type="button"
                // Keep the text box's selection: a mousedown on the button would move focus first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(action)}
                disabled={disabled || tab === "preview"}
                aria-label={LABELS[action]}
                aria-keyshortcuts={key ? `${mac ? "Meta" : "Control"}+${key}` : undefined}
                title={tip}
                className={`inline-flex h-8 w-7 items-center justify-center rounded-md text-zinc-400 sm:w-8 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent ${focusRing}`}
              >
                {ICONS[action]}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  const tabButton = (which: "write" | "preview", label: string, tid: string) => {
    const on = tab === which;
    return (
      <button
        type="button"
        role="tab"
        id={tid}
        aria-selected={on}
        aria-controls={which === "write" ? `${id}-write` : previewId}
        tabIndex={on ? 0 : -1}
        onClick={() => setTab(which)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const next = which === "write" ? "preview" : "write";
            setTab(next);
            document.getElementById(next === "write" ? writeTabId : previewTabId)?.focus();
          }
        }}
        className={`-mb-px inline-flex min-h-9 items-center border-b-2 px-3 text-sm ${
          on ? "border-zinc-100 font-medium text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-100"
        } ${focusRing}`}
      >
        {label}
      </button>
    );
  };

  const textarea = (
    <textarea
      ref={(el) => {
        ref.current = el;
        setRef(textareaRef, el);
      }}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onPaste={(e) => {
        const el = e.currentTarget;
        const edit = pasteLink(el.value, el.selectionStart, el.selectionEnd, e.clipboardData.getData("text/plain"));
        if (edit) {
          e.preventDefault();
          applyEdit(el, edit);
        }
      }}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={rows}
      disabled={disabled}
      autoFocus={autoFocus}
      spellCheck
      data-testid={testId}
      className={`block w-full resize-none bg-transparent text-sm leading-relaxed text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-60 ${
        compact ? "px-3 pb-1 pt-2.5" : "px-3 py-2.5"
      }`}
    />
  );

  const status = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {draft !== "idle" && (
        <span role="status" className="text-zinc-500" data-testid="md-draft-status">
          {draft === "restored" ? "Draft restored" : "Draft saved"}
        </span>
      )}
      {nearLimit && maxLength !== undefined && (
        <span className={atLimit ? "text-amber-400" : "text-zinc-500"} data-testid="md-count" aria-live="polite">
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      )}
    </span>
  );

  if (compact) {
    return (
      <div className={`${frame} ${border} ${className}`} data-variant="compact">
        {textarea}
        <div className="flex min-w-0 flex-wrap items-center gap-1 px-1.5 pb-1.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setToolsOpen((v) => !v)}
            aria-expanded={toolsOpen}
            aria-controls={toolbarId}
            aria-label={toolsOpen ? "Hide formatting" : "Show formatting"}
            title={toolsOpen ? "Hide formatting" : "Show formatting"}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold ${
              toolsOpen ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            } ${focusRing}`}
          >
            Aa
          </button>
          {toolbar}
          <span className="ml-auto flex shrink-0 items-center gap-2 text-xs">
            {status}
            {actions}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${className}`} data-variant={variant}>
      <div className={`${frame} ${border} overflow-hidden`}>
        <div className="flex min-w-0 flex-wrap items-end gap-x-2 border-b border-zinc-800 bg-zinc-900/60 px-1.5 pt-1">
          <div role="tablist" aria-label="Write or preview" className="flex shrink-0">
            {tabButton("write", "Write", writeTabId)}
            {tabButton("preview", "Preview", previewTabId)}
          </div>
          {template && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={insertTemplate}
              disabled={disabled}
              className={`mb-1 ml-auto inline-flex h-8 items-center rounded-md px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 ${focusRing}`}
              data-testid="md-template"
            >
              <span className="sm:hidden">Template</span>
              <span className="hidden sm:inline">{template.label}</span>
            </button>
          )}
          {/* On a phone the toolbar takes its own row under the tabs. */}
          <div className={`w-full pb-1 sm:w-auto ${template ? "" : "sm:ml-auto"}`}>{toolbar}</div>
        </div>
        <div id={`${id}-write`} role="tabpanel" aria-labelledby={writeTabId} hidden={tab !== "write"}>
          {textarea}
        </div>
        {tab === "preview" && (
          <div
            id={previewId}
            role="tabpanel"
            aria-labelledby={previewTabId}
            tabIndex={0}
            className={`overflow-y-auto px-3 py-2.5 ${focusRing}`}
            style={{ minHeight: `${rows * 1.42 + 1.25}rem`, maxHeight: max }}
            data-testid="md-preview"
          >
            {previewNote && <p className="mb-2 text-xs text-zinc-500">{previewNote}</p>}
            {value.trim() ? (
              <ChatMarkdown breaks>{value}</ChatMarkdown>
            ) : (
              <p className="text-sm text-zinc-500">Nothing to preview yet.</p>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-zinc-800/70 px-3 py-1.5 text-xs">
          <button
            type="button"
            onClick={() => setTipsOpen((v) => !v)}
            aria-expanded={tipsOpen}
            aria-controls={tipsId}
            className={`inline-flex min-h-6 items-center gap-1.5 rounded text-zinc-500 hover:text-zinc-300 ${focusRing}`}
            data-testid="md-tips-toggle"
          >
            <svg width={16} height={10} viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth={1.25} aria-hidden>
              <rect x="0.6" y="0.6" width="14.8" height="8.8" rx="1.5" />
              <path d="M3 7V3l2 2.2L7 3v4M11 3v4M9.5 5.6L11 7l1.5-1.4" />
            </svg>
            Markdown supported
            <span aria-hidden className="text-zinc-600">· Tips</span>
          </button>
          {status}
        </div>
        {tipsOpen && (
          <ul id={tipsId} className="space-y-1 border-t border-zinc-800/70 px-3 py-2 text-xs leading-relaxed text-zinc-400" data-testid="md-tips">
            {tipList.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-zinc-600">•</span>
                <span className="min-w-0">{t}</span>
              </li>
            ))}
            <li className="flex gap-2">
              <span aria-hidden className="text-zinc-600">•</span>
              <span className="min-w-0">
                Shortcuts: {mod}B bold, {mod}I italic, {mod}E code, {mod}K link{onSubmitShortcut ? `, ${mod}Enter send` : ""}.
              </span>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
