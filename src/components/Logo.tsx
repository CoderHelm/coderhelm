// The /// mark, exactly as brand/icon-accent.svg, drawn inline so it costs no request.
export function Logo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="96 86 320 340" className={className} aria-hidden="true">
      <polygon points="106,416 158,416 226,96 174,96" fill="#fafafa" />
      <polygon points="196,416 248,416 316,96 264,96" fill="#3B82F6" />
      <polygon points="286,416 338,416 406,96 354,96" fill="#fafafa" />
    </svg>
  );
}
