"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "@/components/icons";
import { focusRing } from "@/components/ui";
import { settingsItemFor } from "@/components/settings-items";
import { pageWidthClass } from "@/components/page";

/** Every settings page gets the same way back to the Settings hub. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const item = settingsItemFor(pathname);
  const showCrumb = item && item.href.startsWith("/settings/");

  return (
    <>
      {showCrumb && (
        <nav aria-label="Breadcrumb" className={`mb-4 ${pageWidthClass}`}>
          <ol className="flex items-center gap-1.5 text-sm text-zinc-500">
            <li>
              <Link href="/settings" className={`rounded hover:text-zinc-200 transition-colors motion-reduce:transition-none ${focusRing}`}>
                Settings
              </Link>
            </li>
            <li aria-hidden="true" className="scale-75 text-zinc-600">
              <ChevronRightIcon />
            </li>
            <li aria-current="page" className="text-zinc-300">
              {item.title}
            </li>
          </ol>
        </nav>
      )}
      {children}
    </>
  );
}
