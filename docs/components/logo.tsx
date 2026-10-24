/** The three-slash mark and wordmark (brand/BRAND.md). */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-mono font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill="#000" />
        <polygon points="6.5,26 9.75,26 14,6 10.75,6" fill="#fff" />
        <polygon points="12.25,26 15.5,26 19.75,6 16.5,6" fill="#3b82f6" />
        <polygon points="18,26 21.25,26 25.5,6 22.25,6" fill="#fff" />
      </svg>
      <span>
        CoderHelm <span className="font-normal text-fd-muted-foreground">Docs</span>
      </span>
    </span>
  );
}
