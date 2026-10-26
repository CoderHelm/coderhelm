"use client";

import { usePathname } from "next/navigation";
import { sectionTabs } from "@/lib/nav";
import { Tabs } from "./tabs";
import { pageWidthClass } from "./page";

/**
 * The pages of the current destination, as tabs above the page: Reviewer,
 * Tests and Releases under Code review; Logs and Alerts under Logs;
 * Analytics, Learning and the rest under Insights. Nothing on a destination
 * with one page, or on an item's page underneath (a run, a review).
 */
export function SectionTabs({ allowed }: { allowed: (need?: string) => boolean }) {
  const pathname = usePathname();
  const tabs = sectionTabs(pathname, allowed);
  if (!tabs) return null;
  return (
    <div className={`${pageWidthClass} mb-6`} data-testid="section-tabs">
      <Tabs
        label={`${tabs.section.label} pages`}
        items={tabs.pages.map((p) => ({ value: p.href, label: p.label, href: p.href }))}
        value={tabs.current}
        className=""
      />
    </div>
  );
}
