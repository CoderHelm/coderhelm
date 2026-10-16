"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton } from "./copy-button";
import { Stepper } from "./stepper";
import { focusRing } from "./ui";

/** Layout shared by every data-source setup screen: back link, steps, title. */
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
    <div className="max-w-4xl">
      <Link href={back.href} className={`inline-flex min-h-6 items-center text-sm text-zinc-400 hover:text-zinc-100 rounded ${focusRing}`}>
        <span aria-hidden="true">←&nbsp;</span>{back.label}
      </Link>
      <div className="mt-3 grid gap-5 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
        <nav aria-label="Setup steps">
          <Stepper steps={steps} current={step} />
        </nav>
        <div className="flex min-w-0 flex-col gap-5">
          <h1 id="step-heading" tabIndex={-1} className="text-xl font-bold text-zinc-100 text-balance focus:outline-none">
            {title}
          </h1>
          {children}
          <div>
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

