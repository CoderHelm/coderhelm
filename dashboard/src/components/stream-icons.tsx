// ---------------------------------------------------------------------------
// Monochrome streaming icons — matches existing hand-rolled SVG pattern
// ---------------------------------------------------------------------------

const s = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Brain icon — thinking/reasoning
export const BrainIcon = () => (
  <svg {...s}>
    <path d="M12 2a7 7 0 00-4.7 12.2A3.5 3.5 0 0010 21h4a3.5 3.5 0 002.7-6.8A7 7 0 0012 2z" />
    <path d="M10 21v-4" />
    <path d="M14 21v-4" />
    <path d="M9 10h.01" />
    <path d="M15 10h.01" />
  </svg>
);

// Wrench icon — generic tool
export const WrenchIcon = () => (
  <svg {...s}>
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

// Search icon — search/find tools
export const SearchIcon = () => (
  <svg {...s}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// File icon — file read/write tools
export const FileIcon = () => (
  <svg {...s}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

// Check icon — success/done
export const CheckIcon = () => (
  <svg {...s}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// X icon — error/failed
export const XIcon = () => (
  <svg {...s}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// Square icon — stop button
export const SquareIcon = () => (
  <svg {...s}>
    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" stroke="none" />
  </svg>
);

// Loader icon — spinning
export const LoaderIcon = ({ className }: { className?: string }) => (
  <svg {...s} className={className}>
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

// Arrow down icon — scroll to bottom
export const ArrowDownIcon = () => (
  <svg {...s}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

// Chevron down — expand/collapse
export const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg {...s} className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Refresh icon — retry
export const RefreshIcon = () => (
  <svg {...s}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);

// Zap icon — MCP server bolt
export const ZapIcon = () => (
  <svg {...s} fill="none">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

// Copy icon
export const CopyIcon = () => (
  <svg {...s}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

// Pen/edit icon
export const PenIcon = () => (
  <svg {...s}>
    <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
  </svg>
);

// Map tool names to appropriate icons
export function getToolIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("search") || lower.includes("find") || lower.includes("query")) return SearchIcon;
  if (lower.includes("read") || lower.includes("file") || lower.includes("write") || lower.includes("list") || lower.includes("tree")) return FileIcon;
  return WrenchIcon;
}
