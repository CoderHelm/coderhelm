"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton } from "./copy-button";
import { Stepper } from "./stepper";
import { focusRing } from "./ui";
import { PageHeader, pageWidthClass } from "./page";
import { ChevronRightIcon } from "./icons";

/**
 * Layout shared by every data-source setup screen: back link, steps, title.
 * The form itself is capped at a readable width; a flow with one step drops
 * the step list and uses the whole column.
 */
export function FlowShell({
  step,
  title,
  back,
  children,
  steps,
}: {
  step: string;
  title: string;
  back: { href: string; label: string };
  children: ReactNode;
  steps: { id: string; label: string }[];
}) {
  return (
    <div className={pageWidthClass}>
      <Link href={back.href} className={`inline-flex min-h-6 items-center gap-1 rounded text-sm text-zinc-400 hover:text-zinc-100 ${focusRing}`}>
        <span aria-hidden="true" className="inline-flex rotate-180 scale-90">
          <ChevronRightIcon />
        </span>
        {back.label}
      </Link>
      <div className={`mt-3 grid gap-5 md:gap-10 ${steps.length > 1 ? "md:grid-cols-[200px_minmax(0,1fr)]" : ""}`}>
        {steps.length > 1 && (
          <nav aria-label="Setup steps">
            <Stepper steps={steps} current={step} />
          </nav>
        )}
        <div className="flex min-w-0 max-w-2xl flex-col gap-5">
          <PageHeader detail crumb={false} title={title} titleId="step-heading" titleClassName="text-balance" />
          {children}
          <div className="border-t border-zinc-800 pt-4 text-sm">
            <CopyButton
              variant="link"
              text={() => window.location.href}
              label="Not the right person? Send this step to a teammate"
              copiedLabel="Link copied. Any admin on your team can open it and finish this step."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

