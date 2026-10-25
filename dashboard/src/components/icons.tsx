const s = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

// Sidebar nav icons
/** A lab flask: tests and their results. */
export const TestTubeIcon = () => <svg {...s}><path d="M9 3h6" /><path d="M10 3v6.2L4.6 18.4A1.7 1.7 0 006.1 21h11.8a1.7 1.7 0 001.5-2.6L14 9.2V3" /><path d="M7.5 15h9" /></svg>;
/** Lines of a log with a magnifier: the log analyzer's findings. */
export const LogFindingsIcon = () => <svg {...s}><path d="M4 5h12" /><path d="M4 10h8" /><path d="M4 15h5" /><circle cx="16.5" cy="15.5" r="3.5" /><path d="M19 18l2.5 2.5" /></svg>;
/** Three connected nodes: the code graph. */
export const GraphIcon = () => <svg {...s}><circle cx="5.5" cy="6" r="2.5" /><circle cx="18.5" cy="6" r="2.5" /><circle cx="12" cy="18.5" r="2.5" /><path d="M8 6h8" /><path d="M6.8 8.2l4 8" /><path d="M17.2 8.2l-4 8" /></svg>;
/** An open book: the team's written skills. */
export const BookIcon = () => <svg {...s}><path d="M2.5 5.5A1.5 1.5 0 014 4h5a3 3 0 013 3v13a2.5 2.5 0 00-2.5-2.5h-5.5a1.5 1.5 0 01-1.5-1.5z" /><path d="M21.5 5.5A1.5 1.5 0 0020 4h-5a3 3 0 00-3 3v13a2.5 2.5 0 012.5-2.5H20a1.5 1.5 0 001.5-1.5z" /></svg>;
/** A checklist: plans and their steps. */
export const PlanIcon = () => <svg {...s}><path d="M3.5 6.5l1.5 1.5 3-3" /><path d="M3.5 12.5l1.5 1.5 3-3" /><path d="M3.5 18.5l1.5 1.5 3-3" /><path d="M12 7h8.5" /><path d="M12 13h8.5" /><path d="M12 19h8.5" /></svg>;
export const PlayIcon = () => <svg {...s}><polygon points="6 3 20 12 6 21 6 3" /></svg>;
export const CircleDotIcon = () => <svg {...s}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>;
export const BarChartIcon = () => <svg {...s}><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>;
export const HexagonIcon = () => <svg {...s}><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" /></svg>;
export const HeartIcon = () => <svg {...s}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" /></svg>;
export const GitBranchIcon = () => <svg {...s}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 01-9 9" /></svg>;
export const ShieldIcon = () => <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
export const GearIcon = () => <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>;
export const PenIcon = () => <svg {...s}><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" /></svg>;
export const AtlassianIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8.93 11.09a.5.5 0 00-.84.08L3.06 21.24a.5.5 0 00.44.76h6.72a.5.5 0 00.45-.28c1.4-2.92.57-7.17-1.74-10.63z" /><path d="M11.41 3.41a11.55 11.55 0 00-.78 11.87l3.1 6.44a.5.5 0 00.45.28h6.72a.5.5 0 00.44-.76S13.71 5.17 13.38 4.5a1.87 1.87 0 00-1.97-1.09z" opacity=".8" /></svg>;
export const TrendingUpIcon = () => <svg {...s}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
export const BellIcon = () => <svg {...s}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>;
export const DollarIcon = () => <svg {...s}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>;
export const TargetIcon = () => <svg {...s}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;

// Security section icons
export const ShieldCheckIcon = () => <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>;
export const LockIcon = () => <svg {...s}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>;
export const ShieldAlertIcon = () => <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="16" r="0.5" fill="currentColor" /></svg>;
export const KeyIcon = () => <svg {...s}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>;
export const RepeatIcon = () => <svg {...s}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>;
export const ClipboardIcon = () => <svg {...s}><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></svg>;

// Team/users icon
export const UsersIcon = () => <svg {...s}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
export const CloudIcon = () => <svg {...s}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /></svg>;
export const AwsIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7.64 14.38c0 .28.03.51.08.67.06.16.13.34.23.53.04.06.05.12.05.17 0 .07-.05.15-.14.22l-.47.31c-.07.05-.13.07-.19.07-.07 0-.15-.04-.22-.11a2.24 2.24 0 01-.27-.35 5.82 5.82 0 01-.23-.44c-.58.69-1.31 1.03-2.19 1.03-.63 0-1.13-.18-1.5-.54-.37-.36-.56-.84-.56-1.44 0-.64.22-1.16.68-1.55.45-.39 1.05-.59 1.82-.59.25 0 .51.02.79.06.28.04.56.1.86.17v-.55c0-.57-.12-.97-.35-1.2-.24-.24-.64-.35-1.22-.35-.26 0-.53.03-.81.1-.28.07-.55.15-.81.26-.12.05-.21.08-.26.1a.46.46 0 01-.12.02c-.11 0-.16-.08-.16-.24v-.36c0-.12.01-.22.05-.28.04-.07.12-.13.24-.2.26-.13.58-.24.94-.33a4.37 4.37 0 011.16-.14c.88 0 1.53.2 1.94.6.4.4.61.98.61 1.76v2.32zm-3.02 1.13c.24 0 .49-.04.75-.13.26-.09.5-.25.7-.47.12-.14.22-.3.28-.49.06-.19.1-.42.1-.69v-.33c-.22-.05-.45-.1-.7-.13a5.54 5.54 0 00-.71-.05c-.5 0-.86.1-1.1.31-.25.21-.37.51-.37.9 0 .36.1.63.28.82.19.19.45.26.77.26zm5.97.83c-.14 0-.23-.02-.3-.08-.06-.05-.12-.16-.17-.33l-1.91-6.29c-.05-.18-.08-.29-.08-.35 0-.14.07-.22.21-.22h.74c.14 0 .24.03.3.08.07.05.12.16.17.33l1.36 5.38 1.27-5.38c.04-.18.09-.28.16-.33.07-.05.18-.08.31-.08h.6c.14 0 .24.03.31.08.07.05.13.16.16.33l1.28 5.45 1.4-5.45c.05-.18.11-.28.17-.33.07-.05.17-.08.3-.08h.7c.14 0 .22.07.22.22 0 .04-.01.09-.02.14-.01.06-.03.13-.06.21l-1.96 6.29c-.05.18-.11.28-.17.33-.07.05-.17.08-.3.08h-.65c-.14 0-.24-.03-.31-.08-.07-.06-.12-.16-.16-.34l-1.26-5.24-1.25 5.23c-.04.18-.09.29-.16.34-.07.05-.18.08-.31.08h-.65zm9.5.17a4.1 4.1 0 01-.95-.12c-.31-.07-.55-.16-.7-.25-.09-.05-.16-.12-.18-.18a.47.47 0 01-.04-.18v-.38c0-.16.06-.24.17-.24.05 0 .09.01.14.03.05.02.12.05.19.09.26.12.55.21.85.28.31.07.61.1.92.1.49 0 .86-.09 1.13-.26.27-.18.41-.43.41-.77 0-.23-.07-.41-.21-.56-.14-.15-.41-.28-.79-.4l-1.14-.35c-.57-.18-.99-.44-1.24-.78-.25-.34-.38-.72-.38-1.13 0-.33.07-.62.21-.87.14-.26.33-.48.57-.66.24-.18.51-.31.83-.41.32-.09.65-.14 1.01-.14.18 0 .37.01.56.04.19.03.37.07.54.11.17.05.33.1.47.16.15.06.26.12.34.18.11.07.2.15.25.23.05.08.08.19.08.32v.35c0 .16-.06.24-.17.24-.06 0-.16-.03-.29-.1a3.87 3.87 0 00-1.63-.33c-.44 0-.79.07-1.03.22-.24.15-.36.38-.36.71 0 .23.08.42.24.57.16.15.45.3.88.43l1.11.35c.56.18.97.43 1.21.75.24.32.35.69.35 1.1 0 .34-.07.64-.21.91a2.1 2.1 0 01-.58.67c-.24.18-.53.33-.87.42-.35.1-.71.15-1.1.15z" /></svg>;
export const GitHubIcon = () => <svg {...s} fill="currentColor" stroke="none"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.607.069-.607 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>;

// Safety agent icon
export const ScanIcon = () => <svg {...s}><path d="M3 7V5a2 2 0 012-2h2" /><path d="M17 3h2a2 2 0 012 2v2" /><path d="M21 17v2a2 2 0 01-2 2h-2" /><path d="M7 21H5a2 2 0 01-2-2v-2" /><path d="M8 12h8" /><path d="M12 8v8" /></svg>;

// Plugin icon (puzzle piece)
export const PluginIcon = () => <svg {...s}><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /></svg>;
export const TemplateIcon = () => <svg {...s}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
export const TrashIcon = () => <svg {...s}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>;
export const CpuIcon = () => <svg {...s}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></svg>;
// A notebook with a bookmark ribbon: what Coderhelm keeps and comes back to.
export const MemoryIcon = () => <svg {...s}><path d="M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M8 3v18" /><path d="M13 3v6l2-1.5L17 9V3" /></svg>;
/** @deprecated Kept for any old import; the sidebar uses MemoryIcon. */
export const BrainIcon = MemoryIcon;
export const ReviewerIcon = () => <svg {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>;
export const PlannerIcon = () => <svg {...s}><path d="M9 4H5a1 1 0 00-1 1v15a1 1 0 001 1h14a1 1 0 001-1V5a1 1 0 00-1-1h-4" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M8 11h8M8 15h5" /></svg>;
export const ChatIcon = () => <svg {...s}><path d="M21 12a8 8 0 01-11.8 7L4 20l1.1-4.2A8 8 0 1121 12z" /></svg>;
export const PinIcon = () => <svg {...s}><path d="M15 4l5 5-3 1-3 3 1 4-2 2-3.5-3.5L5 20l-1-1 4.5-4.5L5 11l2-2 4 1 3-3z" /></svg>;
export const LifeBuoyIcon = () => <svg {...s}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="4.93" y1="4.93" x2="9.17" y2="9.17" /><line x1="14.83" y1="14.83" x2="19.07" y2="19.07" /><line x1="14.83" y1="9.17" x2="19.07" y2="4.93" /><line x1="4.93" y1="19.07" x2="9.17" y2="14.83" /></svg>;
export const MailIcon = () => <svg {...s}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>;
export const ExternalLinkIcon = () => <svg {...s}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>;

// Data sources + shared form component icons
export const DatabaseIcon = () => <svg {...s}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>;
export const LogsIcon = () => <svg {...s}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><polyline points="14 3 14 9 20 9" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>;
export const CodeIcon = () => <svg {...s}><polyline points="8 8 4 12 8 16" /><polyline points="16 8 20 12 16 16" /><line x1="13" y1="6" x2="11" y2="18" /></svg>;
export const WrenchIcon = () => <svg {...s}><path d="M14.5 6.5a4 4 0 00-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 005.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z" /></svg>;
export const CheckIcon = () => <svg {...s} strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>;
export const XIcon = () => <svg {...s} strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
export const CopyIcon = () => <svg {...s}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>;
export const ChevronRightIcon = () => <svg {...s} strokeWidth={2}><polyline points="9 6 15 12 9 18" /></svg>;
export const WarningIcon = () => <svg {...s}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><circle cx="12" cy="17" r="0.5" fill="currentColor" /></svg>;
export const InfoIcon = () => <svg {...s}><circle cx="12" cy="12" r="10" /><line x1="12" y1="11" x2="12" y2="16" /><circle cx="12" cy="8" r="0.5" fill="currentColor" /></svg>;
export const AlertCircleIcon = () => <svg {...s}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16" r="0.5" fill="currentColor" /></svg>;
export const EyeIcon = () => <svg {...s}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>;
export const EyeOffIcon = () => <svg {...s}><path d="M17.94 17.94A10.9 10.9 0 0112 19C5 19 1 12 1 12a20.3 20.3 0 015.06-5.94" /><path d="M9.9 4.24A10.4 10.4 0 0112 4c7 0 11 8 11 8a20.3 20.3 0 01-2.16 3.19" /><path d="M14.12 14.12a3 3 0 01-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
/** Thumbs up and down: a yes or no on something the app did. */
export const ThumbsUpIcon = () => <svg {...s}><path d="M7 10v11" /><path d="M15 5.88L14 10h5.83a2 2 0 011.92 2.56l-2.33 8A2 2 0 0117.5 22H4a2 2 0 01-2-2v-8a2 2 0 012-2h2.76a2 2 0 001.79-1.11L12 2a3.13 3.13 0 013 3.88z" /></svg>;
export const ThumbsDownIcon = () => <svg {...s}><path d="M17 14V3" /><path d="M9 18.12L10 14H4.17a2 2 0 01-1.92-2.56l2.33-8A2 2 0 016.5 2H20a2 2 0 012 2v8a2 2 0 01-2 2h-2.76a2 2 0 00-1.79 1.11L12 22a3.13 3.13 0 01-3-3.88z" /></svg>;

// Chat icons
/** A paperclip: attach a file. */
export const PaperclipIcon = () => <svg {...s}><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9" /></svg>;
/** An upward stroke in a button: send the message. */
export const SendIcon = () => <svg {...s} strokeWidth={2}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></svg>;
/** A panel with a sidebar: show or hide the list of chats. */
export const SidebarIcon = () => <svg {...s}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>;
/** Three dots: more actions. */
export const MoreIcon = () => <svg {...s} strokeWidth={2.5}><circle cx="5" cy="12" r="0.6" /><circle cx="12" cy="12" r="0.6" /><circle cx="19" cy="12" r="0.6" /></svg>;
/** A square with a pencil: start a new chat. */
export const ComposeIcon = () => <svg {...s}><path d="M12 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-6" /><path d="M17.5 3.5a2.1 2.1 0 013 3L13 14l-4 1 1-4z" /></svg>;
/** Stacked layers: the sources an answer may read. */
export const LayersIcon = () => <svg {...s}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>;
/** A magnifier. */
export const SearchIcon = () => <svg {...s}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
/** A circular stroke: try again. */
export const RetryIcon = () => <svg {...s}><path d="M3 12a9 9 0 0115.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 01-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></svg>;
