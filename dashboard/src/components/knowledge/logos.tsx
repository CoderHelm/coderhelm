// App marks for Knowledge, drawn the way each app draws its own icon, so a
// person recognises Notion or Google Drive at a glance. Notion, Confluence,
// Sanity and GitHub paths are from Simple Icons 13.21.0 (CC0 1.0); the Google
// Drive mark uses Google's published colours. Bundled, never fetched.

import type { AddKind } from "@/lib/knowledge";

const NOTION =
  "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z";
const CONFLUENCE =
  "M.87 18.257c-.248.382-.53.875-.763 1.245a.764.764 0 0 0 .255 1.04l4.965 3.054a.764.764 0 0 0 1.058-.26c.199-.332.454-.763.733-1.221 1.967-3.247 3.945-2.853 7.508-1.146l4.957 2.337a.764.764 0 0 0 1.028-.382l2.364-5.346a.764.764 0 0 0-.382-1 599.851 599.851 0 0 1-4.965-2.361C10.911 10.97 5.224 11.185.87 18.257zM23.131 5.743c.249-.405.531-.875.764-1.25a.764.764 0 0 0-.256-1.034L18.675.404a.764.764 0 0 0-1.058.26c-.195.335-.451.763-.734 1.225-1.966 3.246-3.945 2.85-7.508 1.146L4.437.694a.764.764 0 0 0-1.027.382L1.046 6.422a.764.764 0 0 0 .382 1c1.039.49 3.105 1.467 4.965 2.361 6.698 3.246 12.392 3.029 16.738-4.04z";
const SANITY =
  "M7.394 7.31a5.745 5.745 0 0 1-.833-.68c-.913-.91-1.38-2.067-1.38-3.568v-.575C6.699.929 9.039 0 11.828 0c5.394 0 8.515 2.8 9.285 6.74H16.22c-.54-1.554-1.89-2.764-4.352-2.764-2.422 0-4.136 1.276-4.473 3.334h-.002ZM4.683 3.062c0 3.236 2.034 5.162 6.106 6.177l4.316.983c3.854.87 6.2 3.03 6.2 6.55a6.61 6.61 0 0 1-1.436 4.239c0-3.511-1.85-5.409-6.31-6.55l-4.236-.946c-3.393-.76-6.011-2.536-6.011-6.36a6.578 6.578 0 0 1 1.37-4.093ZM17.18 16.484c-.292 2.235-2.092 3.495-4.698 3.495-2.314 0-4.048-.946-4.703-2.99H2.694C3.518 21.44 7.224 24 12.519 24c2.828 0 5.277-.87 6.85-2.439v-.55c0-1.66-.433-2.876-1.342-3.816a5.508 5.508 0 0 0-.847-.71v-.001Z";
const GITHUB =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

function Drive({ px }: { px: number }) {
  return (
    <svg width={px} height={px * 0.9} viewBox="0 0 87.3 78" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

const SIZES = {
  sm: { box: "h-6 w-6 rounded-md", px: 14 },
  md: { box: "h-9 w-9 rounded-lg", px: 20 },
  lg: { box: "h-12 w-12 rounded-xl", px: 26 },
} as const;

type Size = keyof typeof SIZES;

/** An app's icon tile: white like the apps' own icons, Sanity in its red. */
export function SourceLogo({ kind, size = "md", className = "" }: { kind: AddKind | string; size?: Size; className?: string }) {
  const s = SIZES[size];
  const tile = (bg: string, child: React.ReactNode) => (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center ${s.box} ${bg} ${className}`}>
      {child}
    </span>
  );
  const path = (d: string, color: string) => (
    <svg width={s.px} height={s.px} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d={d} />
    </svg>
  );
  switch (kind) {
    case "notion":
      return tile("bg-white shadow-sm ring-1 ring-black/5", path(NOTION, "#111111"));
    case "confluence":
      return tile("bg-white shadow-sm ring-1 ring-black/5", path(CONFLUENCE, "#1868DB"));
    case "sanity":
      return tile("bg-[#F03E2F] shadow-sm", path(SANITY, "#ffffff"));
    case "google_drive":
      return tile("bg-white shadow-sm ring-1 ring-black/5", <Drive px={s.px} />);
    case "github":
      return tile("bg-white shadow-sm ring-1 ring-black/5", path(GITHUB, "#181717"));
    case "web":
      return tile(
        "bg-sky-500/15 ring-1 ring-sky-400/30 text-sky-300",
        <svg width={s.px} height={s.px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
        </svg>,
      );
    default:
      return tile(
        "bg-emerald-500/15 ring-1 ring-emerald-400/30 text-emerald-300",
        <svg width={s.px} height={s.px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M12 18v-6M9.5 14.5 12 12l2.5 2.5" />
        </svg>,
      );
  }
}

/** A base's apps as overlapping tiles. */
export function LogoStack({ kinds, size = "sm", max = 4 }: { kinds: string[]; size?: Size; max?: number }) {
  const shown = kinds.slice(0, max);
  const more = kinds.length - shown.length;
  if (!shown.length) return null;
  return (
    <span className="flex items-center" aria-hidden="true">
      {shown.map((k, i) => (
        <SourceLogo key={k} kind={k} size={size} className={`${i > 0 ? "-ml-1.5" : ""} ring-2 !ring-zinc-900`} />
      ))}
      {more > 0 && <span className="ml-1.5 text-xs text-zinc-400">+{more}</span>}
    </span>
  );
}
