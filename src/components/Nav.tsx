"use client";

import Link from "next/link";
import { useState } from "react";

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-surface-border bg-surface/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="gradient-text">{"///"}</span>
          <span>d3ftly</span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            How it works
          </a>
          <a href="#pricing" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
            Pricing
          </a>
          <a
            href="https://api.d3ftly.com/api/auth/github"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Login
          </a>
          <a
            href="https://github.com/apps/d3ftly-agent"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Install on GitHub
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-text-secondary"
          aria-label="Toggle menu"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-surface-border bg-surface px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            <a href="#features" onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              Features
            </a>
            <a href="#how-it-works" onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              How it works
            </a>
            <a href="#pricing" onClick={() => setOpen(false)} className="text-sm text-text-secondary">
              Pricing
            </a>
            <a
              href="https://api.d3ftly.com/api/auth/github"
              className="text-sm text-text-secondary"
            >
              Login
            </a>
            <a
              href="https://github.com/apps/d3ftly-agent"
              className="rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-black"
            >
              Install on GitHub
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
